# Repo Testing Guide

This guide is for operators evaluating `@causal-order/dedupe` through the local repository test harness under different workload conditions and choosing a dedupe setting that matches their system.

This is a repo testing concern, not the general package deployment guide.

If you are integrating `@causal-order/dedupe` into your own service, see [deployment.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/deployment.md).

## Two Different Things

There are two knobs in the local runtime harness that serve different purposes:

- Workload profiles under `profiles/`
- Dedupe config files under `configs/`
- Dedupe presets on `DedupeGateway`

They are related, but they are not the same.

If you need to create or edit a workload profile, see [guides/building-workload-profiles.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-workload-profiles.md).

If you need to create or edit a dedupe config JSON file, see [guides/building-dedupe-configs.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-dedupe-configs.md).

If you hit a configuration or profile validation failure, see [guides/operator-errors.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md).

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

In repo testing terms:

- `profiles/` shapes the workload
- `configs/` shapes the dedupe behavior when you want manual window values

## What Dedupe Presets Mean

Dedupe presets control how aggressively `@causal-order/dedupe` remembers event identities before allowing them through again.

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

`slidingWindowSeconds` is how long the dedupe layer remembers an accepted event identity.

`maxSlidingWindowSeconds` is the ceiling for later expansion through `updateWindow(seconds)`.

If the downstream `causal-order` engine is working with roughly a `90s` late-arrival horizon, dedupe windows below `90s` are usually risky because a duplicate can fall out of the dedupe cache before the ordering engine is done considering that time range.

Practical rule:

- start at or above the engine horizon
- leave buffer for cleanup cadence
- leave buffer for transport jitter
- leave buffer for delayed replay bursts

That is why `standard` is conservative at `180 / 300`.

## How To Run a Profile

Quick repo test example:

```bash
npm run test:runtime -- --duration 5m --profile-file profiles/expected-production-3way-mesh.json --dedupe-preset standard --time-scale 60 --run-name expected-production-3way-mesh-standard-5m
```

Then inspect the latest run:

```bash
npm run summary:latest
```

```bash
npm run summary:report
```

This is a good short sanity-check flow for repo users because it exercises a realistic 3-node workload profile, finishes quickly with `--time-scale 60`, and gives both a compact summary and a fuller human-readable report.

Manual dedupe-config example:

```bash
npm run test:runtime -- --duration 10m --profile-file profiles/expected-production-3way-mesh.json --dedupe-config configs/dedupe-manual-heavy.json --run-name expected-production-3way-mesh-manual-420-840-10m-wallclock
```

Use this when you want to compare a hand-tuned dedupe window against the built-in presets without mixing the dedupe config file into the workload profile folder.

Practical repo-testing takeaway:

- if a longer wall-clock run reports `INVALID CONFIG` or shows `activeWindowSeconds` below the configured floor, do not use it for tuning decisions
- use `standard`, `cross-node-busy`, `heavy-duplicates`, and `high-latency` as candidates to compare rather than as pre-ranked defaults
- if fresh runs still report duplicate-event errors or preset regressions, move on to a manual config under `configs/`

Fresh validated long-run baseline:

```bash
npm run test:runtime -- --duration 8h --profile-file profiles/expected-production-3way-mesh.json --dedupe-preset standard --run-name expected-production-3way-mesh-standard-8h-postfix-baseline
```

The `2026-06-10` post-fix `8h` wall-clock baseline for `expected-production-3way-mesh + standard` completed with:

- `Verdict: PASS`
- `Status: completed`
- `Assessment: healthy`
- `activeWindowSeconds: 180s`, matching the configured `standard` floor exactly
- `acceptedEvents: 1144896`
- `droppedDuplicates: 7578`, matching `7578` injected duplicates
- `error-level anomalies: 0`
- `queue max: 1383`
- `peak dedupe cache: 11429 ids`
- `peak RSS: 73.0MB`

Treat this as the current trustworthy long-run baseline for that exact profile and preset pair because the dedupe validation and the run-level verdict agreed.

Tracked inspection files for this run live under [test-artifacts/expected-production-3way-mesh-standard-8h-postfix-baseline](../test-artifacts/expected-production-3way-mesh-standard-8h-postfix-baseline), including `summary.json`, `run-config.json`, `lifecycle.ndjson`, and a sampled `anomalies.sample.ndjson`.

Validated `8h` comparison result against `heavy-duplicates`:

```bash
npm run test:runtime -- --duration 8h --profile-file profiles/expected-production-3way-mesh.json --dedupe-preset heavy-duplicates --run-name expected-production-3way-mesh-heavy-duplicates-8h-postfix
```

The `2026-06-10` to `2026-06-11` `8h` wall-clock comparison run for `expected-production-3way-mesh + heavy-duplicates` also completed cleanly:

- `Verdict: PASS`
- `Status: completed`
- `Assessment: healthy`
- `activeWindowSeconds: 300s`, matching the configured `heavy-duplicates` floor exactly
- `acceptedEvents: 1145401`
- `droppedDuplicates: 7656`, matching `7656` injected duplicates
- `error-level anomalies: 0`
- `queue max: 1480`
- `peak dedupe cache: 16570 ids`
- `peak RSS: 74.1MB`

Direct `summary:compare` reading against the validated `standard` baseline:

- duplicate leakage stayed unchanged at `0`
- late ratio improved from `16.02%` to `15.18%`
- queue peak worsened from `1383` to `1480`
- dedupe pressure rose from `noticeable` to `warning`
- peak RSS rose by `1.1MB`

Operational conclusion for this profile:

- `heavy-duplicates` is a valid alternate preset, not a failed one
- it is not a meaningful enough win to replace `standard` as the cleaner default baseline
- the current architecture already looks healthy for this tested `8h` production-like mesh shape

Tracked inspection files for the comparison live under [test-artifacts](../test-artifacts) and are summarized in [comparison.md](../test-artifacts/comparison.md).

## Current `break-the-wire` `8h` Finding

The repo's validated `8h` comparison for `break-the-wire` now shows a clear preset winner:

```bash
npm run test:runtime -- --duration 8h --profile-file profiles/break-the-wire.json --dedupe-preset standard --run-name break-the-wire-standard-8h
```

The `2026-06-11` `8h` `standard` run completed with:

- `Verdict: PASS WITH STRESS`
- `Status: completed`
- `Assessment: degraded`
- `activeWindowSeconds: 300s`, which stayed within the configured `standard` `180s..300s` range and hit the live max
- `acceptedEvents: 1385180`
- `droppedDuplicates: 9080` out of `23008` injected duplicates
- `error-level anomalies: 7`, all `duplicate_event`
- `late_arrival: 854449` of `1385180` delivered events, about `62%`
- `queue max: 5132`
- `peak dedupe cache: 19015 ids`
- `peak RSS: 63.4MB`

Important nuance from the follow-up inspection:

- all `7` duplicate-event errors clustered in the final drain just before collector shutdown rather than appearing steadily throughout the run
- that pattern is more consistent with very-late replay leakage than with a constant mid-run correctness failure
- the original `2026-06-11` run predates `duplicate-leaks.ndjson`, so it cannot show first-seen versus repeated-seen timing for those exact leaked IDs

The validated rerun with `high-latency` was:

```bash
npm run test:runtime -- --duration 8h --profile-file profiles/break-the-wire.json --dedupe-preset high-latency --run-name break-the-wire-high-latency-8h-rerun
```

The `2026-06-12` rerun completed with:

- `Verdict: PASS WITH STRESS`
- `Status: completed`
- `Assessment: degraded`
- `activeWindowSeconds: 480s`, matching the configured `high-latency` floor exactly
- `acceptedEvents: 1373079`
- `droppedDuplicates: 23266` out of `23266` injected duplicates
- `error-level anomalies: 0`
- `late_arrival: 841253` of `1373079` delivered events, about `61%`
- `queue max: 5155`
- `peak dedupe cache: 30226 ids`
- `peak RSS: 66.6MB`

Direct `summary:compare` reading against `standard`:

- duplicate leakage improved from `13928/23008 (60.54%)` to `0/23266 (0.00%)`
- error-level anomalies improved from `7` to `0`
- late ratio improved from `61.69%` to `61.27%`
- queue peak rose only slightly from `5132` to `5155`
- peak RSS rose by `3.1MB`

Duplicate-leak diagnostics for the completed rerun reported:

- `Duplicate leaks: none observed`

Operational conclusion for this profile:

- `standard` is not clean enough for `break-the-wire` because duplicate-related correctness trouble leaked through
- `high-latency` is the preferred preset for `break-the-wire` because it removed duplicate leakage and error-level anomalies while keeping the run config-valid
- the remaining `PASS WITH STRESS` reading is now driven by extreme lateness and backlog pressure rather than dedupe correctness
- manual tuning is not justified yet because the preset already solved the correctness gate cleanly

Tracked inspection files for this comparison live under [test-artifacts](/abs/path/c:/dev/causal-order-dedupe/test-artifacts) and are summarized in [break-the-wire-comparison.md](/abs/path/c:/dev/causal-order-dedupe/test-artifacts/break-the-wire-comparison.md).

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

To compare two runs directly, use:

```bash
npm run summary:compare -- <baseline-run-dir> <candidate-run-dir>
```

If you omit both paths, `summary:compare` compares the two most recent runs.

The validated `8h` mesh comparison flow was:

```bash
npm run test:runtime -- --duration 8h --profile-file profiles/expected-production-3way-mesh.json --dedupe-preset heavy-duplicates --run-name expected-production-3way-mesh-heavy-duplicates-8h-postfix
```

```bash
npm run summary:compare -- artifacts/runs/2026-06-10T10-06-07Z-expected-production-3way-mesh-standard-8h-postfix-baseline artifacts/runs/2026-06-10T18-12-37Z-expected-production-3way-mesh-heavy-duplicates-8h-postfix
```

Focus first on:

- duplicate leakage
- late ratio
- queue peak
- error-level anomalies

## When `heavy-duplicates` Actually Wins

Treat `heavy-duplicates` as a meaningful win over `standard` when most of these are true in the same profile and duration:

- error-level anomalies stay at `0` or drop
- duplicate leakage drops clearly, especially if `standard` was already leaking duplicates in a visible way
- late ratio does not rise enough to change the operational reading of the run
- queue peak stays similar or improves instead of climbing sharply
- memory stays in the same general range rather than expanding noticeably just to buy a small duplicate win

In practical terms:

- if `heavy-duplicates` removes correctness-class duplicate problems without making lateness or backlog materially worse, it is probably the better choice
- if duplicate leakage improves only slightly but late ratio or queue peak gets meaningfully worse, `standard` is usually still the cleaner default
- if both presets stay healthy and the differences are small, prefer `standard` because it is the simpler and less aggressive baseline
- if both presets still show correctness trouble, stop comparing presets and move to a manual config under `configs/`

Good signs that the difference is meaningful:

- duplicate leakage falls by a clearly visible amount in `summary:compare`
- an `INVALID CONFIG` result disappears and both runs actually honor their configured floors
- a `PASS WITH STRESS` result becomes a `PASS`
- duplicate-related error anomalies disappear

Signs that the difference is probably not worth switching:

- the duplicate improvement is small, but queue peak or late ratio gets noticeably worse
- both runs are already `PASS` with `0` error-level anomalies and similar backlog
- the heavier window mainly increases retention cost without changing the operator decision

That is the current validated outcome for the repo's `8h` `expected-production-3way-mesh` comparison:

- `heavy-duplicates` did not improve duplicate leakage over `standard`
- it slightly improved late ratio, but increased backlog and dedupe pressure
- both runs stayed healthy, so the operator decision does not materially change
- `standard` remains the cleaner default baseline and `heavy-duplicates` remains a situational alternate

## How To Read the Results

Evaluate the total equilibrium of a run across three dimensions:

```text
       [ Correctness ]
             /\
            /  \
           /    \
 [Pressure] <---> [Backlog]
(Late Ratio)     (Queue Peak)
```

Use the triangle like this:

- `Correctness`: the hard gate. Did the run avoid correctness-class failures, keep ordered delivery aligned with delivered events, and keep duplicate leakage acceptably low for the chosen policy?
- `Pressure`: how hostile the environment was. In this harness, `late_arrival` ratio is the clearest proxy.
- `Backlog`: how much work accumulated while absorbing that pressure. `queue peak` is the easiest headline signal.

Interpretation:

- high pressure with controlled backlog and preserved correctness means the system is resilient
- high pressure with rising backlog but preserved correctness means the system is still correct but closer to capacity
- high pressure with rising backlog and broken correctness means the system is buckling
- low pressure with high backlog usually points to an internal throughput bottleneck, not just hostile delivery conditions

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
- `Validation:` confirms the dedupe window stayed within the configured floor and ceiling

Stress signs:

- elevated late arrivals
- large queue backlog
- duplicate-event errors
- degraded assessment in the human-readable report

Before trusting any run as a baseline, make sure it also proves:

- `activeWindowSeconds` did not fall below the configured floor
- the run did not come back as `INVALID CONFIG`
- the runtime harness actually honored the cleanup settings from the config path

## How Validation Actually Gates The Verdict

The important split is:

- `getStats()` validates the live dedupe behavior
- `summary:report` decides the run verdict from status, assessment, and config adherence

Read the harness output in this order:

1. `Status`
2. `Validation`
3. `Assessment`
4. `Verdict`

The reason for that order is simple:

- if the run is not `completed`, it is not a clean baseline
- if `Validation:` shows `activeWindowSeconds` below the configured floor, the result is `INVALID CONFIG` even if the process survived
- only after config adherence is confirmed should `healthy` or `degraded` be used to interpret the workload itself

For the `2026-06-10` `standard` baseline above, this chain held cleanly:

- `Status: completed`
- `dedupe config: observed (active window 180s)`
- `dedupe traffic: ok (accepted 1144896 events)`
- `dedupe suppression: active (dropped 7578 duplicates with 7578 injected)`
- `dedupe pressure: noticeable (peak cache 11429 ids, 1.00% of accepted volume)`
- `Assessment: healthy`
- `Verdict: PASS`

For package-facing deployments, `DedupeGateway#getStats()` now exposes a lighter-weight version of this same idea:

- `droppedDuplicates` is the quickest local correctness signal
- `currentCacheSize` is the quickest local pressure signal
- `activeWindowSeconds` is the quickest config-adherence signal
- `acceptedEvents` is the quickest local signal that the gateway is still forwarding real traffic
- downstream queueing and latency remain the real backlog signals outside the repo harness

Treat that runtime snapshot as a first read, not a replacement for the fuller harness reports in this guide.

## Matching Settings To Requirements

Use `standard` when:

- the environment is fairly normal
- the downstream engine horizon is around `90s`
- you want conservative behavior without extra tuning

Use `heavy-duplicates` when:

- repeated deliveries are common
- retry storms or replay behavior are expected
- reducing duplicate leakage matters more than minimizing retention
- and your comparison run actually improves correctness or duplicate leakage without pushing the run into a worse overall verdict

Use `high-latency` when:

- the network is expected to deliver events very late
- long tails are normal
- you need a wider memory window than `standard`
- and for `break-the-wire` specifically, because the validated `8h` comparison showed it removes duplicate leakage that `standard` did not

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
3. Confirm that `summary:report` does not show `INVALID CONFIG` and that `activeWindowSeconds` stayed at or above the configured floor.
4. If duplicate-related stress is still visible, compare against `heavy-duplicates`.
5. If `heavy-duplicates` regresses, still shows correctness trouble, or raises retention cost without materially changing the operator decision, keep `standard` as the default and move to a manual config only when a real workload gap remains.
6. If lateness dominates, test `high-latency` or widen the manual window.
7. If a partition-style stress profile still degrades badly, treat that as an operational limit to investigate, not just a dedupe setting issue.
