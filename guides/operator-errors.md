# Operator Error Guide

This guide explains the configuration and profile validation errors that an operator is most likely to see when using `@causal-order/dedupe`.

There are two separate concerns:

- deployment errors for package-level dedupe configuration
- repo testing errors for the local runtime harness and workload profiles

The intent is simple:

- show the kind of error text you will see
- explain what it means operationally
- show the fix to make next

## Error Format

Runtime command failures are shown as plain operator-facing text:

```text
Error: ...
```

Examples:

```text
Error: Invalid dedupe config: slidingWindowSeconds cannot be greater than maxSlidingWindowSeconds
```

```text
Error: Invalid dedupe config file C:\path\dedupe.json: choose either "preset" or explicit "slidingWindowSeconds" and "maxSlidingWindowSeconds", not both
```

```text
Error: Invalid workload profile C:\path\profile.json: unknown field "unexpectedTopLevel"
```

## Deployment Errors

These are package-level dedupe config errors.

## Dedupe Config Errors

These errors apply to:

- `new DedupeGateway(...)`
- `loadDedupeGatewayConfigFile(...)`
- `createDedupeGatewayFromConfigFile(...)`
- `npm run test:runtime -- --dedupe-config ...`

### Window larger than max window

Example:

```text
Error: Invalid dedupe config: slidingWindowSeconds cannot be greater than maxSlidingWindowSeconds
```

Meaning:

- the active dedupe window is larger than the allowed maximum

Fix:

- lower `slidingWindowSeconds`
- or raise `maxSlidingWindowSeconds`
- make sure the first value is less than or equal to the second

Good:

```json
{
  "slidingWindowSeconds": 180,
  "maxSlidingWindowSeconds": 300
}
```

Bad:

```json
{
  "slidingWindowSeconds": 300,
  "maxSlidingWindowSeconds": 180
}
```

### Preset and manual values mixed together

Example:

```text
Error: Invalid dedupe config file C:\path\dedupe.json: choose either "preset" or explicit "slidingWindowSeconds" and "maxSlidingWindowSeconds", not both
```

Meaning:

- the config file is trying to use two different modes at once

Fix:

- use only `preset`
- or remove `preset` and provide both manual window fields

Preset-only:

```json
{
  "preset": "standard"
}
```

Manual-only:

```json
{
  "slidingWindowSeconds": 210,
  "maxSlidingWindowSeconds": 420
}
```

### Partial manual window config

Example:

```text
Error: Invalid dedupe config file C:\path\dedupe.json: explicit window config requires both "slidingWindowSeconds" and "maxSlidingWindowSeconds"
```

Meaning:

- only one of the two manual window fields was provided

Fix:

- set both values together

### Unsupported preset name

Example:

```text
Error: Invalid dedupe config: unsupported preset "aggressive"
```

Meaning:

- the preset name is not one of the supported built-in presets

Fix:

- use one of:
  - `standard`
  - `heavy-duplicates`
  - `high-latency`
  - `cross-node-busy`

### Unknown config field

Example:

```text
Error: Invalid dedupe config file C:\path\dedupe.json: unknown field "cleanupMode"
```

Meaning:

- the JSON file contains a field the loader does not understand

Fix:

- remove the field
- or rename it to a supported field

Supported config file fields are:

- `preset`
- `slidingWindowSeconds`
- `maxSlidingWindowSeconds`
- `autoCleanup`
- `autoCleanupIntervalSeconds`

### Invalid number value

Examples:

```text
Error: Invalid dedupe config: slidingWindowSeconds must be a positive finite number
```

```text
Error: Invalid dedupe config: autoCleanupIntervalSeconds must be a positive finite number
```

Meaning:

- a numeric setting is zero, negative, not a real number, or not usable

Fix:

- use a positive numeric value such as `180` or `30`

## Repo Testing Errors

These are local harness and workload-profile errors.

## Workload Profile Errors

These errors apply to:

- `npm run test:runtime -- --profile ...`
- `npm run test:runtime -- --profile-file ...`

Profiles are merged with the built-in default profile, but provided fields still have to be valid.

### Unknown top-level field

Example:

```text
Error: Invalid workload profile C:\path\profile.json: unknown field "unexpectedTopLevel"
```

Meaning:

- the profile root contains a field that is not part of the supported shape

Fix:

- remove the field
- or move the value into the correct supported section

Supported top-level sections are:

- `name`
- `description`
- `nodeWeights`
- `phaseRates`
- `dependencies`
- `duplicates`
- `ordering`
- `delays`

### Unknown nested field

Example:

```text
Error: Invalid workload profile C:\path\profile.json: unknown field "madeUpField" under "phaseRates"
```

Meaning:

- a known section exists, but it contains an unsupported key

Fix:

- remove the field
- compare against [building-workload-profiles.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-workload-profiles.md)

### Probability value outside `0..1`

Example:

```text
Error: Invalid workload profile C:\path\profile.json: "duplicates.chaoticChance" must be between 0 and 1
```

Meaning:

- a probability-like field is too small or too large

Fix:

- use values between `0` and `1`

Common fields in this category include:

- dependency chance fields
- duplicate chance fields
- ordering preservation fields
- spike chance fields

### Probability sum too large

Example:

```text
Error: Invalid workload profile C:\path\profile.json: "dependencies.steadySameNodeChance" + "dependencies.steadyCrossNodeChance" cannot be greater than 1
```

Meaning:

- the profile says too many dependency choices should happen at once during the
same phase

Fix:

- lower one or both values until the sum is at most `1`

### Min delay greater than max delay

Example:

```text
Error: Invalid workload profile C:\path\profile.json: "delays.steady.baseMinMs" cannot be greater than "delays.steady.baseMaxMs"
```

Meaning:

- a range is inverted

Fix:

- make sure every `Min` field is less than or equal to the matching `Max` field

This also applies to:

- `phaseRates.chaosJitterMin` / `phaseRates.chaosJitterMax`
- `delays.steady.spikeMinMs` / `delays.steady.spikeMaxMs`
- `delays.chaotic.slowSpikeMinMs` / `delays.chaotic.slowSpikeMaxMs`
- `delays.chaotic.lateSpikeMinMs` / `delays.chaotic.lateSpikeMaxMs`
- `delays.chaotic.extremeSpikeMinMs` / `delays.chaotic.extremeSpikeMaxMs`

### Invalid positive numeric field

Examples:

```text
Error: Invalid workload profile C:\path\profile.json: "phaseRates.steadyEventsPerSecond" must be a positive finite number
```

```text
Error: Invalid workload profile C:\path\profile.json: "nodeWeights.edge-a" must be a positive finite number
```

Meaning:

- a field that must be positive is zero, negative, or not numeric

Fix:

- use a positive numeric value

### Invalid non-negative delay field

Example:

```text
Error: Invalid workload profile C:\path\profile.json: "delays.chaotic.baseMinMs" must be a non-negative finite number
```

Meaning:

- a delay field is negative or invalid

Fix:

- use `0` or a larger numeric value

## Read Errors

### Config file cannot be read

Example:

```text
Error: Unable to read dedupe config file C:\path\dedupe.json: ENOENT: no such file or directory
```

Meaning:

- the file path is wrong
- the file does not exist
- or the JSON cannot be parsed

Fix:

- verify the path
- verify the file exists
- verify the JSON syntax is valid

### Workload profile cannot be read

Example:

```text
Error: Unable to read workload profile C:\path\profile.json: Unexpected token ...
```

Meaning:

- the file could not be opened or parsed as JSON

Fix:

- fix the file path
- or fix the JSON syntax

## Safe Operator Checklist

When a config or profile fails, check in this order:

1. Is the file path correct?
2. Is the file valid JSON?
3. Are you mixing preset mode and manual window mode?
4. Are all required paired fields present together?
5. Are all probabilities between `0` and `1`?
6. Are all `Min` values less than or equal to their matching `Max` values?
7. Did you add any field names the loader does not support?

## Related Guides

- [Deployment Guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/deployment.md)
- [Repo Testing Guide](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/operator-tuning.md)
- [Building Workload Profiles](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/guides/building-workload-profiles.md)
