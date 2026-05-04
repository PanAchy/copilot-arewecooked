import { existsSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { xcodeLogPaths } from "./paths.js";
import type { SourceParseResult } from "./source.js";
import type { SourceFinding, UsageRecord } from "./types.js";
import { readLinesFromFile } from "./utils.js";

const MODEL_ATTACH_WINDOW = 30;

// Matches: [2026-04-21T16:43:07.210Z] [info] [GitHubCopilot] [20917] ...
const HEADER_RE = /^\[(.+?)\] \[(.+?)\] \[(.+?)\] \[(\d+)\]/;
// Matches the "message" field in the pretty-printed JSON block (field may appear in either order)
const MESSAGE_RE = /^\s*"message"\s*:\s*"(.*)"\s*[,]?\s*$/;
// conversation\/turn {conversationId}\/{turnId} (JSON-escaped slashes)
const TURN_RE = /conversation\\\/turn ([^\\"]+)\\\/([^"\s,]+)/;
// Turn token usage: X prompt, Y completion, Z cached (cache rate: N%)
const TOKEN_RE =
  /Turn token usage: (\d+) prompt, (\d+) completion, (\d+) cached/;
// [AutoModelService] Fetched auto model for active in Xms: MODEL
const ACTIVE_MODEL_RE =
  /\[AutoModelService\] Fetched auto model for active in .*?: (.+)/;

interface ActiveModelState {
  model: string;
  lineNum: number;
  fileName: string;
}

interface TurnState {
  conversationId: string;
  turnId: string;
  lineNum: number;
  fileName: string;
}

export function defaultXcodeLogPaths(): string[] {
  return xcodeLogPaths();
}

export function parseXcode(
  logDir = defaultXcodeLogPaths()[0],
  sinceMs?: number
): SourceParseResult {
  const finding: SourceFinding = {
    source: "xcode",
    path: logDir ?? "",
    found: Boolean(logDir && existsSync(logDir)),
    records: 0,
    notes: [],
  };
  const records: UsageRecord[] = [];
  if (!finding.found || !logDir) return { finding, records };

  const logFiles = fg
    .sync("*.log", {
      cwd: logDir,
      absolute: true,
      onlyFiles: true,
    })
    .sort();

  // State is shared across files to allow pid continuity across log rotations
  const lastActiveModelByPid = new Map<string, ActiveModelState>();
  const currentTurnByPid = new Map<string, TurnState>();
  const pinnedModelByTurn = new Map<string, string>();

  for (const file of logFiles) {
    const fileRecords = parseXcodeLogFile(
      file,
      sinceMs,
      lastActiveModelByPid,
      currentTurnByPid,
      pinnedModelByTurn
    );
    records.push(...fileRecords);
  }

  finding.records = records.length;
  if (records.length === 0 && logFiles.length > 0) {
    finding.notes.push("No 'Turn token usage' entries found in log files.");
  }

  return { finding, records };
}

function parseXcodeLogFile(
  file: string,
  sinceMs: number | undefined,
  lastActiveModelByPid: Map<string, ActiveModelState>,
  currentTurnByPid: Map<string, TurnState>,
  pinnedModelByTurn: Map<string, string>
): UsageRecord[] {
  const records: UsageRecord[] = [];
  const fileName = file.split("/").pop() ?? file;

  let currentHeader: { timestamp: string; pid: string } | null = null;
  let lineNum = 0;

  for (const line of readLinesFromFile(file)) {
    lineNum++;

    const headerMatch = HEADER_RE.exec(line);
    if (headerMatch) {
      currentHeader = { timestamp: headerMatch[1], pid: headerMatch[4] };
      continue;
    }

    if (!currentHeader) continue;

    const messageMatch = MESSAGE_RE.exec(line);
    if (!messageMatch) continue;

    const message = messageMatch[1];
    const { timestamp, pid } = currentHeader;

    // Track active model for this pid
    const activeModelMatch = ACTIVE_MODEL_RE.exec(message);
    if (activeModelMatch) {
      lastActiveModelByPid.set(pid, {
        model: activeModelMatch[1].trim(),
        lineNum,
        fileName,
      });
    }

    // Track conversation/turn context for this pid
    const turnMatch = TURN_RE.exec(message);
    if (turnMatch) {
      const [, conversationId, turnId] = turnMatch;
      const turnKey = `${fileName}:${pid}:${turnId}`;
      currentTurnByPid.set(pid, {
        conversationId,
        turnId,
        lineNum,
        fileName,
      });

      // Pin model to this turn if AutoModelService appeared close before it
      const lastActive = lastActiveModelByPid.get(pid);
      if (
        lastActive &&
        lastActive.fileName === fileName &&
        lineNum - lastActive.lineNum <= MODEL_ATTACH_WINDOW &&
        !pinnedModelByTurn.has(turnKey)
      ) {
        pinnedModelByTurn.set(turnKey, lastActive.model);
      }
    }

    // Emit a UsageRecord when we see token usage
    const tokenMatch = TOKEN_RE.exec(message);
    if (!tokenMatch) continue;

    const turnContext = currentTurnByPid.get(pid);
    if (!turnContext) continue;

    // Apply sinceMs filter on the header timestamp of the token usage line
    if (sinceMs !== undefined) {
      const ts = Date.parse(timestamp);
      if (!isNaN(ts) && ts < sinceMs) continue;
    }

    const turnKey = `${fileName}:${pid}:${turnContext.turnId}`;
    const pinned = pinnedModelByTurn.get(turnKey);
    let model: string;
    if (pinned) {
      model = pinned;
    } else {
      const lastActive = lastActiveModelByPid.get(pid);
      model =
        lastActive && lastActive.fileName === fileName
          ? lastActive.model
          : "<unknown>";
    }

    records.push({
      source: "xcode",
      sourcePath: file,
      sessionId: turnContext.conversationId,
      messageId: turnContext.turnId,
      timestamp,
      provider: "github",
      model,
      inputTokens: parseInt(tokenMatch[1], 10),
      outputTokens: parseInt(tokenMatch[2], 10),
      cacheReadTokens: parseInt(tokenMatch[3], 10),
      cacheWriteTokens: 0,
      calls: 1,
    });
  }

  return records;
}
