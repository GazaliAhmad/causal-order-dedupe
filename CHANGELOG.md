# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Added a `summary:compare` script for side-by-side comparison of two runtime harness runs, including duplicate leakage, late ratio, queue peak, anomaly counts, and peak RSS.
- Added explicit operator guidance for a documented `8h` wall-clock baseline on `expected-production-3way-mesh` with the `standard` preset.
- Added a three-way equilibrium model to the operator guide so run evaluation is framed through correctness, pressure, and backlog together.

### Changed

- Updated run-comparison output to summarize equilibrium directly with labeled correctness, pressure, and backlog readings.
- Updated operator tuning guidance to treat late-arrival counts as one dimension of system pressure rather than a standalone pass/fail signal.

## [1.0.5]

### Added

- Added JSON config-file support for dedupe setup through exported helpers that load validated dedupe options from disk.
- Added runtime harness support for `--dedupe-config` so deployment-style runs can exercise file-based dedupe configuration directly.
- Added a dedicated `configs/` location for repo-side dedupe configuration examples so manual dedupe windows stay separate from workload profiles under `profiles/`.
- Added focused validation coverage for dedupe config files and runtime/workload-profile configuration failures.
- Added an operator-facing error guide under `guides/` with example failure messages and recommended fixes.

### Changed

- Tightened dedupe config validation to reject mixed preset-plus-manual config, partial explicit window config, unknown fields, invalid numeric values, and impossible window ordering such as `slidingWindowSeconds > maxSlidingWindowSeconds`.
- Tightened workload-profile validation to reject unsupported top-level and nested fields, invalid numeric ranges, invalid probability sums, and inverted min/max ranges.
- Improved operator-facing runtime errors so configuration failures surface as clear `Error: ...` messages instead of ambiguous internal failures.
- Updated the `README.md` and operator guides to document config-file setup, `profiles/` versus `configs/` separation, and validation troubleshooting.
- Updated the `publish-dist/` packaging flow so `README.md` and the publish surface are refreshed automatically during `prepack`, reducing the risk of publishing stale npm docs.

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
