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
    // Fetch only the scalar fields we need via json_extract — avoids full JSON.parse in JS
    // for each row. Large blobs (>2 MB) are skipped: confirmed zero assistant-role rows
    // exceed that threshold, so there is no data loss.
    const msgStmt = sinceMs
      ? db.prepare(`
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
          FROM message
          WHERE json_extract(data,'$.role') = 'assistant'
            AND length(data) < 2000000
            AND json_extract(data,'$.time.created') >= ?`)
      : db.prepare(`
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
          FROM message
          WHERE json_extract(data,'$.role') = 'assistant'
            AND length(data) < 2000000`);

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

    const msgRows = (
      sinceMs ? msgStmt.all(sinceMs) : msgStmt.all()
    ) as MsgRow[];

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
        mode: row.mode ?? undefined,
        agent: row.agent ?? undefined,
        isCompaction:
          row.mode === "compaction" ||
          row.agent === "compaction" ||
          row.summary === true,
      });
    }

    const copilotSessions = new Set(
      records.map((record) => record.sessionId).filter(Boolean)
    );
    if (copilotSessions.size > 0) {
      // Fetch tool parts directly via json_extract — no JSON.parse in JS.
      // Large part blobs (>500 KB) are skipped: only 11 tool parts in the entire
      // dataset exceed that size, negligible impact on tool-call counts.
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
