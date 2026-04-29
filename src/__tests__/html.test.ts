import { describe, it, expect } from "vitest";
import { bucketTrend } from "../html.js";
import type { CostedUsageRecord } from "../types.js";

function rec(
  timestamp: number | string | undefined,
  credits: number
): CostedUsageRecord {
  return {
    source: "vscode",
    sourcePath: "/mock",
    provider: "github-copilot",
    model: "gpt-5-mini",
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    usd: 0,
    credits,
    pricingKnown: true,
    timestamp,
  };
}

// Day boundary helper: midnight UTC for a given YYYY-MM-DD
function midnightLocal(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  return d.getTime();
}

// ---------------------------------------------------------------------------
// bucketTrend — empty / single
// ---------------------------------------------------------------------------

describe("bucketTrend", () => {
  it("returns empty array for no records", () => {
    expect(bucketTrend([])).toEqual([]);
  });

  it("returns empty array when all records lack timestamps", () => {
    expect(bucketTrend([rec(undefined, 10), rec(undefined, 20)])).toEqual([]);
  });

  it("returns a single point for one record", () => {
    const ts = midnightLocal("2026-04-01") + 60_000;
    const result = bucketTrend([rec(ts, 42)]);
    expect(result).toHaveLength(1);
    expect(result[0]!.credits).toBe(42);
  });

  // -------------------------------------------------------------------------
  // same-day bucketing
  // -------------------------------------------------------------------------

  it("merges two records on the same calendar day into one bucket", () => {
    const base = midnightLocal("2026-04-15");
    const r1 = rec(base + 1_000, 10);
    const r2 = rec(base + 3_600_000, 20); // 1 hour later, same day
    const result = bucketTrend([r1, r2]);
    expect(result).toHaveLength(1);
    expect(result[0]!.credits).toBe(30);
  });

  it("puts records on different days into separate buckets", () => {
    const day1 = midnightLocal("2026-04-15") + 1_000;
    const day2 = midnightLocal("2026-04-16") + 1_000;
    const result = bucketTrend([rec(day1, 10), rec(day2, 20)]);
    expect(result).toHaveLength(2);
    expect(result[0]!.credits).toBe(10);
    expect(result[1]!.credits).toBe(20);
  });

  // -------------------------------------------------------------------------
  // midnight anchoring
  // -------------------------------------------------------------------------

  it("anchors bucket boundaries to midnight: 23:59 and 00:01 next day are separate buckets", () => {
    const base = midnightLocal("2026-04-20");
    const endOfDay = base + 23 * 3_600_000 + 59 * 60_000; // 23:59
    const startOfNextDay = base + 24 * 3_600_000 + 60_000; // next day 00:01
    const result = bucketTrend([rec(endOfDay, 5), rec(startOfNextDay, 7)]);
    expect(result).toHaveLength(2);
    expect(result[0]!.credits).toBe(5);
    expect(result[1]!.credits).toBe(7);
  });

  it("groups 23:59 and 00:30 of the same day into one bucket", () => {
    const base = midnightLocal("2026-04-20");
    const t1 = base + 30 * 60_000; // 00:30
    const t2 = base + 23 * 3_600_000 + 59 * 60_000; // 23:59
    const result = bucketTrend([rec(t1, 3), rec(t2, 4)]);
    expect(result).toHaveLength(1);
    expect(result[0]!.credits).toBe(7);
  });

  // -------------------------------------------------------------------------
  // ISO string timestamps
  // -------------------------------------------------------------------------

  it("accepts ISO string timestamps", () => {
    const result = bucketTrend([
      rec("2026-04-01T10:00:00.000Z", 11),
      rec("2026-04-01T18:00:00.000Z", 22),
    ]);
    // May be 1 or 2 buckets depending on UTC offset, but credits must sum
    const total = result.reduce((s, p) => s + p.credits, 0);
    expect(total).toBe(33);
  });

  // -------------------------------------------------------------------------
  // week bucketing for spans > 90 days
  // -------------------------------------------------------------------------

  it("uses daily buckets when span is <= 90 days", () => {
    const base = midnightLocal("2026-01-01");
    const result = bucketTrend([
      rec(base, 1),
      rec(base + 89 * 24 * 3_600_000, 2),
    ]);
    // Should have day-level labels (no "Week of" prefix)
    expect(result.every((p) => !p.date.startsWith("Week of"))).toBe(true);
  });

  it("uses weekly buckets when span is > 90 days", () => {
    const base = midnightLocal("2026-01-01");
    const result = bucketTrend([
      rec(base, 1),
      rec(base + 100 * 24 * 3_600_000, 2),
    ]);
    expect(result.every((p) => p.date.startsWith("Week of"))).toBe(true);
  });

  it("weekly bucket merges days within the same week", () => {
    const base = midnightLocal("2026-01-01");
    // Put 7 records in the first 7 days (week 0), and 1 record 100 days later (different week)
    const firstWeek = Array.from({ length: 7 }, (_, i) =>
      rec(base + i * 24 * 3_600_000, 1)
    );
    const farRecord = rec(base + 100 * 24 * 3_600_000, 10);
    const result = bucketTrend([...firstWeek, farRecord]);
    // First bucket should have 7 credits (all merged into week 0)
    expect(result[0]!.credits).toBe(7);
    expect(result[result.length - 1]!.credits).toBe(10);
  });
});
