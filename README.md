# @causal-order/dedupe

Deduplication support for `causal-order` event streams.

## Current Release

Version `1.1.0` is the current stable release line.

It adds released fault-injection coverage for larger dark+jitter mesh runs and records the current resilience boundary for the hostile `expected-production-mesh-dark-jitter` profile.

Current `1.1.0` read: the tracked `n=12` hostile-profile runs kept `@causal-order/dedupe` and `causal-order` correctness-safe with zero duplicate leakage and zero error-level anomalies, but they still operated under heavy late-arrival pressure. That profile is now documented as a resilience-boundary check rather than a line that still needs longer `8h` or `12h` repetition for this release.

## Relationship to [causal-order](https://www.npmjs.com/package/causal-order)

`@causal-order/dedupe` is an extension package for [`causal-order`](https://www.npmjs.com/package/causal-order).

It provides duplicate-event detection before events enter the causal ordering pipeline and is intended to sit immediately before the ordering stage in stream-processing, replay, recovery, and ingestion workflows built on top of the `causal-order` runtime.

| Package                | Purpose                            |
| ---------------------- | ---------------------------------- |
| `causal-order`         | Core causal event ordering runtime |
| `@causal-order/dedupe` | Duplicate-event filtering layer    |

Runtime compatibility:

* Node `20+`
* ESM-only package

## What It Does

`DedupeGateway` keeps a sliding-window cache of event identities and lets you drop repeat deliveries before handing events to `causal-order`.

By default, the gateway performs lightweight automatic cleanup during filtering so old identities can age out without extra wiring. You can still call `cleanup()` manually when you want tighter control over eviction timing.

An event is deduplicated by:

- `event.id`, when present
- otherwise `event.nodeId + "::" + event.sequence`

Events without either identity shape are allowed through unchanged.

## Install

```bash
npm install @causal-order/dedupe
```

## Usage

```js
import { DedupeGateway } from "@causal-order/dedupe";

const dedupe = new DedupeGateway({
  slidingWindowSeconds: 180,
  maxSlidingWindowSeconds: 300,
  nowProvider: () => BigInt(Date.now()),
});

if (dedupe.filter(event)) {
  // forward event into causal-order
}

const stats = dedupe.getStats();
console.log(stats);

// optional when you want tighter manual control
dedupe.cleanup();
```

## Operator Guide

Additional guides for deployment, configuration, troubleshooting, and runtime validation are available here:

- [Deployment Guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/deployment.md)
- [Building Dedupe Configs](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-dedupe-configs.md)
- [Operator Guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-tuning.md)
- [Building Workload Profiles](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-workload-profiles.md)
- [Topology Validation Guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/topology-validation.md)
- [Operator Error Guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md)

Use the deployment guide for package integration, and use the operator, workload-profile, and topology guides when you want deeper guidance for runtime evaluation.

## Project Docs

- [Compatibility](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/COMPATIBILITY.md)
- [Security Policy](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/SECURITY.md)
- [Code of Conduct](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/CODE_OF_CONDUCT.md)

## API

### `new DedupeGateway(options)`

Creates a dedupe gateway. The `options` object is optional.

Options:

- `preset`: named mode such as `standard`, `heavy-duplicates`, `high-latency`, or `cross-node-busy`
- `slidingWindowSeconds`: initial lookback window, default `180`
- `maxSlidingWindowSeconds`: hard upper bound for dynamic window growth, default `300`
- `autoCleanup`: whether lightweight automatic cleanup runs during filtering, default `true`
- `autoCleanupIntervalSeconds`: minimum interval between automatic cleanup passes, default `30`
- `nowProvider`: function that returns the current time in milliseconds, compatible with `BigInt`

`slidingWindowSeconds` controls how long the dedupe layer remembers an accepted event identity before automatic or manual cleanup can evict it. If the same event arrives again while that identity is still cached, it is dropped as a duplicate. Once the identity ages out, the event can be accepted again.

`maxSlidingWindowSeconds` is the ceiling used by `updateWindow(seconds)`. It does not widen the active dedupe window on its own, but it sets the maximum window the gateway is allowed to use later.

If the downstream `causal-order` engine is operating with a `90s` late-arrival horizon, setting `slidingWindowSeconds` below `90` usually means some delayed duplicates can fall out of the dedupe cache before the engine itself is done considering that period. In practice, operators will usually want the dedupe window to be at least as large as the engine horizon, and often somewhat higher to absorb cleanup cadence, transport jitter, and delayed delivery spikes.

### `filter(event)`

Returns:

- `true` when the event should be accepted
- `false` when the event is considered a duplicate

### `updateWindow(seconds)`

Adjusts the active dedupe window, capped by `maxSlidingWindowSeconds`.

### `getStats()`

Returns a lightweight runtime snapshot:

- `acceptedEvents`: total events accepted by this gateway instance
- `droppedDuplicates`: total duplicate events rejected by this gateway instance
- `currentCacheSize`: number of identities currently retained in the dedupe cache
- `activeWindowSeconds`: current active dedupe window in seconds

The counters are lifetime counts for the current gateway instance. The cache size and active window are current snapshot values.

In practice, operators can read these values as:

- rising `droppedDuplicates` means the gateway is actively catching repeated deliveries
- rising `currentCacheSize` means the gateway is retaining more dedupe state
- a changed `activeWindowSeconds` confirms the gateway is running with a different active window than before

### `cleanup()`

Evicts cached identities older than the current sliding window.

This is optional for most drop-in use because automatic cleanup is enabled by default. Call it manually when you want stricter control over eviction timing or when `autoCleanup` is disabled.

### `destroy()`

Clears the in-memory cache and resets runtime stats for that gateway instance.

## Version Notice

Published versions `1.0.1` through `1.0.5` are deprecated due to a config-adherence bug in runtime dedupe behavior. In those affected versions, the active dedupe window and cleanup behavior may not honor configured values correctly under runtime conditions.

Version `1.0.0` was published and immediately deprecated because `LICENSE.md` was accidentally excluded from the npm package. Version `1.0.3` was never published to npm.

Version `1.0.6` fixes the config-adherence bug and adds `getStats()` for lightweight runtime insights on dedupe activity and state. The gateway also supports `updateWindow(seconds)` for runtime window adjustment and `destroy()` for clearing cache and resetting stats when needed.
