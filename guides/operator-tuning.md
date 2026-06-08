# Operator Guide

This guide is for operators evaluating `@causal-order/dedupe` under different
workload conditions and choosing a dedupe setting that matches their system.

## Two Different Things

There are two knobs in the local runtime harness that serve different purposes:

- Workload profiles under `profiles/`
- Dedupe presets on `DedupeGateway`

They are related, but they are not the same.

If you need to create or edit a workload profile, see
[guides/building-workload-profiles.md](building-workload-profiles.md).

## What Workload Profiles Mean

Workload profiles describe the simulated operating environment.

Examples:

- `expected-production`: a reasonable production-like baseline
- `break-the-wire`: an aggressive stress profile with extreme delay and replay behavior

A workload profile controls things like:

- event rate
- duplicate injection rate
- cross-node dependency pressure
- delay spikes
- late-arrival behavior
- queue stress

In practice, a profile answers:

`What kind of network and event behavior are we testing against?`

## What Dedupe Presets Mean

Dedupe presets control how aggressively `@causal-order/dedupe` remembers event
identities before allowing them through again.

Current presets:

- `standard`
- `heavy-duplicates`
- `high-latency`
- `cross-node-busy`

In practice, a preset answers:

`How defensive should the dedupe layer be for this deployment?`

## Default Behavior

Default mode is `standard`.

These are equivalent:

```js
new DedupeGateway()
```

```js
new DedupeGateway({ preset: "standard" })
```

`standard` currently means:

- `slidingWindowSeconds = 180`
- `maxSlidingWindowSeconds = 300`

## Custom Behavior

If the presets do not fit, operators can use explicit raw values.

```js
new DedupeGateway({
  slidingWindowSeconds: 240,
  maxSlidingWindowSeconds: 600,
})
```

This is the custom path. There is no literal `custom` preset name.

## How To Think About Window Size

`slidingWindowSeconds` is how long the dedupe layer remembers an accepted event
identity.

`maxSlidingWindowSeconds` is the ceiling for later expansion through
`updateWindow(seconds)`.

If the downstream `causal-order` engine is working with roughly a `90s`
late-arrival horizon, dedupe windows below `90s` are usually risky because a
duplicate can fall out of the dedupe cache before the ordering engine is done
considering that time range.

Practical rule:

- start at or above the engine horizon
- leave buffer for cleanup cadence
- leave buffer for transport jitter
- leave buffer for delayed replay bursts

That is why `standard` is conservative at `180 / 300`.

## How To Run a Profile

Example baseline run:

```bash
npm run test:runtime -- --duration 5m --profile expected-production --dedupe-preset standard --time-scale 60 --run-name expected-production-standard-5m
```

Example heavier dedupe against the same workload:

```bash
npm run test:runtime -- --duration 5m --profile expected-production --dedupe-preset heavy-duplicates --time-scale 60 --run-name expected-production-heavy-duplicates-5m
```

Example stress profile:

```bash
npm run test:runtime -- --duration 5m --profile break-the-wire --dedupe-preset standard --time-scale 60 --run-name break-the-wire-standard-5m
```

Then inspect the latest summaries:

```bash
npm run summary:latest
```

```bash
npm run summary:report
```

## How To Read the Results

Focus on these signals first:

- `late_arrival`: tells you how much of the workload is arriving outside the easy path
- `duplicate_event`: tells you whether duplicates are still leaking through under stress
- queue depth: tells you whether the workload is causing backlog
- error-level anomalies: tells you whether the run is merely noisy or actually degraded

Healthy baseline signs:

- completed run
- mostly warning-level anomalies
- low or moderate queue depth
- no error-level duplicate anomalies

Stress signs:

- elevated late arrivals
- large queue backlog
- duplicate-event errors
- degraded assessment in the human-readable report

## What Recent Runs Suggest

In the local comparison runs:

- `expected-production` with `heavy-duplicates` looked better than `standard` on anomaly count and lateness
- `break-the-wire` remained stressed under both presets
- `heavy-duplicates` helped remove duplicate-event errors in `break-the-wire`
- `heavy-duplicates` did not materially solve the lateness or backlog pattern in `break-the-wire`

Operator meaning:

- choose `standard` for a normal baseline
- choose `heavy-duplicates` when duplicate suppression is more important than keeping the window smaller
- do not expect dedupe alone to solve a workload dominated by extreme lateness and partition-like delay

## Matching Settings To Requirements

Use `standard` when:

- the environment is fairly normal
- the downstream engine horizon is around `90s`
- you want conservative behavior without extra tuning

Use `heavy-duplicates` when:

- repeated deliveries are common
- retry storms or replay behavior are expected
- reducing duplicate leakage matters more than minimizing retention

Use `high-latency` when:

- the network is expected to deliver events very late
- long tails are normal
- you need a wider memory window than `standard`

Use `cross-node-busy` when:

- there is heavy cross-node coordination
- causal dependencies often span nodes
- the system is busy but not necessarily as delay-heavy as a high-latency environment

Use manual raw values when:

- the engine horizon is known precisely
- the traffic pattern is unusual
- you want tighter or wider bounds than the presets offer
- you are tuning against observed reports rather than starting from a generic preset

## A Safe Operator Workflow

1. Start with `expected-production` and `standard`.
2. Review `summary:report`.
3. If duplicate-related stress is still visible, compare against `heavy-duplicates`.
4. If lateness dominates, test `high-latency` or widen the manual window.
5. If a partition-style stress profile still degrades badly, treat that as an operational limit to investigate, not just a dedupe setting issue.
