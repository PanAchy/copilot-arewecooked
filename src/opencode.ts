import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { opencodeDbPaths } from "./paths.js";
import type { SourceFinding, ToolFinding, UsageRecord } from "./types.js";
import type { SourceParseResult } from "./source.js";

export function defaultOpenCodeDbPaths(): string[] {
  return opencodeDbPaths();
}

function isCopilotProvider(provider?: string, model?: string): boolean {
  return (
    provider === "github-copilot" ||
    model?.startsWith("github-copilot/") === true
  );
}

type MsgRow = {
  id: string;
  session_id: string;
  ts: number | null;
  prov: string | null;
  mdl: string | null;
  mprov: string | null;
  mmdl: string | null;
  t_in: number | null;
  t_out: number | null;
  t_cr: number | null;
  t_cw: number | null;
  parent: string | null;
  mode: string | null;
  agent: string | null;
  summary: unknown;
};

const MSG_SELECT = `
  SELECT id, session_id,
    json_extract(data,'$.time.created')       AS ts,
    json_extract(data,'$.providerID')          AS prov,
    json_extract(data,'$.modelID')             AS mdl,
    json_extract(data,'$.model.providerID')    AS mprov,
    json_extract(data,'$.model.modelID')       AS mmdl,
    json_extract(data,'$.tokens.input')        AS t_in,
    json_extract(data,'$.tokens.output')       AS t_out,
    json_extract(data,'$.tokens.cache.read')   AS t_cr,
    json_extract(data,'$.tokens.cache.write')  AS t_cw,
    json_extract(data,'$.parentID')            AS parent,
    json_extract(data,'$.mode')                AS mode,
    json_extract(data,'$.agent')               AS agent,
    json_extract(data,'$.summary')             AS summary
  FROM message`;

const WHERE_ASSISTANT = `json_extract(data,'$.role') = 'assistant'`;
const WHERE_SINCE = `json_extract(data,'$.time.created') >= ?`;

/**
 * Fetch all assistant message rows, falling back to rowid-chunked scanning
 * if any blob exceeds Node.js/SQLite's in-memory size limit (SQLITE_TOOBIG).
 *
 * Fast path: single query over the whole table.
 * Slow path: scan by rowid chunks of CHUNK_SIZE, then one-by-one on chunk failure.
 * Unreadable rows are identified by message ID + session ID (those columns never
 * require reading the data blob) and reported in finding.notes.
 */
function fetchMsgRows(
  db: Database.Database,
  sinceMs: number | undefined,
  finding: SourceFinding
): MsgRow[] {
  const whereClause = sinceMs
    ? `${WHERE_ASSISTANT} AND ${WHERE_SINCE}`
    : WHERE_ASSISTANT;

  // ── Fast path ────────────────────────────────────────────────────────────
  const fastStmt = db.prepare(`${MSG_SELECT} WHERE ${whereClause}`);
  try {
    return (sinceMs ? fastStmt.all(sinceMs) : fastStmt.all()) as MsgRow[];
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code !== "SQLITE_TOOBIG") throw e;
  }

  // ── Slow path: rowid-chunked scan ────────────────────────────────────────
  const CHUNK_SIZE = 200;
  const results: MsgRow[] = [];
  const skipped: { id: string; session_id: string }[] = [];

  // Rowid scan never touches the data column — always safe.
  const allRowids = db
    .prepare("SELECT rowid FROM message ORDER BY rowid")
    .pluck()
    .all() as number[];

  for (let i = 0; i < allRowids.length; i += CHUNK_SIZE) {
    const chunk = allRowids.slice(i, i + CHUNK_SIZE);
    const ph = chunk.map(() => "?").join(",");
    const chunkWhere = `rowid IN (${ph}) AND ${whereClause}`;
    const chunkArgs = sinceMs ? ([...chunk, sinceMs] as unknown[]) : chunk;

    try {
      const rows = db
        .prepare(`${MSG_SELECT} WHERE ${chunkWhere}`)
        .all(...chunkArgs) as MsgRow[];
      for (const row of rows) results.push(row);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code !== "SQLITE_TOOBIG") throw e;

      // Narrow down: try one row at a time within the failing chunk.
      for (const rowid of chunk) {
        const singleArgs = sinceMs ? ([rowid, sinceMs] as unknown[]) : [rowid];
        try {
          const rows = db
            .prepare(`${MSG_SELECT} WHERE rowid = ? AND ${whereClause}`)
            .all(...singleArgs) as MsgRow[];
          for (const row of rows) results.push(row);
        } catch (e2: unknown) {
          if ((e2 as NodeJS.ErrnoException)?.code !== "SQLITE_TOOBIG") throw e2;

          // Data blob is truly unreadable. Retrieve identity columns only
          // (they never require loading the data blob).
          const meta = db
            .prepare("SELECT id, session_id FROM message WHERE rowid = ?")
            .get(rowid) as { id: string; session_id: string } | undefined;
          if (meta) skipped.push(meta);
        }
      }
    }
  }

  if (skipped.length > 0) {
    finding.notes.push(
      `Warning: ${skipped.length} message(s) could not be read because their data ` +
        `blob exceeds Node.js memory limits. Token counts may be understated. ` +
        `Affected message IDs: ${skipped.map((m) => `${m.id} (session: ${m.session_id})`).join(", ")}`
    );
  }

  return results;
}

export function parseOpenCode(
  path = defaultOpenCodeDbPaths()[0],
  sinceMs?: number
): SourceParseResult {
  const finding: SourceFinding = {
    source: "opencode",
    path,
    found: existsSync(path),
    records: 0,
    notes: [],
  };
  const records: UsageRecord[] = [];
  const toolCounts = new Map<string, ToolFinding>();

  if (!finding.found) return { finding, records, toolFindings: [] };

  let db: Database.Database;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
  } catch (err) {
    finding.notes.push(
      `Failed to open database: ${err instanceof Error ? err.message : String(err)}`
    );
    return { finding, records, toolFindings: [] };
  }

  try {
    const msgRows = fetchMsgRows(db, sinceMs, finding);

    for (const row of msgRows) {
      const provider = row.prov ?? row.mprov ?? undefined;
      const model = row.mdl ?? row.mmdl ?? undefined;
      if (!isCopilotProvider(provider, model)) continue;

      records.push({
        source: "opencode",
        sourcePath: path,
        sessionId: row.session_id,
        messageId: row.id,
        parentId: row.parent ?? undefined,
        timestamp: row.ts ?? undefined,
        provider: String(provider ?? ""),
        model: String(model ?? "").replace(/^github-copilot\//, ""),
        inputTokens: row.t_in ?? 0,
        outputTokens: row.t_out ?? 0,
        cacheReadTokens: row.t_cr ?? 0,
        cacheWriteTokens: row.t_cw ?? 0,
        calls: 1,
        mode: row.mode ?? undefined,
        agent: row.agent ?? undefined,
        isCompaction:
          row.mode === "compaction" ||
          row.agent === "compaction" ||
          row.summary === true ||
          row.summary === 1,
      });
    }

    const copilotSessions = new Set(
      records.map((record) => record.sessionId).filter(Boolean)
    );
    if (copilotSessions.size > 0) {
      type PartRow = {
        session_id: string;
        tool: string | null;
        status: string | null;
      };
      for (const row of db
        .prepare(
          `
          SELECT session_id,
            json_extract(data,'$.tool')         AS tool,
            json_extract(data,'$.state.status') AS status
          FROM part
          WHERE length(data) < 500000
            AND json_extract(data,'$.type') = 'tool'`
        )
        .iterate() as Iterable<PartRow>) {
        if (!copilotSessions.has(row.session_id)) continue;
        const tool = row.tool;
        if (!tool) continue;
        if (!["question", "task", "delegate_task"].includes(tool)) continue;
        const status = row.status ?? undefined;
        const key = `${row.session_id}:${tool}:${status ?? "unknown"}`;
        const existing = toolCounts.get(key);
        if (existing) existing.count += 1;
        else
          toolCounts.set(key, {
            source: "opencode",
            sessionId: row.session_id,
            tool,
            status,
            count: 1,
          });
      }
    }
  } finally {
    db.close();
  }

  finding.records = records.length;
  if (records.length === 0)
    finding.notes.push("No github-copilot provider records found.");

  return { finding, records, toolFindings: [...toolCounts.values()] };
}
