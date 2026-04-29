#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildSummary, costRecords } from "./report.js";
import { sourceAdapters } from "./sources.js";
import { renderHtml } from "./html.js";

const pkg = createRequire(import.meta.url)("../package.json");

const program = new Command();

program
  .name("copilot-arewecooked")
  .description(
    "Local GitHub Copilot AI-credit billing estimator for local usage logs."
  )
  .version(pkg.version)
  .option("--days <days>", "days to look back")
  .option(
    "--since <date>",
    "only include records from this date onward (YYYY-MM-DD)"
  )
  .option("--json", "print detailed normalized JSON instead of HTML")
  .option(
    "--html [path]",
    "write HTML report path (default: copilot-report-YYYY-MM-DD.html)"
  )
  .parse(process.argv);

const options = program.opts<{
  days?: string;
  since?: string;
  json?: boolean;
  html?: boolean | string;
}>();

let periodDays: number | undefined;
let sinceMs: number | undefined;

if (options.since && options.days) {
  console.error(
    "--since and --days are mutually exclusive; use one or the other"
  );
  process.exit(1);
}

if (options.since) {
  const parsed = Date.parse(options.since);
  if (!Number.isFinite(parsed)) {
    console.error("--since must be a valid date (YYYY-MM-DD)");
    process.exit(1);
  }
  sinceMs = parsed;
} else if (options.days) {
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

if (options.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const today = new Date().toISOString().slice(0, 10);
  const htmlPath =
    typeof options.html === "string" && options.html
      ? options.html
      : `copilot-report-${today}.html`;
  writeFileSync(htmlPath, renderHtml(summary));
  console.log(`HTML report written to ${htmlPath}`);
}
