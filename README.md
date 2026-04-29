<div align="center">

# Yo GitHub Copilot: are we cooked?

</div>

Estimate your GitHub Copilot AI-credit cost in preparation for June 1st.
Pulls usage from VS Code, OpenCode, Pi, and GitHub Copilot CLI, aggregates it
based on the new per-token pricing, and generates a local HTML report.

![HTML report preview](./docs/assets/report-preview.png)

#### Relevant links

- [April 27th, 2026: GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)
- [Models and per-token pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing#model-multipliers-for-annual-copilot-pro-and-copilot-pro-subscribers)
- [Usage-based billing for individuals](https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals)
- [Usage-based billing for organizations and enterprises](https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises)

> TL;DR: GitHub Copilot is moving from premium-request quotas to per-token billing on June 1st. Agentic workflows can now cost more than the old premium-request mental model suggests.

## Setup

[Download the latest release](../../releases) and unzip, then:

```bash
npm install
npm run build
npm start
```

By default, this writes an HTML report like:

```text
copilot-report-YYYY-MM-DD.html
```

### Options

| Flag     | Description                                |
| -------- | ------------------------------------------ |
| `--days` | Days to look back (default: all available) |
| `--json` | Print detailed normalized JSON             |
| `--html` | Write HTML report to a specific path       |

```bash
npm start -- --days 30
npm start -- --html report.html
npm start -- --json
```

## How data is extracted

| Source          | Paths                                                                                                                                                                                                                                       | Token accuracy                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **VS Code**     | `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.jsonl` (macOS) · `%APPDATA%/Code/User/workspaceStorage/*/chatSessions/*.jsonl` (Windows) · `~/.config/Code/User/workspaceStorage/*/chatSessions/*.jsonl` (Linux) | Input estimated, output exact, cache not persisted |
| **OpenCode**    | `~/.local/share/opencode/opencode.db` (macOS and Linux) · `%LOCALAPPDATA%/opencode/opencode.db` / `%APPDATA%/opencode/opencode.db` (Windows)                                                                                                | All exact (input, output, cache read/write)        |
| **Pi**          | `~/.pi/agent/sessions/**/*.jsonl` (all platforms)                                                                                                                                                                                           | All exact (input, output, cache read/write)        |
| **Copilot CLI** | `~/.copilot/session-state/*/events.jsonl` (all platforms)                                                                                                                                                                                   | Output exact, input estimated, compaction exact    |

## Contributing

PRs welcome. Run `npm run check` to build and verify.

## License

[MIT](./LICENSE)
