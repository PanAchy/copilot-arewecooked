#!/usr/bin/env node
// Generate mock usage data for a year to test HTML report rendering.
// Usage: npx tsx src/mock.ts [--html path.html]
import { buildSummary, costRecords } from "./report.js";
import { renderHtml } from "./html.js";
import { writeFileSync } from "node:fs";
import type { UsageRecord } from "./types.js";
import { PLANS } from "./pricing.js";

const MODELS = [
  "gpt-5-mini",
  "claude-sonnet-4.5",
  "claude-opus-4.7",
  "gpt-5.4",
  "gemini-3-flash",
];

const SOURCES: Array<
  "opencode" | "pi" | "copilot-cli" | "vscode" | "vscode-insiders"
> = ["opencode", "pi", "copilot-cli", "vscode", "vscode-insiders"];

let seed = 42;

function random(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function rand(min: number, max: number): number {
  return random() * (max - min) + min;
}

function generateYearOfData(): UsageRecord[] {
  const records: UsageRecord[] = [];
  const now = new Date();
  const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    // Weekdays heavier, weekends lighter
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const callsPerDay = isWeekend
      ? Math.floor(rand(1, 4))
      : Math.floor(rand(3, 12));

    // Ramp up usage over the year (simulate growing dependency)
    const dayIndex = Math.floor(
      (d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
    );
    const rampFactor = 0.3 + (dayIndex / 365) * 0.7;

    for (let c = 0; c < callsPerDay; c++) {
      const model = MODELS[Math.floor(random() * MODELS.length)];
      const source = SOURCES[Math.floor(random() * SOURCES.length)];

      // Bigger models = more tokens
      const isBigModel = model.includes("opus") || model.includes("gpt-5.4");
      const inputMult = isBigModel ? 3 : 1;
      const outputMult = isBigModel ? 4 : 1;

      const ts = new Date(d);
      ts.setHours(Math.floor(rand(8, 22)), Math.floor(rand(0, 60)));

      records.push({
        source,
        sourcePath: `/mock/${source}`,
        sessionId: `session-${d.toISOString().slice(0, 10)}`,
        messageId: `msg-${records.length}`,
        parentId: `parent-${records.length}`,
        timestamp: ts.toISOString(),
        provider: "github-copilot",
        model,
        inputTokens: Math.floor(rand(800, 5000) * inputMult * rampFactor),
        outputTokens: Math.floor(rand(200, 2000) * outputMult * rampFactor),
        cacheReadTokens: Math.floor(rand(0, 4000) * inputMult * rampFactor),
        cacheWriteTokens: Math.floor(rand(0, 500) * rampFactor),
        calls: 1,
      });
    }
  }
  return records;
}

const records = generateYearOfData();
console.log(`Generated ${records.length} records`);

const costed = costRecords(records);
const totalCredits = costed.reduce((s, r) => s + r.credits, 0);
console.log(
  `Total credits: ${totalCredits.toFixed(1)} (pro plan: ${PLANS.pro})`
);

const summary = buildSummary({
  findings: [
    {
      source: "opencode",
      path: "/mock/opencode",
      found: true,
      records: records.filter((r) => r.source === "opencode").length,
      notes: [],
    },
    {
      source: "pi",
      path: "/mock/pi",
      found: true,
      records: records.filter((r) => r.source === "pi").length,
      notes: [],
    },
    {
      source: "copilot-cli",
      path: "/mock/copilot-cli",
      found: true,
      records: records.filter((r) => r.source === "copilot-cli").length,
      notes: [],
    },
    {
      source: "vscode",
      path: "/mock/vscode",
      found: true,
      records: records.filter((r) => r.source === "vscode").length,
      notes: [],
    },
    {
      source: "vscode-insiders",
      path: "/mock/vscode-insiders",
      found: true,
      records: records.filter((r) => r.source === "vscode-insiders").length,
      notes: [],
    },
  ],
  records: costed,
  toolFindings: [],
});

const htmlPath =
  process.argv.find((a, i) => process.argv[i - 1] === "--html") ??
  "report.html";
writeFileSync(htmlPath, renderHtml(summary));
console.log(`HTML report written to ${htmlPath}`);
