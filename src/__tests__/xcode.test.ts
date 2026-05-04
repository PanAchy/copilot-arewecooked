import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseXcode } from "../xcode.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "arewecooked-xcode-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Build a single window/logMessage log entry.
 * @param timestamp ISO timestamp
 * @param pid process id string
 * @param message the value for the "message" field (unescaped — will be embedded as-is)
 * @param messageFirst whether to put "message" before "type" in the JSON block
 */
function logEntry(
  timestamp: string,
  pid: string,
  message: string,
  messageFirst = true
): string {
  const fields = messageFirst
    ? `  "message" : "${message}",\n  "type" : 3`
    : `  "type" : 3,\n  "message" : "${message}"`;
  return `[${timestamp}] [info] [GitHubCopilot] [${pid}] window/logMessage: {\n${fields}\n}`;
}

function writeLog(name: string, entries: string[]): void {
  writeFileSync(join(tmpDir, name), entries.join("\n") + "\n");
}

// conversation\/turn uses JSON-escaped slashes (backslash + forward-slash)
function turnMsg(conversationId: string, turnId: string): string {
  return `[agentPrompt] for conversation\\/turn ${conversationId}\\/${turnId}`;
}

function activeModelMsg(model: string): string {
  return `[AutoModelService] Fetched auto model for active in 100ms: ${model}`;
}

function tokenUsageMsg(
  prompt: number,
  completion: number,
  cached: number
): string {
  const rate = prompt > 0 ? ((cached / prompt) * 100).toFixed(1) : "0.0";
  return `[roundMetricsTracker] Turn token usage: ${prompt} prompt, ${completion} completion, ${cached} cached (cache rate: ${rate}%)`;
}

describe("parseXcode", () => {
  it("returns found:false and no records when directory does not exist", () => {
    const { finding, records } = parseXcode("/nonexistent/path/xcode-logs");
    expect(finding.found).toBe(false);
    expect(records).toHaveLength(0);
  });

  it("happy path: two turns produce correct UsageRecords", () => {
    writeLog("test.log", [
      logEntry("2026-05-01T10:00:00.000Z", "100", activeModelMsg("gpt-4")),
      logEntry("2026-05-01T10:00:01.000Z", "100", turnMsg("conv-1", "turn-1")),
      logEntry("2026-05-01T10:00:02.000Z", "100", tokenUsageMsg(1000, 50, 800)),
      logEntry("2026-05-01T10:00:03.000Z", "100", activeModelMsg("gpt-5")),
      logEntry("2026-05-01T10:00:04.000Z", "100", turnMsg("conv-1", "turn-2")),
      logEntry(
        "2026-05-01T10:00:05.000Z",
        "100",
        tokenUsageMsg(2000, 100, 1500)
      ),
    ]);

    const { finding, records } = parseXcode(tmpDir);

    expect(finding.found).toBe(true);
    expect(records).toHaveLength(2);

    expect(records[0]).toMatchObject({
      source: "xcode",
      provider: "github",
      sessionId: "conv-1",
      messageId: "turn-1",
      model: "gpt-4",
      inputTokens: 1000,
      outputTokens: 50,
      cacheReadTokens: 800,
      cacheWriteTokens: 0,
      calls: 1,
    });

    expect(records[1]).toMatchObject({
      source: "xcode",
      provider: "github",
      sessionId: "conv-1",
      messageId: "turn-2",
      model: "gpt-5",
      inputTokens: 2000,
      outputTokens: 100,
      cacheReadTokens: 1500,
      calls: 1,
    });
  });

  it("nearby attribution: AutoModelService within 30 lines pins model to turn", () => {
    // AutoModelService immediately before conversation/turn → pinned
    writeLog("test.log", [
      logEntry("2026-05-01T10:00:00.000Z", "200", activeModelMsg("claude-3")),
      logEntry("2026-05-01T10:00:01.000Z", "200", turnMsg("conv-a", "turn-a")),
      logEntry("2026-05-01T10:00:02.000Z", "200", tokenUsageMsg(500, 30, 400)),
    ]);

    const { records } = parseXcode(tmpDir);

    expect(records).toHaveLength(1);
    expect(records[0].model).toBe("claude-3");
  });

  it("recent model fallback: AutoModelService > 30 lines before turn still resolves model", () => {
    // Place AutoModelService, then 35 filler entries (each 4 lines ≈ 140 lines) before the turn
    const entries: string[] = [
      logEntry("2026-05-01T10:00:00.000Z", "300", activeModelMsg("gpt-4o")),
    ];
    // Add 35 filler entries to push lineNum well past the window
    for (let i = 0; i < 35; i++) {
      entries.push(
        logEntry(
          `2026-05-01T10:00:0${String(i).padStart(2, "0")}.000Z`,
          "300",
          "filler message"
        )
      );
    }
    entries.push(
      logEntry("2026-05-01T10:05:00.000Z", "300", turnMsg("conv-b", "turn-b")),
      logEntry("2026-05-01T10:05:01.000Z", "300", tokenUsageMsg(300, 20, 200))
    );

    writeLog("test.log", entries);

    const { records } = parseXcode(tmpDir);

    expect(records).toHaveLength(1);
    // Model resolves via recent_active_model path (not pinned but same file)
    expect(records[0].model).toBe("gpt-4o");
  });

  it("unknown model: no AutoModelService in file → model is <unknown>", () => {
    writeLog("test.log", [
      logEntry("2026-05-01T10:00:01.000Z", "400", turnMsg("conv-c", "turn-c")),
      logEntry("2026-05-01T10:00:02.000Z", "400", tokenUsageMsg(100, 10, 80)),
    ]);

    const { records } = parseXcode(tmpDir);

    expect(records).toHaveLength(1);
    expect(records[0].model).toBe("<unknown>");
  });

  it("sinceMs filter: entries before cutoff are excluded", () => {
    writeLog("test.log", [
      logEntry("2026-04-01T00:00:00.000Z", "500", activeModelMsg("old-model")),
      logEntry(
        "2026-04-01T00:00:01.000Z",
        "500",
        turnMsg("conv-old", "turn-old")
      ),
      logEntry("2026-04-01T00:00:02.000Z", "500", tokenUsageMsg(100, 10, 80)),
      logEntry("2026-05-01T00:00:00.000Z", "500", activeModelMsg("new-model")),
      logEntry(
        "2026-05-01T00:00:01.000Z",
        "500",
        turnMsg("conv-new", "turn-new")
      ),
      logEntry("2026-05-01T00:00:02.000Z", "500", tokenUsageMsg(200, 20, 160)),
    ]);

    const cutoff = Date.parse("2026-05-01T00:00:00.000Z");
    const { records } = parseXcode(tmpDir, cutoff);

    expect(records).toHaveLength(1);
    expect(records[0].sessionId).toBe("conv-new");
  });

  it("multi-pid isolation: two PIDs have independent model and turn state", () => {
    writeLog("test.log", [
      logEntry("2026-05-01T10:00:00.000Z", "1001", activeModelMsg("model-A")),
      logEntry("2026-05-01T10:00:01.000Z", "1002", activeModelMsg("model-B")),
      logEntry("2026-05-01T10:00:02.000Z", "1001", turnMsg("conv-A", "turn-A")),
      logEntry("2026-05-01T10:00:03.000Z", "1002", turnMsg("conv-B", "turn-B")),
      logEntry("2026-05-01T10:00:04.000Z", "1001", tokenUsageMsg(100, 10, 80)),
      logEntry("2026-05-01T10:00:05.000Z", "1002", tokenUsageMsg(200, 20, 160)),
    ]);

    const { records } = parseXcode(tmpDir);

    expect(records).toHaveLength(2);
    const recA = records.find((r) => r.sessionId === "conv-A");
    const recB = records.find((r) => r.sessionId === "conv-B");

    expect(recA?.model).toBe("model-A");
    expect(recA?.inputTokens).toBe(100);
    expect(recB?.model).toBe("model-B");
    expect(recB?.inputTokens).toBe(200);
  });

  it("multi-file: records from all .log files are aggregated", () => {
    writeLog("first.log", [
      logEntry("2026-05-01T10:00:00.000Z", "600", activeModelMsg("gpt-4")),
      logEntry(
        "2026-05-01T10:00:01.000Z",
        "600",
        turnMsg("conv-f1", "turn-f1")
      ),
      logEntry("2026-05-01T10:00:02.000Z", "600", tokenUsageMsg(100, 10, 80)),
    ]);
    writeLog("second.log", [
      logEntry("2026-05-01T11:00:00.000Z", "600", activeModelMsg("gpt-5")),
      logEntry(
        "2026-05-01T11:00:01.000Z",
        "600",
        turnMsg("conv-f2", "turn-f2")
      ),
      logEntry("2026-05-01T11:00:02.000Z", "600", tokenUsageMsg(200, 20, 160)),
    ]);

    const { finding, records } = parseXcode(tmpDir);

    expect(finding.found).toBe(true);
    expect(records).toHaveLength(2);
    const ids = records.map((r) => r.sessionId);
    expect(ids).toContain("conv-f1");
    expect(ids).toContain("conv-f2");
  });

  it("message field order: 'message' before 'type' and 'type' before 'message' both work", () => {
    writeLog("test.log", [
      // message first
      logEntry(
        "2026-05-01T10:00:00.000Z",
        "700",
        activeModelMsg("gpt-4"),
        true
      ),
      logEntry(
        "2026-05-01T10:00:01.000Z",
        "700",
        turnMsg("conv-ord", "turn-1"),
        true
      ),
      logEntry(
        "2026-05-01T10:00:02.000Z",
        "700",
        tokenUsageMsg(100, 10, 80),
        true
      ),
      // type first
      logEntry(
        "2026-05-01T10:00:03.000Z",
        "700",
        activeModelMsg("gpt-4"),
        false
      ),
      logEntry(
        "2026-05-01T10:00:04.000Z",
        "700",
        turnMsg("conv-ord", "turn-2"),
        false
      ),
      logEntry(
        "2026-05-01T10:00:05.000Z",
        "700",
        tokenUsageMsg(200, 20, 160),
        false
      ),
    ]);

    const { records } = parseXcode(tmpDir);

    expect(records).toHaveLength(2);
    expect(records[0].model).toBe("gpt-4");
    expect(records[1].model).toBe("gpt-4");
    expect(records[0].inputTokens).toBe(100);
    expect(records[1].inputTokens).toBe(200);
  });

  it("token usage without preceding turn context is silently skipped", () => {
    writeLog("test.log", [
      logEntry("2026-05-01T10:00:00.000Z", "800", activeModelMsg("gpt-4")),
      // No turn context set before token usage
      logEntry("2026-05-01T10:00:01.000Z", "800", tokenUsageMsg(100, 10, 80)),
    ]);

    const { records } = parseXcode(tmpDir);

    expect(records).toHaveLength(0);
  });

  it("finding.records matches actual record count", () => {
    writeLog("test.log", [
      logEntry("2026-05-01T10:00:00.000Z", "900", activeModelMsg("gpt-4")),
      logEntry("2026-05-01T10:00:01.000Z", "900", turnMsg("conv-x", "turn-x")),
      logEntry("2026-05-01T10:00:02.000Z", "900", tokenUsageMsg(100, 10, 80)),
    ]);

    const { finding, records } = parseXcode(tmpDir);

    expect(finding.records).toBe(records.length);
    expect(finding.records).toBe(1);
  });
});
