/**
 * Generate docs/assets/report-preview.png from synthetic demo data.
 *
 * Usage:
 *   node scripts/generate-preview.mjs
 *
 * Requires a fresh build (npm run build).
 */

import puppeteer from "puppeteer";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { renderHtml } from "../dist/html.js";
import { comparePlans } from "../dist/pricing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Period: Nov 1, 2025 → Apr 29, 2026 (~6 months, accelerating ramp)
// ---------------------------------------------------------------------------
const START_MS = new Date("2025-11-01T00:00:00Z").getTime();
const END_MS = new Date("2026-04-29T23:59:59Z").getTime();
const RANGE_MS = END_MS - START_MS;
const MONTHS = 6;
const MONTH_WEIGHTS = [0.07, 0.1, 0.13, 0.17, 0.22, 0.31]; // ramp

// ---------------------------------------------------------------------------
// Modern models — realistic call counts + credit shares
// ---------------------------------------------------------------------------
const MODELS = [
  //                            calls  share  inp      out    cache
  {
    model: "claude-opus-4.7",
    calls: 68,
    share: 0.38,
    inp: 28_000,
    out: 4_200,
    cache: 18_000,
  },
  {
    model: "claude-sonnet-4.6",
    calls: 147,
    share: 0.28,
    inp: 19_000,
    out: 2_600,
    cache: 12_000,
  },
  {
    model: "gpt-5.5",
    calls: 44,
    share: 0.18,
    inp: 24_000,
    out: 3_800,
    cache: 9_000,
  },
  {
    model: "gpt-5.3-codex",
    calls: 93,
    share: 0.11,
    inp: 16_000,
    out: 2_100,
    cache: 7_000,
  },
  {
    model: "gpt-5-mini",
    calls: 231,
    share: 0.05,
    inp: 8_000,
    out: 900,
    cache: 3_000,
  },
];

// Sources with realistic skew
const SOURCES = [
  { source: "opencode", share: 0.44 },
  { source: "vscode", share: 0.34 },
  { source: "copilot-cli", share: 0.15 },
  { source: "pi", share: 0.07 },
];

const TOTAL_CREDITS = 9_600;

// ---------------------------------------------------------------------------
// Deterministic RNG (LCG) — reproducible output
// ---------------------------------------------------------------------------
let seed = 0xdeadbeef;
function rng() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function rngBetween(lo, hi) {
  return lo + rng() * (hi - lo);
}
function pickWeighted(items) {
  const r = rng();
  let acc = 0;
  for (const item of items) {
    acc += item.share;
    if (r < acc) return item;
  }
  return items[items.length - 1];
}

// Random timestamp biased toward a specific month index
function randomTs(monthIdx) {
  const lo = START_MS + monthIdx * (RANGE_MS / MONTHS);
  const hi = lo + RANGE_MS / MONTHS;
  return Math.floor(lo + rng() * (hi - lo));
}

// ---------------------------------------------------------------------------
// Build records
// ---------------------------------------------------------------------------
const records = [];

for (const m of MODELS) {
  const targetCredits = TOTAL_CREDITS * m.share;

  // Distribute calls across months proportional to ramp weights, with jitter
  for (let mo = 0; mo < MONTHS; mo++) {
    const monthFraction = MONTH_WEIGHTS[mo];
    // Slight per-model-month jitter so not all models ramp identically
    const jitteredFrac = monthFraction * rngBetween(0.75, 1.3);
    const monthCredits = targetCredits * jitteredFrac;
    const monthCalls = Math.max(
      1,
      Math.round(m.calls * monthFraction * rngBetween(0.7, 1.35))
    );
    const cpr = monthCredits / monthCalls;

    for (let i = 0; i < monthCalls; i++) {
      const callJitter = rngBetween(0.45, 1.75); // wide variance = realistic
      const credits = Math.max(0.1, cpr * callJitter);
      const usd = credits / 100;
      const scale = callJitter;
      const src = pickWeighted(SOURCES);

      records.push({
        source: src.source,
        sourcePath: `/mock/${src.source}`,
        sessionId: `sess-${mo}-${m.model}-${i}`,
        messageId: `msg-${mo}-${m.model}-${i}`,
        parentId: undefined,
        timestamp: randomTs(mo),
        provider: "github-copilot",
        model: m.model,
        pricingModel: m.model,
        inputTokens: Math.round(m.inp * scale),
        outputTokens: Math.round(m.out * scale),
        cacheReadTokens: Math.round(m.cache * scale),
        cacheWriteTokens: 0,
        usd,
        credits,
        pricingKnown: true,
        isCompaction: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Totals + byModel
// ---------------------------------------------------------------------------
const totals = {
  calls: records.length,
  sessions: Math.round(records.length * 0.18),
  userPromptParents: Math.round(records.length * 0.15),
  inputTokens: records.reduce((s, r) => s + r.inputTokens, 0),
  outputTokens: records.reduce((s, r) => s + r.outputTokens, 0),
  cacheReadTokens: records.reduce((s, r) => s + r.cacheReadTokens, 0),
  cacheWriteTokens: 0,
  usd: records.reduce((s, r) => s + r.usd, 0),
  credits: records.reduce((s, r) => s + r.credits, 0),
  compactions: 11,
};

const byModel = {};
for (const r of records) {
  const k = r.pricingModel ?? r.model;
  byModel[k] ??= {
    calls: 0,
    credits: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
  };
  byModel[k].calls += 1;
  byModel[k].credits += r.credits;
  byModel[k].inputTokens += r.inputTokens;
  byModel[k].outputTokens += r.outputTokens;
  byModel[k].cacheReadTokens += r.cacheReadTokens;
}

// ---------------------------------------------------------------------------
// Source findings
// ---------------------------------------------------------------------------
const srcCounts = {};
for (const r of records) srcCounts[r.source] = (srcCounts[r.source] ?? 0) + 1;

const findings = [
  {
    source: "vscode",
    path: "~/Library/Application Support/Code/…",
    found: true,
    records: srcCounts["vscode"] ?? 0,
    notes: [],
  },
  {
    source: "opencode",
    path: "~/.local/share/opencode/opencode.db",
    found: true,
    records: srcCounts["opencode"] ?? 0,
    notes: [],
  },
  {
    source: "copilot-cli",
    path: "~/.copilot/session-state/…",
    found: true,
    records: srcCounts["copilot-cli"] ?? 0,
    notes: [],
  },
  {
    source: "pi",
    path: "~/.pi/agent/sessions/…",
    found: true,
    records: srcCounts["pi"] ?? 0,
    notes: [],
  },
];

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const summary = {
  generatedAt: new Date("2026-04-29T12:00:00Z").toISOString(),
  periodDays: undefined,
  sources: findings,
  records,
  toolFindings: [],
  totals,
  byModel,
  plans: comparePlans(totals.credits),
};

// ---------------------------------------------------------------------------
// Render + screenshot
// ---------------------------------------------------------------------------
const htmlPath = resolve(ROOT, "tmp-preview.html");
const pngPath = resolve(ROOT, "docs/assets/report-preview.png");

mkdirSync(resolve(ROOT, "docs/assets"), { recursive: true });
writeFileSync(htmlPath, renderHtml(summary));
console.log("HTML written — launching puppeteer…");

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
await page.screenshot({ path: pngPath, fullPage: true });
await browser.close();

unlinkSync(htmlPath);
console.log(`Preview written → docs/assets/report-preview.png`);
