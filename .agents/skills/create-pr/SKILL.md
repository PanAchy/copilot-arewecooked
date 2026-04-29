---
name: create-pr
description: Create PRs with titles and bodies that produce accurate release notes. Use when opening a pull request, merging to develop or main, or when user says "open a PR", "create a PR", "ready to merge", or "ship it".
---

# Create PR

## Rules

1. Create short-lived feature branches from `main` for all work.
2. Open PRs from feature branches directly into `main`.
3. Prefer squash merge. The PR title becomes the single Conventional Commit that release-please reads.
4. The PR title becomes the release-please changelog entry. The PR body becomes the GitHub Release notes.
5. Write the title as a single conventional commit summarizing actual diff changes.
6. Enumerate every meaningful actual diff change in the body.
7. Use `fix(...)` for release-affecting fixes, including broken publish/release automation. Do not use `ci(...)` if the change must trigger a release.

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
2. Confirm current branch is a feature branch, not `main` or `develop`: `git branch --show-current`.
3. Run `git diff origin/main...HEAD --name-status` to see actual changed files in the PR.
4. Run `git diff origin/main...HEAD -- <file>` to understand actual content changes.
5. Synthesize the title and body from the diff, not from commit headlines alone.
6. Verify `npm run build && npm test` passes.
7. Push the branch: `git push -u origin <branch>`.
8. Create PR: `gh pr create --base main --head <branch> --title "<title>" --body "<body>"`.
9. After creating PR, run `gh pr diff <number> --name-only` and `gh pr view <number> --json files,title,body` to confirm body matches actual changed files.

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
