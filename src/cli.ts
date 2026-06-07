#!/usr/bin/env node
import { Command } from "commander";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSummary, costRecords, renderConsole } from "./report.js";
import { sourceAdapters } from "./sources.js";
import type { SourceParseResult } from "./source.js";
import { renderHtml } from "./html.js";

const DEBUG = !!process.env.DEBUG;
function dbg(label: string, start: number) {
  if (DEBUG)
    console.error(`[timing] ${label}: ${(Date.now() - start).toFixed(0)}ms`);
}

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
  .option("--terminal", "print a compact terminal report instead of HTML/PNG")
  .option(
    "--html [path]",
    "write HTML report path (default: copilot-report-YYYY-MM-DD-<hex>.html)"
  )
  .option(
    "--auto-model <model>",
    "treat records reported as 'auto' as this specific model (e.g. gpt-5.3-codex)"
  )
  .parse(process.argv);

const options = program.opts<{
  days?: string;
  since?: string;
  json?: boolean;
  terminal?: boolean;
  html?: boolean | string;
  autoModel?: string;
}>();

let periodDays: number | undefined;
let sinceMs: number | undefined;
const autoModel = options.autoModel?.trim() || undefined;

if (options.since && options.days) {
  console.error(
    "--since and --days are mutually exclusive; use one or the other"
  );
  process.exit(1);
}

if (options.json && options.terminal) {
  console.error(
    "--json and --terminal are mutually exclusive; use one or the other"
  );
  process.exit(1);
}

if (options.html && options.terminal) {
  console.error(
    "--html and --terminal are mutually exclusive; use one or the other"
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

const t0 = Date.now();
const findings = [];
const records = [];
const toolFindings = [];

for (const adapter of Object.values(sourceAdapters)) {
  const paths = adapter.defaultPaths();
  const existing = paths.filter((p) => existsSync(p));
  const toCheck = existing.length > 0 ? existing : [paths[0]];
  for (const path of toCheck) {
    const tAdapter = Date.now();
    let result: SourceParseResult;
    try {
      result = adapter.parse(path, sinceMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Warning: ${adapter.kind} source failed (${msg}). Skipping.`
      );
      if (DEBUG && err instanceof Error) console.error(err.stack);
      continue;
    }
    dbg(
      `parse ${result.finding.source} (${result.records.length} records)`,
      tAdapter
    );
    findings.push(result.finding);
    for (const record of result.records) records.push(record);
    for (const finding of result.toolFindings ?? []) toolFindings.push(finding);
  }
}
dbg("all sources parsed", t0);

// Dedup: OTel spans have exact token counts; VS Code JSONL has estimated
// input and zero cache. Remove duplicate sessions from vscode/vscode-insiders
// when vscode-otel already covers them.
const otelSessions = new Set(
  records
    .filter((r) => r.source === "vscode-otel" && r.sessionId)
    .map((r) => r.sessionId)
);
if (otelSessions.size > 0) {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]!;
    if (
      (r.source === "vscode" || r.source === "vscode-insiders") &&
      r.sessionId &&
      otelSessions.has(r.sessionId)
    ) {
      records.splice(i, 1);
    }
  }
}

const tCost = Date.now();
const costed = costRecords(records, { autoModel });
dbg("costRecords", tCost);

const tSummary = Date.now();
const summary = buildSummary({
  periodDays,
  autoModel,
  findings,
  records: costed,
  toolFindings,
});
dbg("buildSummary", tSummary);

if (options.json) {
  console.log(JSON.stringify(summary, null, 2));
} else if (options.terminal) {
  console.log(renderConsole(summary));
} else {
  const today = new Date().toISOString().slice(0, 10);
  const hexId = randomBytes(3).toString("hex");
  const htmlPath =
    typeof options.html === "string" && options.html
      ? options.html
      : `copilot-report-${today}-${hexId}.html`;

  const tHtml = Date.now();
  writeFileSync(htmlPath, renderHtml(summary));
  dbg("renderHtml + write", tHtml);
  dbg("total", t0);
  console.log(`HTML report written to ${htmlPath}`);

  const pngPath = htmlPath.replace(/\.html$/, "") + ".png";
  const tPng = Date.now();
  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
    });
    await page.goto(pathToFileURL(resolve(htmlPath)).href, {
      waitUntil: "networkidle0",
    });
    await page.screenshot({ path: pngPath, fullPage: true });
    await browser.close();
    dbg("png screenshot", tPng);
    console.log(`PNG screenshot written to ${pngPath}`);
  } catch (err) {
    const reason =
      err instanceof Error && err.message.includes("Cannot find")
        ? "puppeteer is not installed"
        : err instanceof Error
          ? err.message.split("\n")[0]
          : String(err);
    console.error(
      `Skipping PNG screenshot (${reason}). Open the HTML report in a browser instead.`
    );
    if (DEBUG && err instanceof Error) console.error(err.stack);
  }
}
