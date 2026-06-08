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

- Version `1.0.3` cleaned the published package documentation so npm users see package-focused guidance instead of repository workflow notes.

## v1.0.4

- Add first-class preset support to `DedupeGateway`.
- Ship one consistent preset set:
  - `standard`
  - `heavy-duplicates`
  - `high-latency`
  - `cross-node-busy`
- Keep a default mode so the package remains easy to adopt with minimal configuration.
- Treat named presets as the guided operator path.
- Treat manual raw timing values as the custom path.
- Do not add a literal `custom` preset name; custom behavior should come from explicit raw values.
- Make no-preset behavior match `standard`.
- Preserve the existing raw timing options for operators who want manual control.
- Make `standard` match the current default behavior so upgrades stay low-risk:
  - `slidingWindowSeconds = 180`
  - `maxSlidingWindowSeconds = 300`
- Keep `standard` positioned as a conservative default for deployments where the downstream engine is already working with roughly a `90s` late-arrival horizon.
- Document what each preset is optimized for and when an operator should choose it.
- Document the tradeoffs of each preset, including memory pressure, duplicate suppression strength, and tolerance for delayed delivery.
- Document how `slidingWindowSeconds` and `maxSlidingWindowSeconds` relate to the downstream engine horizon so operators understand why dedupe windows below the engine window are usually risky.
- Add tests that cover preset resolution, default behavior, manual configuration, and invalid preset names.

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
