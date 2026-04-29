#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "node:fs";
import { buildSummary, costRecords, renderConsole } from "./report.js";
import { sourceAdapters } from "./sources.js";

const program = new Command();

program
  .name("copilot-arewecooked")
  .description(
    "Local GitHub Copilot AI-credit billing estimator for local usage logs."
  )
  .option("--days <days>", "days to look back")
  .option("--json", "print normalized JSON")
  .parse(process.argv);

const options = program.opts<{
  days?: string;
  json?: boolean;
}>();

let periodDays: number | undefined;
let sinceMs: number | undefined;

if (options.days) {
  periodDays = Number.parseInt(options.days, 10);
  if (!Number.isFinite(periodDays) || periodDays <= 0) {
    console.error("--days must be a positive integer");
    process.exit(1);
  }
  sinceMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
}

const findings = [];
const records = [];
const toolFindings = [];

for (const adapter of Object.values(sourceAdapters)) {
  const paths = adapter.defaultPaths();
  const existing = paths.filter((p) => existsSync(p));
  const toCheck = existing.length > 0 ? existing : [paths[0]];
  for (const path of toCheck) {
    const result = adapter.parse(path, sinceMs);
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
