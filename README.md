# @causal-order/dedupe

Deduplication support for `causal-order` event streams.

## Relationship to [causal-order](https://www.npmjs.com/package/causal-order)

`@causal-order/dedupe` is an extension package for [`causal-order`](https://www.npmjs.com/package/causal-order).

It provides duplicate-event detection before events enter the causal ordering pipeline and is intended to sit immediately before the ordering stage in stream-processing, replay, recovery, and ingestion workflows built on top of the `causal-order` runtime.

| Package                | Purpose                            |
| ---------------------- | ---------------------------------- |
| `causal-order`         | Core causal event ordering runtime |
| `@causal-order/dedupe` | Duplicate-event filtering layer    |

Version `1.0.2`.

Runtime compatibility:

* Node `20+`
* ESM-only package

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

### `new DedupeGateway(options)`

Creates a dedupe gateway. The `options` object is optional.

Options:

- `slidingWindowSeconds`: initial lookback window, default `180`
- `maxSlidingWindowSeconds`: hard upper bound for dynamic window growth, default `300`
- `nowProvider` or `now_provider`: function that returns the current time in milliseconds, compatible with `BigInt`

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
