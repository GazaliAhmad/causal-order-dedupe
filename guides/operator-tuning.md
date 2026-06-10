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

Recent comparison on `expected-production-3way-mesh`:

- in a short `5m` simulated run, `heavy-duplicates` looked cleaner than `standard`
- in a longer `10m` wall-clock run, `heavy-duplicates` still showed stress and duplicate-event errors
- `cross-node-busy` also landed at `PASS WITH STRESS` and did not outperform `standard` on duplicate leakage for this profile
- `high-latency` performed worse for this profile and produced multiple error-level `duplicate_event` anomalies
- in an `8h` wall-clock run, `standard` completed with `PASS`, `0` error-level anomalies, peak memory around `60.6MB`, and roughly `95%` of injected duplicates suppressed
- in a second `8h` wall-clock run on `2026-06-09`, `heavy-duplicates` underperformed that baseline with `PASS WITH STRESS`, `2` `duplicate_event` errors, worse duplicate leakage, higher late ratio, and higher memory use

Practical repo-testing takeaway:

- keep `standard` as the preferred preset baseline for `expected-production-3way-mesh`
- use `standard` and `cross-node-busy` as comparison points, not as obviously stronger defaults for this profile
- avoid treating `high-latency` as the default choice for this mesh-style workload unless later evidence shows a real lateness-dominated need
- do not treat `heavy-duplicates` as a better default for this mesh profile after the documented `8h` comparison
- if the longer wall-clock run still reports duplicate-event errors or preset regressions, move on to a manual config under `configs/`
- treat the `8h` `standard` run as a strong baseline anchor for future wall-clock comparisons on this mesh profile

Documented `8h` baseline on `expected-production-3way-mesh` with `standard`:

```bash
npm run test:runtime -- --duration 8h --profile-file profiles/expected-production-3way-mesh.json --dedupe-preset standard --run-name expected-production-3way-mesh-standard-8h-wallclock
```

Observed outcome from the `2026-06-09` run:

- completed cleanly across all three nodes
- `Verdict: PASS`
- `duplicatesInjected=7516` with only `353` extra delivered events over generated volume
- about `95.3%` of injected duplicates were suppressed
- `late_arrival=161567` and `sequence_regression=41402`, but all anomalies remained warning-level
- memory stayed stable at about `59.0MB` last RSS and `60.6MB` peak RSS

Operational reading:

- `standard` held up over a full `8h` wall-clock run for this 3-way mesh profile
- the ordering layer tolerated sustained lateness without escalating into correctness failures
- this run is a good baseline to keep when judging later preset or manual-window comparisons

Documented `8h` comparison result on `2026-06-09` with `heavy-duplicates`:

```bash
npm run test:runtime -- --duration 8h --profile-file profiles/expected-production-3way-mesh.json --dedupe-preset heavy-duplicates --run-name expected-production-3way-mesh-heavy-duplicates-8h-wallclock
```

Observed outcome from the `2026-06-09T14:31:26.602Z` to `2026-06-09T22:32:28.132Z` run:

- completed, but only at `Verdict: PASS WITH STRESS`
- `error=2`, both `duplicate_event`
- duplicate leakage worsened from `353/7516 (4.70%)` under `standard` to `391/7358 (5.31%)`
- late ratio rose from `14.10%` under `standard` to `15.46%`
- queue peak improved only slightly from `1495` to `1450`
- peak RSS increased from `60.6MB` to `68.2MB`

Operational reading:

- `heavy-duplicates` did not beat the `standard` baseline in the apples-to-apples `8h` mesh comparison
- the heavier window bought a small backlog improvement, but it lost on correctness, lateness, duplicate leakage, and memory
- for this profile, the next tuning step after `standard` should be a manual config rather than treating `heavy-duplicates` as the preferred preset

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

For the documented `8h` mesh baseline, a useful comparison flow is:

```bash
npm run test:runtime -- --duration 8h --profile-file profiles/expected-production-3way-mesh.json --dedupe-preset heavy-duplicates --run-name expected-production-3way-mesh-heavy-duplicates-8h-wallclock
```

```bash
npm run summary:compare -- artifacts/runs/2026-06-09T06-13-03Z-expected-production-3way-mesh-standard-8h-wallclock artifacts/runs/<new-heavy-duplicates-run>
```

Focus first on:

- duplicate leakage
- late ratio
- queue peak
- error-level anomalies

Recorded result from the `2026-06-09` `standard` vs `heavy-duplicates` comparison:

- `Verdict: PASS -> PASS WITH STRESS`
- `duplicate leakage: 353/7516 (4.70%) -> 391/7358 (5.31%)`
- `late ratio: 14.10% -> 15.46%`
- `queue peak: 1495 -> 1450`
- `error-level anomalies: 0 -> 2`
- `peak RSS: 60.6MB -> 68.2MB`

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
- a `PASS WITH STRESS` result becomes a `PASS`
- duplicate-related error anomalies disappear

Signs that the difference is probably not worth switching:

- the duplicate improvement is small, but queue peak or late ratio gets noticeably worse
- both runs are already `PASS` with `0` error-level anomalies and similar backlog
- the heavier window mainly increases retention cost without changing the operator decision

That is exactly what happened in the documented `2026-06-09` `8h` mesh comparison:

- `heavy-duplicates` did not improve duplicate leakage
- it introduced `2` `duplicate_event` errors
- it raised late ratio and memory use
- the small queue improvement was not enough to change the operator decision

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

Stress signs:

- elevated late arrivals
- large queue backlog
- duplicate-event errors
- degraded assessment in the human-readable report

For the documented `8h` `expected-production-3way-mesh` baseline with `standard`, the equilibrium reads well:

- correctness stayed strong because the run finished `PASS`, `error=0`, and ordered matched delivered
- pressure was real because the late ratio was about `14.1%`
- backlog stayed controlled because queue peak was `1495` and the system drained to completion

## What Recent Runs Suggest

In the local comparison runs:

- `expected-production` with `heavy-duplicates` looked better than `standard` on anomaly count and lateness
- `expected-production-3way-mesh` with `standard` also proved stable in an `8h` wall-clock run and is now a documented baseline
- `expected-production-3way-mesh` with `heavy-duplicates` lost to that baseline in the matching `8h` wall-clock comparison
- `break-the-wire` remained stressed under both presets
- `heavy-duplicates` helped remove duplicate-event errors in `break-the-wire`
- `heavy-duplicates` did not materially solve the lateness or backlog pattern in `break-the-wire`

Operator meaning:

- choose `standard` for a normal baseline
- for `expected-production-3way-mesh`, keep `standard` as the preferred preset unless a later run shows a materially different result
- choose `heavy-duplicates` only when duplicate pressure is the clearly dominant problem and the comparison actually improves correctness
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
- and your comparison run actually improves correctness or duplicate leakage without pushing the run into a worse overall verdict

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
4. If `heavy-duplicates` regresses or still shows correctness trouble, move to a manual config instead of assuming another preset will save the profile.
5. If lateness dominates, test `high-latency` or widen the manual window.
6. If a partition-style stress profile still degrades badly, treat that as an operational limit to investigate, not just a dedupe setting issue.
