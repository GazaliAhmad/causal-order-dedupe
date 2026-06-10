# @causal-order/dedupe

Deduplication support for `causal-order` event streams.

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

// optional when you want tighter manual control
dedupe.cleanup();
```

## Operator Guide

This repository includes additional operator and workload-profile guides for local development and evaluation workflows:

- [Deployment Guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/deployment.md)
- [Building Dedupe Configs](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-dedupe-configs.md)
- [Operator Guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-tuning.md)
- [Building Workload Profiles](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-workload-profiles.md)
- [Operator Error Guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md)

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
- `nowProvider` or `now_provider`: function that returns the current time in milliseconds, compatible with `BigInt`

`slidingWindowSeconds` controls how long the dedupe layer remembers an accepted event identity before automatic or manual cleanup can evict it. If the same event arrives again while that identity is still cached, it is dropped as a duplicate. Once the identity ages out, the event can be accepted again.

`maxSlidingWindowSeconds` is the ceiling used by `updateWindow(seconds)`. It does not widen the active dedupe window on its own, but it sets the maximum window the gateway is allowed to use later.

If the downstream `causal-order` engine is operating with a `90s` late-arrival horizon, setting `slidingWindowSeconds` below `90` usually means some delayed duplicates can fall out of the dedupe cache before the engine itself is done considering that period. In practice, operators will usually want the dedupe window to be at least as large as the engine horizon, and often somewhat higher to absorb cleanup cadence, transport jitter, and delayed delivery spikes.

### `filter(event)`

Returns:

- `true` when the event should be accepted
- `false` when the event is considered a duplicate

### `updateWindow(seconds)`

Adjusts the active dedupe window, capped by `maxSlidingWindowSeconds`.

### `cleanup()`

Evicts cached identities older than the current sliding window.

This is optional for most drop-in use because automatic cleanup is enabled by default. Call it manually when you want stricter control over eviction timing or when `autoCleanup` is disabled.

### `destroy()`

Clears the in-memory cache.
