# `typical-real-world-mesh` `n=12` `12h` Rejoin-Aware -> Standard Comparison

Compared runs:

- rejoin-aware run: `artifacts/runs/2026-06-23T15-16-05Z-typical-real-world-mesh-standard-12h-n12-wallclock-rejoin-aware`
- standard run: `artifacts/runs/2026-06-24T03-27-00Z-typical-real-world-mesh-standard-12h-n12-wallclock`

Source compare command:

```powershell
npm run summary:compare -- artifacts/runs/2026-06-23T15-16-05Z-typical-real-world-mesh-standard-12h-n12-wallclock-rejoin-aware artifacts/runs/2026-06-24T03-27-00Z-typical-real-world-mesh-standard-12h-n12-wallclock
```

Result:

- `Verdict: PASS -> PASS`
- duplicate leakage: `0/2427 (0.00%) -> 0/2496 (0.00%)`
- late ratio: `0.76% -> 0.00%`
- queue peak: `446 -> 472`
- anomalies: `6853 -> 1004`, with `error=0 -> 0`
- dedupe window: `180s -> 288.958s`
- dedupe pressure: `noticeable -> noticeable`
- peak RSS: `68.6MB -> 71.1MB`

Sanitized run data highlights:

- rejoin-aware:
  - generated/delivered/ordered: `761370 / 761370 / 761370`
  - duplicates injected/dropped: `2427 / 2427`
  - late anomalies: `5804`
  - warning anomalies: `6853`
  - queue peak: `446`
  - peak RSS: `68.6MB`
  - dedupe window: `180s`
  - dark node `edge-b`: `29` dark windows, `29` reconnects, `446` max pending queue depth
- standard:
  - generated/delivered/ordered: `764218 / 764218 / 764218`
  - duplicates injected/dropped: `2496 / 2496`
  - late anomalies: `15`
  - warning anomalies: `1004`
  - queue peak: `472`
  - peak RSS: `71.1MB`
  - dedupe window: `288.958s`
  - dark node `edge-b`: `29` dark windows, `29` reconnects, `472` max pending queue depth

Reading:

- both runs preserved the main correctness gates
- duplicate leakage stayed at zero in both runs
- error-level anomalies stayed at zero in both runs
- the standard harness reduced late-arrival pressure sharply in this comparison
- the standard harness carried slightly higher backlog and memory pressure
- the rejoin-aware harness did not produce a strong enough overall win to justify another reconnect-specific infrastructure layer from this evidence alone

Important interpretation note:

- this was not a like-for-like final-window comparison
- both runs used the `standard` preset, which configures a `180s` floor and `300s` max
- the rejoin-aware run finished at the configured floor (`180s`)
- the standard run finished higher inside the allowed range (`288.958s`)
- some of the observed pressure difference is therefore tied to the live active dedupe window, not only to the harness shape

## What A `240s / 480s` Floor-Max Pair Would Likely Change

This section is an inference from the current runs, not a completed measured rerun.

If the configured dedupe floor were `240s` with a `480s` max:

- the baseline landing point after recovery would be more conservative than `180s`
- the runtime would have more room to absorb replay-tail duplicates before identities aged out
- memory and cache retention would likely stay somewhat higher than the current `standard` preset baseline
- a reconnect-polish idea that shrinks back to the configured floor would mean:
  - shrink back to `240s`, not to a hardcoded `180s`
  - keep the logic config-aware rather than preset-specific

Operational reading for `240s / 480s`:

- this wider configured floor would likely make reconnect recovery feel safer without any extra code
- it would also reduce the urgency of a special post-catch-up shrink tweak, because the normal floor is already more forgiving
- any future adaptive shrink should therefore be described as:
  - expand above the configured floor during reconnect pressure
  - shrink back to the configured floor after catch-up plus a short quiet period

Current conclusion:

- for this `12h` `n=12` typical real-world mesh profile, `@causal-order/dedupe` already looked deployable and correctness-safe in both harness shapes
- the remaining question is package polish, not package rescue
- a `240s / 480s` deployment choice may already provide enough operational cushion that no reconnect-specific dedupe tweak is needed
