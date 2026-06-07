# @causal-order/dedupe

Deduplication support for `causal-order`, plus a deployment-style test harness for exercising duplicate-heavy event streams.

Version `1.0.1`.

Release notes: [CHANGELOG.md](./CHANGELOG.md)

Runtime compatibility:

- Node `20+` minimum for package consumers
- Node `24+` recommended for local development in this repo
- ESM-only package

The repo currently exposes a single gateway class in [src/dedupe.ts](./src/dedupe.ts) and includes runtime scripts in [test/](./test) that simulate multi-process event delivery over localhost TCP.

## What It Does

`DedupeGateway` keeps a sliding-window cache of event identities and lets you drop repeat deliveries before handing events to `causal-order`.

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

For local development in this repo, importing from `./src/dedupe.ts` is still fine when running through the TS toolchain.

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

## Deployment Test Harness

The `test/` directory contains a local runtime harness that simulates:

- one collector process running `causal-order`
- multiple node processes generating events
- localhost TCP transport between nodes and collector
- delayed delivery, late arrivals, and duplicate injection
- per-process logs and JSON run artifacts

Useful entry points:

```bash
npm run check
npm run build
npm run test:runtime -- --help
npm run test:runtime -- --duration 1m --steady-for 20s --time-scale 60 --run-name smoke
npm run test:runtime -- --profile expected-production --duration 1h --steady-for 15m --run-name tuned-test
npm run summary:latest
npm run summary:report
```

Artifacts are written under `artifacts/runs/`.

Typical files in a run folder:

- `summary.json`
- `run-config.json`
- `heartbeats.ndjson`
- `anomalies.ndjson`
- `lifecycle.ndjson`
- `orchestrator.log`
- `collector.stdout.log`
- `collector.stderr.log`
- `nodes/*.stdout.log`
- `nodes/*.stderr.log`

## Workload Profiles

The harness supports both a built-in default profile and JSON-backed profiles in [profiles/](./profiles).

These profiles are workload presets for the local test harness. They shape simulated traffic characteristics such as throughput, node balance, cross-node dependencies, duplicate pressure, ordering preservation, and delivery delay. They are testing scenarios, not authoritative real-world deployment models.

Available profiles in this repo:

- `expected-production`: production-like baseline you can tune further
- `expected-production-heavy-cross`: forces much heavier cross-node dependency pressure
- `expected-production-3way-mesh`: scales the workload toward a 3-node mesh shape
- `break-the-wire`: harsher partition and latency stress profile

Examples:

```bash
npm run test:runtime -- --profile expected-production --duration 10h --steady-for 2h --time-scale 1 --run-name overnight-expected
npm run test:runtime -- --profile expected-production-heavy-cross --duration 2h --steady-for 30m --time-scale 1 --run-name heavy-cross
npm run test:runtime -- --profile expected-production-3way-mesh --duration 2h --steady-for 30m --time-scale 1 --run-name mesh
npm run test:runtime -- --profile break-the-wire --duration 30m --steady-for 5m --time-scale 1 --run-name partition-stress
```

You can also point at a custom JSON file directly:

```bash
npm run test:runtime -- --profile-file profiles/expected-production.json --duration 1h --steady-for 15m --run-name custom-profile
```

The profile files control:

- phase rates and chaos multipliers
- node weighting
- same-node versus cross-node dependency mix
- duplicate injection rates
- ordering preservation probability
- steady and chaotic delay bands

## Notes

- The previous `README-pre.md` described an earlier version of this repo with older names and npm script aliases.
- The repo defines `npm run test:runtime`, `npm run summary:latest`, and `npm run summary:report` for the local harness workflow.
- The publish workflow uses a generated `publish-dist/` folder with a stripped `package.json`, so local repo scripts are available for development but are not carried in the published npm package.

## Publishing

Build the publishable package directory:

```bash
npm run prepare:dist
```

Preview the published tarball contents:

```bash
npm run pack:dist
```

Publish the stripped package:

```bash
npm run publish:dist
```
