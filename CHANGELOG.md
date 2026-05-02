# Changelog

## [0.4.0](https://github.com/PanAchy/copilot-arewecooked/compare/v0.3.6...v0.4.0) (2026-05-02)


### Features

* add --auto-model option for cost estimation and update HTML report ([6f801d2](https://github.com/PanAchy/copilot-arewecooked/commit/6f801d280796bd8c0e9b89ae8496fb400d5291c5))
* add --auto-model option for cost estimation and update HTML report ([111d21a](https://github.com/PanAchy/copilot-arewecooked/commit/111d21a8713b3dc518dd0592e7e3272007b69ec4))
* **auto-model:** support pricing records reported as auto ([3d42538](https://github.com/PanAchy/copilot-arewecooked/commit/3d425384f1446a2dcb9c6a968f385d9ff8aab55d))


### Bug Fixes

* **auto-model:** preserve original model when remapping ([38338cb](https://github.com/PanAchy/copilot-arewecooked/commit/38338cbcd7499542300cfd00527e1c1176feaf02))
* **auto-model:** preserve original model when remapping ([4f07c96](https://github.com/PanAchy/copilot-arewecooked/commit/4f07c96bac5e1a494048563913f41687b02c4302))

## [0.3.6](https://github.com/PanAchy/copilot-arewecooked/compare/v0.3.5...v0.3.6) (2026-04-30)


### Bug Fixes

* handle SQLITE_TOOBIG and silent data loss in opencode parser ([#36](https://github.com/PanAchy/copilot-arewecooked/issues/36)) ([b34d5ba](https://github.com/PanAchy/copilot-arewecooked/commit/b34d5ba28a577490cb650e14b3227c2fa47d4d0f))

## [0.3.5](https://github.com/PanAchy/copilot-arewecooked/compare/v0.3.4...v0.3.5) (2026-04-29)


### Bug Fixes

* **publish:** trigger on tag push to bypass GITHUB_TOKEN event restriction ([#31](https://github.com/PanAchy/copilot-arewecooked/issues/31)) ([1b1f562](https://github.com/PanAchy/copilot-arewecooked/commit/1b1f5624a31921508f57b94ea084421e9761a57f))

## [0.3.4](https://github.com/PanAchy/copilot-arewecooked/compare/v0.3.3...v0.3.4) (2026-04-29)


### Features

* add VS Code Insiders as a separate source ([#22](https://github.com/PanAchy/copilot-arewecooked/issues/22)) ([e22bcf4](https://github.com/PanAchy/copilot-arewecooked/commit/e22bcf4cd14cc77b61c09d26ca5f543e96393ebf))
* redesign report cards, add PNG export, opencode perf, Gemini aliases, and new tests ([#28](https://github.com/PanAchy/copilot-arewecooked/issues/28)) ([48bc85a](https://github.com/PanAchy/copilot-arewecooked/commit/48bc85a45e9d646263df50578f01545ca645032c))
* warn about missing output tokens + add --since flag ([#26](https://github.com/PanAchy/copilot-arewecooked/issues/26)) ([668b2c3](https://github.com/PanAchy/copilot-arewecooked/commit/668b2c36165d95fd17bf997461191c7609cde356))


### Bug Fixes

* prototype pollution in setPath, sinceMs filter, chart bucketing, mock findings ([#27](https://github.com/PanAchy/copilot-arewecooked/issues/27)) ([28f7468](https://github.com/PanAchy/copilot-arewecooked/commit/28f7468a0d0fa7c7e11a55a7e7bdddd08e89a861))
* Windows cross-platform build and VS Code session history parser ([#21](https://github.com/PanAchy/copilot-arewecooked/issues/21)) ([9864225](https://github.com/PanAchy/copilot-arewecooked/commit/9864225f8477e30b9dc92c0e2a59248a522a13b2))

## [0.3.3](https://github.com/PanAchy/copilot-arewecooked/compare/v0.3.2...v0.3.3) (2026-04-29)

### Bug Fixes

- warn on unknown models, exclude tests and mock from npm package ([#15](https://github.com/PanAchy/copilot-arewecooked/issues/15)) ([35a1312](https://github.com/PanAchy/copilot-arewecooked/commit/35a1312e1370c5eb32f3b616e3d96e9cfb927a1a))

## [0.3.2](https://github.com/PanAchy/copilot-arewecooked/compare/v0.3.1...v0.3.2) (2026-04-29)

### Features

- add model aliases, error handling, tests, npm publish, and HTML report improvements ([#12](https://github.com/PanAchy/copilot-arewecooked/issues/12)) ([0e6bbb9](https://github.com/PanAchy/copilot-arewecooked/commit/0e6bbb9a293e315bb7c040c56ff37a1bfdf3c6ff))

## [0.3.1](https://github.com/PanAchy/copilot-arewecooked/compare/v0.3.0...v0.3.1) (2026-04-29)

### Features

- **report:** make HTML the default report ([#9](https://github.com/PanAchy/copilot-arewecooked/issues/9)) ([#10](https://github.com/PanAchy/copilot-arewecooked/issues/10)) ([9a97e12](https://github.com/PanAchy/copilot-arewecooked/commit/9a97e1240c8ba57821d3b8f91e44290448852122))

## [0.3.0](https://github.com/PanAchy/copilot-arewecooked/compare/copilot-arewecooked-v0.2.0...copilot-arewecooked-v0.3.0) (2026-04-29)

### ⚠ BREAKING CHANGES

- **cli:** --opencode-db, --pi-sessions, --copilot-cli-state, --vscode-storage, --no-opencode, --no-pi, --no-copilot-cli, --no-vscode flags removed.

### Features

- **cli:** simplify to --days and --json only ([23df1bc](https://github.com/PanAchy/copilot-arewecooked/commit/23df1bc6ba614bcbb8a8fd57c638bf175158654e))
- initial Copilot billing estimator ([6f78718](https://github.com/PanAchy/copilot-arewecooked/commit/6f787182a1ff07d8a00900dc197a09946066da0e))
- **report:** improve plan fit table and cost display ([a66d5c5](https://github.com/PanAchy/copilot-arewecooked/commit/a66d5c5e5060ef2509f4dcbb0b6d06cf80d6c250))

## 0.2.0 (2026-04-29)

### Features

- initial Copilot billing estimator
- support VS Code, OpenCode, Pi, and GitHub Copilot CLI sources
- estimate GitHub Copilot AI-credit cost and plan fit
