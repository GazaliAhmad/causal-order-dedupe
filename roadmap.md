# Roadmap

This roadmap is specifically for `@causal-order/dedupe`.

It focuses on operator ease of use first.

The goal is to make `@causal-order/dedupe` easy to deploy without forcing operators to tune low-level timing values up front. Most users should be able to start with a sensible preset, then move to heavier or more latency-tolerant behavior only when needed.

## Principles

- Prefer safe defaults over mandatory tuning.
- Let operators choose intent-driven presets instead of raw timing values where possible.
- Keep advanced manual configuration available for teams that need finer control.
- Expose enough runtime visibility for operators to validate behavior in production.
- Align local test harness profiles with operator-facing package concepts over time.

## Current Status

- Version `1.0.4` is now implemented:
  - first-class preset support exists in `DedupeGateway`
  - default mode behaves as `standard`
  - runtime profile tests can select a dedupe preset
  - operator guides now cover tuning and workload-profile construction
  - drop-in safeguards now include validation and automatic cleanup by default

## v1.0.4

- Completed first-class preset support in `DedupeGateway`.
- Completed one consistent preset set: `standard`, `heavy-duplicates`, `high-latency`, and `cross-node-busy`.
- Completed the default-mode contract:
  - default mode remains easy to adopt with minimal configuration
  - default mode is `standard`
  - named presets are the guided operator path
  - manual raw timing values remain the custom path
  - no literal `custom` preset name was added
  - no-preset behavior matches `standard`
  - existing raw timing options remain available
- Completed `standard` compatibility with the current default behavior:
  - `slidingWindowSeconds = 180`
  - `maxSlidingWindowSeconds = 300`
- Completed operator documentation for preset guidance, tradeoffs, and window sizing against the downstream engine horizon.
- Completed preset tests for resolution, default behavior, manual configuration, and invalid preset names.
- Extended the implementation with runtime profile selection through `--dedupe-preset`.
- Extended the implementation with automatic cleanup by default for drop-in use.
- Extended the implementation with clear constructor validation for invalid raw timing configuration.

## v1.0.5

- Support config-file driven setup using a simple format such as JSON.
- Allow operators to choose either:
  - a preset name like `standard`
  - explicit values such as `slidingWindowSeconds` and `maxSlidingWindowSeconds`
- Add clear validation errors for invalid or conflicting configuration.

## v1.0.6

- Add lightweight runtime stats so operators can evaluate whether a chosen preset is working well.
- Candidate stats:
  - accepted events
  - dropped duplicates
  - current cache size
  - active dedupe window
- Use these metrics to support safer tuning rather than guesswork.

## v1.1.0

- Treat this as the first operator-ready milestone for `@causal-order/dedupe`.
- Expected scope:
  - named presets are in place
  - config-file driven setup is available
  - basic runtime stats are exposed
  - the operator workflow is documented clearly in the README
- The intent of `v1.1.0` is to mark the point where the package feels like an operational product, not just a low-level dedupe helper.

## Longer Term

- Bring the local `profiles/` harness and operator-facing package presets closer together so testing language matches deployment language.
- Publish a short operator guide for choosing presets in practice.
- Revisit preset defaults once real-world deployment data becomes available.
