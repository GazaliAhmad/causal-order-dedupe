# Deployment Guide

This guide is for teams using `@causal-order/dedupe` in their own application deployment.

Use this guide when you want to:

- add `DedupeGateway` to your runtime
- choose a preset or manual window for production
- use a JSON config file in your own service
- diagnose package-level dedupe config errors

If you want to run the local repository harness with workload profiles, that is a different concern. See [operator-tuning.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-tuning.md) and [building-workload-profiles.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-workload-profiles.md).

If you hit a dedupe config validation error, see [operator-errors.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md).

If you want a step-by-step guide for authoring the JSON file itself, see [building-dedupe-configs.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-dedupe-configs.md).

## Start Here

Most deployments should start with a preset.

Simple code path:

```js
import { DedupeGateway } from "@causal-order/dedupe";

const dedupe = new DedupeGateway({
  preset: "standard",
});
```

Simple config-file path:

```js
import { createDedupeGatewayFromConfigFile } from "@causal-order/dedupe";

const dedupe = createDedupeGatewayFromConfigFile("./dedupe-gateway.json");
```

Example config file:

```json
{
  "preset": "standard",
  "autoCleanup": true,
  "autoCleanupIntervalSeconds": 30
}
```

Those optional cleanup fields are already the runtime defaults, so they do not have to be present unless you want the file to be explicit:

- `autoCleanup` defaults to `true`
- `autoCleanupIntervalSeconds` defaults to `30`

In this repo, manual dedupe config examples can live under `configs/` to keep them separate from workload profiles under `profiles/`.

## Two Deployment Paths

There are two valid ways to configure dedupe in deployment:

- preset-based configuration
- manual window configuration

Choose one or the other.

### Preset-based configuration

Use this when:

- you want the safest adoption path
- you do not want to tune raw timing values first
- your system is reasonably close to a known operating shape

Supported presets:

- `standard`
- `heavy-duplicates`
- `high-latency`
- `cross-node-busy`

### Manual window configuration

Use this when:

- you know your downstream late-arrival horizon
- you want tighter or wider bounds than the presets provide
- you are tuning from observed production behavior

Example:

```json
{
  "slidingWindowSeconds": 210,
  "maxSlidingWindowSeconds": 420,
  "autoCleanup": true
}
```

When using manual values, set both:

- `slidingWindowSeconds`
- `maxSlidingWindowSeconds`

Keep in mind that a manual pair can be valid without being the safest first deployment setting.

For example, a wider manual config such as:

```json
{
  "slidingWindowSeconds": 420,
  "maxSlidingWindowSeconds": 840
}
```

is valid, but it should be treated as an intentional tuned choice rather than a universal default.

## Picking a Starting Setting

Use `standard` when:

- the environment is fairly normal
- you want the default guided path
- you want a conservative starting point

Use `heavy-duplicates` when:

- repeated deliveries are common
- retries or replay bursts are expected
- duplicate suppression matters more than keeping the cache smaller

Use `high-latency` when:

- the network regularly delivers events late
- long tails are normal
- you need a wider memory window than `standard`

Use `cross-node-busy` when:

- there is heavy cross-node coordination
- dependencies often span nodes
- the system is busy without necessarily being the most latency-heavy case

If you are unsure, prefer a preset over a manual window pair. Presets are the safer starting path for most deployments because they communicate operator intent more clearly and avoid premature tuning.

## How To Think About Window Size

`slidingWindowSeconds` is how long the dedupe layer remembers an accepted event identity.

`maxSlidingWindowSeconds` is the ceiling for later expansion through `updateWindow(seconds)`.

If the downstream `causal-order` engine is working with roughly a `90s` late-arrival horizon, dedupe windows below `90s` are usually risky because a duplicate can fall out of the dedupe cache before the ordering engine is done considering that time range.

Practical rule:

- start at or above the engine horizon
- leave buffer for cleanup cadence
- leave buffer for transport jitter
- leave buffer for delayed replay bursts

## Deployment Validation Rules

For dedupe config, the important rules are:

- choose either `preset` or manual window values
- if using manual values, provide both `slidingWindowSeconds` and `maxSlidingWindowSeconds`
- `slidingWindowSeconds` must be less than or equal to `maxSlidingWindowSeconds`
- numeric values must be positive and finite
- unknown config fields are rejected

Example bad config:

```json
{
  "preset": "standard",
  "slidingWindowSeconds": 180,
  "maxSlidingWindowSeconds": 300
}
```

This fails because it mixes the preset path and the manual path.

## Recommended Deployment Workflow

1. Start with `standard`.
2. Use a JSON config file if you want the setting to be explicit and reviewable.
3. Move to `heavy-duplicates` or `high-latency` only when traffic behavior justifies it.
4. Use manual windows only when you know why the presets are not enough.
5. If validation fails, use [operator-errors.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md) to correct the config before rollout.
