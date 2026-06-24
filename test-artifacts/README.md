# Test Artifacts

This tracked folder contains sanitized snapshots of the long-run runtime evidence currently referenced in the repo guides:

- `expected-production-3way-mesh-standard-8h-postfix-baseline`
- `expected-production-3way-mesh-heavy-duplicates-8h-postfix`
- `break-the-wire-standard-8h`
- `break-the-wire-high-latency-8h-rerun`
- `expected-production-mesh-standard-1h-n5-wallclock`
- `expected-production-mesh-standard-1h-n8-wallclock`
- `expected-production-mesh-standard-8h-n8-wallclock`
- `expected-production-mesh-standard-12h-n8-wallclock`
- `fault-injection-1h-n12-wallclock`
- `fault-injection-4h-n12-wallclock`
- `fault-injection-4h-n12-wallclock-rejoin-aware`
- `fault-injection-8h-n12-wallclock`

Each run folder includes:

- `summary.json`: the machine-readable run summary
- `run-config.json`: the runtime configuration used for the run
- `lifecycle.ndjson`: lifecycle events for collector and node completion
- `anomalies.sample.ndjson`: the first `200` anomaly records from the raw run for inspection without checking in the full multi-megabyte anomaly stream

See [comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/comparison.md) for the tracked `expected-production-3way-mesh` `standard` vs `heavy-duplicates` comparison notes.
See [break-the-wire-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/break-the-wire-comparison.md) for the tracked `break-the-wire` `standard` vs `high-latency` comparison notes.
See [expected-production-mesh-1h-n5-n8-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-1h-n5-n8-comparison.md) for the tracked `expected-production-mesh` `n=5` vs `n=8` wall-clock comparison notes.
See [expected-production-mesh-1h-8h-n8-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-1h-8h-n8-comparison.md) for the tracked `expected-production-mesh` `n=8` `1h` vs `8h` endurance comparison notes.
See [expected-production-mesh-8h-12h-n8-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-8h-12h-n8-comparison.md) for the tracked `expected-production-mesh` `n=8` `8h` vs `12h` endurance comparison notes.
See [typical-real-world-mesh-12h-n12-standard-vs-rejoin-aware-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/typical-real-world-mesh-12h-n12-standard-vs-rejoin-aware-comparison.md) for the tracked `typical-real-world-mesh` `n=12` `12h` standard vs rejoin-aware comparison notes and the floor/max-window interpretation notes for `240s / 480s`.
See [fault-injection-1h-4h-n12-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/fault-injection-1h-4h-n12-comparison.md) for the tracked `fault-injection` `n=12` `1h` vs `4h` resilience comparison notes.
See [fault-injection-4h-original-vs-rejoin-aware-n12-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/fault-injection-4h-original-vs-rejoin-aware-n12-comparison.md) for the tracked `fault-injection` `n=12` `4h` original vs `4h` rejoin-aware comparison notes.
See [fault-injection-4h-8h-n12-comparison.md](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/fault-injection-4h-8h-n12-comparison.md) for the tracked `fault-injection` `n=12` `4h` vs `8h` resilience comparison notes.

For released `1.1.0`, the hostile `expected-production-mesh-dark-jitter` evidence is treated as complete enough to establish the current resilience boundary: `@causal-order/dedupe` and `causal-order` stayed correctness-safe in the tracked `n=12` `4h` runs, while pressure remained intentionally severe. Based on that result, longer `8h` and `12h` repetition on the same hostile track is not part of the current release requirement.

## Safety

These files are derived from synthetic local test runs.
They do not contain production customer data, credentials, or external hostnames.

What they do contain:

- synthetic event ids such as `edge-a-000000001930`
- local relative artifact paths
- timestamps, workload settings, and anomaly telemetry

What is intentionally not checked in here:

- full raw `anomalies.ndjson` streams from `artifacts/runs/`
- heartbeat streams
- full collector and node stdout logs
- absolute machine-specific paths

If future runs include real hostnames, credentials, or customer-linked identifiers, sanitize them before adding anything new to this folder.
