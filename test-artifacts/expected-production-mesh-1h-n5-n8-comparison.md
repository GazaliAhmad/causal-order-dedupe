# `expected-production-mesh` `1h` `n=5` -> `n=8` Comparison

Compared runs:

- [n=5 summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-standard-1h-n5-wallclock/summary.json)
- [n=8 summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-standard-1h-n8-wallclock/summary.json)

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-12T13-18-14Z-expected-production-mesh-standard-1h-n5-wallclock artifacts/runs/2026-06-12T14-24-38Z-expected-production-mesh-standard-1h-n8-wallclock
```

Result:

- `Verdict: PASS -> PASS`
- duplicate leakage: `0/684 (0.00%) -> 0/634 (0.00%)`
- late ratio: `6.83% -> 4.17%`
- queue peak: `540 -> 338`
- anomalies: `9478 -> 5589`, with `error=0 -> 0`
- dedupe window: `180s -> 180s`
- dedupe pressure: `warning -> warning`
- peak RSS: `62.2MB -> 61.5MB`

Reading:

- both runs preserved correctness
- duplicate leakage stayed at zero in both runs
- `n=8` reduced late-arrival pressure
- `n=8` reduced backlog pressure
- `n=8` is the stronger single-cluster result of the two for this tested workload shape
