# @causal-order/dedupe

Deduplication support for `causal-order` event streams.

Runtime compatibility:

- Node `20+`
- ESM-only package

## What It Does

`DedupeGateway` keeps a sliding-window cache of event identities and lets you
drop repeat deliveries before handing events to `causal-order`.

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

dedupe.cleanup();
```

## API

### `new DedupeGateway(config?)`

Supported options:

- `slidingWindowSeconds`: initial lookback window, default `180`
- `maxSlidingWindowSeconds`: hard upper bound for dynamic window growth, default `300`
- `nowProvider` or `now_provider`: function returning the current time in milliseconds, compatible with `BigInt`

### `filter(event)`

Returns:

- `true` when the event should be accepted
- `false` when the event is considered a duplicate

### `updateWindow(seconds)`

Adjusts the active dedupe window, capped by `maxSlidingWindowSeconds`.

### `cleanup()`

Evicts cached identities older than the current sliding window.

### `destroy()`

Clears the in-memory cache.
