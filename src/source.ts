import type { SourceFinding, ToolFinding, UsageRecord } from "./types.js";

export interface SourceParseResult {
  finding: SourceFinding;
  records: UsageRecord[];
  toolFindings?: ToolFinding[];
}

export interface SourceAdapter {
  kind: SourceFinding["source"];
  defaultPaths(): string[];
  parse(path: string | undefined, sinceMs?: number): SourceParseResult;
}
