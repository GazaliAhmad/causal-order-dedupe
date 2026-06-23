# `fault-injection` `n=12` `4h` Original -> `4h` Rejoin-Aware Comparison

Compared runs:

- [original 4h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/fault-injection-4h-n12-wallclock/summary.json)
- [rejoin-aware 4h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/fault-injection-4h-n12-wallclock-rejoin-aware/summary.json)

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-16T14-30-30Z-fault-injection-4h-n12-wallclock artifacts/runs/2026-06-23T03-31-11Z-fault-injection-4h-n12-wallclock-rejoin-aware
```

Result:

- `Verdict: PASS WITH STRESS -> PASS WITH STRESS`
- duplicate leakage: `0/5085 (0.00%) -> 0/5092 (0.00%)`
- late ratio: `66.44% -> 68.00%`
- queue peak: `1248 -> 1241`
- anomalies: `291267 -> 295931`, with `error=0 -> 0`
- dedupe window: `480s -> 480s`
- dedupe pressure: `warning -> warning`
- peak RSS: `81.1MB -> 72.2MB`

Reading:

- both runs preserved the key correctness gates under the hostile profile
- duplicate leakage stayed at zero in both runs
- error-level anomalies stayed at zero in both runs
- the rejoin-aware harness slightly reduced backlog peak and memory pressure, but it did not reduce the late-arrival ratio
- the practical conclusion is that `@causal-order/dedupe` and `causal-order` remained correctness-safe even under this hostile profile
- the hostile profile is therefore better treated as a resilience-boundary profile than as a target for longer `8h` or `12h` wall-clock repetition
- after the rejoin-aware `4h` confirmation, there is no strong evidence that spending more wall-clock time on the same hostile track would answer a higher-value correctness question
