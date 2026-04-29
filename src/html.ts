import type { CostedUsageRecord, Summary } from "./types.js";
import { REPORT_CSS } from "./report-style.js";

const DISPLAY_NAMES: Record<string, string> = {
  vscode: "VS Code",
  opencode: "OpenCode",
  pi: "Pi",
  "copilot-cli": "Copilot CLI",
};

const SOURCE_ORDER = ["vscode", "opencode", "pi", "copilot-cli"];
const SOURCE_COLORS = [
  "var(--color-report-blue)",
  "var(--color-report-purple)",
  "var(--color-report-green)",
  "var(--color-report-yellow)",
  "var(--color-report-red)",
  "var(--color-report-cyan)",
];

const PLAN_GROUPS = [
  {
    title: "Individual plans",
    plans: ["pro", "pro+"],
  },
  {
    title: "Business plans",
    plans: ["business", "enterprise"],
  },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmt(n: number, digits = 1): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtInt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtCredits(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 2 : 1 });
}

function planDisplayName(plan: string): string {
  if (plan === "pro+") return "Pro+";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function getTimestamp(record: CostedUsageRecord): number | undefined {
  if (!record.timestamp) return undefined;
  const t =
    typeof record.timestamp === "string"
      ? Date.parse(record.timestamp)
      : record.timestamp;
  return Number.isFinite(t) ? t : undefined;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface TrendPoint {
  date: string;
  credits: number;
}

function bucketTrend(records: CostedUsageRecord[]): TrendPoint[] {
  const dated = records
    .map((record) => ({ ts: getTimestamp(record), credits: record.credits }))
    .filter((r): r is { ts: number; credits: number } => r.ts != null)
    .sort((a, b) => a.ts - b.ts);

  if (dated.length === 0) return [];

  const first = dated[0]!.ts;
  const last = dated[dated.length - 1]!.ts;
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.max(1, Math.ceil((last - first) / dayMs) + 1);
  const bucketDays = spanDays > 90 ? 7 : 1;
  const map = new Map<number, number>();

  for (const record of dated) {
    const index = Math.floor((record.ts - first) / dayMs / bucketDays);
    const bucketStart = first + index * bucketDays * dayMs;
    map.set(bucketStart, (map.get(bucketStart) ?? 0) + record.credits);
  }

  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, credits]) => ({
      date: bucketDays === 1 ? fmtDate(ts) : `Week of ${fmtDate(ts)}`,
      credits,
    }));
}

function renderTrend(points: TrendPoint[]): string {
  if (points.length === 0) {
    return `<p class="muted">No dated usage records found.</p>`;
  }

  const width = 920;
  const height = 320;
  const p = { l: 48, r: 16, t: 16, b: 38 };
  const max = Math.max(...points.map((d) => d.credits), 1);
  const step =
    points.length > 1 ? (width - p.l - p.r) / (points.length - 1) : 0;
  const y = (v: number) => p.t + (1 - v / max) * (height - p.t - p.b);
  const x = (i: number) => p.l + i * step;
  const pts = points.map((d, i) => [x(i), y(d.credits)] as const);
  const path = pts
    .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${x(points.length - 1)} ${height - p.b} L ${p.l} ${height - p.b} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const first = escapeHtml(points[0]!.date);
  const last = escapeHtml(points[points.length - 1]!.date);

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Credit usage trend">
<defs><linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#60a5fa"/><stop offset="1" stop-color="#60a5fa" stop-opacity="0"/></linearGradient></defs>
<g stroke="#27272a">${ticks.map((v) => `<line x1="${p.l}" y1="${y(v)}" x2="${width - p.r}" y2="${y(v)}"/>`).join("")}</g>
<g fill="#a1a1aa" font-size="13">${ticks.map((v) => `<text x="6" y="${y(v) + 4}">${fmtInt(v)}</text>`).join("")}<text x="${p.l}" y="${height - 10}">${first}</text><text text-anchor="end" x="${width - p.r}" y="${height - 10}">${last}</text></g>
<path d="${area}" fill="url(#trendGrad)" opacity=".24"/><path d="${path}" fill="none" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
${pts.map(([cx, cy], i) => `<circle cx="${cx}" cy="${cy}" r="4" fill="#60a5fa"><title>${escapeHtml(points[i]!.date)}: ${fmt(points[i]!.credits)} credits</title></circle>`).join("")}
</svg>`;
}

function reportRange(summary: Summary): string {
  const timestamps = summary.records
    .map(getTimestamp)
    .filter((ts): ts is number => ts != null)
    .sort((a, b) => a - b);
  const period = summary.periodDays
    ? `Last ${summary.periodDays} days`
    : "All available data";
  if (timestamps.length === 0) return period;
  return `${period} · ${fmtDate(timestamps[0]!)}–${fmtDate(timestamps[timestamps.length - 1]!)}`;
}

function comparisonMetric(summary: Summary): {
  label: string;
  credits: number;
  note: string;
} {
  const days = summary.periodDays;
  if (days != null && days < 28) {
    return {
      label: "30-day projection",
      credits: (summary.totals.credits / days) * 30,
      note: "30-day projection represented above.",
    };
  }
  if (days != null && days <= 45) {
    return {
      label: "Period credits",
      credits: summary.totals.credits,
      note: "Selected report period represented above.",
    };
  }
  const timestamps = summary.records
    .map(getTimestamp)
    .filter((ts): ts is number => ts != null);
  let months = 1;
  if (timestamps.length > 0) {
    const first = new Date(Math.min(...timestamps));
    const last = new Date(Math.max(...timestamps));
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
    note: "Monthly average represented above.",
  };
}

function renderPlanGroups(summary: Summary, usedCredits: number): string {
  return PLAN_GROUPS.map((group) => {
    const rows = group.plans
      .map((planName) => summary.plans.find((p) => p.plan === planName))
      .filter((p) => p != null)
      .map((plan) => {
        const pct =
          plan.includedCredits > 0
            ? (usedCredits / plan.includedCredits) * 100
            : 0;
        const cls = pct > 100 ? "bad" : pct > 90 ? "warn" : "ok";
        return `<div class="plan-row ${pct > 100 ? "over" : ""}">
<div class="plan-name">${escapeHtml(planDisplayName(plan.plan))}<span class="plan-sub">${fmtInt(plan.includedCredits)} credits/month</span></div>
<div class="track"><div class="usage" style="width:${Math.min(100, pct).toFixed(1)}%"></div></div>
<div class="used ${cls}"><strong>${fmt(pct)}%</strong><span>${fmtCredits(usedCredits)} credits</span></div>
</div>`;
      })
      .join("");
    return `<div><div class="group-title">${group.title}</div><div class="plan-scale">${rows}</div></div>`;
  }).join("");
}

function renderSources(summary: Summary): string {
  const bySource = new Map<string, number>();
  for (const record of summary.records) {
    bySource.set(
      record.source,
      (bySource.get(record.source) ?? 0) + record.credits
    );
  }
  const sources = [...bySource.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, credits]) => credits > 0);
  const total = sources.reduce((sum, [, credits]) => sum + credits, 0);
  if (total <= 0 || sources.length === 0) {
    return `<p class="muted">No source usage found.</p>`;
  }

  return sources
    .map(([source, credits], i) => {
      const pct = (credits / total) * 100;
      const color = SOURCE_COLORS[i % SOURCE_COLORS.length];
      return `<div class="source-row">
<div class="source-line"><span class="source-name"><span class="sw" style="background:${color}"></span>${DISPLAY_NAMES[source] ?? source}</span><span class="source-value"><strong>${fmt(pct)}%</strong><span>${fmtCredits(credits)} credits</span></span></div>
<div class="source-track"><div class="source-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
</div>`;
    })
    .join("");
}

function renderModelRows(summary: Summary): string {
  return Object.entries(summary.byModel)
    .sort((a, b) => b[1].credits - a[1].credits)
    .map(([model, data]) => {
      const share =
        summary.totals.credits > 0
          ? (data.credits / summary.totals.credits) * 100
          : 0;
      return `<tr><td>${escapeHtml(model || "unknown")}</td><td class="right">${fmtInt(data.calls)}</td><td class="right">${fmtInt(data.inputTokens)}</td><td class="right">${fmtInt(data.cacheReadTokens)}</td><td class="right">${fmtInt(data.outputTokens)}</td><td class="right">${fmtCredits(data.credits)}</td><td class="right">${fmt(share)}%</td></tr>`;
    })
    .join("");
}

export function renderHtml(summary: Summary): string {
  const comparison = comparisonMetric(summary);
  const sources = renderSources(summary);
  const trend = bucketTrend(summary.records);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Copilot AI Credit Project Report</title><style>${REPORT_CSS}</style></head>
<body class="report-body"><main class="wrap">
<header class="top"><div><h1 class="title">Copilot AI Credit Project Report</h1><div class="sub">${escapeHtml(reportRange(summary))}</div></div><a class="repo" href="https://github.com/PanAchy/copilot-arewecooked">Generated by copilot-arewecooked</a></header>
<section class="card"><div class="section-head"><h2 class="section-title">Usage trend</h2><div class="head-meta">${fmtCredits(summary.totals.credits)} credits in range · ${comparison.label}: ${fmtCredits(comparison.credits)}</div></div><div class="chart">${renderTrend(trend)}</div></section>
<div class="middle"><section class="card plan-card"><div class="section-head"><h2 class="section-title">Included credit comparison</h2></div><div class="plan-groups">${renderPlanGroups(summary, comparison.credits)}</div><div class="card-note">${comparison.note}</div></section>
<section class="card source-card"><h2 class="section-title">Usage by source</h2><div class="source-bars">${sources}</div><div class="card-note">Source totals for this report period.</div></section></div>
<section class="card"><div class="section-head"><h2 class="section-title">Model usage and cost</h2></div><table><thead><tr><th>Model</th><th class="right">Calls</th><th class="right">Input</th><th class="right">Cache read</th><th class="right">Output</th><th class="right">Credits</th><th class="right">Share</th></tr></thead><tbody>${renderModelRows(summary)}</tbody></table></section>
<footer class="foot"><span>Generated by <a href="https://github.com/PanAchy/copilot-arewecooked">copilot-arewecooked</a></span><span>${new Date(summary.generatedAt).toLocaleDateString()}</span></footer>
</main></body></html>`;
}
