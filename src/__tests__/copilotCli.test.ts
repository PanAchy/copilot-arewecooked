import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCopilotCli } from "../copilotCli.js";

let tmpBase: string;

beforeEach(() => {
  tmpBase = mkdtempSync(join(tmpdir(), "arewecooked-copilot-cli-"));
});

afterEach(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

function writeEvents(sessionId: string, events: any[]): void {
  const dir = join(tmpBase, sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "events.jsonl"),
    events.map((event) => JSON.stringify(event)).join("\n") + "\n"
  );
}

describe("parseCopilotCli", () => {
  it("uses exact session.shutdown modelMetrics when available", () => {
    writeEvents("s1", [
      {
        type: "session.start",
        data: { sessionId: "s1" },
        id: "start",
        timestamp: "2026-05-01T00:00:00.000Z",
      },
      {
        type: "assistant.message",
        data: { messageId: "m1", outputTokens: 999 },
        id: "msg",
        timestamp: "2026-05-01T00:00:01.000Z",
      },
      {
        type: "session.shutdown",
        id: "shutdown",
        timestamp: "2026-05-01T00:00:02.000Z",
        parentId: "msg",
        data: {
          modelMetrics: {
            "gpt-5-mini": {
              requests: { count: 5, cost: 2 },
              usage: {
                inputTokens: 87130,
                outputTokens: 3825,
                cacheReadTokens: 56704,
                cacheWriteTokens: 0,
              },
            },
          },
        },
      },
    ]);

    const { finding, records } = parseCopilotCli(tmpBase);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      model: "gpt-5-mini",
      inputTokens: 87130,
      outputTokens: 3825,
      cacheReadTokens: 56704,
      calls: 5,
      mode: "session.shutdown",
    });
    expect(finding.notes.join("\n")).toContain("exact session.shutdown");
  });

  it("adds multiple shutdown segments from resumed sessions", () => {
    writeEvents("s1", [
      {
        type: "session.start",
        data: { sessionId: "s1" },
        id: "start",
        timestamp: "2026-04-23T00:00:00.000Z",
      },
      {
        type: "session.shutdown",
        id: "shutdown-1",
        timestamp: "2026-04-23T00:56:41.384Z",
        data: {
          modelMetrics: {
            "claude-opus-4.7": {
              requests: { count: 121, cost: 82.5 },
              usage: {
                inputTokens: 11538077,
                outputTokens: 72829,
                cacheReadTokens: 11027120,
                cacheWriteTokens: 0,
              },
            },
            "gpt-5.4": {
              requests: { count: 12, cost: 0 },
              usage: {
                inputTokens: 562472,
                outputTokens: 7635,
                cacheReadTokens: 504064,
                cacheWriteTokens: 0,
              },
            },
          },
        },
      },
      {
        type: "session.shutdown",
        id: "shutdown-2",
        timestamp: "2026-04-26T13:45:51.780Z",
        data: {
          modelMetrics: {
            "claude-opus-4.7": {
              requests: { count: 1, cost: 7.5 },
              usage: {
                inputTokens: 77758,
                outputTokens: 150,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
            },
          },
        },
      },
    ]);

    const { records } = parseCopilotCli(tmpBase);

    expect(records).toHaveLength(3);
    const opusRecords = records.filter((r) => r.model === "claude-opus-4.7");
    expect(opusRecords).toHaveLength(2);
    expect(opusRecords.reduce((sum, r) => sum + r.calls, 0)).toBe(122);
    expect(opusRecords.reduce((sum, r) => sum + r.inputTokens, 0)).toBe(
      11615835
    );
    expect(records.find((r) => r.model === "gpt-5.4")).toMatchObject({
      calls: 12,
      inputTokens: 562472,
    });
  });

  it("does not double count assistant messages or compactions when shutdown metrics exist", () => {
    writeEvents("s1", [
      {
        type: "session.start",
        data: { sessionId: "s1" },
        id: "start",
        timestamp: "2026-05-01T00:00:00.000Z",
      },
      {
        type: "assistant.message",
        data: { messageId: "m1", outputTokens: 1000 },
        id: "msg-1",
        timestamp: "2026-05-01T00:00:01.000Z",
      },
      {
        type: "session.compaction_complete",
        data: {
          compactionTokensUsed: {
            input: 2000,
            output: 300,
            cachedInput: 400,
          },
        },
        id: "compact",
        timestamp: "2026-05-01T00:00:02.000Z",
      },
      {
        type: "assistant.message",
        data: { messageId: "m2", outputTokens: 500 },
        id: "msg-2",
        timestamp: "2026-05-01T00:00:03.000Z",
      },
      {
        type: "session.shutdown",
        id: "shutdown",
        timestamp: "2026-05-01T00:00:04.000Z",
        data: {
          modelMetrics: {
            "gpt-5-mini": {
              requests: { count: 2, cost: 1 },
              usage: {
                inputTokens: 100,
                outputTokens: 20,
                cacheReadTokens: 10,
                cacheWriteTokens: 0,
              },
            },
          },
        },
      },
    ]);

    const { records } = parseCopilotCli(tmpBase);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      mode: "session.shutdown",
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 10,
      calls: 2,
      isCompaction: false,
    });
  });

  it("falls back to unknown model when model data is missing", () => {
    writeEvents("s1", [
      {
        type: "session.start",
        data: { sessionId: "s1" },
        id: "start",
        timestamp: "2026-05-01T00:00:00.000Z",
      },
      {
        type: "user.message",
        data: { content: "hello" },
        id: "user",
        timestamp: "2026-05-01T00:00:01.000Z",
      },
      {
        type: "assistant.message",
        data: { messageId: "m1", content: "ok", outputTokens: 7 },
        id: "msg",
        timestamp: "2026-05-01T00:00:02.000Z",
      },
    ]);

    const { finding, records } = parseCopilotCli(tmpBase);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      model: "unknown",
      outputTokens: 7,
      calls: 1,
    });
    expect(finding.notes.join("\n")).toContain("lacked shutdown metrics");
  });

  it("keeps model changes for fallback sessions", () => {
    writeEvents("s1", [
      {
        type: "session.start",
        data: { sessionId: "s1" },
        id: "start",
        timestamp: "2026-05-01T00:00:00.000Z",
      },
      {
        type: "session.model_change",
        data: { newModel: "claude-sonnet-4.6" },
        id: "model",
        timestamp: "2026-05-01T00:00:01.000Z",
      },
      {
        type: "assistant.message",
        data: { messageId: "m1", content: "ok", outputTokens: 7 },
        id: "msg",
        timestamp: "2026-05-01T00:00:02.000Z",
      },
    ]);

    const { records } = parseCopilotCli(tmpBase);

    expect(records[0]?.model).toBe("claude-sonnet-4.6");
  });
});
