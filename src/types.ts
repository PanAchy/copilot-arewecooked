export type SourceKind =
  | "opencode"
  | "pi"
  | "copilot-cli"
  | "vscode"
  | "vscode-insiders"
  | "xcode";

export interface UsageRecord {
  source: SourceKind;
  sourcePath: string;
  sessionId?: string;
  messageId?: string;
  parentId?: string;
  timestamp?: number | string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  mode?: string;
  agent?: string;
  isCompaction?: boolean;
  calls: number;
}

export interface SourceFinding {
  source: SourceKind;
  path: string;
  found: boolean;
  records: number;
  notes: string[];
}

export interface ToolFinding {
  source: SourceKind;
  sessionId?: string;
  tool: string;
  status?: string;
  count: number;
}

export interface PriceRate {
  input: number;
  cachedInput: number;
  output: number;
  cacheWrite?: number;
}

export interface CostedUsageRecord extends UsageRecord {
  usd: number;
  credits: number;
  pricingModel?: string;
  pricingKnown: boolean;
}

export interface PlanComparison {
  plan: string;
  includedCredits: number;
  usedCredits: number;
  remainingCredits: number;
  overageCredits: number;
  overageUsd: number;
  verdict: "safe" | "close" | "cooked";
}

export interface Summary {
  generatedAt: string;
  periodDays?: number;
  autoModel?: string;
  autoModelAppliedCount?: number;
  sources: SourceFinding[];
  records: CostedUsageRecord[];
  toolFindings: ToolFinding[];
  totals: {
    calls: number;
    sessions: number;
    userPromptParents: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    usd: number;
    credits: number;
    compactions: number;
  };
  byModel: Record<
    string,
    {
      calls: number;
      credits: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    }
  >;
  plans: PlanComparison[];
}
