# Compatibility

## Runtime

`@causal-order/dedupe` currently targets:

- Node `20+`
- ESM-only environments

This package is not intended for CommonJS-only consumers without an ESM-compatible integration path.

## Dependency Alignment

Current package compatibility is aligned with:

- `causal-order@^1.0.0`

If the downstream `causal-order` package changes its runtime or API requirements in a future release line, this document should be updated alongside the package dependency.

## API Compatibility Notes

The main public entry point is `DedupeGateway`.

Supported configuration concepts in the current `1.0.x` line include:

- `preset`
- `slidingWindowSeconds`
- `maxSlidingWindowSeconds`
- `autoCleanup`
- `autoCleanupIntervalSeconds`
- `nowProvider` and `now_provider`

Event identity compatibility currently supports:

- `event.id`
- fallback identity via `event.nodeId + "::" + event.sequence`

Events without either identity shape are passed through unchanged.

## Package Boundary

The published package is library-focused.

Repo-only materials such as local guides, workload profiles, and runtime harness scripts support development and evaluation workflows, but they are not part of the runtime package contract unless explicitly documented in the package API.

## Operational Guidance

For most users, start with:

- `preset: "standard"`
- a dedupe window at or above the downstream engine's late-arrival horizon

For deeper tuning guidance, see:

- [README.md](README.md)
- [guides/operator-tuning.md](guides/operator-tuning.md)
- [guides/building-workload-profiles.md](guides/building-workload-profiles.md)
