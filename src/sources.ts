import { defaultCopilotCliStatePaths, parseCopilotCli } from "./copilotCli.js";
import { defaultOpenCodeDbPaths, parseOpenCode } from "./opencode.js";
import { defaultPiSessionsPaths, parsePi } from "./pi.js";
import type { SourceAdapter } from "./source.js";
import { defaultZedDbPaths, parseZed } from "./zed.js";
import {
  defaultVsCodeWorkspaceStoragePaths,
  defaultVsCodeInsidersWorkspaceStoragePaths,
  parseVsCode,
  parseVsCodeInsiders,
} from "./vscode.js";
import { defaultXcodeLogPaths, parseXcode } from "./xcode.js";

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
  zed: {
    kind: "zed",
    defaultPaths: defaultZedDbPaths,
    parse: parseZed,
  },
  copilotCli: {
    kind: "copilot-cli",
    defaultPaths: defaultCopilotCliStatePaths,
    parse: parseCopilotCli,
  },
  xcode: {
    kind: "xcode",
    defaultPaths: defaultXcodeLogPaths,
    parse: parseXcode,
  },
} satisfies Record<string, SourceAdapter>;
