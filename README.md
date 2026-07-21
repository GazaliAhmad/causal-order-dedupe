# @causal-order/dedupe

Suppress repeated event delivery before events enter `causal-order`.
`@causal-order/dedupe` provides bounded, in-memory identity tracking for normal
ingress, retry, reconnect, and monitor-managed replay paths.

Published package version: `v1.2.0`

## Stack Position

```text
@causal-order/transport -> @causal-order/monitor -> @causal-order/dedupe -> causal-order
```

The monitor owns health-aware routing, bounded buffering, and controlled replay.
This package owns duplicate filtering immediately before causal ordering.
Buffered events re-enter the downstream path through dedupe during monitor
recovery.

The exception is monitor's deliberate `dedupe_bypass_throttled` route. Events on
that degraded route go directly to causal ordering and are not filtered by this
package.

## Install and Requirements

```bash
npm install @causal-order/dedupe causal-order
```

- Node.js `>=22.13.0`
- ESM-only output
- root package import only; no public subpath imports

| Package | Compatible line | Role |
| --- | --- | --- |
| `causal-order` | `^1.0.0` | Runtime dependency and downstream ordering |
| `@causal-order/monitor` | `0.5.x` | Optional upstream buffering and replay |
| `@causal-order/transport` | `^0.1.2` | Optional ingress transport |
| `@causal-order/testing` | `0.3.x` | Optional stack-integration tooling |

## When to Use It

Use dedupe when a `causal-order` pipeline can receive the same logical event
more than once because of:

- transport retries or reconnects
- monitor recovery and buffered replay
- at-least-once delivery
- overlapping ingestion paths
- distributed producers repeating an event identity

### When Not to Use It

This package is not:

- durable idempotency storage
- an exactly-once delivery guarantee
- a replacement for monitor buffering or causal ordering
- a distributed cache shared across processes
- a payload-equivalence detector for events without stable identities

## Integration Model

Create one `DedupeGateway` for the lifetime of the application process and pass
accepted events to `causal-order`:

```js
import { DedupeGateway } from "@causal-order/dedupe";

const dedupe = new DedupeGateway({ preset: "standard" });

async function deliverToDedupe(event) {
  const decision = dedupe.filterWithResult(event);

  if (decision.accepted) {
    await deliverToCausalOrder(event);
  }

  return decision;
}
```

A duplicate decision is a successfully handled delivery: the event has already
been represented downstream and should not remain pending merely because dedupe
did not emit another causal-order input.

Use one filtering method per delivery. Calling both `filter()` and
`filterWithResult()` for the same event performs two dedupe operations.

## Monitor Routing Contract

| Monitor route | Dedupe behavior |
| --- | --- |
| `normal` | Filter before causal ordering |
| `order_buffer_only` | Filter when buffered work replays |
| `full_outage_buffer` | Filter when buffered work replays |
| `replay_through_dedupe` | Accept unseen identities or successfully drop duplicates |
| `dedupe_bypass_throttled` | Dedupe is bypassed; duplicates can reach causal ordering |

Applications that cannot tolerate duplicate delivery must disable or avoid
dedupe bypass and provide an application-owned reconciliation or durable
idempotency boundary.

## Identity Contract

Identity precedence is:

1. `event.id`, when it is a non-empty string
2. `event.nodeId + "::" + event.sequence`, when both values are present
3. no identity; the event is accepted without being cached

The package compares identities, not payloads. Reusing an identity for different
payloads causes later deliveries within the active window to be dropped.

## Configuration

Most deployments should start with a preset:

```js
const dedupe = new DedupeGateway({ preset: "standard" });
```

| Preset | Sliding window | Maximum window |
| --- | ---: | ---: |
| `standard` | 180 seconds | 300 seconds |
| `heavy-duplicates` | 300 seconds | 600 seconds |
| `high-latency` | 480 seconds | 900 seconds |
| `cross-node-busy` | 240 seconds | 480 seconds |

Manual configuration is available when production evidence justifies explicit
bounds:

```js
const dedupe = new DedupeGateway({
  slidingWindowSeconds: 420,
  maxSlidingWindowSeconds: 840,
  autoCleanup: true,
  autoCleanupIntervalSeconds: 30,
});
```

Constructor options:

- `preset`: one of the four named presets; defaults to `standard`
- `slidingWindowSeconds`: initial and minimum active window
- `maxSlidingWindowSeconds`: ceiling for `updateWindow()`
- `autoCleanup`: run periodic cleanup during filtering; defaults to `true`
- `autoCleanupIntervalSeconds`: minimum interval between automatic cleanup
  passes; defaults to `30`
- `nowProvider`: optional millisecond clock for controlled runtime integration
  or deterministic tests

All configured durations must be positive finite numbers, and the sliding window
must not exceed the maximum window.

### JSON Configuration

```json
{
  "preset": "standard",
  "autoCleanup": true,
  "autoCleanupIntervalSeconds": 30
}
```

```js
import { createDedupeGatewayFromConfigFile } from "@causal-order/dedupe";

const dedupe = createDedupeGatewayFromConfigFile("./dedupe.json");
```

A JSON file must choose either `preset` or both manual window fields. Unknown
fields and mixed preset/manual window configuration are rejected. Runtime-only
options such as `nowProvider` can be supplied as overrides:

```js
const dedupe = createDedupeGatewayFromConfigFile("./dedupe.json", {
  nowProvider: () => BigInt(Date.now()),
});
```

## Window Sizing

Size the active window against the maximum credible gap between deliveries of
the same identity. In a monitor-enabled stack, that can include transport retry
delay, downstream outage duration, recovery confirmation, replay queue time,
retry backoff, and acknowledgement uncertainty.

The dedupe window should normally be at least as large as the downstream
causal-order late-arrival horizon. Monitor retention and dedupe retention do not
need to be identical: widening dedupe retention increases process memory use and
should be supported by observed redelivery behavior.

Identity expiry is cleanup-driven. Automatic cleanup can retain an identity for
up to one cleanup interval beyond the nominal window. That additional time is
not a guaranteed extension of the configured contract.

## API

### `new DedupeGateway(config?)`

Creates an in-memory gateway using a preset or explicit configuration.

### `filter(event)`

Returns `true` when the event should continue downstream and `false` when its
identity is already present in the active window.

### `filterWithResult(event)`

Performs the same state transition as `filter()` and returns payload-free
decision evidence:

```ts
{
  accepted: boolean;
  reason: "accepted" | "duplicate" | "accepted_without_identity";
  identitySource: "id" | "node_sequence" | "none";
}
```

The resolved identity and event payload are not exposed in the result.

### `updateWindow(seconds)`

Changes the active window within the configured minimum and maximum bounds.
Invalid values are ignored.

### `getStats()`

Returns process-lifetime counters and current state:

```ts
{
  acceptedEvents: number;
  droppedDuplicates: number;
  currentCacheSize: number;
  activeWindowSeconds: number;
}
```

### `cleanup()`

Evicts identities older than the active window. Manual cleanup is optional when
automatic cleanup is enabled.

### `destroy()`

Clears retained identities and resets gateway statistics. Call it when the
gateway is permanently retired, not as ordinary traffic maintenance.

### `loadDedupeGatewayConfigFile(path)`

Reads and validates a JSON configuration file without creating a gateway.

### `createDedupeGatewayFromConfigFile(path, overrides?)`

Reads a JSON configuration file and creates a gateway, applying optional
runtime overrides afterward.

## Operational Constraints

- Identity state is held in process memory and is not restored after restart.
- A fresh process can accept an identity that the previous process accepted.
- Restart after an indeterminate downstream acknowledgement is therefore an
  at-least-once boundary, not an exactly-once boundary.
- Monitor's SQLite reservoir and dedupe's identity cache are separate ownership
  domains; monitor storage must not be treated as dedupe state.
- Cache memory grows with the number of distinct identities retained inside the
  active window.
- `getStats()` is local process evidence, not a whole-stack health verdict.

## Package Exports

The supported import is the package root:

```js
import {
  DedupeGateway,
  createDedupeGatewayFromConfigFile,
  loadDedupeGatewayConfigFile,
} from "@causal-order/dedupe";
```

Deep paths such as `@causal-order/dedupe/src/dedupe.js` and
`@causal-order/dedupe/package.json` are not public exports. CommonJS `require()`
is not supported.

## Documentation

- [Deployment guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/deployment.md)
- [Configuration guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-dedupe-configs.md)
- [Configuration errors](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md)
- [Compatibility](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/COMPATIBILITY.md)
- [Release history](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/CHANGELOG.md)

## Release History Notes

- `1.2.0` is the current monitor-aware release line. It adds structured dedupe
  decisions, aligns the runtime floor with Node `>=22.13.0`, and defines normal,
  replay, bypass, expiry, and restart behavior as stack contracts.
- `1.1.1` was the preceding documentation-and-positioning patch and did not
  change runtime behavior from `1.1.0`. Its topology and resilience evidence is
  retained in the project changelog and roadmap.
- Versions `1.0.1` through `1.0.5` are deprecated because runtime window and
  cleanup behavior could fail to honor configuration correctly.
- Version `1.0.0` was published and immediately deprecated because the license
  file was excluded from the package.
- Version `1.0.3` was never published.
- Version `1.0.6` corrected the configuration-adherence defect and added
  `getStats()`, `updateWindow()`, and `destroy()`.

## License

[MIT](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/LICENSE)
