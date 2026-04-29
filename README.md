<div align="center">

# Yo GitHub Copilot: are we cooked?

</div>

Estimate your GitHub Copilot AI-credit cost in preparation for June 1st.
Pulls usage from VS Code, OpenCode, Pi, and GitHub Copilot CLI, aggregates
it based on the new per-token pricing, and tells you if you're over or under.

#### Relevant links

- [April 27th, 2026: GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)
- [Models and per-token pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing#model-multipliers-for-annual-copilot-pro-and-copilot-pro-subscribers)
- [Usage-based billing for individuals](https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals)
- [Usage-based billing for organizations and enterprises](https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises)

> TL;DR: GitHub Copilot is moving from premium-request quotas to per-token billing on June 1st. Orchestration tricks such as the use of subagents no longer saves you usage on this plan.

## Setup

[Download the latest release](../../releases) and unzip, then:

```bash
npm install
npm run build
npm start
```

### Options

| Flag     | Description                      |
| -------- | -------------------------------- |
| `--days` | Days to look back (default: all) |
| `--json` | Print normalized JSON            |

```bash
npm start -- --days 30
npm start -- --json
```

### Example output

```bash
npm start
Period: all available data

Sources
Tool         Calls  Tokens  Credits
-----------  -----  ------  -------
OpenCode         7  70,494     1.13
Pi               2   9,308    0.254
Copilot CLI      6  60,433    2.297
VS Code          3   3,354    0.031

Tokens
Type         Tokens
-----------  ------
Input        65,798
Output       11,743
Cache read   66,048
Cache write       0

Estimated cost: 3.712 AI credits | $0.0371

Plan         Included  Remaining       %
----------  ---------  ---------  ------
pro            1,000      996.3   99.6%
pro+           3,900    3,896.3   99.9%
business       1,900    1,896.3   99.8%
enterprise     3,900    3,896.3   99.9%
```

## How data is extracted

| Source          | Paths                                                                                                                                                                                                                                       | Token accuracy                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **VS Code**     | `~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.jsonl` (macOS) · `%APPDATA%/Code/User/workspaceStorage/*/chatSessions/*.jsonl` (Windows) · `~/.config/Code/User/workspaceStorage/*/chatSessions/*.jsonl` (Linux) | Input estimated, output exact, cache not persisted |
| **OpenCode**    | `~/.local/share/opencode/opencode.db` (macOS and Linux)`%LOCALAPPDATA%/opencode/opencode.db` / `%APPDATA%/opencode/opencode.db` (Windows)                                                                                                   | All exact (input, output, cache read/write)        |
| **Pi**          | `~/.pi/agent/sessions/**/*.jsonl` (all platforms)                                                                                                                                                                                           | All exact (input, output, cache read/write)        |
| **Copilot CLI** | `~/.copilot/session-state/*/events.jsonl` (all platforms)                                                                                                                                                                                   | Output exact, input estimated, compaction exact    |

## Contributing

PRs welcome. Run `npm run check` to build and verify.

## License

[MIT](./LICENSE)
