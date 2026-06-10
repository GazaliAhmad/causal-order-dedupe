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

- Version `1.0.5` is the current released line:
  - first-class preset support exists in `DedupeGateway`
  - default mode behaves as `standard`
  - config-file driven setup now exists for dedupe configuration
  - repo testing now keeps workload profiles under `profiles/` and manual dedupe config examples under `configs/`
  - runtime profile tests can select a dedupe preset or a dedupe config file
  - operator guides now cover tuning, workload-profile construction, and operator-facing error handling
  - drop-in safeguards now include validation, automatic cleanup by default, and clear operator-facing configuration errors
- Current repo-side operator workflow now also includes:
  - a documented `8h` wall-clock baseline for `expected-production-3way-mesh` with `standard`
  - a reusable `summary:compare` command for side-by-side run evaluation
  - a three-way equilibrium model for reading runs through correctness, pressure, and backlog together

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

Released scope:

- Completed config-file driven setup using JSON helpers that load and validate dedupe options.
- Completed operator choice between:
  - a preset name like `standard`
  - explicit values such as `slidingWindowSeconds` and `maxSlidingWindowSeconds`
- Completed clear validation errors for invalid, partial, unknown, or conflicting configuration.
- Completed a clearer repo-testing separation between workload profiles in `profiles/` and manual dedupe config examples in `configs/`.
- Completed stricter workload-profile validation for invalid ranges, unsupported fields, and inconsistent probability settings.
- Completed operator-facing error documentation under `guides/` so validation failures are easier to diagnose in practice.

## v1.0.6

- Add lightweight runtime stats so operators can evaluate whether a chosen preset is working well.
- Candidate stats:
  - accepted events
  - dropped duplicates
  - current cache size
  - active dedupe window
- Use these metrics to support safer tuning rather than guesswork.
- Extend the repo-side reporting workflow so longer wall-clock comparisons are easier to interpret quickly.
- Completed groundwork already in the repo:
  - `summary:compare` now gives side-by-side duplicate leakage, late ratio, queue peak, and memory comparisons
  - operator guidance now treats run evaluation as a three-way equilibrium:
    - correctness
    - pressure
    - backlog
- Next useful extension:
  - surface the same equilibrium framing from lightweight runtime stats in package-facing operator flows, not just repo harness reports

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
