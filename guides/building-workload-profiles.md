# Building Workload Profiles

This guide explains how to create a workload profile for the local runtime harness in `profiles/`.

Use this when you want to simulate a production shape, replay issue, latency spike pattern, or stress scenario that is closer to your own system.

This is a repo testing concern, not the package deployment path.

If you are trying to configure `DedupeGateway` for your own deployed service, see [deployment.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/deployment.md).

If you want to build a dedupe config JSON file instead of a workload profile, see [building-dedupe-configs.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-dedupe-configs.md).

If the runtime rejects a profile or config, see [operator-errors.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md).

## What a Profile Does

A workload profile defines the simulated traffic and delivery conditions for the runtime harness.

It does not configure the dedupe layer directly.

Instead, it answers:

`What kind of workload should the ordering and dedupe stack be tested against?`

Then you pair that profile with a dedupe preset such as `standard` or `heavy-duplicates`.

If you want manual dedupe windows for repo testing, pass a separate config file with `--dedupe-config`, for example `configs/dedupe-manual-heavy.json`.

## Where Profiles Live

Profiles live under `profiles/` as JSON files.

Dedupe config files are a separate concern and should live under `configs/`, not under `profiles/`.

Examples in this repo:

- [expected-production.json](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/profiles/expected-production.json)
- [break-the-wire.json](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/profiles/break-the-wire.json)

## Minimum Structure

A profile should define these top-level sections:

- `name`
- `description`
- `nodeWeights`
- `phaseRates`
- `dependencies`
- `duplicates`
- `ordering`
- `delays`

## Starter Template

```json
{
  "name": "my-profile",
  "description": "Describe the workload being simulated.",
  "nodeWeights": {
    "edge-a": 1.0,
    "edge-b": 1.0,
    "edge-c": 1.0
  },
  "phaseRates": {
    "steadyEventsPerSecond": 12,
    "chaosMultiplier": 1.6,
    "chaosJitterMin": 0.95,
    "chaosJitterMax": 1.15
  },
  "dependencies": {
    "steadySameNodeChance": 0.4,
    "steadyCrossNodeChance": 0.2,
    "chaoticSameNodeChance": 0.25,
    "chaoticCrossNodeChance": 0.35,
    "sameNodeParentChance": 0.8,
    "crossNodeParentChance": 0.7
  },
  "duplicates": {
    "steadyChance": 0.001,
    "chaoticChance": 0.008
  },
  "ordering": {
    "steadyPreserveOrderChance": 0.995,
    "chaoticPreserveOrderChance": 0.92
  },
  "delays": {
    "steady": {
      "baseMinMs": 15,
      "baseMaxMs": 90,
      "spikeChance": 0.02,
      "spikeMinMs": 180,
      "spikeMaxMs": 700
    },
    "chaotic": {
      "baseMinMs": 30,
      "baseMaxMs": 180,
      "slowSpikeChance": 0.06,
      "slowSpikeMinMs": 800,
      "slowSpikeMaxMs": 4000,
      "lateSpikeChance": 0.01,
      "lateSpikeMinMs": 6000,
      "lateSpikeMaxMs": 20000,
      "extremeSpikeChance": 0.002,
      "extremeSpikeMinMs": 30000,
      "extremeSpikeMaxMs": 90000
    }
  }
}
```

## Field Meanings

### `name`

Short identifier used by `--profile`.

Example:

```json
"name": "expected-production"
```

You run it like:

```bash
npm run test:runtime -- --profile expected-production
```

### `description`

Human-readable explanation of what the profile is trying to model.

Keep this concrete. Good descriptions mention the operational shape, not just the environment name.

## `nodeWeights`

Controls how much traffic each node generates relative to the others.

Examples:

- equal weights: balanced traffic
- one heavier node: hotspot or primary-ingest pattern
- one lighter node: underutilized replica or cold region

Example:

```json
"nodeWeights": {
  "edge-a": 1.2,
  "edge-b": 0.8,
  "edge-c": 1.0
}
```

## `phaseRates`

Controls throughput and how aggressive the chaotic phase becomes.

- `steadyEventsPerSecond`: baseline total event rate
- `chaosMultiplier`: how much heavier the chaotic phase is
- `chaosJitterMin` and `chaosJitterMax`: variability during the chaotic phase

Use higher values when you want bursty or pressure-heavy traffic.

## `dependencies`

Controls how much causal dependency pressure exists.

- `steadySameNodeChance`: dependencies within a node during the steady phase
- `steadyCrossNodeChance`: dependencies across nodes during the steady phase
- `chaoticSameNodeChance`: same-node dependency pressure during the chaotic phase
- `chaoticCrossNodeChance`: cross-node dependency pressure during the chaotic phase
- `sameNodeParentChance`: direct-parent likelihood within the same node
- `crossNodeParentChance`: direct-parent likelihood across nodes

If you want a cross-node busy system, increase the cross-node values.

If you want a more isolated per-node system, reduce them.

## `duplicates`

Controls how often duplicate deliveries are injected.

- `steadyChance`: duplicate rate in the steady phase
- `chaoticChance`: duplicate rate in the chaotic phase

Raise these if you want to simulate:

- retry storms
- replay-heavy pipelines
- unstable transports
- duplicate fan-out under load

## `ordering`

Controls how often delivery order is preserved.

- `steadyPreserveOrderChance`
- `chaoticPreserveOrderChance`

Higher values mean cleaner delivery order. Lower values mean more shuffle and more opportunity for sequence and lateness issues.

## `delays`

Controls latency behavior.

`steady` is for the baseline period.

`chaotic` is for the stress period.

### Steady delay fields

- `baseMinMs`
- `baseMaxMs`
- `spikeChance`
- `spikeMinMs`
- `spikeMaxMs`

These should usually stay modest unless your normal traffic is already slow.

### Chaotic delay fields

- `baseMinMs`
- `baseMaxMs`
- `slowSpikeChance`
- `slowSpikeMinMs`
- `slowSpikeMaxMs`
- `lateSpikeChance`
- `lateSpikeMinMs`
- `lateSpikeMaxMs`
- `extremeSpikeChance`
- `extremeSpikeMinMs`
- `extremeSpikeMaxMs`

These are the most important fields when you want to simulate:

- tail latency
- long replay gaps
- partial partitions
- broken links
- delayed recovery bursts

## Good Starting Patterns

### Baseline production profile

Use:

- moderate event rate
- low duplicate rate
- moderate cross-node dependency pressure
- small steady delays
- occasional chaotic delay spikes

Start from:

- [expected-production.json](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/profiles/expected-production.json)

### Cross-node busy profile

Increase:

- `steadyCrossNodeChance`
- `chaoticCrossNodeChance`
- `crossNodeParentChance`

Keep delays moderate if you want to test dependency complexity without turning it into a latency problem.

### High-latency profile

Increase:

- `slowSpikeChance`
- `lateSpikeChance`
- `lateSpikeMaxMs`
- `extremeSpikeChance`

This is useful when testing whether dedupe and the ordering engine can tolerate long tails.

### Break-the-wire profile

If you want a partition-like stress shape:

- keep cross-node dependency pressure very high
- make chaotic delays severe
- raise late and extreme spike probabilities
- allow large max delay ranges

Start from:

- [break-the-wire.json](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/profiles/break-the-wire.json)

## How To Create a New Profile

1. Copy a nearby existing profile from `profiles/`.
2. Rename the `name` and update the `description`.
3. Change only one or two behavioral dimensions at first.
4. Run a short `5m` simulated test.
5. Inspect `summary:report`.
6. Tighten or widen the profile based on the observed report.

## How To Run It

If you save a profile as `profiles/my-profile.json`, run:

```bash
npm run test:runtime -- --duration 5m --profile my-profile --dedupe-preset standard --time-scale 60 --run-name my-profile-standard-5m
```

Then inspect:

```bash
npm run summary:latest
```

```bash
npm run summary:report
```

If you want to keep the same workload profile but swap in a manual dedupe config, run something like:

```bash
npm run test:runtime -- --duration 10m --profile-file profiles/expected-production-3way-mesh.json --dedupe-config configs/dedupe-manual-heavy.json --run-name expected-production-3way-mesh-manual-420-840-10m-wallclock
```

One validated long-run reference point in this repo is:

```bash
npm run test:runtime -- --duration 8h --profile-file profiles/expected-production-3way-mesh.json --dedupe-preset standard --run-name expected-production-3way-mesh-standard-8h-postfix-baseline
```

That `2026-06-10` wall-clock run completed with `PASS`, `Status: completed`, `Assessment: healthy`, `0` error-level anomalies, `activeWindowSeconds: 180s`, and duplicate suppression that matched the injected duplicate count exactly.
Use it as a baseline only because the dedupe validation also stayed consistent with the configured `standard` preset.
Readers who want the tracked evidence can inspect [test-artifacts/expected-production-3way-mesh-standard-8h-postfix-baseline](../test-artifacts/expected-production-3way-mesh-standard-8h-postfix-baseline).

The matching `heavy-duplicates` `8h` comparison on `2026-06-10` to `2026-06-11` also completed with `PASS` and honored its configured `300s` window, but the comparison did not reveal a meaningful enough improvement to displace `standard` as the baseline for this profile.
The tracked comparison snapshot is available at [test-artifacts/comparison.md](../test-artifacts/comparison.md).

## How To Tune Toward Your Real Requirements

If your system mostly suffers from duplicate retries:

- raise `duplicates.chaoticChance`
- compare `standard` vs `heavy-duplicates`

If your system mostly suffers from lateness:

- raise `lateSpikeChance`
- raise `lateSpikeMaxMs`
- raise `extremeSpikeChance` carefully
- compare `standard` vs `high-latency`

The repo's current `break-the-wire` `8h` comparison is the clearest example of that rule:

- `standard` stayed config-valid but leaked duplicate errors at final drain
- `high-latency` stayed config-valid and removed duplicate leakage completely
- the remaining stress was still mostly late-arrival and backlog pressure

If your system mostly suffers from cross-region dependency load:

- raise cross-node dependency fields
- keep an eye on queue depth and late arrivals together

If your system has a dominant ingress node:

- raise that node’s weight
- watch whether backlog and anomalies concentrate around that node

## Validation Rules To Remember

In practice, these values should stay sane:

- probability-like fields should be between `0` and `1`
- event rates should be positive
- delay ranges should be non-negative and internally sensible

If a profile is partially specified, the runtime merges it with the built-in default profile, so omitted fields still inherit baseline values.

If the runtime rejects a profile, see [operator-errors.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md) for the exact operator-facing error patterns and what to change next.

## Recommended Workflow

1. Build a baseline profile close to expected production.
2. Build one stress profile that exaggerates your main failure mode.
3. Compare presets against both.
4. Treat the baseline as your adoption guide.
5. Treat the stress profile as your operational warning boundary.
