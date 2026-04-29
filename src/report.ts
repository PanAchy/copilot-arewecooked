import type {
  CostedUsageRecord,
  SourceFinding,
  Summary,
  ToolFinding,
} from "./types.js";
import { comparePlans, costRecord } from "./pricing.js";
import { renderTable } from "./table.js";

export function buildSummary(args: {
  periodDays: number;
  findings: SourceFinding[];
  records: CostedUsageRecord[];
  toolFindings: ToolFinding[];
}): Summary {
  const sessions = new Set(
    args.records
      .map((record) => `${record.source}:${record.sessionId}`)
      .filter(Boolean)
  );
  const parents = new Set(
    args.records
      .map((record) => `${record.source}:${record.parentId}`)
      .filter((value) => !value.endsWith(":undefined"))
  );
  const totals = args.records.reduce(
    (acc, record) => {
      acc.calls += 1;
      acc.inputTokens += record.inputTokens;
      acc.outputTokens += record.outputTokens;
      acc.cacheReadTokens += record.cacheReadTokens;
      acc.cacheWriteTokens += record.cacheWriteTokens;
      acc.usd += record.usd;
      acc.credits += record.credits;
      if (record.isCompaction) acc.compactions += 1;
      return acc;
    },
    {
      calls: 0,
      sessions: 0,
      userPromptParents: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      usd: 0,
      credits: 0,
      compactions: 0,
    }
  );
  totals.sessions = sessions.size;
  totals.userPromptParents = parents.size;

  const byModel: Summary["byModel"] = {};
  for (const record of args.records) {
    const key = record.pricingModel ?? record.model;
    byModel[key] ??= {
      calls: 0,
      credits: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
    };
    byModel[key].calls += 1;
    byModel[key].credits += record.credits;
    byModel[key].inputTokens += record.inputTokens;
    byModel[key].outputTokens += record.outputTokens;
    byModel[key].cacheReadTokens += record.cacheReadTokens;
  }

  return {
    generatedAt: new Date().toISOString(),
    periodDays: args.periodDays,
    sources: args.findings,
    records: args.records,
    toolFindings: args.toolFindings,
    totals,
    byModel,
    plans: comparePlans(totals.credits),
  };
}

export function costRecords(
  records: Parameters<typeof costRecord>[0][]
): CostedUsageRecord[] {
  return records.map(costRecord);
}

function fmt(n: number, digits = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtCredits(n: number): string {
  return fmt(n, n < 10 ? 3 : 1);
}

function sourceRows(summary: Summary) {
  return summary.sources
    .map((source) => {
      const records = summary.records.filter(
        (record) =>
          record.source === source.source &&
          record.sourcePath.startsWith(source.path)
      );
      const credits = records.reduce((sum, record) => sum + record.credits, 0);
      const tokens = records.reduce(
        (sum, record) =>
          sum +
          record.inputTokens +
          record.outputTokens +
          record.cacheReadTokens +
          record.cacheWriteTokens,
        0
      );
      return {
        tool: source.source,
        calls: source.records,
        tokens,
        credits,
      };
    })
    .filter((row) => row.calls > 0);
}

export function renderConsole(summary: Summary): string {
  const lines: string[] = [];
  lines.push("copilot-arewecooked");
  lines.push(`Period: last ${summary.periodDays}d`);
  lines.push("");
  lines.push("Sources");
  const sources = sourceRows(summary);
  if (sources.length > 0) {
    lines.push(
      ...renderTable(sources, [
        { header: "Tool", value: (row) => row.tool },
        { header: "Calls", value: (row) => fmt(row.calls, 0), align: "right" },
        {
          header: "Tokens",
          value: (row) => fmt(row.tokens, 0),
          align: "right",
        },
        {
          header: "Credits",
          value: (row) => fmtCredits(row.credits),
          align: "right",
        },
      ])
    );
  } else {
    lines.push("No Copilot usage found.");
  }

  lines.push("");
  lines.push("Tokens");
  lines.push(
    ...renderTable(
      [
        { kind: "Input", value: summary.totals.inputTokens },
        { kind: "Output", value: summary.totals.outputTokens },
        { kind: "Cache read", value: summary.totals.cacheReadTokens },
        { kind: "Cache write", value: summary.totals.cacheWriteTokens },
      ],
      [
        { header: "Type", value: (row) => row.kind },
        { header: "Tokens", value: (row) => fmt(row.value, 0), align: "right" },
      ]
    )
  );

  lines.push("");
  lines.push(
    `Estimated June billing: ${fmtCredits(summary.totals.credits)} AI credits ($${fmt(summary.totals.usd, 4)})`
  );
  lines.push("");
  lines.push("Plan fit");
  lines.push(
    ...renderTable(
      summary.plans.filter((plan) =>
        ["pro", "pro+", "business", "enterprise"].includes(plan.plan)
      ),
      [
        { header: "Plan", value: (row) => row.plan },
        {
          header: "Used",
          value: (row) => fmtCredits(row.usedCredits),
          align: "right",
        },
        {
          header: "Included",
          value: (row) => fmt(row.includedCredits, 0),
          align: "right",
        },
        { header: "Verdict", value: (row) => row.verdict },
      ]
    )
  );
  return lines.join("\n");
}
