import { describe, it, expect } from "vitest";
import {
  normalizeModel,
  costRecord,
  comparePlans,
  MODEL_PRICES,
  PLANS,
} from "../pricing.js";
import type { UsageRecord } from "../types.js";
import { roughTokens, DISPLAY_NAMES } from "../utils.js";
import { buildSummary, costRecords } from "../report.js";
import type { CostedUsageRecord, SourceFinding } from "../types.js";

// ---------------------------------------------------------------------------
// normalizeModel
// ---------------------------------------------------------------------------

describe("normalizeModel", () => {
  it("lowercases model names", () => {
    expect(normalizeModel("GPT-5-Mini")).toBe("gpt-5-mini");
  });

  it("strips github-copilot/ prefix", () => {
    expect(normalizeModel("github-copilot/claude-sonnet-4.5")).toBe(
      "claude-sonnet-4.5"
    );
  });

  it("replaces underscores with hyphens", () => {
    expect(normalizeModel("claude_sonnet_4_5")).toBe("claude-sonnet-4-5");
  });

  it("trims whitespace", () => {
    expect(normalizeModel("  gpt-5-mini  ")).toBe("gpt-5-mini");
  });

  it("handles already-normalized names", () => {
    expect(normalizeModel("gpt-5-mini")).toBe("gpt-5-mini");
  });
});

// ---------------------------------------------------------------------------
// Model aliases
// ---------------------------------------------------------------------------

describe("model aliases", () => {
  it("prices GPT-5.1 as GPT-5.2", () => {
    const record: UsageRecord = {
      source: "opencode",
      sourcePath: "/mock",
      provider: "github-copilot",
      model: "gpt-5.1",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const result = costRecord(record);
    expect(result.pricingModel).toBe("gpt-5.2");
    expect(result.pricingKnown).toBe(true);
    // GPT-5.2 input: $1.75/M
    expect(result.usd).toBeCloseTo(1.75, 6);
  });

  it("prices GPT-5.1-Codex as GPT-5.2-Codex", () => {
    const record: UsageRecord = {
      source: "opencode",
      sourcePath: "/mock",
      provider: "github-copilot",
      model: "gpt-5.1-codex",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const result = costRecord(record);
    expect(result.pricingModel).toBe("gpt-5.2-codex");
    expect(result.pricingKnown).toBe(true);
  });

  it("prices GPT-4o as GPT-4.1", () => {
    const record: UsageRecord = {
      source: "vscode",
      sourcePath: "/mock",
      provider: "github-copilot",
      model: "gpt-4o",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const result = costRecord(record);
    expect(result.pricingModel).toBe("gpt-4.1");
    expect(result.pricingKnown).toBe(true);
  });

  it("prices GPT-4o-mini as GPT-5-mini", () => {
    const record: UsageRecord = {
      source: "vscode",
      sourcePath: "/mock",
      provider: "github-copilot",
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const result = costRecord(record);
    expect(result.pricingModel).toBe("gpt-5-mini");
    expect(result.pricingKnown).toBe(true);
  });

  it("prices Gemini 3 Pro as Gemini 3.1 Pro", () => {
    const record: UsageRecord = {
      source: "opencode",
      sourcePath: "/mock",
      provider: "github-copilot",
      model: "gemini-3-pro",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const result = costRecord(record);
    expect(result.pricingModel).toBe("gemini-3.1-pro");
    expect(result.pricingKnown).toBe(true);
  });

  it("still returns unknown for truly unknown models", () => {
    const record: UsageRecord = {
      source: "opencode",
      sourcePath: "/mock",
      provider: "github-copilot",
      model: "totally-unknown-model",
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const result = costRecord(record);
    expect(result.pricingKnown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// costRecord
// ---------------------------------------------------------------------------

describe("costRecord", () => {
  const baseRecord: UsageRecord = {
    source: "opencode",
    sourcePath: "/mock/opencode.db",
    sessionId: "s1",
    messageId: "m1",
    parentId: "p1",
    timestamp: "2026-04-29T00:00:00Z",
    provider: "github-copilot",
    model: "gpt-5-mini",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  it("costs known model correctly", () => {
    const result = costRecord(baseRecord);
    // gpt-5-mini: input $0.25/M, output $2.00/M
    // 1M input * 0.25 + 1M output * 2.0 = 0.25 + 2.0 = $2.25
    expect(result.usd).toBeCloseTo(2.25, 6);
    // credits = usd * 100
    expect(result.credits).toBeCloseTo(225, 4);
    expect(result.pricingKnown).toBe(true);
    expect(result.pricingModel).toBe("gpt-5-mini");
  });

  it("costs cache read at cachedInput rate", () => {
    const record: UsageRecord = {
      ...baseRecord,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
    };
    const result = costRecord(record);
    // gpt-5-mini cachedInput: $0.025/M → $0.025
    expect(result.usd).toBeCloseTo(0.025, 6);
    expect(result.credits).toBeCloseTo(2.5, 4);
  });

  it("costs cache write at cacheWrite rate when available", () => {
    const record: UsageRecord = {
      ...baseRecord,
      model: "claude-sonnet-4.5",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 1_000_000,
    };
    const result = costRecord(record);
    // claude-sonnet-4.5 cacheWrite: $3.75/M
    expect(result.usd).toBeCloseTo(3.75, 6);
    expect(result.credits).toBeCloseTo(375, 4);
  });

  it("falls back to cachedInput for cache write when no explicit rate", () => {
    const record: UsageRecord = {
      ...baseRecord,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 1_000_000,
    };
    const result = costRecord(record);
    // gpt-5-mini has no cacheWrite, falls back to cachedInput $0.025/M
    expect(result.usd).toBeCloseTo(0.025, 6);
  });

  it("returns zero cost for unknown model", () => {
    const record: UsageRecord = {
      ...baseRecord,
      model: "totally-unknown-model",
      inputTokens: 999_999,
      outputTokens: 999_999,
    };
    const result = costRecord(record);
    expect(result.usd).toBe(0);
    expect(result.credits).toBe(0);
    expect(result.pricingKnown).toBe(false);
    expect(result.pricingModel).toBe("totally-unknown-model");
  });

  it("handles zero tokens gracefully", () => {
    const record: UsageRecord = {
      ...baseRecord,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const result = costRecord(record);
    expect(result.usd).toBe(0);
    expect(result.credits).toBe(0);
  });

  it("costs claude-opus-4.7 correctly with all token types", () => {
    const record: UsageRecord = {
      ...baseRecord,
      model: "claude-opus-4.7",
      inputTokens: 500_000,
      outputTokens: 200_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 300_000,
    };
    const rate = MODEL_PRICES["claude-opus-4.7"]!;
    const expected =
      (500_000 * rate.input +
        1_000_000 * rate.cachedInput +
        300_000 * (rate.cacheWrite ?? rate.cachedInput) +
        200_000 * rate.output) /
      1_000_000;
    const result = costRecord(record);
    expect(result.usd).toBeCloseTo(expected, 6);
    expect(result.credits).toBeCloseTo(expected * 100, 4);
  });
});

// ---------------------------------------------------------------------------
// comparePlans
// ---------------------------------------------------------------------------

describe("comparePlans", () => {
  it("marks plan as safe when usage is well under limit", () => {
    const [pro] = comparePlans(100); // Pro has 1000 credits
    expect(pro.plan).toBe("pro");
    expect(pro.verdict).toBe("safe");
    expect(pro.remainingCredits).toBe(900);
    expect(pro.overageCredits).toBe(0);
  });

  it("marks plan as close when usage is 80%+", () => {
    const [pro] = comparePlans(850); // 850/1000 = 85%
    expect(pro.verdict).toBe("close");
    expect(pro.remainingCredits).toBe(150);
  });

  it("marks plan as cooked when usage exceeds limit", () => {
    const [pro] = comparePlans(1500); // 1500/1000 = 150%
    expect(pro.verdict).toBe("cooked");
    expect(pro.overageCredits).toBe(500);
    expect(pro.overageUsd).toBe(5);
    expect(pro.remainingCredits).toBe(0);
  });

  it("verdict boundary: exactly 80% is close", () => {
    const [pro] = comparePlans(800); // exactly 80%
    expect(pro.verdict).toBe("close");
  });

  it("verdict boundary: 79.9% is safe", () => {
    const [pro] = comparePlans(799); // 79.9%
    expect(pro.verdict).toBe("safe");
  });

  it("verdict boundary: exactly 100% is cooked", () => {
    const [pro] = comparePlans(1000);
    expect(pro.verdict).toBe("cooked");
  });

  it("returns one entry per plan", () => {
    const results = comparePlans(0);
    expect(results).toHaveLength(Object.keys(PLANS).length);
  });

  it("handles zero usage", () => {
    const [pro] = comparePlans(0);
    expect(pro.verdict).toBe("safe");
    expect(pro.remainingCredits).toBe(pro.includedCredits);
  });
});

// ---------------------------------------------------------------------------
// MODEL_PRICES completeness
// ---------------------------------------------------------------------------

describe("MODEL_PRICES", () => {
  it("every model has required rate fields", () => {
    for (const [model, rate] of Object.entries(MODEL_PRICES) as [
      string,
      { input: number; cachedInput: number; output: number },
    ][]) {
      expect(rate.input, `${model} input`).toBeGreaterThan(0);
      expect(rate.cachedInput, `${model} cachedInput`).toBeGreaterThan(0);
      expect(rate.output, `${model} output`).toBeGreaterThan(0);
      // cachedInput should be cheaper than input
      expect(rate.cachedInput, `${model} cachedInput < input`).toBeLessThan(
        rate.input
      );
    }
  });
});

// ---------------------------------------------------------------------------
// PLANS
// ---------------------------------------------------------------------------

describe("PLANS", () => {
  it("core plans exist", () => {
    expect(PLANS.pro).toBe(1000);
    expect(PLANS["pro+"]).toBe(3900);
    expect(PLANS.business).toBe(1900);
    expect(PLANS.enterprise).toBe(3900);
  });

  it("all plan values are positive", () => {
    for (const [plan, credits] of Object.entries(PLANS)) {
      expect(credits, `${plan} credits`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// roughTokens
// ---------------------------------------------------------------------------

describe("roughTokens", () => {
  it("returns 0 for null/undefined", () => {
    expect(roughTokens(null)).toBe(0);
    expect(roughTokens(undefined)).toBe(0);
  });

  it("estimates tokens from JSON string length", () => {
    // JSON.stringify("hello world") → '"hello world"' = 13 chars → ceil(13/4) = 4
    expect(roughTokens("hello world")).toBe(4);
  });

  it("handles objects", () => {
    expect(roughTokens({ foo: "bar" })).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DISPLAY_NAMES
// ---------------------------------------------------------------------------

describe("DISPLAY_NAMES", () => {
  it("maps all source kinds", () => {
    const sources: string[] = ["vscode", "opencode", "pi", "copilot-cli"];
    for (const source of sources) {
      expect(DISPLAY_NAMES[source]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// buildSummary
// ---------------------------------------------------------------------------

describe("buildSummary", () => {
  it("aggregates totals from costed records", () => {
    const records = costRecords([
      {
        source: "opencode",
        sourcePath: "/mock",
        provider: "github-copilot",
        model: "gpt-5-mini",
        inputTokens: 100_000,
        outputTokens: 50_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      {
        source: "pi",
        sourcePath: "/mock",
        provider: "github-copilot",
        model: "claude-sonnet-4.5",
        inputTokens: 200_000,
        outputTokens: 100_000,
        cacheReadTokens: 50_000,
        cacheWriteTokens: 0,
      },
    ]);
    const findings: SourceFinding[] = [
      { source: "opencode", path: "/mock", found: true, records: 1, notes: [] },
      { source: "pi", path: "/mock", found: true, records: 1, notes: [] },
    ];
    const summary = buildSummary({
      findings,
      records,
      toolFindings: [],
    });
    expect(summary.totals.calls).toBe(2);
    expect(summary.totals.inputTokens).toBe(300_000);
    expect(summary.totals.outputTokens).toBe(150_000);
    expect(summary.totals.cacheReadTokens).toBe(50_000);
    expect(summary.totals.usd).toBeGreaterThan(0);
    expect(summary.totals.credits).toBeGreaterThan(0);
    expect(summary.plans.length).toBe(Object.keys(PLANS).length);
    expect(Object.keys(summary.byModel)).toHaveLength(2);
  });

  it("handles empty records", () => {
    const summary = buildSummary({
      findings: [],
      records: [],
      toolFindings: [],
    });
    expect(summary.totals.calls).toBe(0);
    expect(summary.totals.usd).toBe(0);
    expect(summary.totals.credits).toBe(0);
    expect(summary.plans).toHaveLength(Object.keys(PLANS).length);
    // All plans should be safe with 0 usage
    expect(
      summary.plans.every((p: { verdict: string }) => p.verdict === "safe")
    ).toBe(true);
  });

  it("counts auto-model remaps only when records were actually remapped", () => {
    const records = costRecords(
      [
        {
          source: "vscode",
          sourcePath: "/mock",
          provider: "github-copilot",
          model: "auto",
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        {
          source: "vscode",
          sourcePath: "/mock",
          provider: "github-copilot",
          model: "gpt-5-mini",
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      ],
      { autoModel: "gpt-5.3-codex" }
    );

    const summary = buildSummary({
      autoModel: "gpt-5.3-codex",
      findings: [],
      records,
      toolFindings: [],
    });

    expect(summary.autoModelAppliedCount).toBe(1);
    expect(summary.byModel["gpt-5.3-codex"]!.calls).toBe(1);
    expect(summary.byModel["gpt-5-mini"]!.calls).toBe(1);
  });

  it("counts unique sessions", () => {
    const records = costRecords([
      {
        source: "opencode",
        sourcePath: "/mock",
        sessionId: "s1",
        provider: "github-copilot",
        model: "gpt-5-mini",
        inputTokens: 100,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      {
        source: "opencode",
        sourcePath: "/mock",
        sessionId: "s1",
        provider: "github-copilot",
        model: "gpt-5-mini",
        inputTokens: 100,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      {
        source: "pi",
        sourcePath: "/mock",
        sessionId: "s2",
        provider: "github-copilot",
        model: "gpt-5-mini",
        inputTokens: 100,
        outputTokens: 100,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    ]);
    const summary = buildSummary({
      findings: [],
      records,
      toolFindings: [],
    });
    expect(summary.totals.sessions).toBe(2);
    expect(summary.totals.calls).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// costRecords
// ---------------------------------------------------------------------------

describe("costRecords", () => {
  it("returns empty array for empty input", () => {
    expect(costRecords([])).toEqual([]);
  });

  it("returns CostedUsageRecord[] with pricing info", () => {
    const results = costRecords([
      {
        source: "opencode",
        sourcePath: "/mock",
        provider: "github-copilot",
        model: "gpt-5-mini",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]!.pricingKnown).toBe(true);
    expect(results[0]!.pricingModel).toBe("gpt-5-mini");
    expect(results[0]!.usd).toBeCloseTo(0.25, 6);
  });

  it("prices auto records with --auto-model while preserving original model", () => {
    const results = costRecords(
      [
        {
          source: "vscode",
          sourcePath: "/mock",
          provider: "github-copilot",
          model: "auto",
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      ],
      { autoModel: " gpt-5.3-codex " }
    );

    expect(results[0]!.model).toBe("auto");
    expect(results[0]!.pricingModel).toBe("gpt-5.3-codex");
    expect(results[0]!.pricingKnown).toBe(true);
    expect(results[0]!.usd).toBeCloseTo(1.75, 6);
  });

  it("does not remap non-auto records", () => {
    const results = costRecords(
      [
        {
          source: "vscode",
          sourcePath: "/mock",
          provider: "github-copilot",
          model: "gpt-5-mini",
          inputTokens: 1_000_000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      ],
      { autoModel: "gpt-5.3-codex" }
    );

    expect(results[0]!.model).toBe("gpt-5-mini");
    expect(results[0]!.pricingModel).toBe("gpt-5-mini");
    expect(results[0]!.usd).toBeCloseTo(0.25, 6);
  });
});
