# Test Artifects

This tracked folder contains sanitized snapshots of the two validated `8h` runtime runs used in the repo guides:

- `expected-production-3way-mesh-standard-8h-postfix-baseline`
- `expected-production-3way-mesh-heavy-duplicates-8h-postfix`

Each run folder includes:

- `summary.json`: the machine-readable run summary
- `run-config.json`: the runtime configuration used for the run
- `lifecycle.ndjson`: lifecycle events for collector and node completion
- `anomalies.sample.ndjson`: the first `200` anomaly records from the raw run for inspection without checking in the full multi-megabyte anomaly stream

See [comparison.md](./comparison.md) for the tracked `standard` vs `heavy-duplicates` comparison notes.

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
