# Topology Validation Guide

This guide is for operators validating single-cluster topology size in the local `@causal-order/dedupe` repository harness.

Use it when you want to answer questions like:

- does the current single-cluster runtime stay healthy at `n=5`
- does it stay healthy at `n=8`
- does it still stay correctness-safe at `n=12`
- does a larger mesh create correctness, backlog, or pressure trouble

This is a repo testing concern, not the package deployment path.

If you are integrating `@causal-order/dedupe` into your own service, see [deployment.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/deployment.md).

If you need to build or edit the workload shape first, see [building-workload-profiles.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-workload-profiles.md).

If you need to tune dedupe windows or compare presets, see [operator-tuning.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-tuning.md).

## Topology vs Workload

There are two separate inputs in the runtime harness:

- topology from `--node-ids`
- workload shape from `profiles/*.json`

That split matters.

`--node-ids` answers:

`How many nodes are in this single cluster for this run?`

The workload profile answers:

`What kind of delivery pressure, duplicate rate, dependency pressure, and latency behavior are we testing?`

That is why `profiles/expected-production-mesh.json` is topology-neutral.
It describes a production-like mesh workload shape, while the actual node count comes from `--node-ids`.

Examples:

- `edge-a,edge-b,edge-c` means `n=3`
- `edge-a,edge-b,edge-c,edge-d,edge-e` means `n=5`
- `edge-a,edge-b,edge-c,edge-d,edge-e,edge-f,edge-g,edge-h` means `n=8`
- `edge-a,edge-b,edge-c,edge-d,edge-e,edge-f,edge-g,edge-h,edge-i,edge-j,edge-k,edge-l` means `n=12`

## Practical Framing

There are two useful ways to talk about topology in this repo:

- repo-preserved baseline: keep `n=3` available as the untouched small-cluster smoke path
- deployment-minded framing: treat `n=5` as the primary real-world baseline, `n=8` as the growth baseline, and `n=12` as resilience and expansion evidence

Those are not contradictory.

The repo keeps `n=3` because it is the safest unchanged local baseline.
The package-facing deployment story now centers `n=5` more than `n=3`, because current evidence suggests that ordinary real-world deployment is usually closer to that range than to the larger `n=12` resilience track.

## Safe Testing Rule

Do not disturb the validated baseline while expanding topology testing.

Practical rule:

- keep the existing `n=3` path as the preserved smoke baseline
- make larger meshes opt-in through `--node-ids`
- treat `n=5` as the first deployment-shaped checkpoint
- treat `n=8` as the next growth checkpoint
- treat `n=12` as resilience and expansion evidence rather than the default operating assumption

That keeps the current known-good test path intact while still letting the repo test larger meshes.

## How To Run `n=5`

Use the topology-neutral mesh profile and pass the node list explicitly:

```powershell
npm run test:runtime -- --duration 1h --profile-file profiles/expected-production-mesh.json --dedupe-preset standard --node-ids edge-a,edge-b,edge-c,edge-d,edge-e --run-name expected-production-mesh-standard-1h-n5-wallclock
```

Then inspect the run:

```powershell
npm run summary:report
npm run summary:duplicates
```

## How To Run `n=8`

Run the same workload shape and dedupe preset, but expand the topology:

```powershell
npm run test:runtime -- --duration 1h --profile-file profiles/expected-production-mesh.json --dedupe-preset standard --node-ids edge-a,edge-b,edge-c,edge-d,edge-e,edge-f,edge-g,edge-h --run-name expected-production-mesh-standard-1h-n8-wallclock
```

Then inspect the run:

```powershell
npm run summary:report
npm run summary:duplicates
```

## How To Compare Them

Use `summary:compare` directly against the two run folders:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-12T13-18-14Z-expected-production-mesh-standard-1h-n5-wallclock artifacts/runs/2026-06-12T14-24-38Z-expected-production-mesh-standard-1h-n8-wallclock
```

Focus on these first:

- duplicate leakage
- error-level anomalies
- late ratio
- queue peak
- peak RSS

## Current Validated `1h` Finding: `n=5` -> `n=8`

The current validated wall-clock comparison in this repo was:

- `n=5`: `artifacts/runs/2026-06-12T13-18-14Z-expected-production-mesh-standard-1h-n5-wallclock`
- `n=8`: `artifacts/runs/2026-06-12T14-24-38Z-expected-production-mesh-standard-1h-n8-wallclock`

Both runs completed cleanly and both returned:

- `Verdict: PASS`
- `Status: completed`
- `Assessment: healthy`
- `error-level anomalies: 0`
- `duplicate leakage: 0`
- active dedupe window `180s`

`n=5` summary highlights:

- generated `95831`
- delivered `95831`
- ordered `95831`
- duplicates injected `684`
- late ratio `6.83%`
- queue peak `540`
- peak RSS `62.2MB`

`n=8` summary highlights:

- generated `95265`
- delivered `95265`
- ordered `95265`
- duplicates injected `634`
- late ratio `4.17%`
- queue peak `338`
- peak RSS `61.5MB`

Direct comparison reading:

- duplicate leakage `0 -> 0`
- late ratio `6.83% -> 4.17%`
- queue peak `540 -> 338`
- warning anomalies `9478 -> 5589`
- error anomalies `0 -> 0`
- peak RSS `62.2MB -> 61.5MB`

Current best-supported conclusion for this exact workload shape:

- `n=5` is healthy
- `n=8` is also healthy
- `n=8` is the stronger single-cluster result of the two
- current evidence supports continuing single-cluster validation at larger node counts

Tracked inspection files for this comparison live under [test-artifacts](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/README.md) and are summarized in [expected-production-mesh-1h-n5-n8-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-1h-n5-n8-comparison.md).

## Current Validated `8h` Endurance Finding: `n=8`

The current validated `8h` wall-clock endurance run in this repo was:

```powershell
npm run test:runtime -- --duration 8h --profile-file profiles/expected-production-mesh.json --dedupe-preset standard --node-ids edge-a,edge-b,edge-c,edge-d,edge-e,edge-f,edge-g,edge-h --run-name expected-production-mesh-standard-8h-n8-wallclock
```

Run folder:

- `artifacts/runs/2026-06-15T08-57-50Z-expected-production-mesh-standard-8h-n8-wallclock`

The run completed with:

- `Verdict: PASS`
- `Status: completed`
- `Assessment: healthy`
- `acceptedEvents: 764817`
- `droppedDuplicates: 5104`, matching `5104` injected duplicates
- `error-level anomalies: 0`
- `late ratio: 4.49%`
- `queue peak: 380`
- `peak RSS: 68.5MB`
- `activeWindowSeconds: 180s`

Direct `summary:compare` reading against the validated `1h` `n=8` run:

- duplicate leakage stayed `0/634 (0.00%) -> 0/5104 (0.00%)`
- late ratio rose slightly from `4.17%` to `4.49%`
- queue peak rose slightly from `338` to `380`
- peak RSS rose from `61.5MB` to `68.5MB`
- error-level anomalies stayed `0 -> 0`
- backlog stayed controlled and pressure stayed low

Operational conclusion for this profile and topology:

- `n=8` stayed healthy at `8h`
- correctness remained strong
- the longer run added some pressure and memory cost, but not enough to change the operator reading
- `n=8` is now a validated single-cluster endurance checkpoint for this tested workload shape

Tracked inspection files for this run and comparison live under [test-artifacts](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/README.md), including [expected-production-mesh-standard-8h-n8-wallclock](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-standard-8h-n8-wallclock/summary.json) and [expected-production-mesh-1h-8h-n8-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-1h-8h-n8-comparison.md).

## Current Validated `12h` Endurance Finding: `n=8`

The current validated `12h` wall-clock endurance run in this repo was:

```powershell
npm run test:runtime -- --duration 12h --profile-file profiles/expected-production-mesh.json --dedupe-preset standard --node-ids edge-a,edge-b,edge-c,edge-d,edge-e,edge-f,edge-g,edge-h --run-name expected-production-mesh-standard-12h-n8-wallclock
```

Run folder:

- `artifacts/runs/2026-06-15T17-13-15Z-expected-production-mesh-standard-12h-n8-wallclock`

The run completed with:

- `Verdict: PASS`
- `Status: completed`
- `Assessment: healthy`
- `acceptedEvents: 1146602`
- `droppedDuplicates: 7552`, matching `7552` injected duplicates
- `error-level anomalies: 0`
- `late ratio: 4.19%`
- `queue peak: 375`
- `peak RSS: 69.0MB`
- `activeWindowSeconds: 180s`

Direct `summary:compare` reading against the validated `8h` `n=8` run:

- duplicate leakage stayed `0/5104 (0.00%) -> 0/7552 (0.00%)`
- late ratio improved slightly from `4.49%` to `4.19%`
- queue peak improved slightly from `380` to `375`
- peak RSS rose only slightly from `68.5MB` to `69.0MB`
- error-level anomalies stayed `0 -> 0`
- backlog stayed controlled and pressure stayed low

Operational conclusion for this profile and topology:

- `n=8` stayed healthy at `12h`
- correctness remained strong
- the longer run did not reveal endurance drift
- `n=8` is now validated at `1h`, `8h`, and `12h` for this tested workload shape

Tracked inspection files for this run and comparison live under [test-artifacts](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/README.md), including [expected-production-mesh-standard-12h-n8-wallclock](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-standard-12h-n8-wallclock/summary.json) and [expected-production-mesh-8h-12h-n8-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-8h-12h-n8-comparison.md).

## Current Typical-Profile `12h` Finding: `n=12`

The newer deployment-shaped `n=12` evidence in this repo uses `profiles/typical-real-world-mesh.json` rather than the older `expected-production-mesh` track.

Tracked comparisons:

- [typical-real-world-mesh-12h-n12-standard-vs-rejoin-aware-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/typical-real-world-mesh-12h-n12-standard-vs-rejoin-aware-comparison.md)
- [typical-real-world-mesh-12h-n12-standard-vs-cross-node-busy-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/typical-real-world-mesh-12h-n12-standard-vs-cross-node-busy-comparison.md)

Current reading:

- the `12h` `n=12` standard run stayed healthy
- the rejoin-aware comparison stayed correctness-safe but did not produce a large enough win to justify another reconnect-specific layer
- the `cross-node-busy` comparison also stayed correctness-safe, but the wider `240s / 480s` floor/max pair did not produce a meaningful enough win to replace `standard` as the cleaner default baseline

That makes `n=12` useful as headroom and resilience evidence.
It does not make `n=12` the new default deployment target.

## What This Means In Real Deployment Terms

In practical terms, this result means:

- the current single-cluster engine did not show correctness trouble at `n=8`
- backlog pressure did not get worse when moving from `n=5` to `n=8` in this tested workload
- the newer `n=12` typical-profile runs also stayed correctness-safe, which strengthens the deployability read for ordinary cluster shapes
- the larger mesh evidence is best read as comfort margin and resilience headroom, not as proof that most deployments need to target `n=12`

It does not mean:

- `8` is the universal ideal cluster size for every workload
- a future `n=10` or `n=12` run will necessarily behave the same way
- this single comparison is enough to settle every larger-topology decision

## Scope Boundary

This guide is only about single-cluster topology validation in the repo test harness.

It does not evaluate:

- different workload families that were not run here
- non-single-cluster runtime behavior
- conclusions beyond the repo test harness evidence

Its operator-facing purpose is narrower:

- run larger single-cluster tests safely
- compare them against the preserved baseline
- decide whether the current runtime still looks healthy at the tested node count

## Recommended Next Steps

Use this progression:

1. Keep `n=3` as the preserved repo smoke baseline.
2. Treat `n=5` as the primary real-world baseline.
3. Treat `n=8` as the practical growth baseline.
4. Treat `n=12` as resilience and expansion evidence rather than the default operating target.
5. Re-check correctness, late ratio, queue peak, and peak RSS at each step instead of assuming larger topologies or longer durations will behave the same way.
6. Run longer durations only when you are answering a specific deployment question, not just because a bigger wall-clock number sounds stronger.
