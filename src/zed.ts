import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import zlib from "node:zlib";
import { zedDbPaths } from "./paths.js";
import type { SourceFinding, UsageRecord } from "./types.js";
import type { SourceParseResult } from "./source.js";

type ThreadRow = {
  id: string;
  updated_at: string | null;
  created_at: string | null;
  data_type: string | null;
  data: Buffer;
};

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

type JsonObject = Record<string, unknown>;

export function defaultZedDbPaths(): string[] {
  return zedDbPaths();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNested(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (!isObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function firstString(value: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const candidate = getNested(value, path);
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function decodeZstd(data: Buffer): Buffer {
  return zlib.zstdDecompressSync(data);
}

function decodeThreadPayload(row: ThreadRow): JsonObject {
  const dataType = row.data_type?.toLowerCase() ?? "zstd";
  const jsonText =
    dataType === "json"
      ? row.data.toString("utf8")
      : dataType === "zstd"
        ? decodeZstd(row.data).toString("utf8")
        : (() => {
            throw new Error(`Unsupported Zed thread data_type '${dataType}'`);
          })();

  const parsed: unknown = JSON.parse(jsonText);
  if (!isObject(parsed)) {
    throw new Error("Decoded Zed thread payload was not a JSON object");
  }
  return parsed;
}

function isCopilotProvider(provider?: string, model?: string): boolean {
  const providerValue = provider?.toLowerCase();
  const modelValue = model?.toLowerCase();
  return (
    providerValue?.includes("copilot") === true ||
    modelValue?.startsWith("github-copilot/") === true ||
    modelValue?.includes("copilot") === true
  );
}

function extractProvider(payload: JsonObject): string | undefined {
  return firstString(payload, [
    ["provider"],
    ["providerId"],
    ["provider_id"],
    ["model", "provider"],
    ["model", "providerId"],
    ["model", "provider_id"],
    ["profile", "provider"],
    ["profile", "providerId"],
    ["profile", "provider_id"],
  ]);
}

function extractModel(payload: JsonObject): string | undefined {
  return firstString(payload, [
    ["model"],
    ["model", "model"],
    ["model", "name"],
    ["model", "id"],
    ["model", "modelId"],
    ["model", "model_id"],
    ["profile", "model"],
    ["profile", "name"],
    ["profile", "id"],
  ]);
}

function extractAgent(payload: JsonObject): string | undefined {
  return firstString(payload, [
    ["agent"],
    ["profile", "name"],
    ["profile", "id"],
  ]);
}

function extractTokenUsage(value: unknown): TokenUsage {
  if (Array.isArray(value)) {
    return value.reduce<TokenUsage>(
      (acc, item) => {
        const usage = extractTokenUsage(item);
        acc.inputTokens += usage.inputTokens;
        acc.outputTokens += usage.outputTokens;
        acc.cacheReadTokens += usage.cacheReadTokens;
        acc.cacheWriteTokens += usage.cacheWriteTokens;
        return acc;
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }
    );
  }

  if (!isObject(value)) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
  }

  return {
    inputTokens: asNumber(value.input_tokens ?? value.inputTokens),
    outputTokens: asNumber(value.output_tokens ?? value.outputTokens),
    cacheReadTokens: asNumber(
      value.cache_read_input_tokens ?? value.cacheReadInputTokens
    ),
    cacheWriteTokens: asNumber(
      value.cache_creation_input_tokens ?? value.cacheWriteTokens
    ),
  };
}

function isNonZeroTokenUsage(usage: TokenUsage): boolean {
  return (
    usage.inputTokens > 0 ||
    usage.outputTokens > 0 ||
    usage.cacheReadTokens > 0 ||
    usage.cacheWriteTokens > 0
  );
}

function extractRequestTokenUsage(payload: JsonObject): TokenUsage {
  const value = payload.request_token_usage ?? payload.requestTokenUsage;
  if (Array.isArray(value)) return extractTokenUsage(value);
  if (!isObject(value)) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
  }

  return Object.values(value).reduce<TokenUsage>(
    (acc, item) => {
      const usage = extractTokenUsage(item);
      acc.inputTokens += usage.inputTokens;
      acc.outputTokens += usage.outputTokens;
      acc.cacheReadTokens += usage.cacheReadTokens;
      acc.cacheWriteTokens += usage.cacheWriteTokens;
      return acc;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
  );
}

function extractCalls(payload: JsonObject): number {
  const requestUsage = payload.request_token_usage ?? payload.requestTokenUsage;
  if (Array.isArray(requestUsage)) return requestUsage.length || 1;
  if (isObject(requestUsage))
    return Math.max(1, Object.keys(requestUsage).length);
  return 1;
}

function parseTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function parseZed(
  path = defaultZedDbPaths()[0],
  sinceMs?: number
): SourceParseResult {
  const finding: SourceFinding = {
    source: "zed",
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
    const rows = (
      sinceMs != null
        ? db
            .prepare(
              `SELECT id, updated_at, created_at, data_type, data
               FROM threads
               WHERE updated_at >= ?
               ORDER BY updated_at ASC`
            )
            .all(new Date(sinceMs).toISOString())
        : db
            .prepare(
              `SELECT id, updated_at, created_at, data_type, data
               FROM threads
               ORDER BY updated_at ASC`
            )
            .all()
    ) as ThreadRow[];

    for (const row of rows) {
      try {
        const payload = decodeThreadPayload(row);
        const provider = extractProvider(payload);
        const model = extractModel(payload);
        if (!isCopilotProvider(provider, model)) continue;

        const cumulativeUsage = extractTokenUsage(
          payload.cumulative_token_usage
        );
        const requestUsage = extractRequestTokenUsage(payload);
        const usage = isNonZeroTokenUsage(cumulativeUsage)
          ? cumulativeUsage
          : requestUsage;
        records.push({
          source: "zed",
          sourcePath: path,
          sessionId: row.id,
          timestamp: parseTimestamp(
            row.updated_at ?? row.created_at ?? undefined
          ),
          provider: provider ?? "github-copilot",
          model: (model ?? "unknown").replace(/^github-copilot\//, ""),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          calls: extractCalls(payload),
          agent: extractAgent(payload),
        });
      } catch (err) {
        finding.notes.push(
          `Failed to decode Zed thread ${row.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } finally {
    db.close();
  }

  finding.records = records.length;
  if (records.length === 0) {
    finding.notes.push("No github-copilot provider records found.");
  }

  return { finding, records };
}
