# Building Dedupe Configs

This guide explains how to create a dedupe config JSON file for `@causal-order/dedupe`.

It is the dedupe-config version of the workload-profile guide: choose a shape, save a JSON file under `configs/`, then run the deployment path or repo harness with that file.

Use this when you want to:

- define a preset in a JSON file
- define manual dedupe windows in a JSON file
- keep dedupe behavior separate from workload profiles
- run the local repository harness with `--dedupe-config`
- keep deployment config explicit and reviewable

This is different from workload profiles.

- `profiles/` shapes the workload
- `configs/` shapes the dedupe behavior

If you want to create or edit a workload profile, see [building-workload-profiles.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-workload-profiles.md).

If validation fails, see [operator-errors.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md).

## Where Dedupe Configs Live

In this repo, dedupe config files should live under `configs/`.

Example:

- [configs/dedupe-manual-heavy.json](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/configs/dedupe-manual-heavy.json)

Do not place dedupe config files under `profiles/`.

## Quick Build Flow

1. Decide whether you want a preset or manual window values.
2. Create a JSON file under `configs/`.
3. Start from one of the templates below.
4. Keep the shape small at first.
5. Run the deployment path or repo harness with that file.
6. If validation fails, use [operator-errors.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-errors.md) to correct it.

## Two Valid Shapes

A dedupe config file can use one of two shapes:

- preset-based configuration
- manual window configuration

Choose one or the other.

## Preset-Based Config

Use this when:

- you want the safest starting point
- you want simple operator intent
- you do not want to tune raw timing values first

Example:

```json
{
  "preset": "standard",
  "autoCleanup": true,
  "autoCleanupIntervalSeconds": 30
}
```

Good first filename:

```text
configs/dedupe-standard.json
```

Supported presets:

- `standard`
- `heavy-duplicates`
- `high-latency`
- `cross-node-busy`

## Manual Window Config

Use this when:

- you know the downstream late-arrival horizon
- you want tighter or wider bounds than the presets provide
- you are tuning from observed runtime behavior

Example:

```json
{
  "slidingWindowSeconds": 420,
  "maxSlidingWindowSeconds": 840,
  "autoCleanup": true,
  "autoCleanupIntervalSeconds": 30
}
```

Good first filename:

```text
configs/dedupe-manual-heavy.json
```

## Minimum Fields

### For preset-based config

Required:

- `preset`

Optional:

- `autoCleanup`
- `autoCleanupIntervalSeconds`

### For manual config

Required:

- `slidingWindowSeconds`
- `maxSlidingWindowSeconds`

Optional:

- `autoCleanup`
- `autoCleanupIntervalSeconds`

## Which Fields Actually Need To Be Present

Not every valid config needs to spell out every field.

`autoCleanup` and `autoCleanupIntervalSeconds` are optional because the runtime already defaults them to:

- `autoCleanup: true`
- `autoCleanupIntervalSeconds: 30`

That means this:

```json
{
  "slidingWindowSeconds": 420,
  "maxSlidingWindowSeconds": 840
}
```

and this:

```json
{
  "slidingWindowSeconds": 420,
  "maxSlidingWindowSeconds": 840,
  "autoCleanup": true,
  "autoCleanupIntervalSeconds": 30
}
```

mean the same thing operationally.

Include the optional fields when you want the file to be explicit and easy to review. Omit them when you want the smallest clean config.

## Valid Does Not Always Mean Safe As A Starting Point

A config can be valid JSON and still not be the best first setting for most operators.

For example:

```json
{
  "slidingWindowSeconds": 420,
  "maxSlidingWindowSeconds": 840,
  "autoCleanup": true,
  "autoCleanupIntervalSeconds": 30
}
```

is a valid manual config, but it is not a universal default.

What it means:

- the dedupe layer remembers accepted event identities for a wider period than the default path
- it can help when duplicates arrive late or replay bursts are long
- it also retains identities longer, so it should be chosen deliberately

If you are unsure, do not start with `420 / 840` just because it is valid.

Safer first choices:

- `{"preset":"standard"}` for a general starting point
- `{"preset":"heavy-duplicates"}` when duplicate pressure is a more obvious concern

For the repo's validated `expected-production-3way-mesh` `8h` wall-clock runs on `2026-06-10` to `2026-06-11`, `standard` remains the trustworthy starting point.
The matching `heavy-duplicates` comparison also stayed healthy and honored its `300s` floor, but it did not improve duplicate leakage and it raised backlog and dedupe pressure enough that it still does not replace `standard` as the cleaner default for that profile.
If you want to inspect the tracked evidence behind that conclusion, see [test-artifects/comparison.md](../test-artifects/comparison.md) and the paired run snapshots under [test-artifects](../test-artifects).

Use a wider manual pair like `420 / 840` when:

- you already tested the presets
- you know your late-arrival horizon is larger
- you are tuning against observed runtime reports

## Validation Rules To Remember

These rules are enforced:

- choose either `preset` or manual window values
- do not mix `preset` with `slidingWindowSeconds` / `maxSlidingWindowSeconds`
- if you use manual values, provide both window fields
- `slidingWindowSeconds` must be less than or equal to `maxSlidingWindowSeconds`
- numeric values must be positive and finite
- `autoCleanup` must be a boolean
- unknown fields are rejected

## Good Starting Patterns

### Start simple

```json
{
  "preset": "standard"
}
```

Save it as something like:

```text
configs/dedupe-standard.json
```

### Retry-heavy environment

```json
{
  "preset": "heavy-duplicates"
}
```

### Manual wider window for repo testing

```json
{
  "slidingWindowSeconds": 420,
  "maxSlidingWindowSeconds": 840,
  "autoCleanup": true,
  "autoCleanupIntervalSeconds": 30
}
```

This is the same shape used by:

- [configs/dedupe-manual-heavy.json](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/configs/dedupe-manual-heavy.json)

## How To Create a New Config

1. Decide whether you want a preset or manual window values.
2. Create a JSON file under `configs/`.
3. Start with the smallest valid shape.
4. If you are unsure, use a preset file first.
5. Add `autoCleanup` or `autoCleanupIntervalSeconds` only when you need them explicit.
6. Run a short repo test or deployment smoke test.
7. If validation fails, correct the config before wider use.

## How To Use It

### In your own code

```js
import { createDedupeGatewayFromConfigFile } from "@causal-order/dedupe";

const dedupe = createDedupeGatewayFromConfigFile("./configs/dedupe-manual-heavy.json");
```

### In the local repo harness

```bash
npm run test:runtime -- --duration 10m --profile-file profiles/expected-production-3way-mesh.json --dedupe-config configs/dedupe-manual-heavy.json --run-name expected-production-3way-mesh-manual-420-840-10m-wallclock
```

If you want a faster first check, use a short simulated run:

```bash
npm run test:runtime -- --duration 5m --profile-file profiles/expected-production-3way-mesh.json --dedupe-config configs/dedupe-manual-heavy.json --time-scale 60 --run-name expected-production-3way-mesh-manual-420-840-5m
```

Then inspect:

```bash
npm run summary:latest
```

```bash
npm run summary:report
```

## How To Think About Manual Window Size

`slidingWindowSeconds` is how long the dedupe layer remembers an accepted event identity.

`maxSlidingWindowSeconds` is the ceiling for later expansion through `updateWindow(seconds)`.

Practical rule:

- start at or above the downstream engine horizon
- leave buffer for cleanup cadence
- leave buffer for network jitter
- leave buffer for delayed replay bursts

If you widen the window too little, duplicates may leak.

If you widen the window too aggressively, you may retain identities longer than needed without actually fixing the real workload issue.

## Recommended Workflow

1. Start with a preset.
2. Compare repo results across presets first.
3. If a heavier preset regresses correctness or overall verdict, move to a manual config instead of assuming a larger preset window is automatically safer.
4. Keep the config in `configs/`.
5. Keep workload shape in `profiles/`.
