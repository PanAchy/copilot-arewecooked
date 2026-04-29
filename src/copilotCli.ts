import fg from "fast-glob";
import { existsSync, readFileSync } from "node:fs";
import { copilotCliStatePaths } from "./paths.js";
import type { SourceFinding, UsageRecord } from "./types.js";
import type { SourceParseResult } from "./source.js";

export function defaultCopilotCliStatePaths(): string[] {
  return copilotCliStatePaths();
}

function roughTokens(value: unknown): number {
  if (value == null) return 0;
  return Math.ceil(JSON.stringify(value).length / 4);
}

export function parseCopilotCli(
  basePath = defaultCopilotCliStatePaths()[0],
  sinceMs?: number
): SourceParseResult {
  const finding: SourceFinding = {
    source: "copilot-cli",
    path: basePath,
    found: existsSync(basePath),
    records: 0,
    notes: [],
  };
  const records: UsageRecord[] = [];
  if (!finding.found) return { finding, records };

  const files = fg.sync("*/events.jsonl", {
    cwd: basePath,
    absolute: true,
    onlyFiles: true,
  });
  for (const file of files) {
    let sessionId: string | undefined;
    let currentModel = "gpt-5-mini";
    let pendingInputEstimate = 0;

    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      const timestampMs = event.timestamp
        ? Date.parse(event.timestamp)
        : undefined;
      if (event.type === "session.start") sessionId = event.data?.sessionId;
      if (event.type === "session.model_change")
        currentModel = event.data?.newModel ?? currentModel;
      if (sinceMs && timestampMs && timestampMs < sinceMs) continue;

      if (
        ["system.message", "user.message", "tool.execution_complete"].includes(
          event.type
        )
      ) {
        pendingInputEstimate += roughTokens(event.data);
      }

      if (event.type === "assistant.message") {
        const outputTokens = event.data?.outputTokens ?? 0;
        records.push({
          source: "copilot-cli",
          sourcePath: file,
          sessionId,
          messageId: event.data?.messageId ?? event.id,
          parentId: event.parentId,
          timestamp: event.timestamp,
          provider: "github-copilot",
          model: currentModel,
          inputTokens: pendingInputEstimate,
          outputTokens,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          isCompaction: false,
        });
        pendingInputEstimate =
          roughTokens(event.data?.content) +
          roughTokens(event.data?.toolRequests);
      }

      if (
        event.type === "session.compaction_complete" &&
        event.data?.compactionTokensUsed
      ) {
        const usage = event.data.compactionTokensUsed;
        records.push({
          source: "copilot-cli",
          sourcePath: file,
          sessionId,
          messageId: event.id,
          parentId: event.parentId,
          timestamp: event.timestamp,
          provider: "github-copilot",
          model: usage.model ?? currentModel,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cacheReadTokens: usage.cacheReadTokens ?? 0,
          cacheWriteTokens: usage.cacheWriteTokens ?? 0,
          mode: "compaction",
          agent: "compaction",
          isCompaction: true,
        });
      }
    }
  }

  finding.records = records.length;
  if (records.length === 0)
    finding.notes.push("No assistant messages with outputTokens found.");
  else
    finding.notes.push(
      "Normal chat input tokens are rough estimates; Copilot CLI compaction events expose exact input/output/cache tokens."
    );
  return { finding, records };
}
