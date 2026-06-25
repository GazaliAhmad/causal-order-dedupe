# `typical-real-world-mesh` `n=12` `12h` Standard -> `cross-node-busy` Comparison

Compared runs:

- standard run: `artifacts/runs/2026-06-24T03-27-00Z-typical-real-world-mesh-standard-12h-n12-wallclock`
- `cross-node-busy` run: `artifacts/runs/2026-06-24T16-04-23Z-typical-real-world-mesh-cross-node-busy-12h-n12-wallclock`

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-24T03-27-00Z-typical-real-world-mesh-standard-12h-n12-wallclock artifacts/runs/2026-06-24T16-04-23Z-typical-real-world-mesh-cross-node-busy-12h-n12-wallclock
```

Result:

- `Verdict: PASS -> PASS`
- duplicate leakage: `0/2496 (0.00%) -> 0/2457 (0.00%)`
- late ratio: `0.00% -> 0.00%`
- queue peak: `472 -> 456`
- anomalies: `1004 -> 1037`, with `error=0 -> 0`
- dedupe window: `288.958s -> 289.747s`
- dedupe pressure: `noticeable -> noticeable`
- peak RSS: `71.1MB -> 66.9MB`

Sanitized run data highlights:

- standard:
  - generated/delivered/ordered: `764218 / 764218 / 764218`
  - duplicates injected/dropped: `2496 / 2496`
  - late anomalies: `15`
  - warning anomalies: `1004`
  - queue peak: `472`
  - peak RSS: `71.1MB`
  - dedupe window: `288.958s`
  - dedupe cache at summary: `5607`
  - dark node `edge-b`: `29` dark windows, `29` reconnects, `472` max pending queue depth
- `cross-node-busy`:
  - generated/delivered/ordered: `761726 / 761726 / 761726`
  - duplicates injected/dropped: `2457 / 2457`
  - late anomalies: `24`
  - warning anomalies: `1037`
  - queue peak: `456`
  - peak RSS: `66.9MB`
  - dedupe window: `289.747s`
  - dedupe cache at summary: `5602`
  - dark node `edge-b`: `29` dark windows, `29` reconnects, `456` max pending queue depth

Reading:

- both runs preserved correctness
- duplicate leakage stayed at zero in both runs
- error-level anomalies stayed at zero in both runs
- the wider `cross-node-busy` floor/max pair did not produce a meaningful correctness improvement
- backlog pressure eased slightly in the `cross-node-busy` run
- peak RSS also eased in the `cross-node-busy` run
- the live active dedupe window ended in nearly the same place in both runs, so the practical behavior difference was small

Important interpretation note:

- this comparison used the same workload profile and topology, but different dedupe presets
- `standard` configures a `180s` floor and `300s` max
- `cross-node-busy` configures a `240s` floor and `480s` max
- despite that wider floor/max pair, the final active window was almost the same in both runs (`288.958s` vs `289.747s`)
- that strongly suggests the wider preset did not materially change the operational outcome for this deployment shape

Current conclusion:

- for this `12h` `n=12` `typical-real-world-mesh` profile, `cross-node-busy` remained healthy and correctness-safe
- it did not produce a meaningful enough win over `standard` to displace `standard` as the cleaner default baseline
- `cross-node-busy` remains a valid more-defensive option, but current evidence does not show it is needed for the tested deployment shape
