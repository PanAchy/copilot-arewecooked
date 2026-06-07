import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { buildSummary, renderConsole } from "../report.js";
import { renderHtml } from "../html.js";
import { parseCopilotCli } from "../copilotCli.js";
import { parseVsCode } from "../vscode.js";
import { parseXcode } from "../xcode.js";
import { parseOpenCode } from "../opencode.js";
import type { CostedUsageRecord } from "../types.js";

/**
 * Regression tests for stack overflow on large datasets (issue #73, PR #74).
 *
 * JavaScript's spread / Function.prototype.apply passes array elements as
 * individual call-stack arguments, so arrays exceeding ~125k elements cause
 * "Maximum call stack size exceeded". PR #74 replaced spread patterns with
 * stack-safe iteration across all affected sites.
 *
 * These tests use LARGE = 150_000 elements — safely above the V8 limit — so
 * they would crash with the old code and pass with the fix.
 */

const LARGE = 150_000;

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

let tmpBase: string;
let dbPath: string;

beforeEach(() => {
  tmpBase = mkdtempSync(join(tmpdir(), "arewecooked-large-"));
  dbPath = join(tmpBase, "test.db");
});

afterEach(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function costedRec(i: number): CostedUsageRecord {
  return {
    source: "vscode",
    sourcePath: "/mock",
    provider: "github-copilot",
    model: "gpt-5-mini",
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    calls: 1,
    usd: 0.001,
    credits: 1,
    pricingKnown: true,
    // Spread 150k distinct timestamps to exercise the min/max reduce paths
    timestamp: new Date(1_700_000_000_000 + i * 60_000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// report.ts — comparisonMetric Math.min/max spread (src/report.ts:153-154)
// ---------------------------------------------------------------------------

describe("large dataset — report.ts", () => {
  it("buildSummary handles 150k records without stack overflow", () => {
    const records = Array.from({ length: LARGE }, (_, i) => costedRec(i));
    const summary = buildSummary({ findings: [], records, toolFindings: [] });
    // comparisonMetric (Math.min/max spread) is called inside renderConsole,
    // not buildSummary. Call it here to exercise the spread over 150k timestamps.
    const output = renderConsole(summary);
    expect(output).toContain("Monthly average");
  }, 10_000);
});

// ---------------------------------------------------------------------------
// html.ts — renderTrend Math.max spread (src/html.ts:132) +
//           comparisonMetric Math.min/max spread (src/html.ts:207-208)
// ---------------------------------------------------------------------------

describe("large dataset — html.ts", () => {
  it("renderHtml handles 150k records without stack overflow", () => {
    const records = Array.from({ length: LARGE }, (_, i) => costedRec(i));
    const summary = buildSummary({ findings: [], records, toolFindings: [] });
    const html = renderHtml(summary);
    expect(html).toContain("<!doctype html>");
  }, 15_000);
});

// ---------------------------------------------------------------------------
// copilotCli.ts — records.push(...result.records) (src/copilotCli.ts:42)
//
// One session JSONL with 150k assistant.message events triggers the fallback
// path, producing a 150k-element result.records spread into the outer array.
// ---------------------------------------------------------------------------

describe("large dataset — copilotCli.ts", () => {
  it("parseCopilotCli handles 150k assistant messages in one session", () => {
    const sessionDir = join(tmpBase, "session-large");
    mkdirSync(sessionDir);

    const lines = Array.from({ length: LARGE }, (_, i) =>
      JSON.stringify({
        type: "assistant.message",
        data: { messageId: `m${i}`, outputTokens: 10 },
        id: `e${i}`,
        timestamp: "2026-01-01T00:00:00.000Z",
      })
    );
    writeFileSync(join(sessionDir, "events.jsonl"), lines.join("\n") + "\n");

    const { records } = parseCopilotCli(tmpBase);
    expect(records).toHaveLength(LARGE);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// vscode.ts — records.push(...shutdownRecords) (src/vscode.ts:192)
//
// One transcript file with a shutdown event containing 150k model entries
// produces a 150k-element shutdownRecords array spread into the outer array.
// ---------------------------------------------------------------------------

describe("large dataset — vscode.ts", () => {
  it("parseVsCode handles a shutdown event with 150k models", () => {
    const transcriptDir = join(
      tmpBase,
      "workspace123",
      "GitHub.copilot-chat",
      "transcripts"
    );
    mkdirSync(transcriptDir, { recursive: true });
    // chatSessions directory must exist for the second glob to be valid
    mkdirSync(join(tmpBase, "workspace123", "chatSessions"), {
      recursive: true,
    });

    const modelMetrics: Record<string, unknown> = {};
    for (let i = 0; i < LARGE; i++) {
      modelMetrics[`model-${i}`] = {
        requests: { count: 1, cost: 0 },
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      };
    }

    const shutdownEvent = {
      type: "session.shutdown",
      id: "shutdown-1",
      timestamp: "2026-01-01T12:00:00.000Z",
      data: { modelMetrics },
    };
    writeFileSync(
      join(transcriptDir, "test-session.jsonl"),
      JSON.stringify(shutdownEvent) + "\n"
    );

    const { records } = parseVsCode(tmpBase);
    expect(records).toHaveLength(LARGE);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// xcode.ts — records.push(...fileRecords) (src/xcode.ts:76)
//
// One log file with 150k token-usage entries (sharing a single turn context
// established at the start) produces a 150k-element fileRecords array spread
// into the outer records array.
// ---------------------------------------------------------------------------

describe("large dataset — xcode.ts", () => {
  it("parseXcode handles a log file with 150k token usage entries", () => {
    const pid = "1234";
    const ts = "2026-01-01T00:00:00.000Z";

    const makeEntry = (message: string) =>
      `[${ts}] [info] [GitHubCopilot] [${pid}] window/logMessage: {\n  "message" : "${message}",\n  "type" : 3\n}`;

    // One turn-context entry followed by 150k token-usage entries.
    // The turn context is retained between lines, so every token entry emits
    // a record without needing its own conversation\/turn header.
    const turnEntry = makeEntry(
      `[agentPrompt] for conversation\\/turn conv1\\/turn1`
    );
    const tokenEntry = makeEntry(
      `[roundMetricsTracker] Turn token usage: 100 prompt, 50 completion, 10 cached (cache rate: 10.0%)`
    );

    const entries = [
      turnEntry,
      ...Array.from({ length: LARGE }, () => tokenEntry),
    ];
    writeFileSync(join(tmpBase, "test.log"), entries.join("\n") + "\n");

    const { records } = parseXcode(tmpBase);
    expect(records).toHaveLength(LARGE);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// opencode.ts — results.push(...rows) (src/opencode.ts:101, 113)
//
// Note: the spread in opencode.ts only triggers in the SQLITE_TOOBIG slow
// path, which processes rows in chunks of 200 — far below V8's stack limit.
// This test validates correctness at scale (150k rows parsed and returned)
// rather than the stack-overflow protection specifically. The overflow
// protection for the slow path is exercised by the SQLITE_TOOBIG mock tests
// in opencode.test.ts.
// ---------------------------------------------------------------------------

describe("large dataset — opencode.ts", () => {
  it("parseOpenCode handles 150k SQLite rows without stack overflow", () => {
    const db = new Database(dbPath);
    db.exec(`
        CREATE TABLE message (
          id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          time_created INTEGER NOT NULL DEFAULT 0,
          data TEXT NOT NULL
        );
        CREATE TABLE part (
          id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE session (
          id TEXT NOT NULL,
          model TEXT,
          tokens_input INTEGER NOT NULL DEFAULT 0,
          tokens_output INTEGER NOT NULL DEFAULT 0,
          tokens_reasoning INTEGER NOT NULL DEFAULT 0,
          tokens_cache_read INTEGER NOT NULL DEFAULT 0,
          tokens_cache_write INTEGER NOT NULL DEFAULT 0,
          cost REAL NOT NULL DEFAULT 0,
          time_created INTEGER NOT NULL DEFAULT 0,
          agent TEXT,
          time_compacting INTEGER
        );
      `);

    const rowData = JSON.stringify({
      role: "assistant",
      time: { created: 1_700_000_000_000 },
      tokens: { input: 100, output: 50, cache: { read: 0, write: 0 } },
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
    });

    const stmt = db.prepare(
      "INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)"
    );
    const insertAll = db.transaction(() => {
      for (let i = 0; i < LARGE; i++) {
        stmt.run(`msg-${i}`, "ses-1", rowData);
      }
    });
    insertAll();
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(LARGE);
  }, 30_000);
});
