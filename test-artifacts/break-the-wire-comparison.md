# `break-the-wire` `8h` Comparison

Compared runs:

- [standard summary](/abs/path/c:/dev/causal-order-dedupe/test-artifacts/break-the-wire-standard-8h/summary.json)
- [high-latency summary](/abs/path/c:/dev/causal-order-dedupe/test-artifacts/break-the-wire-high-latency-8h-rerun/summary.json)

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-11T02-49-35Z-break-the-wire-standard-8h artifacts/runs/2026-06-12T01-45-30Z-break-the-wire-high-latency-8h-rerun
```

Result:

- `Verdict: PASS WITH STRESS -> PASS WITH STRESS`
- duplicate leakage: `13928/23008 (60.54%) -> 0/23266 (0.00%)`
- late ratio: `61.69% -> 61.27%`
- queue peak: `5132 -> 5155`
- anomalies: `893504 -> 880773`, with `error=7 -> 0`
- dedupe window: `300s -> 480s`
- dedupe pressure: `warning -> warning`
- peak RSS: `63.4MB -> 66.6MB`

Reading:

- `high-latency` removed duplicate leakage and all error-level anomalies
- the correctness gate improved from degraded to strong
- lateness and backlog pressure remained extreme
- `high-latency` is the preferred preset for `break-the-wire`, but the remaining stress is still operational lateness rather than dedupe correctness
