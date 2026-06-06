import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { parseVsCodeOtel } from "../vscodeOtel.js";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "arewecooked-vscode-otel-test-"));
  dbPath = join(tmpDir, "agent-traces.db");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createDb(): Database.Database {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE spans (
      span_id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      parent_span_id TEXT,
      name TEXT NOT NULL,
      start_time_ms INTEGER NOT NULL,
      end_time_ms INTEGER NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 0,
      status_message TEXT,
      operation_name TEXT,
      provider_name TEXT,
      agent_name TEXT,
      conversation_id TEXT,
      request_model TEXT,
      response_model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cached_tokens INTEGER,
      reasoning_tokens INTEGER,
      tool_name TEXT,
      tool_call_id TEXT,
      tool_type TEXT,
      chat_session_id TEXT,
      turn_index INTEGER,
      ttft_ms REAL
    );
  `);
  return db;
}

function insertSpan(
  db: Database.Database,
  row: {
    span_id: string;
    trace_id?: string;
    name?: string;
    operation_name?: string;
    provider_name?: string;
    agent_name?: string;
    conversation_id?: string;
    chat_session_id?: string;
    request_model?: string;
    response_model?: string;
    input_tokens?: number | null;
    output_tokens?: number | null;
    cached_tokens?: number | null;
    start_time_ms?: number;
    end_time_ms?: number;
    status_code?: number;
  }
) {
  db.prepare(
    `INSERT INTO spans (span_id, trace_id, name, operation_name, provider_name,
       agent_name, conversation_id, chat_session_id, request_model, response_model,
       input_tokens, output_tokens, cached_tokens, start_time_ms, end_time_ms, status_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.span_id,
    row.trace_id ?? "trace-1",
    row.name ?? "chat",
    row.operation_name ?? "chat",
    row.provider_name ?? "github",
    row.agent_name ?? null,
    row.conversation_id ?? null,
    row.chat_session_id ?? null,
    row.request_model ?? null,
    row.response_model ?? null,
    row.input_tokens ?? null,
    row.output_tokens ?? null,
    row.cached_tokens ?? null,
    row.start_time_ms ?? 1_000_000,
    row.end_time_ms ?? 1_000_100,
    row.status_code ?? 0
  );
}

describe("parseVsCodeOtel", () => {
  it("returns not-found when database does not exist", () => {
    const { finding, records } = parseVsCodeOtel("/nonexistent/db.sqlite");
    expect(finding.found).toBe(false);
    expect(records).toHaveLength(0);
  });

  it("returns records for chat spans with github provider", () => {
    const db = createDb();
    insertSpan(db, {
      span_id: "span-1",
      operation_name: "chat",
      provider_name: "github",
      response_model: "gpt-5-mini",
      input_tokens: 500,
      output_tokens: 200,
      cached_tokens: 100,
      conversation_id: "conv-1",
    });
    db.close();

    const { records } = parseVsCodeOtel(dbPath);
    expect(records).toHaveLength(1);
    expect(records[0]!.inputTokens).toBe(500);
    expect(records[0]!.outputTokens).toBe(200);
    expect(records[0]!.cacheReadTokens).toBe(100);
    expect(records[0]!.model).toBe("gpt-5-mini");
    expect(records[0]!.sessionId).toBe("conv-1");
    expect(records[0]!.provider).toBe("github-copilot");
  });

  it("uses request_model when response_model is null", () => {
    const db = createDb();
    insertSpan(db, {
      span_id: "span-1",
      operation_name: "chat",
      provider_name: "github",
      request_model: "gpt-5.4",
      response_model: null,
      input_tokens: 100,
      output_tokens: 50,
    });
    db.close();

    const { records } = parseVsCodeOtel(dbPath);
    expect(records[0]!.model).toBe("gpt-5.4");
  });

  it("skips non-chat operation types", () => {
    const db = createDb();
    insertSpan(db, {
      span_id: "span-1",
      operation_name: "execute_tool",
      provider_name: "github",
      input_tokens: 100,
      output_tokens: 50,
    });
    db.close();

    const { records } = parseVsCodeOtel(dbPath);
    expect(records).toHaveLength(0);
  });

  it("skips non-github providers", () => {
    const db = createDb();
    insertSpan(db, {
      span_id: "span-1",
      operation_name: "chat",
      provider_name: "openai",
      input_tokens: 100,
      output_tokens: 50,
    });
    db.close();

    const { records } = parseVsCodeOtel(dbPath);
    expect(records).toHaveLength(0);
  });

  it("skips spans with null input and output tokens", () => {
    const db = createDb();
    insertSpan(db, {
      span_id: "span-1",
      operation_name: "chat",
      provider_name: "github",
      input_tokens: null,
      output_tokens: null,
    });
    db.close();

    const { records } = parseVsCodeOtel(dbPath);
    expect(records).toHaveLength(0);
  });

  it("filters records older than sinceMs", () => {
    const db = createDb();
    insertSpan(db, {
      span_id: "span-old",
      operation_name: "chat",
      provider_name: "github",
      input_tokens: 100,
      output_tokens: 50,
      start_time_ms: 1_000_000,
    });
    insertSpan(db, {
      span_id: "span-new",
      operation_name: "chat",
      provider_name: "github",
      input_tokens: 200,
      output_tokens: 100,
      start_time_ms: 3_000_000,
    });
    db.close();

    const { records } = parseVsCodeOtel(dbPath, 2_000_000);
    expect(records).toHaveLength(1);
    expect(records[0]!.messageId).toBe("span-new");
  });

  it("adds note when no records found", () => {
    createDb().close();

    const { finding } = parseVsCodeOtel(dbPath);
    expect(finding.notes).toContain(
      "No VS Code OTel Copilot chat spans found."
    );
  });

  it("uses chat_session_id as fallback when conversation_id is null", () => {
    const db = createDb();
    insertSpan(db, {
      span_id: "span-1",
      operation_name: "chat",
      provider_name: "github",
      conversation_id: null,
      chat_session_id: "chat-ses-1",
      input_tokens: 100,
      output_tokens: 50,
    });
    db.close();

    const { records } = parseVsCodeOtel(dbPath);
    expect(records[0]!.sessionId).toBe("chat-ses-1");
  });
});
