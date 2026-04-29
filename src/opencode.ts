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
    for (const row of db
      .prepare("select id, session_id, data from message")
      .iterate() as Iterable<{
      id: string;
      session_id: string;
      data: string;
    }>) {
      let data: any;
      try {
        data = JSON.parse(row.data);
      } catch {
        continue;
      }
      if (data.role !== "assistant") continue;
      if (sinceMs && (data.time?.created ?? 0) < sinceMs) continue;

      const provider = data.providerID ?? data.model?.providerID;
      const model = data.modelID ?? data.model?.modelID;
      if (!isCopilotProvider(provider, model)) continue;

      const tokens = data.tokens ?? {};
      const cache = tokens.cache ?? {};
      records.push({
        source: "opencode",
        sourcePath: path,
        sessionId: row.session_id,
        messageId: row.id,
        parentId: data.parentID,
        timestamp: data.time?.created,
        provider,
        model: String(model).replace(/^github-copilot\//, ""),
        inputTokens: tokens.input ?? 0,
        outputTokens: tokens.output ?? 0,
        cacheReadTokens: cache.read ?? 0,
        cacheWriteTokens: cache.write ?? 0,
        mode: data.mode,
        agent: data.agent,
        isCompaction:
          data.mode === "compaction" ||
          data.agent === "compaction" ||
          data.summary === true,
      });
    }

    const copilotSessions = new Set(
      records.map((record) => record.sessionId).filter(Boolean)
    );
    if (copilotSessions.size > 0) {
      for (const row of db
        .prepare("select session_id, data from part")
        .iterate() as Iterable<{ session_id: string; data: string }>) {
        if (!copilotSessions.has(row.session_id)) continue;
        let data: any;
        try {
          data = JSON.parse(row.data);
        } catch {
          continue;
        }
        if (data.type !== "tool") continue;
        const tool = data.tool;
        if (!tool) continue;
        if (!["question", "task", "delegate_task"].includes(tool)) continue;
        const status = data.state?.status;
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
