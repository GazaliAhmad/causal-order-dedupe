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

- Add named dedupe presets such as `standard`, `heavy`, and `burst-tolerant`.
- Keep a default mode so the package remains easy to adopt with minimal configuration.
- Document what each preset is optimized for and when an operator should choose it.
- Introduce production-intent configurations aimed at common operating conditions.
- Candidate presets:
  - `standard`
  - `heavy-duplicates`
  - `high-latency`
  - `cross-node-busy`
- Document the tradeoffs of each preset, including memory pressure, duplicate suppression strength, and tolerance for delayed delivery.

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
