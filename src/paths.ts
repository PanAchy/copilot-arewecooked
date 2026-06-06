import { homedir, platform } from "node:os";
import { join } from "node:path";

const home = homedir();
const isWindows = platform() === "win32";
const isMac = platform() === "darwin";

function compact(paths: Array<string | undefined>): string[] {
  return [...new Set(paths.filter((path): path is string => Boolean(path)))];
}

export function opencodeDbPaths(): string[] {
  return compact([
    join(home, ".local/share/opencode/opencode.db"),
    isMac
      ? join(home, "Library/Application Support/opencode/opencode.db")
      : undefined,
    isWindows && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "opencode/opencode.db")
      : undefined,
    isWindows && process.env.APPDATA
      ? join(process.env.APPDATA, "opencode/opencode.db")
      : undefined,
  ]);
}

export function zedDbPaths(): string[] {
  return compact([
    isMac
      ? join(home, "Library/Application Support/Zed/threads/threads.db")
      : undefined,
    join(home, ".local/share/zed/threads/threads.db"),
  ]);
}

export function piSessionsPaths(): string[] {
  return compact([join(home, ".pi/agent/sessions")]);
}

export function copilotCliStatePaths(): string[] {
  return compact([join(home, ".copilot/session-state")]);
}

export function vscodeStoragePaths(): string[] {
  return compact([
    isMac
      ? join(home, "Library/Application Support/Code/User/workspaceStorage")
      : undefined,
    isWindows && process.env.APPDATA
      ? join(process.env.APPDATA, "Code/User/workspaceStorage")
      : undefined,
    join(home, ".config/Code/User/workspaceStorage"),
  ]);
}

export function vscodeOtelDbPaths(): string[] {
  return compact([
    join(
      home,
      ".config/Code/User/globalStorage/github.copilot-chat/agent-traces.db"
    ),
    isMac
      ? join(
          home,
          "Library/Application Support/Code/User/globalStorage/github.copilot-chat/agent-traces.db"
        )
      : undefined,
    isWindows && process.env.APPDATA
      ? join(
          process.env.APPDATA,
          "Code/User/globalStorage/github.copilot-chat/agent-traces.db"
        )
      : undefined,
    isWindows && process.env.LOCALAPPDATA
      ? join(
          process.env.LOCALAPPDATA,
          "Code/User/globalStorage/github.copilot-chat/agent-traces.db"
        )
      : undefined,
  ]);
}

export function xcodeLogPaths(): string[] {
  return compact([
    isMac ? join(home, "Library/Logs/GitHubCopilot") : undefined,
  ]);
}

export function vscodeInsidersStoragePaths(): string[] {
  return compact([
    isMac
      ? join(
          home,
          "Library/Application Support/Code - Insiders/User/workspaceStorage"
        )
      : undefined,
    isWindows && process.env.APPDATA
      ? join(process.env.APPDATA, "Code - Insiders/User/workspaceStorage")
      : undefined,
    join(home, ".config/Code - Insiders/User/workspaceStorage"),
  ]);
}
