import type { SourceKind, UsageRecord } from "./types.js";

export function eventTimestampMs(event: any): number | undefined {
  const timestampMs = event.timestamp ? Date.parse(event.timestamp) : undefined;
  return Number.isFinite(timestampMs) ? timestampMs : undefined;
}

export function recordsFromShutdownModelMetrics(args: {
  source: SourceKind;
  sourcePath: string;
  sessionId?: string;
  event: any;
  sinceMs?: number;
}): UsageRecord[] {
  const shutdown = args.event;
  if (shutdown?.type !== "session.shutdown" || !shutdown.data?.modelMetrics) {
    return [];
  }

  const shutdownTimestampMs = eventTimestampMs(shutdown);
  if (
    args.sinceMs &&
    shutdownTimestampMs &&
    shutdownTimestampMs < args.sinceMs
  ) {
    return [];
  }

  return Object.entries<any>(shutdown.data.modelMetrics).map(
    ([model, metrics]) => {
      const usage = metrics.usage ?? {};
      return {
        source: args.source,
        sourcePath: args.sourcePath,
        sessionId: args.sessionId ?? shutdown.data?.sessionId,
        messageId: shutdown.id,
        parentId: shutdown.parentId,
        timestamp: shutdown.timestamp,
        provider: "github-copilot",
        model,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        calls: metrics.requests?.count ?? 1,
        mode: "session.shutdown",
        isCompaction: false,
      };
    }
  );
}
