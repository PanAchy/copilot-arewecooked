import fg from "fast-glob";
import { existsSync } from "node:fs";
import { copilotCliStatePaths } from "./paths.js";
import type { SourceFinding, UsageRecord } from "./types.js";
import type { SourceParseResult } from "./source.js";
import {
  eventTimestampMs,
  recordsFromShutdownModelMetrics,
} from "./shutdownMetrics.js";
import { roughTokens, readLinesFromFile } from "./utils.js";

const FALLBACK_MODEL = "auto";

export function defaultCopilotCliStatePaths(): string[] {
  return copilotCliStatePaths();
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

  let shutdownSessions = 0;
  let fallbackSessions = 0;
  for (const file of files) {
    const result = parseCopilotCliSession(file, sinceMs);
    records.push(...result.records);
    if (result.kind === "shutdown") shutdownSessions += 1;
    if (result.kind === "fallback") fallbackSessions += 1;
  }

  finding.records = records.length;
  if (records.length === 0) {
    finding.notes.push("No assistant messages with outputTokens found.");
  } else {
    if (shutdownSessions > 0) {
      finding.notes.push(
        `${shutdownSessions} Copilot CLI session(s) had exact session.shutdown modelMetrics. Tokens are exact for those sessions.`
      );
    }
    if (fallbackSessions > 0) {
      finding.notes.push(
        `${fallbackSessions} Copilot CLI session(s) lacked shutdown metrics; normal chat input tokens are rough estimates for those sessions.`
      );
    }
  }
  return { finding, records };
}

type SessionParseKind = "shutdown" | "fallback" | "empty";

function parseCopilotCliSession(
  file: string,
  sinceMs?: number
): { kind: SessionParseKind; records: UsageRecord[] } {
  const events = readJsonlEvents(file);
  const sessionId = findSessionId(events);
  const shutdown = [...events]
    .reverse()
    .find((event) => event.type === "session.shutdown");
  const shutdownRecords = recordsFromShutdownModelMetrics({
    source: "copilot-cli",
    sourcePath: file,
    sessionId,
    event: shutdown,
    sinceMs,
  });
  if (shutdownRecords.length > 0)
    return { kind: "shutdown", records: shutdownRecords };

  const fallbackRecords = estimateRecordsFromAssistantMessages(
    file,
    sessionId,
    events,
    sinceMs
  );
  if (fallbackRecords.length > 0)
    return { kind: "fallback", records: fallbackRecords };

  return { kind: "empty", records: [] };
}

function readJsonlEvents(file: string): any[] {
  const events: any[] = [];
  for (const line of readLinesFromFile(file)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return events;
}

function findSessionId(events: any[]): string | undefined {
  for (const event of events) {
    if (event.type === "session.start") return event.data?.sessionId;
  }
  return undefined;
}

function estimateRecordsFromAssistantMessages(
  file: string,
  sessionId: string | undefined,
  events: any[],
  sinceMs?: number
): UsageRecord[] {
  const records: UsageRecord[] = [];
  let currentModel = FALLBACK_MODEL;
  let pendingInputEstimate = 0;

  for (const event of events) {
    if (event.type === "session.model_change")
      currentModel = event.data?.newModel ?? currentModel;

    const timestampMs = eventTimestampMs(event);
    if (sinceMs && timestampMs && timestampMs < sinceMs) continue;

    if (
      ["system.message", "user.message", "tool.execution_complete"].includes(
        event.type
      )
    ) {
      pendingInputEstimate += roughTokens(event.data);
    }

    if (event.type === "assistant.message") {
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
        outputTokens: event.data?.outputTokens ?? 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        calls: 1,
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
        inputTokens: usage.inputTokens ?? usage.input ?? 0,
        outputTokens: usage.outputTokens ?? usage.output ?? 0,
        cacheReadTokens: usage.cacheReadTokens ?? usage.cachedInput ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        calls: 1,
        mode: "compaction",
        agent: "compaction",
        isCompaction: true,
      });
    }
  }

  return records;
}
