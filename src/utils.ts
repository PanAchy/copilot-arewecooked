export function roughTokens(value: unknown): number {
  if (value == null) return 0;
  return Math.ceil(JSON.stringify(value).length / 4);
}

export const DISPLAY_NAMES: Record<string, string> = {
  vscode: "VS Code",
  "vscode-insiders": "VS Code Insiders",
  opencode: "OpenCode",
  pi: "Pi",
  "copilot-cli": "Copilot CLI",
};
