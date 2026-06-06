<div align="center">

# Yo GitHub Copilot: are we cooked?

[![npm version](https://img.shields.io/npm/v/copilot-arewecooked)](https://www.npmjs.com/package/copilot-arewecooked)
[![npm downloads](https://img.shields.io/npm/dw/copilot-arewecooked)](https://www.npmjs.com/package/copilot-arewecooked)

</div>

Estimate your GitHub Copilot AI-credit cost in preparation for June 1st.
Pulls usage from VS Code, OpenCode, Pi, Zed, GitHub Copilot CLI, and Copilot for Xcode, aggregates it based on the new per-token pricing, and generates a local HTML report. **Fully local**.

![HTML report preview](./docs/assets/report-preview.png)

#### Relevant links

- [April 27th, 2026: GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)
- [Models and per-token pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing#model-multipliers-for-annual-copilot-pro-and-copilot-pro-subscribers)
- [Usage-based billing for individuals](https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals)
- [Usage-based billing for organizations and enterprises](https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises)

> TL;DR: GitHub Copilot is moving from premium-request quotas to per-token billing on June 1st. Agentic workflows can now cost more than the old premium-request mental model suggests.

## Quick start

```bash
npx copilot-arewecooked
```

This scans your local Copilot usage data, estimates your AI-credit cost under the new billing, and writes an HTML report + PNG screenshot to your current directory:

```text
copilot-report-*.html
copilot-report-*.png
```

### Flags

| Flag                   | Description                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `--days <n>`           | Days to look back (default: all available data)                                                                       |
| `--since <date>`       | Only include records from this date onward (YYYY-MM-DD)                                                               |
| `--auto-model <model>` | Treat records reported as `auto` as a specific model for cost estimation (e.g. `gpt-5.3-codex`)                       |
| `--json`               | Print detailed normalized JSON to stdout (mutually exclusive with `--terminal`)                                       |
| `--terminal`           | Print a compact report to the terminal instead of generating HTML/PNG (mutually exclusive with `--json` and `--html`) |
| `--html [path]`        | Write HTML report to a specific path (default: auto-generated filename)                                               |

> **Note on `auto` model:** Some tools (e.g. VS Code Copilot) may report the model as `auto` when the user has not selected a specific model. Credits for those requests will show as zero unless you specify `--auto-model` to map them to a known priced model. The HTML report will include a note when any `auto` records are remapped.

## How data is extracted

| Source                | Paths                                                                                                                                                                                                                                                                                 | Token accuracy                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **VS Code**           | `~/Library/Application Support/Code{, - Insiders}/User/workspaceStorage/*/chatSessions/*.jsonl` (macOS) · `%APPDATA%/Code{, - Insiders}/User/workspaceStorage/*/chatSessions/*.jsonl` (Windows) · `~/.config/Code{, - Insiders}/User/workspaceStorage/*/chatSessions/*.jsonl` (Linux) | Input estimated, output exact, cache not persisted                                                |
| **VS Code (OTel)**    | `~/.config/Code/User/globalStorage/github.copilot-chat/agent-traces.db` (Linux) · `~/Library/Application Support/Code/User/globalStorage/github.copilot-chat/agent-traces.db` (macOS) · `%APPDATA%/Code/User/globalStorage/github.copilot-chat/agent-traces.db` (Windows)             | All exact (input, output, cache read); requires `github.copilot.chat.otel.dbSpanExporter.enabled` |
| **OpenCode**          | `~/.local/share/opencode/opencode.db` (macOS and Linux) · `%LOCALAPPDATA%/opencode/opencode.db` / `%APPDATA%/opencode/opencode.db` (Windows)                                                                                                                                          | All exact (input, output, cache read/write)                                                       |
| **Pi**                | `~/.pi/agent/sessions/**/*.jsonl` (all platforms)                                                                                                                                                                                                                                     | All exact (input, output, cache read/write)                                                       |
| **Zed**               | `~/.local/share/zed/threads/threads.db` or `Library/Application Support/Zed/threads/threads.db`                                                                                                                                                                                       | All exact (input, output, cache read/write)                                                       |
| **Copilot CLI**       | `~/.copilot/session-state/*/events.jsonl` (all platforms)                                                                                                                                                                                                                             | Output exact, input estimated, compaction exact                                                   |
| **Copilot for Xcode** | `~/Library/Logs/GitHubCopilot/*.log` (macOS only)                                                                                                                                                                                                                                     | All exact (input, output, cache read); model attribution via heuristic                            |
