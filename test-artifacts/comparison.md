# `8h` Comparison

Compared runs:

- [standard summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-3way-mesh-standard-8h-postfix-baseline/summary.json)
- [heavy-duplicates summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/expected-production-3way-mesh-heavy-duplicates-8h-postfix/summary.json)

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-10T10-06-07Z-expected-production-3way-mesh-standard-8h-postfix-baseline artifacts/runs/2026-06-10T18-12-37Z-expected-production-3way-mesh-heavy-duplicates-8h-postfix
```

Result:

- `Verdict: PASS -> PASS`
- duplicate leakage: `0/7578 (0.00%) -> 0/7656 (0.00%)`
- late ratio: `16.02% -> 15.18%`
- queue peak: `1383 -> 1480`
- anomalies: `223590 -> 214400`, with `error=0 -> 0`
- dedupe window: `180s -> 300s`
- dedupe pressure: `noticeable -> warning`
- peak RSS: `73.0MB -> 74.1MB`

Reading:

- both runs preserved correctness
- `heavy-duplicates` slightly reduced late ratio
- `heavy-duplicates` increased backlog and dedupe pressure
- `standard` remains the cleaner default baseline for this profile
