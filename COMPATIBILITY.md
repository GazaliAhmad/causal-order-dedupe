# Compatibility

## Runtime

`@causal-order/dedupe` currently targets:

- Node `>=22.13.0`
- Node `22` and Node `24` LTS release lines in CI
- ESM-only environments

The runtime floor is aligned with the monitor-enabled causal-order stack, where
`@causal-order/monitor` uses the built-in `node:sqlite` module. Node 20 is not a
supported runtime for this package line.

For the `1.2.x` line, the project treats this ecosystem-wide runtime-floor
alignment as a documented minor-release platform-policy change. The JavaScript
API remains backward compatible, but consumers running Node 20 must upgrade to
a supported Node 22 or Node 24 LTS release before adopting `1.2.x`.

This package is not intended for CommonJS-only consumers without an ESM-compatible integration path.

## Dependency Alignment

Current package compatibility is aligned with:

- `causal-order@^1.0.0`

If the downstream `causal-order` package changes its runtime or API requirements in a future release line, this document should be updated alongside the package dependency.

## Monitor-Enabled Stack Alignment

The supported monitor-enabled stack position is:

```text
@causal-order/transport -> @causal-order/monitor -> @causal-order/dedupe -> causal-order
```

Compatibility semantics:

- `normal` delivery is filtered by dedupe before causal-order
- `order_buffer_only` and `full_outage_buffer` work is filtered when recovery
  returns it through `replay_through_dedupe`
- `dedupe_bypass_throttled` is not filtered by this package and can expose
  duplicate deliveries to causal-order
- a duplicate dropped by dedupe is a successfully handled replay delivery; it
  must not remain pending merely because it produced no causal-order input

The gateway cache is process-local and is not reconstructed from monitor's
SQLite reservoir. Restart after an indeterminate accepted delivery is therefore
an at-least-once boundary. Monitor storage and dedupe identity state remain
separate ownership domains.

Window compatibility is based on the maximum credible duplicate redelivery gap,
including transport retry, outage recovery, replay queueing, retry backoff, and
acknowledgement uncertainty. It is not defined by monitor retention alone.
Cleanup cadence can retain identities beyond the nominal sliding window, but it
must not be treated as a guaranteed extension of that window.

## API Compatibility Notes

The main public entry point is `DedupeGateway`.

`filter(event)` retains its boolean contract. The additive
`filterWithResult(event)` method returns structured decision metadata without
exposing the resolved identity value or payload.

Supported configuration concepts in the current `1.x` line include:

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
