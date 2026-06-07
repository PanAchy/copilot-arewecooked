# Changelog

## [0.10.0](https://github.com/PanAchy/copilot-arewecooked/compare/v0.9.2...v0.10.0) (2026-06-07)


### Features

* **vscode:** add OTel traces DB parser for exact token counts ([e053962](https://github.com/PanAchy/copilot-arewecooked/commit/e053962bdd339811f16b9bf6d336067c8918309e))


### Bug Fixes

* **opencode:** add session-level token fallback for OpenCode 1.16.0+ ([46582cd](https://github.com/PanAchy/copilot-arewecooked/commit/46582cdd4fc0fe9dedbbb13757b9e1d41725b191))
* **pricing:** add missing GitHub Copilot models (opus-4.8, gemini-3.5-flash, mai-code-1-flash) ([9f8103e](https://github.com/PanAchy/copilot-arewecooked/commit/9f8103e3a74f9d827c6be38feba49f3f2277ded2))
* **report:** clarify plan comparison with negative remaining and Used % column ([144012c](https://github.com/PanAchy/copilot-arewecooked/commit/144012c1d44dfe217e942785730f1dc006130ef6))
* **vscode-otel:** dedup vscode/vscode-insiders sessions when OTel data exists ([400c925](https://github.com/PanAchy/copilot-arewecooked/commit/400c925cb0301773b9ffabe28a8c38b613fad047))
* **vscode-otel:** rename display to VSCode (OTel) ([bc9eb45](https://github.com/PanAchy/copilot-arewecooked/commit/bc9eb45f3a8ea20e4aa0928c59a5d1834cfab3ab))

## [0.9.2](https://github.com/PanAchy/copilot-arewecooked/compare/v0.9.1...v0.9.2) (2026-05-11)


### Bug Fixes

* **cli:** make puppeteer optional and gracefully skip PNG on failure ([a199f25](https://github.com/PanAchy/copilot-arewecooked/commit/a199f25eb9ae90cc0e207f1123970223527980a5))
* **cli:** make puppeteer optional and gracefully skip PNG on failure ([564303f](https://github.com/PanAchy/copilot-arewecooked/commit/564303f1bc71dbfcc431b932ebbaacdaa3a1855b))
* skip zstd tests on Node 20 and guard source adapters from crashes ([e532965](https://github.com/PanAchy/copilot-arewecooked/commit/e532965af4b02ee684fe1a67696f00634fe2faa3))
* skip zstd tests on Node 20 and guard source adapters from crashes ([eddb281](https://github.com/PanAchy/copilot-arewecooked/commit/eddb281f82e6c10239c28b3bc41f100fd2fc10c3))

## [0.9.1](https://github.com/PanAchy/copilot-arewecooked/compare/v0.9.0...v0.9.1) (2026-05-06)


### Bug Fixes

* avoid stack overflow on large report datasets ([f3f0af6](https://github.com/PanAchy/copilot-arewecooked/commit/f3f0af6f378b040d2a56e5f280c277cb2fabd87e))
* avoid stack overflow on large report datasets ([387e386](https://github.com/PanAchy/copilot-arewecooked/commit/387e386d84451547fa4ee5806bcb0fed63fa979d))

## [0.9.0](https://github.com/PanAchy/copilot-arewecooked/compare/v0.8.0...v0.9.0) (2026-05-05)


### Features

* add zed support ([6e88f00](https://github.com/PanAchy/copilot-arewecooked/commit/6e88f006185254220b35192c8e091f1f47180a26))
* add zed support ([11c8300](https://github.com/PanAchy/copilot-arewecooked/commit/11c83006da06b508c2eada72065fa3be1ac27a34))


### Bug Fixes

* add macOS path for Zed threads database ([bae664e](https://github.com/PanAchy/copilot-arewecooked/commit/bae664e5549777d45757ca1f956f5fbf200bdd11))
* remove zstdify dependency in favour of native zlib ([2354665](https://github.com/PanAchy/copilot-arewecooked/commit/235466535f530a56c66df50ccaeeaeb99ef29d15))
* **zed:** add macOS db path and remove zstdify dependency ([6ee4c50](https://github.com/PanAchy/copilot-arewecooked/commit/6ee4c503ec3d0b7c31642a0672b5e359f328976a))

## [0.8.0](https://github.com/PanAchy/copilot-arewecooked/compare/v0.7.1...v0.8.0) (2026-05-04)


### Features

* add Copilot for Xcode source adapter ([a3ef6a6](https://github.com/PanAchy/copilot-arewecooked/commit/a3ef6a6798ff5d43a65067c78fede87cf88815b9))
* add Copilot for Xcode source adapter ([c556575](https://github.com/PanAchy/copilot-arewecooked/commit/c556575b1af4deb42ae3b164f12ae650764c669a))

## [0.7.1](https://github.com/PanAchy/copilot-arewecooked/compare/v0.7.0...v0.7.1) (2026-05-03)


### Bug Fixes

* **pricing:** price OSWE VS Code Prime as Raptor mini ([8e045c3](https://github.com/PanAchy/copilot-arewecooked/commit/8e045c35da3258818fcea5a3867b42892e317636))

## [0.7.0](https://github.com/PanAchy/copilot-arewecooked/compare/v0.6.1...v0.7.0) (2026-05-02)


### Features

* **report:** add month markers to usage trend ([dec2576](https://github.com/PanAchy/copilot-arewecooked/commit/dec2576c33e0c1940565f70327dfd9e2f06926af))


### Bug Fixes

* **release:** set repo for publish dispatch ([fe41874](https://github.com/PanAchy/copilot-arewecooked/commit/fe41874074ebc2d4adb1561ce2dcf4c0e55cd5da))

## [0.6.1](https://github.com/PanAchy/copilot-arewecooked/compare/v0.6.0...v0.6.1) (2026-05-02)


### Bug Fixes

* **cli:** show model breakdown in terminal report ([73438cd](https://github.com/PanAchy/copilot-arewecooked/commit/73438cd150908cd52d308a3db56a98e2ed689e26))
* **release:** dispatch publish after release ([853ff6a](https://github.com/PanAchy/copilot-arewecooked/commit/853ff6a2289efc0e8f8477062ac64be1819016e4))

## [0.6.0](https://github.com/PanAchy/copilot-arewecooked/compare/v0.5.0...v0.6.0) (2026-05-02)


### Features

* **cli:** add terminal report flag ([29cc9e7](https://github.com/PanAchy/copilot-arewecooked/commit/29cc9e7fb9ae73aeeba9114941933b859022fd0e))
* **cli:** add terminal report flag ([3f170db](https://github.com/PanAchy/copilot-arewecooked/commit/3f170db0ffebc4c0952e22b2def3fe0ede597378))


### Bug Fixes

* **pricing:** update Goldeneye rate ([a104870](https://github.com/PanAchy/copilot-arewecooked/commit/a104870e4510dfe4462d22c404f33a0e53d0f138))
* **pricing:** update Goldeneye rate ([d9e9c68](https://github.com/PanAchy/copilot-arewecooked/commit/d9e9c68b1c1095f07ea0a025cfba35a2cf7e0e25))

## [0.5.0](https://github.com/PanAchy/copilot-arewecooked/compare/v0.4.0...v0.5.0) (2026-05-02)


### Features

* **copilot-cli:** use shutdown metrics ([f57e0e7](https://github.com/PanAchy/copilot-arewecooked/commit/f57e0e74fa67b603696f5cef12cca7163eae2bfc))
* **sources:** read exact Copilot shutdown metrics ([8b7eb07](https://github.com/PanAchy/copilot-arewecooked/commit/8b7eb07b70b4bea0f40e27bb2685670a5527dee6))
* **vscode:** read transcript shutdown metrics ([15c41d1](https://github.com/PanAchy/copilot-arewecooked/commit/15c41d1d862d5ee597540ecdc1dcf8ebab1f1a8d))


### Bug Fixes

* **copilot-cli:** distinguish unknown model fallback ([7bf10ea](https://github.com/PanAchy/copilot-arewecooked/commit/7bf10ea42b6dcc4a307038b2c325b065c97ee45b))
* **copilot-cli:** sum resumed shutdown segments ([f4ff545](https://github.com/PanAchy/copilot-arewecooked/commit/f4ff5456fa2a3ecf4db732cfa59db21471a6c090))
* **pricing:** avoid double charging cached input ([a9ea26b](https://github.com/PanAchy/copilot-arewecooked/commit/a9ea26b018ea87d6f9041a829c28a45238c663da))
* **report:** clarify total versus monthly usage ([0f57c5f](https://github.com/PanAchy/copilot-arewecooked/commit/0f57c5fa00a2a6388af362849cd51100259eda13))

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
