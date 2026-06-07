# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-06-07

### Fixed

- Added the missing `license` manifest field so the published npm package correctly reports the bundled MIT license.

## [1.0.0] - 2026-06-07

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
