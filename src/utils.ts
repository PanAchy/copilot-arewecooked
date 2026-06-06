import { openSync, readSync, closeSync } from "node:fs";

export function roughTokens(value: unknown): number {
  if (value == null) return 0;
  return Math.ceil(JSON.stringify(value).length / 4);
}

export const DISPLAY_NAMES: Record<string, string> = {
  vscode: "VS Code",
  "vscode-insiders": "VS Code Insiders",
  "vscode-otel": "OTel",
  opencode: "OpenCode",
  pi: "Pi",
  zed: "Zed",
  "copilot-cli": "Copilot CLI",
  xcode: "Copilot for Xcode",
};

export function* readLinesFromFile(filePath: string): Generator<string> {
  const fd = openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024); // 1MB chunks
    let leftover = "";
    let bytesRead: number;
    while ((bytesRead = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      const chunk = leftover + buffer.toString("utf8", 0, bytesRead);
      const lines = chunk.split(/\r?\n/);
      leftover = lines.pop() || ""; // last part might be incomplete
      for (const line of lines) {
        yield line;
      }
    }
    if (leftover) {
      yield leftover;
    }
  } finally {
    closeSync(fd); // always runs — even on break/throw/return
  }
}
