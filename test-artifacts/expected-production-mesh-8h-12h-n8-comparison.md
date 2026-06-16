# `expected-production-mesh` `n=8` `8h` -> `12h` Comparison

Compared runs:

- [8h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-standard-8h-n8-wallclock/summary.json)
- [12h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-mesh-standard-12h-n8-wallclock/summary.json)

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-15T08-57-50Z-expected-production-mesh-standard-8h-n8-wallclock artifacts/runs/2026-06-15T17-13-15Z-expected-production-mesh-standard-12h-n8-wallclock
```

Result:

- `Verdict: PASS -> PASS`
- duplicate leakage: `0/5104 (0.00%) -> 0/7552 (0.00%)`
- late ratio: `4.49% -> 4.19%`
- queue peak: `380 -> 375`
- anomalies: `47411 -> 67799`, with `error=0 -> 0`
- dedupe window: `180s -> 180s`
- dedupe pressure: `noticeable -> noticeable`
- peak RSS: `68.5MB -> 69.0MB`

Reading:

- both runs preserved correctness
- duplicate leakage stayed at zero in both runs
- the `12h` run slightly reduced pressure and backlog
- memory stayed in the same general range
- `n=8` stayed healthy at `12h` and strengthens the single-cluster endurance case for this tested workload shape
