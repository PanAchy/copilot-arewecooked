import type {
  CostedUsageRecord,
  SourceFinding,
  Summary,
  ToolFinding,
} from "./types.js";
import { comparePlans, costRecord, normalizeModel } from "./pricing.js";
import { renderTable } from "./table.js";
import { DISPLAY_NAMES } from "./utils.js";

export function buildSummary(args: {
  periodDays?: number;
  autoModel?: string;
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
      acc.calls += record.calls ?? 1;
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

  const autoModel = args.autoModel?.trim();
  const autoModelAppliedCount = autoModel
    ? args.records.filter(
        (record) =>
          normalizeModel(record.model) === "auto" &&
          record.pricingModel !== "auto"
      ).length
    : 0;

  const byModel: Summary["byModel"] = {};
  for (const record of args.records) {
    const key = record.pricingModel ?? record.model;
    byModel[key] ??= {
      calls: 0,
      credits: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    byModel[key].calls += record.calls ?? 1;
    byModel[key].credits += record.credits;
    byModel[key].inputTokens += record.inputTokens;
    byModel[key].outputTokens += record.outputTokens;
    byModel[key].cacheReadTokens += record.cacheReadTokens;
    byModel[key].cacheWriteTokens += record.cacheWriteTokens;
  }

  return {
    generatedAt: new Date().toISOString(),
    periodDays: args.periodDays,
    autoModel,
    autoModelAppliedCount,
    sources: args.findings,
    records: args.records,
    toolFindings: args.toolFindings,
    totals,
    byModel,
    plans: comparePlans(totals.credits),
  };
}

export function costRecords(
  records: Parameters<typeof costRecord>[0][],
  options?: { autoModel?: string }
): CostedUsageRecord[] {
  const autoModel = options?.autoModel?.trim();
  return records.map((record) => {
    if (autoModel && normalizeModel(record.model) === "auto") {
      const costed = costRecord({ ...record, model: autoModel });
      return { ...costed, model: record.model };
    }
    return costRecord(record);
  });
}

function fmt(n: number, digits = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtCredits(n: number): string {
  return fmt(n, n < 10 ? 3 : 1);
}

function sectionTitle(title: string): string {
  return `━━ ${title} ${"━".repeat(Math.max(0, 72 - title.length))}`;
}

function recordTimestamp(record: CostedUsageRecord): number | undefined {
  if (record.timestamp == null) return undefined;
  const ts =
    typeof record.timestamp === "number"
      ? record.timestamp
      : Date.parse(record.timestamp);
  return Number.isFinite(ts) ? ts : undefined;
}

function comparisonMetric(summary: Summary): {
  label: string;
  credits: number;
} {
  const days = summary.periodDays;
  if (days != null && days < 28) {
    return {
      label: "30-day projection",
      credits: (summary.totals.credits / days) * 30,
    };
  }
  if (days != null && days <= 45) {
    return { label: "Period credits", credits: summary.totals.credits };
  }

  const timestamps = summary.records
    .map(recordTimestamp)
    .filter((ts): ts is number => ts != null);
  let months = 1;
  if (timestamps.length > 0) {
    const first = new Date(timestamps.reduce((a, b) => (a < b ? a : b)));
    const last = new Date(timestamps.reduce((a, b) => (a > b ? a : b)));
    months = Math.max(
      1,
      (last.getFullYear() - first.getFullYear()) * 12 +
        last.getMonth() -
        first.getMonth() +
        1
    );
  } else if (days != null) {
    months = Math.max(1, days / 30);
  }

  return {
    label: "Monthly average",
    credits: summary.totals.credits / months,
  };
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
  lines.push(
    summary.periodDays
      ? `Period: last ${summary.periodDays}d`
      : "Period: all available data"
  );
  const comparison = comparisonMetric(summary);

  lines.push("");
  lines.push(sectionTitle("Sources"));
  const sources = sourceRows(summary);
  if (sources.length > 0) {
    lines.push(
      ...renderTable(sources, [
        { header: "Tool", value: (row) => DISPLAY_NAMES[row.tool] ?? row.tool },
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
  lines.push(
    sectionTitle(
      `Included credit comparison (${comparison.label.toLowerCase()})`
    )
  );
  lines.push(
    `${comparison.label}: ${fmtCredits(comparison.credits)} AI credits ($${fmt(comparison.credits / 100, 4)})`
  );
  const relevantPlans = comparePlans(comparison.credits).filter((plan) =>
    ["pro", "pro+", "business", "enterprise"].includes(plan.plan)
  );
  lines.push(
    ...renderTable(relevantPlans, [
      { header: "Plan", value: (row) => row.plan },
      {
        header: "Included",
        value: (row) => fmt(row.includedCredits, 0),
        align: "right",
      },
      {
        header: "Remaining",
        value: (row) => {
          const remaining = row.includedCredits - row.usedCredits;
          return remaining < 0
            ? fmtCredits(Math.abs(remaining))
            : fmtCredits(remaining);
        },
        align: "right",
      },
      {
        header: "%",
        value: (row) => {
          const pct =
            ((row.includedCredits - row.usedCredits) / row.includedCredits) *
            100;
          return `${pct < 0 ? "-" : ""}${fmt(Math.abs(pct), 1)}%`;
        },
        align: "right",
      },
    ])
  );

  lines.push("");
  lines.push(sectionTitle("Model usage and cost (total)"));
  const modelRows = Object.entries(summary.byModel)
    .map(([model, data]) => ({ model, ...data, isTotal: false }))
    .sort((a, b) => b.credits - a.credits);
  const totalModelRow = {
    model: "Total",
    calls: summary.totals.calls,
    inputTokens: summary.totals.inputTokens,
    cacheReadTokens: summary.totals.cacheReadTokens,
    cacheWriteTokens: summary.totals.cacheWriteTokens,
    outputTokens: summary.totals.outputTokens,
    credits: summary.totals.credits,
    isTotal: true,
  };
  if (modelRows.length > 0) {
    lines.push(
      ...renderTable(
        [...modelRows, totalModelRow],
        [
          { header: "Model", value: (row) => row.model || "unknown" },
          {
            header: "Calls",
            value: (row) => fmt(row.calls, 0),
            align: "right",
          },
          {
            header: "Input",
            value: (row) => fmt(row.inputTokens, 0),
            align: "right",
          },
          {
            header: "Cache read",
            value: (row) => fmt(row.cacheReadTokens, 0),
            align: "right",
          },
          {
            header: "Cache write",
            value: (row) => fmt(row.cacheWriteTokens, 0),
            align: "right",
          },
          {
            header: "Output",
            value: (row) => fmt(row.outputTokens, 0),
            align: "right",
          },
          {
            header: "Credits",
            value: (row) => fmtCredits(row.credits),
            align: "right",
          },
          {
            header: "Share",
            value: (row) => {
              if (row.isTotal) return "100%";
              const share =
                summary.totals.credits > 0
                  ? (row.credits / summary.totals.credits) * 100
                  : 0;
              return `${fmt(share, 1)}%`;
            },
            align: "right",
          },
        ]
      )
    );
  } else {
    lines.push("No priced model usage found.");
  }

  return lines.join("\n");
}
