# `fault-injection` `n=12` `4h` -> `8h` Comparison

Compared runs:

- [4h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/fault-injection-4h-n12-wallclock/summary.json)
- [8h summary](https://github.com/GazaliAhmad/causal-order-dedupe/blob/main/test-artifacts/fault-injection-8h-n12-wallclock/summary.json)

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-16T14-30-30Z-fault-injection-4h-n12-wallclock artifacts/runs/2026-06-22T15-05-59Z-fault-injection-8h-n12-wallclock
```

Result:

- `Verdict: PASS WITH STRESS -> PASS WITH STRESS`
- duplicate leakage: `0/5085 (0.00%) -> 0/10190 (0.00%)`
- late ratio: `66.44% -> 66.66%`
- queue peak: `1248 -> 1333`
- anomalies: `291267 -> 584946`, with `error=0 -> 0`
- dedupe window: `480s -> 480s`
- dedupe pressure: `warning -> warning`
- peak RSS: `81.1MB -> 74.9MB`

Reading:

- both runs preserved correctness under the fault-injection profile
- duplicate leakage stayed at zero even as injected duplicate volume doubled from `5085` to `10190`
- the `8h` run kept the same extreme late-arrival profile as the `4h` run, so the added duration extended existing stress rather than introducing a new correctness failure mode
- backlog pressure increased modestly in the `8h` run, with queue peak rising from `1248` to `1333`, but it remained in the same general operating band
- the `8h` result strengthens endurance confidence for the reconnect and jitter path: the runtime stayed config-valid, completed cleanly, and held correctness across a longer wall-clock window
- the current operator conclusion for this profile is still `survived but stressed`: correctness remains strong, but this workload should still be treated as a resilience boundary rather than a healthy baseline
