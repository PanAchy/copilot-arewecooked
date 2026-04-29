#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "node:fs";
import { buildSummary, costRecords, renderConsole } from "./report.js";
import type { SourceAdapter } from "./source.js";
import { sourceAdapters } from "./sources.js";

const program = new Command();

program
  .name("copilot-arewecooked")
  .description(
    "Local GitHub Copilot AI-credit billing estimator for local usage logs."
  )
  .option("--days <days>", "days to look back", "30")
  .option("--opencode-db <path>", "OpenCode sqlite database path")
  .option("--pi-sessions <path>", "Pi sessions directory")
  .option(
    "--copilot-cli-state <path>",
    "GitHub Copilot CLI session-state directory"
  )
  .option("--vscode-storage <path>", "VS Code workspaceStorage directory")
  .option("--no-opencode", "skip OpenCode")
  .option("--no-pi", "skip Pi")
  .option("--no-copilot-cli", "skip GitHub Copilot CLI")
  .option("--no-vscode", "skip VS Code Copilot")
  .option("--json", "print normalized JSON")
  .parse(process.argv);

const options = program.opts<{
  days: string;
  opencodeDb?: string;
  piSessions?: string;
  copilotCliState?: string;
  vscodeStorage?: string;
  opencode: boolean;
  pi: boolean;
  copilotCli: boolean;
  vscode: boolean;
  json?: boolean;
}>();

const periodDays = Number.parseInt(options.days, 10);
if (!Number.isFinite(periodDays) || periodDays <= 0) {
  console.error("--days must be a positive integer");
  process.exit(1);
}

function selectedPaths(adapter: SourceAdapter, override?: string): string[] {
  if (override) return [override];
  const paths = adapter.defaultPaths();
  const existing = paths.filter((path) => existsSync(path));
  return existing.length > 0 ? existing : [paths[0]];
}

const sinceMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
const findings = [];
const records = [];
const toolFindings = [];

const enabledSources: Array<{
  enabled: boolean;
  adapter: SourceAdapter;
  path?: string;
}> = [
  {
    enabled: options.vscode,
    adapter: sourceAdapters.vscode,
    path: options.vscodeStorage,
  },
  {
    enabled: options.opencode,
    adapter: sourceAdapters.opencode,
    path: options.opencodeDb,
  },
  { enabled: options.pi, adapter: sourceAdapters.pi, path: options.piSessions },
  {
    enabled: options.copilotCli,
    adapter: sourceAdapters.copilotCli,
    path: options.copilotCliState,
  },
];

for (const source of enabledSources) {
  if (!source.enabled) continue;
  for (const path of selectedPaths(source.adapter, source.path)) {
    const result = source.adapter.parse(path, sinceMs);
    findings.push(result.finding);
    records.push(...result.records);
    toolFindings.push(...(result.toolFindings ?? []));
  }
}

const summary = buildSummary({
  periodDays,
  findings,
  records: costRecords(records),
  toolFindings,
});

if (options.json) console.log(JSON.stringify(summary, null, 2));
else console.log(renderConsole(summary));
