import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { compress as zstdCompress } from "zstdify";
import { parseZed } from "../zed.js";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "arewecooked-zed-test-"));
  dbPath = join(tmpDir, "threads.db");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function createDb(): Database.Database {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      data_type TEXT NOT NULL,
      data BLOB NOT NULL
    );
  `);
  return db;
}

function insertThread(
  db: Database.Database,
  args: {
    id: string;
    updatedAt?: string;
    createdAt?: string;
    dataType?: "json" | "zstd";
    provider?: string;
    model?: string;
    cumulativeTokenUsage?: Record<string, number> | Array<Record<string, number>>;
    requestTokenUsage?: Record<string, Record<string, number>>;
    profileName?: string;
  }
) {
  const payload = {
    provider: args.provider ?? "github-copilot",
    model: {
      provider: args.provider ?? "github-copilot",
      name: args.model ?? "claude-sonnet-4.5",
    },
    profile: { name: args.profileName ?? "agent" },
    cumulative_token_usage: args.cumulativeTokenUsage ?? {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 25,
      cache_creation_input_tokens: 10,
    },
    request_token_usage: args.requestTokenUsage ?? {
      req1: { input_tokens: 10 },
      req2: { input_tokens: 20 },
    },
  };

  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const data =
    (args.dataType ?? "zstd") === "json"
      ? json
      : Buffer.from(zstdCompress(json));

  db.prepare(
    `INSERT INTO threads (id, updated_at, created_at, data_type, data)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    args.id,
    args.updatedAt ?? "2026-05-01T00:00:00.000Z",
    args.createdAt ?? "2026-05-01T00:00:00.000Z",
    args.dataType ?? "zstd",
    data
  );
}

describe("parseZed", () => {
  it("returns not-found finding when database does not exist", () => {
    const { finding, records } = parseZed("/nonexistent/path/threads.db");
    expect(finding.found).toBe(false);
    expect(records).toHaveLength(0);
  });

  it("reads zstd-compressed cumulative token usage", () => {
    const db = createDb();
    insertThread(db, { id: "thread-1" });
    db.close();

    const { records } = parseZed(dbPath);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: "zed",
      sessionId: "thread-1",
      provider: "github-copilot",
      model: "claude-sonnet-4.5",
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 25,
      cacheWriteTokens: 10,
      calls: 2,
      agent: "agent",
    });
  });

  it("reads plain json rows too", () => {
    const db = createDb();
    insertThread(db, {
      id: "thread-json",
      dataType: "json",
      cumulativeTokenUsage: {
        input_tokens: 300,
        output_tokens: 120,
        cache_read_input_tokens: 40,
        cache_creation_input_tokens: 5,
      },
    });
    db.close();

    const { records } = parseZed(dbPath);
    expect(records).toHaveLength(1);
    expect(records[0]!.inputTokens).toBe(300);
    expect(records[0]!.cacheWriteTokens).toBe(5);
  });

  it("sums cumulative token usage arrays defensively", () => {
    const db = createDb();
    insertThread(db, {
      id: "thread-array",
      cumulativeTokenUsage: [
        {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 1,
        },
        {
          input_tokens: 50,
          output_tokens: 5,
          cache_read_input_tokens: 3,
          cache_creation_input_tokens: 2,
        },
      ],
    });
    db.close();

    const { records } = parseZed(dbPath);
    expect(records[0]!.inputTokens).toBe(150);
    expect(records[0]!.outputTokens).toBe(25);
    expect(records[0]!.cacheReadTokens).toBe(13);
    expect(records[0]!.cacheWriteTokens).toBe(3);
  });

  it("falls back to summing request token usage when cumulative usage is empty", () => {
    const db = createDb();
    insertThread(db, {
      id: "thread-request-usage",
      cumulativeTokenUsage: {},
      requestTokenUsage: {
        req1: {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 5,
          cache_creation_input_tokens: 1,
        },
        req2: {
          input_tokens: 50,
          output_tokens: 8,
          cache_read_input_tokens: 2,
          cache_creation_input_tokens: 3,
        },
      },
    });
    db.close();

    const { records } = parseZed(dbPath);
    expect(records).toHaveLength(1);
    expect(records[0]!.inputTokens).toBe(150);
    expect(records[0]!.outputTokens).toBe(28);
    expect(records[0]!.cacheReadTokens).toBe(7);
    expect(records[0]!.cacheWriteTokens).toBe(4);
    expect(records[0]!.calls).toBe(2);
  });

  it("filters rows older than sinceMs", () => {
    const db = createDb();
    insertThread(db, { id: "old", updatedAt: "2026-05-01T00:00:00.000Z" });
    insertThread(db, { id: "new", updatedAt: "2026-05-10T00:00:00.000Z" });
    db.close();

    const { records } = parseZed(dbPath, Date.parse("2026-05-05T00:00:00.000Z"));
    expect(records).toHaveLength(1);
    expect(records[0]!.sessionId).toBe("new");
  });

  it("skips non-copilot providers", () => {
    const db = createDb();
    insertThread(db, {
      id: "thread-other",
      provider: "anthropic",
      model: "claude-sonnet-4.5",
    });
    db.close();

    const { finding, records } = parseZed(dbPath);
    expect(records).toHaveLength(0);
    expect(finding.notes).toContain("No github-copilot provider records found.");
  });

  it("reports decode failures without aborting the parse", () => {
    const db = createDb();
    insertThread(db, { id: "good-thread" });
    db.prepare(
      `INSERT INTO threads (id, updated_at, created_at, data_type, data)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      "bad-thread",
      "2026-05-02T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z",
      "zstd",
      Buffer.from("not-zstd")
    );
    db.close();

    const { finding, records } = parseZed(dbPath);
    expect(records).toHaveLength(1);
    expect(finding.notes.some((note) => note.includes("bad-thread"))).toBe(true);
  });
});
