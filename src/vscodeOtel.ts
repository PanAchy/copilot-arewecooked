import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { vscodeOtelDbPaths } from "./paths.js";
import type { SourceFinding, SourceKind, UsageRecord } from "./types.js";
import type { SourceParseResult } from "./source.js";

export function defaultVsCodeOtelDbPaths(): string[] {
  return vscodeOtelDbPaths();
}

type SpanRow = {
  span_id: string;
  trace_id: string;
  name: string;
  operation_name: string | null;
  provider_name: string | null;
  agent_name: string | null;
  conversation_id: string | null;
  chat_session_id: string | null;
  request_model: string | null;
  response_model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  reasoning_tokens: number | null;
  tool_name: string | null;
  tool_type: string | null;
  start_time_ms: number;
  end_time_ms: number;
  status_code: number;
};

type SpanAttributeRow = {
  span_id: string;
  key: string;
  value: string | null;
};

const SPAN_SELECT = `
  SELECT span_id, trace_id, name, operation_name, provider_name, agent_name,
    conversation_id, chat_session_id, request_model, response_model,
    input_tokens, output_tokens, cached_tokens, reasoning_tokens,
    tool_name, tool_type, start_time_ms, end_time_ms, status_code
  FROM spans
  WHERE operation_name = 'chat'
    AND provider_name = 'github'
`;

const SPAN_SINCE = `AND start_time_ms >= ?`;

function modelFromSpan(row: SpanRow): string {
  return (row.response_model ?? row.request_model ?? "").replace(
    /^github-copilot\//,
    ""
  );
}

export function parseVsCodeOtel(
  path = defaultVsCodeOtelDbPaths()[0],
  sinceMs?: number
): SourceParseResult {
  const finding: SourceFinding = {
    source: "vscode-otel",
    path,
    found: existsSync(path),
    records: 0,
    notes: [],
  };
  const records: UsageRecord[] = [];

  if (!finding.found) return { finding, records };

  let db: Database.Database;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
  } catch (err) {
    finding.notes.push(
      `Failed to open database: ${err instanceof Error ? err.message : String(err)}`
    );
    return { finding, records };
  }

  try {
    const query = sinceMs ? `${SPAN_SELECT} ${SPAN_SINCE}` : SPAN_SELECT;
    const rows = (
      sinceMs ? db.prepare(query).all(sinceMs) : db.prepare(query).all()
    ) as SpanRow[];

    for (const row of rows) {
      if (row.input_tokens === null && row.output_tokens === null) continue;

      records.push({
        source: "vscode-otel",
        sourcePath: path,
        sessionId: row.conversation_id ?? row.chat_session_id ?? undefined,
        messageId: row.span_id,
        parentId: undefined,
        timestamp: row.start_time_ms,
        provider: "github-copilot",
        model: modelFromSpan(row),
        inputTokens: row.input_tokens ?? 0,
        outputTokens: row.output_tokens ?? 0,
        cacheReadTokens: row.cached_tokens ?? 0,
        cacheWriteTokens: 0,
        calls: 1,
        mode: undefined,
        agent: row.agent_name ?? undefined,
        isCompaction: false,
      });
    }

    if (records.length > 0) {
      finding.notes.push(
        `Read ${records.length} chat span(s) from VS Code OTel traces DB. Tokens are exact.`
      );
    }
  } finally {
    db.close();
  }

  finding.records = records.length;
  if (records.length === 0)
    finding.notes.push("No VS Code OTel Copilot chat spans found.");

  return { finding, records };
}
