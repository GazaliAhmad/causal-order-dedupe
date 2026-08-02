# Changelog

All notable changes to this project will be documented in this file.

## [1.2.1]

### Added

- Added opt-in `SqliteIdentityLedger` support with atomic identity claims that
  survive process restarts and coordinate duplicate suppression across gateway
  instances sharing one database.
- Added `durableIdentityLedgerPath` to constructor and JSON configuration,
  required `maxDurableIdentities` capacity, relative-path resolution for config
  files, and durable-ledger statistics.
- Added contract coverage for concurrent gateway claims, restart persistence,
  caller-owned ledger lifecycle, JSON configuration, and unsafe configuration
  rejection.

### Changed

- Clarified that durable identity claims provide restart-persistent duplicate
  memory but do not make downstream delivery transactionally exactly once.
- Made durable storage fail closed at its configured identity capacity: known
  duplicates remain suppressed and new identities raise a typed capacity error
  without silent eviction.

## [1.2.0]

### Added

- Added `DedupeGateway#filterWithResult()` with structured accepted, duplicate, and accepted-without-identity outcomes for monitor handlers and stack validation while preserving the existing boolean `filter()` contract.
- Added deterministic stack contracts for inclusive window boundaries, post-window acceptance, replay duplicate suppression, and the documented in-memory restart redelivery boundary.
- Added an isolated packed four-package contract that uses the testing provider with monitor `0.5.x`, dedupe, and causal-order to prove order-outage buffering, replay-through-dedupe, duplicate suppression, exact ordered output, and final reservoir drain.
- Added `publish:prepare:check` as the complete non-publishing release gate and documented that tarball previews must target `./publish-dist` rather than the development repository root.

### Changed

- Raised the runtime requirement from Node `20+` to Node `>=22.13.0` so the package contract aligns with the monitor-enabled causal-order stack and its built-in `node:sqlite` dependency.
- Updated CI coverage to use the supported Node `22` and Node `24` LTS release lines.
- Documented the `1.2.x` platform policy: Node-floor alignment may ship in this minor line while the JavaScript API remains compatible, and Node 20 consumers must upgrade before adopting it.
- Defined the monitor-enabled route contract, including replay-through-dedupe handling, deliberate dedupe-bypass exposure, and the at-least-once process-restart boundary of the in-memory gateway.
- Reworked the npm README around the causal-order stack, package integration, routing, configuration, public API, and operational constraints, removing repository-harness and tutorial-oriented framing while retaining release history.

## [1.1.1]

### Added

- Added tracked `test-artifacts/` comparison notes for the `12h` `n=12` `typical-real-world-mesh` standard versus rejoin-aware runs, including the recorded interpretation of wider `240s / 480s` dedupe floor/max-window settings.
- Added tracked `test-artifacts/` comparison notes for the `12h` `n=12` `typical-real-world-mesh` standard versus `cross-node-busy` runs, including the current conclusion that the wider preset remained healthy but did not displace `standard` as the cleaner default baseline.

### Changed

- Updated the published package-facing docs to frame `@causal-order/dedupe` as a deployable duplicate-filtering runtime rather than only as a repo-tested layer.
- Updated the README with practical topology framing so `n=3`, `n=5`, `n=8`, and `n=12` are described as minimal baseline, primary real-world baseline, growth baseline, and resilience/expansion boundary respectively.
- Updated roadmap guidance to reflect the current conclusion that there is no clear need for reconnect-specific dedupe changes, while keeping wider floor/max pairs such as `240s / 480s` positioned as situational deployment options rather than default upgrades.
- Kept `1.1.1` as a docs-only patch release with no runtime or API behavior change from `1.1.0`.

## [1.1.0]

### Added

- Added explicit runtime fault-injection support for expanded deployment-style tests, including per-node dark/reconnect windows and per-node jitter injection through new CLI flags such as `--dark-nodes`, `--dark-interval`, `--dark-duration`, `--dark-start-after`, `--dark-stagger`, and `--jitter-nodes`.
- Added collector and summary reporting for expanded fault-injection runs so lifecycle artifacts and `summary.json` now capture dark-window counts, reconnect counts, connection-open counts, jitter-delay counts, and per-run fault-state transitions.
- Added runtime config contract coverage for fault-injection validation, including unknown-node rejection, dark-versus-jitter overlap rejection, and invalid duration and jitter-range checks.
- Added the `profiles/expected-production-mesh-dark-jitter.json` workload profile to support larger mesh runs that combine intermittent node loss with unstable-link delay pressure.
- Added a separate rejoin-aware runtime harness and config-contract path so reconnect smoothing experiments can be tested without changing the baseline deployment harness.
- Added sanitized tracked `test-artifacts/` evidence for the hostile `fault-injection` `n=12` `4h` rejoin-aware run and its side-by-side comparison against the original `4h` run.

### Changed

- Updated deployment-style node workers so dark nodes now stop emitting during their dark window, reconnect cleanly afterward, and resume reporting to the collector without requiring whole-run interruption.
- Updated the runtime smoke-test path to exercise a 12-node expanded fault-injection scenario with real dark-start and dark-end lifecycle events instead of relying only on partition-like delay approximation.
- Recorded the released `1.1.0` hostile-profile conclusion: both tracked `fault-injection` `n=12` `4h` runs stayed correctness-safe with zero duplicate leakage and zero error-level anomalies, even though the profile remained `PASS WITH STRESS`.
- Updated repo guidance to treat `expected-production-mesh-dark-jitter` as a hostile resilience-boundary profile, not as a release track that still requires additional `8h` or `12h` repetition after the `4h` confirmation.

## [1.0.8]

### Added

- Added topology-size validation support through explicit `--node-ids` runtime configuration so larger single-cluster meshes can be tested without disturbing the validated default `n=3` baseline.
- Added runtime validation coverage for topology overrides, including rejection of empty or duplicate node ID lists.
- Added a focused runtime topology contract path so the deployment-style harness is exercised against larger node sets with per-node artifacts and summary validation.
- Added the topology-neutral `profiles/expected-production-mesh.json` workload profile for single-cluster mesh validation where workload shape stays separate from the chosen node count.
- Added a dedicated topology validation guide under `guides/` covering the `n=5` and `n=8` single-cluster workflow, interpretation rules, and the current evidence boundary before introducing a separate `/cluster` layer.
- Added package keywords to the publish manifest so the npm package is easier to discover by dedupe, stream-processing, and idempotency-oriented searches.

### Changed

- Generalized deployment-style runtime spawning and workload alignment so topology now scales from the configured node list instead of relying on small fixed-node assumptions.
- Updated node-rate allocation to distribute total cluster throughput across the active node set by weight instead of relying on a hard-coded small-node divisor.
- Updated workload-profile alignment so missing configured node IDs inherit explicit default weights at runtime, keeping topology growth opt-in through `--node-ids`.
- Updated repo documentation to treat topology validation as the primary `1.0.8` focus, with package metadata as a secondary release note.
- Recorded the validated `1h` `expected-production-mesh + standard` comparison result: both `n=5` and `n=8` stayed healthy, and `n=8` was the stronger single-cluster result of the two for this tested workload shape.
- Recorded the validated `8h` `expected-production-mesh + standard` `n=8` endurance result: the single-cluster runtime stayed healthy with zero duplicate leakage, zero error-level anomalies, controlled backlog, and low-pressure behavior over the longer wall-clock run.

## [1.0.7]

### Added

- Added deployment-style duplicate-leak diagnostics for fresh runtime runs so leaked `duplicate_event` anomalies are persisted as explicit operator-readable records instead of staying a black-box count.
- Added a dedicated `duplicate-leaks.ndjson` runtime artifact beside the existing run artifacts so duplicate-leak diagnostics can be stored and inspected consistently.
- Added collector-side duplicate-leak record generation that emits one diagnostic row per leaked duplicate using the repeated event and its first-seen related event from the anomaly.
- Added persisted timing context for leaked duplicates, including:
  - event ID
  - node ID
  - first-seen ingest timestamp
  - repeated-seen ingest timestamp
  - first and repeated event-time timestamps
  - first and repeated arrival latency
  - gap between sightings
  - active dedupe window at repeat time
  - whether the first-versus-repeat gap exceeded the active dedupe window
- Added duplicate-leak artifact metadata to fresh run summaries so downstream tooling can discover the diagnostics path without guessing.
- Added a `summary:duplicates` helper command for terminal-friendly duplicate-leak inspection of the latest or selected run.

### Changed

- Updated duplicate-leak reporting to default to the latest run when no path is provided and to accept either a run directory or a `summary.json` path.
- Updated duplicate-leak summaries to print run label, run path, diagnostics path, total leaks, delivery-relative leak rate, per-node counts, max first-versus-repeat gap, and one readable line per leaked duplicate.
- Updated historical-run handling so older runs that predate `duplicate-leaks.ndjson` report that diagnostics are unavailable instead of implying that no duplicate leakage occurred.
- Kept `1.0.7` behavior diagnostic-only: it improves operator evidence for duplicate leakage under stress without changing the underlying dedupe algorithm or final-drain behavior.

## [1.0.6]

### Deprecation Note

Published versions `1.0.1` through `1.0.5` are deprecated for config-faithful runtime tuning.

Separately:

- version `1.0.0` was published and immediately deprecated because `LICENSE.md` was accidentally excluded from the npm package
- version `1.0.3` was never published to npm

Canonical reason:

- defect 1: `updateWindow()` only enforced the max, not the min. A config such as `slidingWindowSeconds = 210` could still be shrunk by runtime updates because the live window was set to whatever dynamic value was computed, as long as it did not go above `maxSlidingWindowSeconds`. That is how a configured `210s` floor could become a live `77.408s` window.
- defect 2: the deployment-style runtime harness called `cleanup()` manually after every accepted event. That meant runtime cleanup did not actually depend on `autoCleanup`, and did not actually wait for `autoCleanupIntervalSeconds`, so the harness was overriding the configured cleanup behavior.

Practical consequence:

- runtime dedupe behavior could drift away from the configured temporal retention contract
- wall-clock tuning conclusions from those versions should not be treated as authoritative

### Added

- Added expanded operator guidance for longer wall-clock runtime comparisons on `expected-production-3way-mesh`.
- Added a three-way equilibrium model to the operator guide so run evaluation is framed through correctness, pressure, and backlog together.
- Added `DedupeGateway#getStats()` so package users can read lightweight runtime dedupe stats through accepted-event count, dropped-duplicate count, current cache size, and active window seconds.
- Added stats contract coverage for dedupe runtime snapshots, cleanup behavior, window updates, and destroy/reset behavior.
- Added dedupe stats persistence to fresh deployment-style runtime artifacts so `summary.json` and `heartbeats.ndjson` capture package-facing dedupe readings.
- Added tracked sanitized `test-artifacts/` snapshots for the validated `8h` `expected-production-3way-mesh` baseline and comparison runs so guide readers can inspect the supporting evidence without pulling raw multi-megabyte local artifacts.

### Changed

- Marked published versions `1.0.1` through `1.0.5` for deprecation in npm.
- Fixed dedupe window updates so runtime widening can no longer shrink the active window below the configured `slidingWindowSeconds` floor.
- Fixed the deployment-style runtime harness to stop forcing `cleanup()` after every accepted event, so `autoCleanup` and `autoCleanupIntervalSeconds` from dedupe config files are now actually honored during runtime tests.
- Updated `summary:report` and `summary:compare` to flag config-adherence failures as `INVALID CONFIG` when the observed active dedupe window falls below the configured floor.
- Updated the tuning and deployment guides to treat older pre-fix runtime verdicts as provisional and to require checking `activeWindowSeconds` before trusting tuning conclusions.
- Updated public docs to treat wall-clock runtime conclusions as authoritative only when they come from the fixed dedupe implementation.
- Updated run-comparison output to summarize equilibrium directly with labeled correctness, pressure, and backlog readings.
- Updated operator tuning guidance to treat late-arrival counts as one dimension of system pressure rather than a standalone pass/fail signal.
- Updated the `README.md`, deployment guide, and repo tuning guide to document `getStats()` and explain how to interpret dedupe stats through correctness, pressure, and backlog.
- Updated `summary:report` to print persisted dedupe stats for fresh deployment-style runs.
- Updated operator guidance to record the validated `8h` `expected-production-3way-mesh` results: `standard` remains the cleaner default baseline, `heavy-duplicates` is a healthy alternate but not a meaningful enough win to replace it, and manual tuning is not required for that profile based on current evidence.

## [1.0.5]

### Added

- Added JSON config-file support for dedupe setup through exported helpers that load validated dedupe options from disk.
- Added runtime harness support for `--dedupe-config` so deployment-style runs can exercise file-based dedupe configuration directly.
- Added a `summary:compare` script for side-by-side comparison of two runtime harness runs, including duplicate leakage, late ratio, queue peak, anomaly counts, and peak RSS.
- Added a dedicated `configs/` location for repo-side dedupe configuration examples so manual dedupe windows stay separate from workload profiles under `profiles/`.
- Added focused validation coverage for dedupe config files and runtime/workload-profile configuration failures.
- Added a dedicated `test:runtime-config` contract path for runtime config and workload-profile validation failures.
- Added an operator-facing error guide under `guides/` with example failure messages and recommended fixes.
- Added a deployment guide and a dedupe-config authoring guide so package-facing setup is documented separately from repo workload testing.
- Added project-level compatibility, security, and code-of-conduct docs.

### Changed

- Tightened dedupe config validation to reject mixed preset-plus-manual config, partial explicit window config, unknown fields, invalid numeric values, and impossible window ordering such as `slidingWindowSeconds > maxSlidingWindowSeconds`.
- Tightened workload-profile validation to reject unsupported top-level and nested fields, invalid numeric ranges, invalid probability sums, and inverted min/max ranges.
- Improved operator-facing runtime errors so configuration failures surface as clear `Error: ...` messages instead of ambiguous internal failures.
- Updated the `README.md` and operator guides to document config-file setup, `profiles/` versus `configs/` separation, and validation troubleshooting.
- Updated the `publish-dist/` packaging flow so `README.md` and the publish surface are refreshed automatically during `prepack`, reducing the risk of publishing stale npm docs.
- Updated repo automation with Node `20`/`24` CI coverage and CodeQL scanning.

## [1.0.4]

### Added

- Added first-class dedupe preset support with `standard`, `heavy-duplicates`, `high-latency`, and `cross-node-busy`.
- Added a focused `test:presets` script and preset contract coverage for default behavior, overrides, invalid presets, and cleanup modes.
- Added operator-facing guides under `guides/` for dedupe tuning and workload-profile construction.
- Added runtime harness support for `--dedupe-preset` so deployment-style profile runs can exercise named dedupe modes directly.

### Changed

- Updated the `causal-order` dependency to `^1.0.0`.
- Improved `DedupeGateway` drop-in behavior with config validation, automatic cleanup by default, and encapsulated internal state.
- Updated the `README.md` to point operators to the new guides and to reflect the new default cleanup behavior.

## [1.0.3]

This version was never published to npm.

### Changed

- Clarified the published `README.md` version and documented the cleanup expectations for long-running processes.

## [1.0.2]

### Changed

- Cleaned the published `README.md` so it stays focused on package consumers instead of repository-only workflow details.

## [1.0.1]

### Fixed

- Added the missing `license` manifest field so the published npm package correctly reports the bundled MIT license.

## [1.0.0]

Initial release of `@causal-order/dedupe`.

Post-release note:

- this version was published and immediately deprecated because `LICENSE.md` was accidentally excluded from the npm package

### Added

- Added the `DedupeGateway` library for sliding-window event deduplication ahead of `causal-order` processing.
- Added support for event identity based on `event.id` or fallback `nodeId::sequence`.
- Added configurable dedupe timing controls with `slidingWindowSeconds`, `maxSlidingWindowSeconds`, and `nowProvider`.
- Added a local deployment-style test harness for long-running duplicate, delay, and late-arrival simulations.
- Added workload profiles under `profiles/` for baseline, heavy cross-node, 3-way mesh, and partition-stress runs.
- Added summary utilities for latest-run reporting and human-readable run analysis.

### Changed

- Converted the repo to TypeScript source, including the package entrypoint, harness scripts, and report tooling.
- Switched the local workflow to compile into `.build/` and run with plain Node for test and summary commands.
- Separated local development metadata from published package metadata through a generated `publish-dist/` directory.

### Packaging

- Published package name is `@causal-order/dedupe`.
- Published package exports compiled JavaScript plus TypeScript declarations.
- Published tarball is limited to the library build output, `README.md`, and `LICENSE`.
- Repo-only test harness files, workload profiles, and development scripts are not shipped in the npm package.
