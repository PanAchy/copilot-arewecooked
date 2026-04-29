import type {
  CostedUsageRecord,
  PlanComparison,
  PriceRate,
  UsageRecord,
} from "./types.js";

// GitHub Copilot model pricing, USD per 1M tokens.
// Source: https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
export const MODEL_PRICES: Record<string, PriceRate> = {
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "raptor-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "grok-code-fast-1": { input: 0.2, cachedInput: 0.02, output: 1.5 },
  "gpt-4.1": { input: 2.0, cachedInput: 0.5, output: 8.0 },
  "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.2-codex": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15.0 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
  "gpt-5.5": { input: 5.0, cachedInput: 0.5, output: 30.0 },
  "claude-haiku-4.5": {
    input: 1.0,
    cachedInput: 0.1,
    cacheWrite: 1.25,
    output: 5.0,
  },
  "claude-sonnet-4": {
    input: 3.0,
    cachedInput: 0.3,
    cacheWrite: 3.75,
    output: 15.0,
  },
  "claude-sonnet-4.5": {
    input: 3.0,
    cachedInput: 0.3,
    cacheWrite: 3.75,
    output: 15.0,
  },
  "claude-sonnet-4.6": {
    input: 3.0,
    cachedInput: 0.3,
    cacheWrite: 3.75,
    output: 15.0,
  },
  "claude-opus-4.5": {
    input: 5.0,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    output: 25.0,
  },
  "claude-opus-4.6": {
    input: 5.0,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    output: 25.0,
  },
  "claude-opus-4.7": {
    input: 5.0,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    output: 25.0,
  },
  "gemini-2.5-pro": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gemini-3-flash": { input: 0.5, cachedInput: 0.05, output: 3.0 },
  "gemini-3.1-pro": { input: 2.0, cachedInput: 0.2, output: 12.0 },
  goldeneye: { input: 1.75, cachedInput: 0.175, output: 14.0 },
};

export const PLANS: Record<string, number> = {
  pro: 1000,
  "pro+": 3900,
  "pro-plus": 3900,
  business: 1900,
  enterprise: 3900,
  "business-promo": 3000,
  "enterprise-promo": 7000,
};

export function normalizeModel(model: string): string {
  return model
    .toLowerCase()
    .replace(/^github-copilot\//, "")
    .replace(/_/g, "-")
    .trim();
}

export function costRecord(record: UsageRecord): CostedUsageRecord {
  const pricingModel = normalizeModel(record.model);
  const rate = MODEL_PRICES[pricingModel];
  if (!rate) {
    return { ...record, usd: 0, credits: 0, pricingModel, pricingKnown: false };
  }

  const usd =
    (record.inputTokens * rate.input +
      record.cacheReadTokens * rate.cachedInput +
      record.cacheWriteTokens * (rate.cacheWrite ?? rate.cachedInput) +
      record.outputTokens * rate.output) /
    1_000_000;

  return {
    ...record,
    usd,
    credits: usd * 100,
    pricingModel,
    pricingKnown: true,
  };
}

export function comparePlans(usedCredits: number): PlanComparison[] {
  return Object.entries(PLANS).map(([plan, includedCredits]) => {
    const remainingCredits = includedCredits - usedCredits;
    const overageCredits = Math.max(0, -remainingCredits);
    const ratio = usedCredits / includedCredits;
    const verdict: PlanComparison["verdict"] =
      ratio >= 1 ? "cooked" : ratio >= 0.8 ? "close" : "safe";
    return {
      plan,
      includedCredits,
      usedCredits,
      remainingCredits: Math.max(0, remainingCredits),
      overageCredits,
      overageUsd: overageCredits / 100,
      verdict,
    };
  });
}
