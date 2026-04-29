import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVsCode } from "../vscode.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpBase: string;

beforeEach(() => {
  // Create: <tmpBase>/<hash>/chatSessions/session.jsonl
  tmpBase = mkdtempSync(join(tmpdir(), "arewecooked-test-"));
  const hashDir = join(tmpBase, "workspace123");
  mkdirSync(join(hashDir, "chatSessions"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

/**
 * Write a minimal JSONL session file with the given requests.
 * Each request: { requestId, timestamp, completionTokens }
 */
function writeSession(
  requests: Array<{
    requestId: string;
    timestamp?: number | string;
    completionTokens?: number;
  }>
): void {
  const state = {
    sessionId: "test-session",
    requests,
  };
  const line = JSON.stringify({ kind: 0, v: state });
  writeFileSync(
    join(tmpBase, "workspace123", "chatSessions", "session.jsonl"),
    line + "\n"
  );
}

// ---------------------------------------------------------------------------
// sinceMs filter — numeric timestamps
// ---------------------------------------------------------------------------

describe("parseVsCode — sinceMs filter", () => {
  it("includes all records when sinceMs is undefined", () => {
    writeSession([
      { requestId: "r1", timestamp: 1_000_000_000_000, completionTokens: 1 },
      { requestId: "r2", timestamp: 2_000_000_000_000, completionTokens: 2 },
    ]);
    const { records } = parseVsCode(tmpBase);
    expect(records).toHaveLength(2);
  });

  it("filters out records with numeric timestamps older than sinceMs", () => {
    const cutoff = 1_500_000_000_000;
    writeSession([
      { requestId: "r1", timestamp: 1_000_000_000_000, completionTokens: 1 }, // old
      { requestId: "r2", timestamp: 2_000_000_000_000, completionTokens: 2 }, // new
    ]);
    const { records } = parseVsCode(tmpBase, cutoff);
    expect(records).toHaveLength(1);
    expect((records[0]! as { messageId?: string }).messageId).toBe("r2");
  });

  it("includes records with numeric timestamps exactly equal to sinceMs", () => {
    const cutoff = 1_500_000_000_000;
    writeSession([
      { requestId: "r1", timestamp: cutoff, completionTokens: 5 }, // exactly at boundary
    ]);
    // ts < sinceMs → excluded; ts === sinceMs → NOT excluded (boundary is inclusive)
    const { records } = parseVsCode(tmpBase, cutoff);
    expect(records).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // sinceMs filter — ISO string timestamps (the bug from PR #27)
  // -------------------------------------------------------------------------

  it("filters out records with ISO string timestamps older than sinceMs", () => {
    const cutoff = new Date("2026-04-01T00:00:00.000Z").getTime();
    writeSession([
      {
        requestId: "r1",
        timestamp: "2026-01-01T00:00:00.000Z", // old ISO string
        completionTokens: 1,
      },
      {
        requestId: "r2",
        timestamp: "2026-05-01T00:00:00.000Z", // new ISO string
        completionTokens: 2,
      },
    ]);
    const { records } = parseVsCode(tmpBase, cutoff);
    expect(records).toHaveLength(1);
    expect((records[0]! as { messageId?: string }).messageId).toBe("r2");
  });

  it("includes records with ISO string timestamps newer than sinceMs", () => {
    const cutoff = new Date("2025-01-01T00:00:00.000Z").getTime();
    writeSession([
      {
        requestId: "r1",
        timestamp: "2026-04-01T10:00:00.000Z",
        completionTokens: 3,
      },
      {
        requestId: "r2",
        timestamp: "2026-04-02T10:00:00.000Z",
        completionTokens: 4,
      },
    ]);
    const { records } = parseVsCode(tmpBase, cutoff);
    expect(records).toHaveLength(2);
  });

  it("does not filter records with no timestamp regardless of sinceMs", () => {
    writeSession([
      { requestId: "r1", completionTokens: 5 }, // no timestamp
    ]);
    const cutoff = Date.now();
    const { records } = parseVsCode(tmpBase, cutoff);
    // No timestamp → not filtered (the condition is: sinceMs && request.timestamp)
    expect(records).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// zero-output warning threshold
// ---------------------------------------------------------------------------

describe("parseVsCode — zero-output warning", () => {
  it("adds no ⚠️ note when fewer than 50% of records have zero outputTokens", () => {
    // 1 zero, 2 non-zero → 33% → no warning
    writeSession([
      { requestId: "r1", timestamp: Date.now(), completionTokens: 0 },
      { requestId: "r2", timestamp: Date.now() + 1, completionTokens: 100 },
      { requestId: "r3", timestamp: Date.now() + 2, completionTokens: 200 },
    ]);
    const { finding } = parseVsCode(tmpBase);
    const warnings = finding.notes.filter((n) => n.startsWith("⚠️"));
    expect(warnings).toHaveLength(0);
  });

  it("adds ⚠️ note when exactly 50% of records have zero outputTokens", () => {
    // 1 zero, 1 non-zero → 50% → warning triggered
    writeSession([
      { requestId: "r1", timestamp: Date.now(), completionTokens: 0 },
      { requestId: "r2", timestamp: Date.now() + 1, completionTokens: 100 },
    ]);
    const { finding } = parseVsCode(tmpBase);
    const warnings = finding.notes.filter((n) => n.startsWith("⚠️"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("zero output tokens");
  });

  it("adds ⚠️ note when more than 50% have zero outputTokens", () => {
    // 2 zero, 1 non-zero → 67% → warning
    writeSession([
      { requestId: "r1", timestamp: Date.now(), completionTokens: 0 },
      { requestId: "r2", timestamp: Date.now() + 1, completionTokens: 0 },
      { requestId: "r3", timestamp: Date.now() + 2, completionTokens: 100 },
    ]);
    const { finding } = parseVsCode(tmpBase);
    const warnings = finding.notes.filter((n) => n.startsWith("⚠️"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("zero output tokens");
  });

  it("warning note reports the rounded percentage", () => {
    // 2 zero, 1 non-zero → Math.round(200/3) = 67%
    writeSession([
      { requestId: "r1", timestamp: Date.now(), completionTokens: 0 },
      { requestId: "r2", timestamp: Date.now() + 1, completionTokens: 0 },
      { requestId: "r3", timestamp: Date.now() + 2, completionTokens: 100 },
    ]);
    const { finding } = parseVsCode(tmpBase);
    const warning = finding.notes.find((n) => n.startsWith("⚠️"))!;
    expect(warning).toContain("67%");
  });

  it("adds no warning when there are no records", () => {
    // Empty session — no requests
    writeSession([]);
    const { finding } = parseVsCode(tmpBase);
    const warnings = finding.notes.filter((n) => n.startsWith("⚠️"));
    expect(warnings).toHaveLength(0);
  });
});
