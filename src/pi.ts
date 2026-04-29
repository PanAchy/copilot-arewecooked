import fg from "fast-glob";
import { existsSync, readFileSync } from "node:fs";
import { piSessionsPaths } from "./paths.js";
import type { SourceFinding, UsageRecord } from "./types.js";
import type { SourceParseResult } from "./source.js";

export function defaultPiSessionsPaths(): string[] {
  return piSessionsPaths();
}

export function parsePi(
  basePath = defaultPiSessionsPaths()[0],
  sinceMs?: number
): SourceParseResult {
  const finding: SourceFinding = {
    source: "pi",
    path: basePath,
    found: existsSync(basePath),
    records: 0,
    notes: [],
  };
  const records: UsageRecord[] = [];
  if (!finding.found) return { finding, records };

  const files = fg.sync("*/*.jsonl", {
    cwd: basePath,
    absolute: true,
    onlyFiles: true,
  });
  for (const file of files) {
    let sessionId: string | undefined;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      let data: any;
      try {
        data = JSON.parse(line);
      } catch {
        continue;
      }
      if (data.type === "session") sessionId = data.id;
      if (data.type !== "message") continue;
      const message = data.message ?? {};
      if (message.role !== "assistant") continue;
      if (message.provider !== "github-copilot") continue;
      const timestampMs = data.timestamp
        ? Date.parse(data.timestamp)
        : undefined;
      if (sinceMs && timestampMs && timestampMs < sinceMs) continue;
      const usage = message.usage ?? {};
      records.push({
        source: "pi",
        sourcePath: file,
        sessionId,
        messageId: data.id,
        parentId: data.parentId,
        timestamp: data.timestamp,
        provider: message.provider,
        model: message.model,
        inputTokens: usage.input ?? 0,
        outputTokens: usage.output ?? 0,
        cacheReadTokens: usage.cacheRead ?? 0,
        cacheWriteTokens: usage.cacheWrite ?? 0,
        isCompaction: false,
      });
    }
  }

  finding.records = records.length;
  if (records.length === 0)
    finding.notes.push("No github-copilot provider records found.");
  return { finding, records };
}
