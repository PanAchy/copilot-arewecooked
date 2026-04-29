# GitHub Copilot, are we cooked?

_Are your Copilot AI credits cooked?_

Estimate your GitHub Copilot AI-credit cost in preparation for June 1st.
This will allow you to pull usage out of:

- VS Code
- OpenCode
- Pi
- GitHub Copilot CLI

and aggregate it based on the new costs, to help you know if you are over or under.

#### Relevant information

- [April 27th, 2026: GitHub Copilot is moving to usage-based billing](https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/)
- [Models and per-token pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing#model-multipliers-for-annual-copilot-pro-and-copilot-pro-subscribers)
- [Usage-based billing for individuals](https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-individuals)
- [Usage-based billing for organizations and enterprises](https://docs.github.com/en/copilot/concepts/billing/usage-based-billing-for-organizations-and-enterprises)

_TL;DR The premium request system allowed users with the right set of orchestration (e.g. subagents) to become very efficient at using their GitHub Copilot subscription. These orchestration techniques stop mattering because billing is moving to input/output/cache token based pricing._

## Run

```bash
npm install
npm run build
node dist/cli.js
```

Options:

```bash
node dist/cli.js --days 30
node dist/cli.js --json
node dist/cli.js --no-vscode
node dist/cli.js --no-opencode
node dist/cli.js --no-pi
node dist/cli.js --no-copilot-cli
```

## How data is extracted

### VS Code Copilot

Paths checked:

`~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.jsonl`

`%APPDATA%/Code/User/workspaceStorage/*/chatSessions/*.jsonl`

`~/.config/Code/User/workspaceStorage/*/chatSessions/*.jsonl`

Uses patch-reduced chat session requests; exact `completionTokens`; input estimated from rendered context; cache tokens not persisted.

### OpenCode

Paths checked:

`~/.local/share/opencode/opencode.db`

`~/Library/Application Support/opencode/opencode.db`

`%LOCALAPPDATA%/opencode/opencode.db`

`%APPDATA%/opencode/opencode.db`

Uses `message.data` assistant rows where `providerID === "github-copilot"`; exact `tokens.input`, `tokens.output`, `tokens.cache.read/write`; tool counts from `part.data` for `question`, `task`, `delegate_task`.

### Pi

Paths checked:

`~/.pi/agent/sessions/**/*.jsonl`

Uses assistant messages where `provider === "github-copilot"`; exact `usage.input`, `usage.output`, `usage.cacheRead/cacheWrite`.

### GitHub Copilot CLI

Paths checked:

`~/.copilot/session-state/*/events.jsonl`

Uses normal assistant messages for exact `outputTokens`; input is estimated from local event content; compaction events expose exact `compactionTokensUsed`.
