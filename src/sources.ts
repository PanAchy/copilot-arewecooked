import { defaultCopilotCliStatePaths, parseCopilotCli } from "./copilotCli.js";
import { defaultOpenCodeDbPaths, parseOpenCode } from "./opencode.js";
import { defaultPiSessionsPaths, parsePi } from "./pi.js";
import type { SourceAdapter } from "./source.js";
import {
  defaultVsCodeWorkspaceStoragePaths,
  defaultVsCodeInsidersWorkspaceStoragePaths,
  parseVsCode,
  parseVsCodeInsiders,
} from "./vscode.js";

export const sourceAdapters = {
  vscode: {
    kind: "vscode",
    defaultPaths: defaultVsCodeWorkspaceStoragePaths,
    parse: parseVsCode,
  },
  vscodeInsiders: {
    kind: "vscode-insiders",
    defaultPaths: defaultVsCodeInsidersWorkspaceStoragePaths,
    parse: parseVsCodeInsiders,
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
