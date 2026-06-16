# `expected-production-mesh` `n=8` `1h` -> `8h` Comparison

Compared runs:

- [1h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-standard-1h-n8-wallclock/summary.json)
- [8h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-standard-8h-n8-wallclock/summary.json)

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-12T14-24-38Z-expected-production-mesh-standard-1h-n8-wallclock artifacts/runs/2026-06-15T08-57-50Z-expected-production-mesh-standard-8h-n8-wallclock
```

Result:

- `Verdict: PASS -> PASS`
- duplicate leakage: `0/634 (0.00%) -> 0/5104 (0.00%)`
- late ratio: `4.17% -> 4.49%`
- queue peak: `338 -> 380`
- anomalies: `5589 -> 47411`, with `error=0 -> 0`
- dedupe window: `180s -> 180s`
- dedupe pressure: `warning -> noticeable`
- peak RSS: `61.5MB -> 68.5MB`

Reading:

- both runs preserved correctness
- duplicate leakage stayed at zero in both runs
- the `8h` run increased pressure and memory cost slightly
- backlog remained controlled in the `8h` run
- `n=8` stayed healthy at `8h` and remains a validated single-cluster endurance checkpoint for this tested workload shape
