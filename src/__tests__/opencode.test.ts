import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { parseOpenCode } from "../opencode.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "arewecooked-opencode-test-"));
  dbPath = join(tmpDir, "test.db");
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

function createDb(): Database.Database {
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
  return db;
}

function insertSession(
  db: Database.Database,
  row: {
    id: string;
    modelProviderID?: string;
    modelID?: string;
    tokensInput?: number;
    tokensOutput?: number;
    tokensCacheRead?: number;
    tokensCacheWrite?: number;
    timeCreated?: number;
    agent?: string;
    timeCompacting?: number | null;
  }
) {
  const model =
    row.modelProviderID || row.modelID
      ? JSON.stringify({
          providerID: row.modelProviderID ?? "",
          id: row.modelID ?? "",
        })
      : null;
  db.prepare(
    `INSERT INTO session (id, model, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, time_created, agent, time_compacting)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    model,
    row.tokensInput ?? 0,
    row.tokensOutput ?? 0,
    row.tokensCacheRead ?? 0,
    row.tokensCacheWrite ?? 0,
    row.timeCreated ?? 1_000_000,
    row.agent ?? null,
    row.timeCompacting ?? null
  );
}

function insertMessage(
  db: Database.Database,
  msg: {
    id: string;
    sessionId: string;
    role?: string;
    providerID?: string;
    modelID?: string;
    modelProviderID?: string;
    modelModelID?: string;
    inputTokens?: number;
    outputTokens?: number;
    cacheRead?: number;
    cacheWrite?: number;
    createdMs?: number;
    mode?: string;
    summary?: boolean;
  }
) {
  const data: Record<string, unknown> = {
    role: msg.role ?? "assistant",
    time: { created: msg.createdMs ?? 1_000_000 },
    tokens: {
      input: msg.inputTokens ?? 0,
      output: msg.outputTokens ?? 0,
      cache: { read: msg.cacheRead ?? 0, write: msg.cacheWrite ?? 0 },
    },
    ...(msg.providerID && { providerID: msg.providerID }),
    ...(msg.modelID && { modelID: msg.modelID }),
    ...(msg.modelProviderID && {
      model: {
        providerID: msg.modelProviderID,
        modelID: msg.modelModelID ?? "",
      },
    }),
    ...(msg.mode && { mode: msg.mode }),
    ...(msg.summary !== undefined && { summary: msg.summary }),
  };
  db.prepare("INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)").run(
    msg.id,
    msg.sessionId,
    JSON.stringify(data)
  );
}

function toobigError(): Error {
  const err = new Error("string or blob too big") as NodeJS.ErrnoException;
  err.code = "SQLITE_TOOBIG";
  return err;
}

// ---------------------------------------------------------------------------
// Happy path — real SQLite
// ---------------------------------------------------------------------------

describe("parseOpenCode — happy path", () => {
  it("returns not-found finding when database does not exist", () => {
    const { finding, records } = parseOpenCode("/nonexistent/path/db.sqlite");
    expect(finding.found).toBe(false);
    expect(records).toHaveLength(0);
  });

  it("returns token records for github-copilot provider messages", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
      inputTokens: 100,
      outputTokens: 50,
      cacheRead: 200,
      cacheWrite: 10,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(1);
    expect(records[0]!.inputTokens).toBe(100);
    expect(records[0]!.outputTokens).toBe(50);
    expect(records[0]!.cacheReadTokens).toBe(200);
    expect(records[0]!.cacheWriteTokens).toBe(10);
  });

  it("strips github-copilot/ prefix from model name", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "github-copilot/claude-opus-4.5",
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records[0]!.model).toBe("claude-opus-4.5");
  });

  it("accepts copilot provider via nested model.providerID", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      modelProviderID: "github-copilot",
      modelModelID: "claude-sonnet-4.5",
      inputTokens: 300,
      outputTokens: 75,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(1);
    expect(records[0]!.inputTokens).toBe(300);
  });

  it("skips non-copilot provider rows", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      providerID: "anthropic",
      modelID: "claude-opus-4.5",
      inputTokens: 999,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(0);
  });

  it("skips non-assistant rows", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      role: "user",
      providerID: "github-copilot",
      inputTokens: 999,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(0);
  });

  it("adds note when no copilot records found", () => {
    createDb().close();

    const { finding } = parseOpenCode(dbPath);
    expect(finding.notes).toContain(
      "No github-copilot provider records found."
    );
  });

  it("filters records older than sinceMs", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-old",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
      createdMs: 1_000_000,
    });
    insertMessage(db, {
      id: "msg-new",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
      createdMs: 3_000_000,
    });
    db.close();

    const { records } = parseOpenCode(dbPath, 2_000_000);
    expect(records).toHaveLength(1);
    expect(records[0]!.messageId).toBe("msg-new");
  });

  it("marks compaction messages via mode field", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
      mode: "compaction",
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records[0]!.isCompaction).toBe(true);
  });

  it("marks compaction messages via summary:true", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
      summary: true,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records[0]!.isCompaction).toBe(true);
  });

  it("sums tokens correctly across multiple records", () => {
    const db = createDb();
    for (let i = 1; i <= 5; i++) {
      insertMessage(db, {
        id: `msg-${i}`,
        sessionId: "ses-1",
        providerID: "github-copilot",
        modelID: "claude-opus-4.5",
        inputTokens: 100,
        outputTokens: 50,
      });
    }
    db.close();

    const { records } = parseOpenCode(dbPath);
    const totalInput = records.reduce((s, r) => s + r.inputTokens, 0);
    const totalOutput = records.reduce((s, r) => s + r.outputTokens, 0);
    expect(totalInput).toBe(500);
    expect(totalOutput).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// SQLITE_TOOBIG fallback — mocked Database
// ---------------------------------------------------------------------------

describe("parseOpenCode — SQLITE_TOOBIG fallback", () => {
  it("processes all readable rows and reports unreadable row in findings", () => {
    // Create a real DB with 3 rows so we have real data to work with.
    // Then we mock the initial .all() to throw, and have the chunked path
    // succeed except for one specific rowid.
    const db = createDb();
    insertMessage(db, {
      id: "msg-good-1",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
      inputTokens: 100,
      outputTokens: 50,
    });
    insertMessage(db, {
      id: "msg-bad",
      sessionId: "ses-2",
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
      inputTokens: 999,
      outputTokens: 999,
    });
    insertMessage(db, {
      id: "msg-good-2",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
      inputTokens: 200,
      outputTokens: 100,
    });

    // Get the rowid of the "bad" message so we can simulate it failing.
    const badRowid = (
      db.prepare("SELECT rowid FROM message WHERE id = ?").get("msg-bad") as {
        rowid: number;
      }
    ).rowid;
    db.close();

    const realPrepare = Database.prototype.prepare;
    let fastPathUsed = false;

    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql: string
    ) {
      const stmt = realPrepare.call(this, sql);

      // Fast-path: first full-table assistant query (no rowid clause)
      if (
        sql.includes("FROM message") &&
        !sql.includes("rowid") &&
        !fastPathUsed
      ) {
        fastPathUsed = true;
        return new Proxy(stmt, {
          get(target, prop) {
            if (prop === "all")
              return () => {
                throw toobigError();
              };
            const v = (target as any)[prop];
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
      }

      // Chunk query (rowid IN (?,?,?)) — throw if the bad row is in this chunk
      if (sql.includes("rowid IN") && sql.includes("FROM message")) {
        return new Proxy(stmt, {
          get(target, prop) {
            if (prop === "all") {
              return (...args: unknown[]) => {
                if (args.includes(badRowid)) throw toobigError();
                return target.all(...args);
              };
            }
            const v = (target as any)[prop];
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
      }

      // Single-row query (rowid = ?) — throw only for the bad row
      if (sql.includes("rowid = ?") && sql.includes("FROM message")) {
        return new Proxy(stmt, {
          get(target, prop) {
            if (prop === "all") {
              return (...args: unknown[]) => {
                if (args[0] === badRowid) throw toobigError();
                return target.all(...args);
              };
            }
            const v = (target as any)[prop];
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
      }

      return stmt;
    });

    const { finding, records } = parseOpenCode(dbPath);

    // Good rows should be present
    const ids = records.map((r) => r.messageId);
    expect(ids).toContain("msg-good-1");
    expect(ids).toContain("msg-good-2");
    expect(ids).not.toContain("msg-bad");

    // Token totals from the two good rows only
    const totalInput = records.reduce((s, r) => s + r.inputTokens, 0);
    expect(totalInput).toBe(300);

    // Unreadable row must be reported in findings
    expect(finding.notes.some((n) => n.includes("msg-bad"))).toBe(true);
    expect(finding.notes.some((n) => n.includes("ses-2"))).toBe(true);
    expect(
      finding.notes.some((n) => n.includes("Token counts may be understated"))
    ).toBe(true);
  });

  it("re-throws non-TOOBIG errors from the fast path", () => {
    createDb().close();

    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql: string
    ) {
      if (sql.includes("FROM message")) {
        return {
          all: () => {
            throw new Error("unexpected db error");
          },
        } as unknown as Database.Statement;
      }
      const realPrepare = Database.prototype.prepare;
      return realPrepare.call(this, sql);
    });

    expect(() => parseOpenCode(dbPath)).toThrow("unexpected db error");
  });

  it("re-throws non-TOOBIG errors during chunked fallback", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "claude-opus-4.5",
    });
    db.close();

    const realPrepare = Database.prototype.prepare;
    let fastPathDone = false;

    vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: Database.Database,
      sql: string
    ) {
      const stmt = realPrepare.call(this, sql);

      if (
        sql.includes("FROM message") &&
        !sql.includes("rowid") &&
        !fastPathDone
      ) {
        fastPathDone = true;
        return new Proxy(stmt, {
          get(target, prop) {
            if (prop === "all")
              return () => {
                throw toobigError();
              };
            const v = (target as any)[prop];
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
      }

      if (sql.includes("rowid IN") && sql.includes("FROM message")) {
        return new Proxy(stmt, {
          get(target, prop) {
            if (prop === "all")
              return () => {
                throw new Error("unexpected chunk error");
              };
            const v = (target as any)[prop];
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
      }

      return stmt;
    });

    expect(() => parseOpenCode(dbPath)).toThrow("unexpected chunk error");
  });
});

// ---------------------------------------------------------------------------
// Session-level fallback (OpenCode 1.16.0+)
// ---------------------------------------------------------------------------

describe("parseOpenCode — session-level fallback", () => {
  it("creates records from session table when messages have zero tokens", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "gpt-5-mini",
      inputTokens: 0,
      outputTokens: 0,
    });
    insertSession(db, {
      id: "ses-1",
      modelProviderID: "github-copilot",
      modelID: "gpt-5-mini",
      tokensInput: 1000,
      tokensOutput: 500,
      tokensCacheRead: 200,
      tokensCacheWrite: 50,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(1);
    expect(records[0]!.sessionId).toBe("ses-1");
    expect(records[0]!.inputTokens).toBe(1000);
    expect(records[0]!.outputTokens).toBe(500);
    expect(records[0]!.cacheReadTokens).toBe(200);
    expect(records[0]!.cacheWriteTokens).toBe(50);
    expect(records[0]!.model).toBe("gpt-5-mini");
  });

  it("skips session-level fallback when message records have non-zero tokens", () => {
    const db = createDb();
    insertMessage(db, {
      id: "msg-1",
      sessionId: "ses-1",
      providerID: "github-copilot",
      modelID: "gpt-5-mini",
      inputTokens: 500,
      outputTokens: 300,
    });
    insertSession(db, {
      id: "ses-1",
      modelProviderID: "github-copilot",
      modelID: "gpt-5-mini",
      tokensInput: 9999,
      tokensOutput: 9999,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(1);
    // Should prefer per-message granularity, not session aggregate
    expect(records[0]!.inputTokens).toBe(500);
    expect(records[0]!.outputTokens).toBe(300);
    expect(records[0]!.messageId).toBe("msg-1");
  });

  it("creates session-level records when no messages exist for a copilot session", () => {
    const db = createDb();
    insertSession(db, {
      id: "ses-1",
      modelProviderID: "github-copilot",
      modelID: "gpt-5-mini",
      tokensInput: 2000,
      tokensOutput: 1000,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(1);
    expect(records[0]!.sessionId).toBe("ses-1");
    expect(records[0]!.inputTokens).toBe(2000);
    expect(records[0]!.outputTokens).toBe(1000);
    expect(records[0]!.messageId).toBeUndefined();
    expect(records[0]!.model).toBe("gpt-5-mini");
  });

  it("skips non-copilot sessions", () => {
    const db = createDb();
    insertSession(db, {
      id: "ses-1",
      modelProviderID: "openai",
      modelID: "gpt-5.5",
      tokensInput: 1000,
      tokensOutput: 500,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(0);
  });

  it("skips sessions with zero tokens", () => {
    const db = createDb();
    insertSession(db, {
      id: "ses-1",
      modelProviderID: "github-copilot",
      modelID: "gpt-5-mini",
      tokensInput: 0,
      tokensOutput: 0,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records).toHaveLength(0);
  });

  it("filters session records by sinceMs", () => {
    const db = createDb();
    insertSession(db, {
      id: "ses-old",
      modelProviderID: "github-copilot",
      modelID: "gpt-5-mini",
      tokensInput: 500,
      tokensOutput: 300,
      timeCreated: 1_000_000,
    });
    insertSession(db, {
      id: "ses-new",
      modelProviderID: "github-copilot",
      modelID: "gpt-5-mini",
      tokensInput: 1000,
      tokensOutput: 500,
      timeCreated: 3_000_000,
    });
    db.close();

    const { records } = parseOpenCode(dbPath, 2_000_000);
    expect(records).toHaveLength(1);
    expect(records[0]!.sessionId).toBe("ses-new");
  });

  it("marks session as compaction when time_compacting is set", () => {
    const db = createDb();
    insertSession(db, {
      id: "ses-1",
      modelProviderID: "github-copilot",
      modelID: "gpt-5-mini",
      tokensInput: 500,
      tokensOutput: 300,
      timeCompacting: 2_000_000,
    });
    db.close();

    const { records } = parseOpenCode(dbPath);
    expect(records[0]!.isCompaction).toBe(true);
  });
});
