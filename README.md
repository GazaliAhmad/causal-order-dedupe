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

`DedupeGateway` keeps a sliding-window cache of event identities and lets you
drop repeat deliveries before handing events to `causal-order`.

Cache entries expire when `cleanup()` runs, so long-lived processes should call
it periodically to keep the effective dedupe window moving forward.

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

// call periodically in long-running processes
dedupe.cleanup();
```

## API

### `new DedupeGateway(options)`

Creates a dedupe gateway. The `options` object is optional.

Options:

- `slidingWindowSeconds`: initial lookback window, default `180`
- `maxSlidingWindowSeconds`: hard upper bound for dynamic window growth, default `300`
- `nowProvider` or `now_provider`: function that returns the current time in milliseconds, compatible with `BigInt`

`slidingWindowSeconds` controls how long the dedupe layer remembers an accepted
event identity before `cleanup()` can evict it. If the same event arrives again
while that identity is still cached, it is dropped as a duplicate. Once the
identity ages out, the event can be accepted again.

`maxSlidingWindowSeconds` is the ceiling used by `updateWindow(seconds)`. It
does not widen the active dedupe window on its own, but it sets the maximum
window the gateway is allowed to use later.

If the downstream `causal-order` engine is operating with a `90s` late-arrival
horizon, setting `slidingWindowSeconds` below `90` usually means some delayed
duplicates can fall out of the dedupe cache before the engine itself is done
considering that period. In practice, operators will usually want the dedupe
window to be at least as large as the engine horizon, and often somewhat higher
to absorb cleanup cadence, transport jitter, and delayed delivery spikes.

### `filter(event)`

Returns:

- `true` when the event should be accepted
- `false` when the event is considered a duplicate

### `updateWindow(seconds)`

Adjusts the active dedupe window, capped by `maxSlidingWindowSeconds`.

### `cleanup()`

Evicts cached identities older than the current sliding window.

Call this periodically in long-running processes so old identities age out and
the dedupe window continues to advance.

### `destroy()`

Clears the in-memory cache.
