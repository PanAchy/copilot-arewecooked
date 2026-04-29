---
name: create-pr
description: Create PRs with titles and bodies that produce accurate release notes. Use when opening a pull request, merging to develop or main, or when user says "open a PR", "create a PR", "ready to merge", or "ship it".
---

# Create PR

## Rules

1. All work targets `develop`. No feature branches, no PRs into develop from branches. Push directly to develop.
2. PRs are only created when merging `develop` → `main`.
3. The PR title becomes the release-please changelog entry. The PR body becomes the GitHub Release notes.
4. Write the title as a single conventional commit summarizing actual diff changes.
5. Enumerate every meaningful actual diff change in the body.
6. Never include already-merged historical commits just because they appear in `git log origin/main..develop`.

## PR title format

```
<type>(<scope>): <summary of all changes>
```

Pick the highest-impact type: `feat` > `fix` > `refactor` > `test` > `docs` > `chore`.

## PR body format

```
## What changed

- <change 1>
- <change 2>
- <change 3>

## Context

<1-2 sentences on why>

## Test plan

- [ ] <how to verify>
```

## Before creating the PR

1. Run `git fetch origin`.
2. Run `git diff origin/main...develop --name-status` to see actual changed files in the PR.
3. Run `git diff origin/main...develop -- <file>` or `gh pr diff` to understand actual content changes.
4. Use `git log origin/main..develop --oneline` only as supporting context, never as the source of truth. Merge/release history may contain commits whose changes already exist on `main`.
5. Synthesize the title and body from the diff, not from commit headlines.
6. Verify `npm run build && npm test` passes.
7. Create PR: `gh pr create --base main --head develop --title "<title>" --body "<body>"`
8. After creating PR, run `gh pr diff <number> --name-only` and `gh pr view <number> --json files,title,body` to confirm body matches actual changed files.

## Title quality check

- [ ] Would a user reading the changelog understand what changed?
- [ ] Does it cover all user-visible changes, not just the first commit?
- [ ] Is the type correct? (feat = user-visible feature, fix = bug, chore = internal)
- [ ] No period at the end. No trailing punctuation.

## Bad vs Good

Bad: `feat: updates` (vague)
Bad: `fix: typo in readme` when the branch also adds tests and error handling (understates)
Bad: `feat: add error handling, tests, --version flag, npm publish, CONTRIBUTING.md` (too long, use body)

Good: `feat: add error handling, tests, and npm publish workflow` (concise, accurate scope)
Good: `fix: handle malformed JSONL in source parsers` (specific, covers the real fix)
