# `fault-injection` `n=12` `1h` -> `4h` Comparison

Compared runs:

- [1h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/fault-injection-1h-n12-wallclock/summary.json)
- [4h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/fault-injection-4h-n12-wallclock/summary.json)

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-16T13-13-13Z-fault-injection-1h-n12-wallclock artifacts/runs/2026-06-16T14-30-30Z-fault-injection-4h-n12-wallclock
```

Result:

- `Verdict: PASS WITH STRESS -> PASS WITH STRESS`
- duplicate leakage: `0/1285 (0.00%) -> 0/5085 (0.00%)`
- late ratio: `65.09% -> 66.44%`
- queue peak: `1104 -> 1248`
- anomalies: `71493 -> 291267`, with `error=0 -> 0`
- dedupe window: `480s -> 480s`
- dedupe pressure: `warning -> warning`
- peak RSS: `71.1MB -> 81.1MB`

Reading:

- both runs preserved correctness under the fault-injection profile
- duplicate leakage stayed at zero even as injected duplicate volume rose from `1285` to `5085`
- the `4h` run remained config-valid and completed cleanly, which materially strengthens confidence in the reconnect path after the earlier worker crash fix
- pressure stayed extreme in both runs, with the `4h` run showing only a modest increase in late ratio and queue peak rather than a runaway collapse
- memory increased by about `10MB` over the longer endurance window but remained bounded
- the current operator conclusion for this profile is still `survived but stressed`: correctness is strong, but lateness and backlog pressure remain high enough that this profile should be treated as a resilience boundary rather than a healthy baseline
