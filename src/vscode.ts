import fg from "fast-glob";
import { existsSync, readFileSync } from "node:fs";
import { vscodeStoragePaths } from "./paths.js";
import type { SourceFinding, UsageRecord } from "./types.js";

export function defaultVsCodeWorkspaceStoragePaths(): string[] {
  return vscodeStoragePaths();
}

function roughTokens(value: unknown): number {
  if (value == null) return 0;
  return Math.ceil(JSON.stringify(value).length / 4);
}

function modelFromRequest(request: any): string {
  const details = String(request.details ?? "").toLowerCase();
  if (details.includes("claude haiku 4.5")) return "claude-haiku-4.5";
  if (details.includes("raptor mini")) return "raptor-mini";
  if (details.includes("gpt-5 mini")) return "gpt-5-mini";

  const resolved = String(request.resolvedModel ?? "").toLowerCase();
  if (resolved.includes("gpt-5-mini")) return "gpt-5-mini";
  if (resolved.includes("grok")) return "grok-code-fast-1";

  const modelId = String(request.modelId ?? "").replace(/^copilot\//, "");
  return modelId === "auto" ? "grok-code-fast-1" : modelId;
}

function setPath(
  target: any,
  path: Array<string | number>,
  value: unknown
): void {
  let cursor = target;
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index];
    const nextKey = path[index + 1];
    if (cursor[key] == null)
      cursor[key] = typeof nextKey === "number" ? [] : {};
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
}

function reconstructSession(file: string): any {
  const state: any = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.kind === 0) Object.assign(state, event.v ?? {});
    else if ((event.kind === 1 || event.kind === 2) && Array.isArray(event.k))
      setPath(state, event.k, event.v);
  }
  return state;
}

export function parseVsCode(
  basePath = defaultVsCodeWorkspaceStoragePaths()[0],
  sinceMs?: number
): { finding: SourceFinding; records: UsageRecord[] } {
  const finding: SourceFinding = {
    source: "vscode",
    path: basePath,
    found: existsSync(basePath),
    records: 0,
    notes: [],
  };
  const records: UsageRecord[] = [];
  if (!finding.found) return { finding, records };

  const files = fg.sync("*/chatSessions/*.jsonl", {
    cwd: basePath,
    absolute: true,
    onlyFiles: true,
  });
  for (const file of files) {
    const session = reconstructSession(file);
    const sessionId =
      session.sessionId ??
      file
        .split("/")
        .at(-1)
        ?.replace(/\.jsonl$/, "");

    for (const request of session.requests ?? []) {
      if (!request) continue;
      if (sinceMs && request.timestamp && request.timestamp < sinceMs) continue;
      const metadata = request.result?.metadata ?? {};
      const inputEstimate =
        roughTokens(metadata.renderedUserMessage) +
        roughTokens(metadata.renderedGlobalContext);
      const command = request.command ?? request.slashCommand?.command;

      records.push({
        source: "vscode",
        sourcePath: file,
        sessionId,
        messageId: request.requestId,
        parentId: request.requestId,
        timestamp: request.timestamp,
        provider: "github-copilot",
        model: modelFromRequest(request),
        inputTokens: inputEstimate,
        outputTokens: request.completionTokens ?? 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        mode: command === "compact" ? "compaction" : request.modeInfo?.modeId,
        agent: request.agent?.id,
        isCompaction:
          command === "compact" || request.slashCommand?.name === "compact",
      });
    }
  }

  finding.records = records.length;
  if (records.length === 0)
    finding.notes.push("No VS Code Copilot chat request records found.");
  else
    finding.notes.push(
      "VS Code session JSONL is patch-reduced before reading. Input/cache tokens are not persisted; output completionTokens are persisted when available."
    );
  return { finding, records };
}
