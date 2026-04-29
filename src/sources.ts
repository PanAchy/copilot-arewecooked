import { defaultCopilotCliStatePaths, parseCopilotCli } from "./copilotCli.js";
import { defaultOpenCodeDbPaths, parseOpenCode } from "./opencode.js";
import { defaultPiSessionsPaths, parsePi } from "./pi.js";
import type { SourceAdapter } from "./source.js";
import { defaultVsCodeWorkspaceStoragePaths, parseVsCode } from "./vscode.js";

export const sourceAdapters = {
  vscode: {
    kind: "vscode",
    defaultPaths: defaultVsCodeWorkspaceStoragePaths,
    parse: parseVsCode,
  },
  opencode: {
    kind: "opencode",
    defaultPaths: defaultOpenCodeDbPaths,
    parse: parseOpenCode,
  },
  pi: {
    kind: "pi",
    defaultPaths: defaultPiSessionsPaths,
    parse: parsePi,
  },
  copilotCli: {
    kind: "copilot-cli",
    defaultPaths: defaultCopilotCliStatePaths,
    parse: parseCopilotCli,
  },
} satisfies Record<string, SourceAdapter>;
