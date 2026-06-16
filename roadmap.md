# Roadmap

This roadmap is specifically for `@causal-order/dedupe`.

It focuses on operator ease of use first.

The goal is to make `@causal-order/dedupe` easy to deploy without forcing operators to tune low-level timing values up front. Most users should be able to start with a sensible preset, then move to heavier or more latency-tolerant behavior only when needed.

## Principles

- Prefer safe defaults over mandatory tuning.
- Let operators choose intent-driven presets instead of raw timing values where possible.
- Keep advanced manual configuration available for teams that need finer control.
- Expose enough runtime visibility for operators to validate behavior in production.
- Align local test harness profiles with operator-facing package concepts over time.

## Current Status

- Version `1.0.8` is complete and published to npm as the current release line.
- `v1.0.8` delivered:
  - preserved the validated `3`-node path as the default baseline
  - added an opt-in topology configuration path for larger single-cluster runs
  - validated `n=5`, then `n=8`
  - included npm keyword/discoverability metadata in the published manifest
- Completed and already available from the published `1.0.8` line:
  - first-class preset support exists in `DedupeGateway`
  - default mode behaves as `standard`
  - config-file driven setup now exists for dedupe configuration
  - repo testing now keeps workload profiles under `profiles/` and manual dedupe config examples under `configs/`
  - runtime profile tests can select a dedupe preset or a dedupe config file
  - operator guides now cover tuning, workload-profile construction, and operator-facing error handling
  - drop-in safeguards now include validation, automatic cleanup by default, and clear operator-facing configuration errors
  - repo-side run comparison now includes a reusable `summary:compare` command
  - lightweight runtime stats now exist through `DedupeGateway#getStats()`
  - fresh deployment-style runtime artifacts now persist dedupe stats
  - duplicate-leak diagnostics now persist in fresh deployment-style runtime artifacts
  - repo-side duplicate inspection now includes a reusable `summary:duplicates` command
- Current repo-side operator workflow also includes:
  - a three-way equilibrium model for reading runs through correctness, pressure, and backlog together
  - lightweight package-facing runtime stats through `DedupeGateway#getStats()`
  - persisted dedupe stats in fresh deployment-style runtime artifacts and reports
  - persisted duplicate-leak diagnostics with timing and active-window context for leak inspection
  - config-adherence checks that can invalidate a run when the live dedupe behavior drifts below the configured floor
  - wall-clock runtime results should be treated as baseline-worthy only when they come from the fixed dedupe implementation
  - tracked sanitized inspection snapshots under `test-artifacts/` for the validated `8h` mesh baseline and comparison
  - a now-validated `expected-production-3way-mesh` operator conclusion: `standard` is the cleaner default baseline, `heavy-duplicates` is a situational alternate, and manual tuning is fallback-only rather than the expected next step for that profile

---
## *History*

## v1.0.4

- Completed first-class preset support in `DedupeGateway`.
- Completed one consistent preset set: `standard`, `heavy-duplicates`, `high-latency`, and `cross-node-busy`.
- Completed the default-mode contract:
  - default mode remains easy to adopt with minimal configuration
  - default mode is `standard`
  - named presets are the guided operator path
  - manual raw timing values remain the custom path
  - no literal `custom` preset name was added
  - no-preset behavior matches `standard`
  - existing raw timing options remain available
- Completed `standard` compatibility with the current default behavior:
  - `slidingWindowSeconds = 180`
  - `maxSlidingWindowSeconds = 300`
- Completed operator documentation for preset guidance, tradeoffs, and window sizing against the downstream engine horizon.
- Completed preset tests for resolution, default behavior, manual configuration, and invalid preset names.
- Extended the implementation with runtime profile selection through `--dedupe-preset`.
- Extended the implementation with automatic cleanup by default for drop-in use.
- Extended the implementation with clear constructor validation for invalid raw timing configuration.

## v1.0.5

Released scope:

- Completed config-file driven setup using JSON helpers that load and validate dedupe options.
- Completed operator choice between:
  - a preset name like `standard`
  - explicit values such as `slidingWindowSeconds` and `maxSlidingWindowSeconds`
- Completed clear validation errors for invalid, partial, unknown, or conflicting configuration.
- Completed a clearer repo-testing separation between workload profiles in `profiles/` and manual dedupe config examples in `configs/`.
- Completed stricter workload-profile validation for invalid ranges, unsupported fields, and inconsistent probability settings.
- Completed a dedicated runtime-config contract path for validation failures across dedupe config and workload profiles.
- Completed operator-facing error documentation under `guides/` so validation failures are easier to diagnose in practice.
- Completed package-facing deployment and dedupe-config authoring guides so setup is documented separately from repo workload testing.
- Completed baseline project docs for compatibility, security, and code-of-conduct expectations.

## v1.0.6

- Completed lightweight runtime stats so operators can evaluate whether a chosen preset is working well.
- Exposed stats:
  - accepted events
  - dropped duplicates
  - current cache size
  - active dedupe window
- Completed a public snapshot API through `DedupeGateway#getStats()`.
- Completed README and deployment-guide coverage for interpreting these metrics in practice.
- Completed runtime artifact persistence for fresh deployment-style runs:
  - `summary.json` now includes a `dedupe` section
  - `heartbeats.ndjson` now includes per-snapshot dedupe stats
  - `summary:report` now prints dedupe stats directly
- These metrics now support safer tuning rather than guesswork.
- Fixed runtime config-adherence so the active dedupe window now respects the configured floor and the runtime harness now honors cleanup settings from config files.
- Established that published versions `1.0.1` through `1.0.5` are flawed for config-faithful runtime tuning and should be deprecated in npm.
- Separately, version `1.0.0` was published and immediately deprecated because `LICENSE.md` was accidentally excluded from the npm package, and version `1.0.3` was never published to npm.
- Future wall-clock baseline and comparison results should be written only from the fixed dedupe line.
- Completed package-facing equilibrium framing in deployment guidance as a lightweight interpretation aid.
- Repo-side operator guidance continues to treat run evaluation as a three-way equilibrium:
  - correctness
  - pressure
  - backlog
- Completed config-valid `8h` wall-clock validation for `expected-production-3way-mesh` with both `standard` and `heavy-duplicates`.
- Completed a trustworthy mesh baseline conclusion:
  - `standard` remains the cleaner default baseline
  - `heavy-duplicates` is healthy, but not a meaningful enough win to replace `standard`
  - manual raw tuning is not required for that profile from current evidence
- Completed tracked sanitized evidence snapshots under `test-artifacts/` so readers can inspect the `8h` baseline and comparison without checking in full raw local run directories.

## v1.0.7

- Completed the next operator-visibility step without introducing a new tuning model.
- Published `v1.0.7` to npm as the current release line.
- Kept the release aligned with the roadmap principle to expose enough runtime visibility for operators to validate behavior in production.
- Completed duplicate-leak diagnostics for fresh deployment-style runtime runs.
- Persisted `duplicate-leaks.ndjson` beside the other run artifacts.
- Captured first-seen and repeated-seen timing for leaked duplicate IDs.
- Captured arrival-gap and active-window context so operators can judge whether a replay likely outran the live dedupe window.
- Completed a dedicated `summary:duplicates` helper for readable duplicate-leak inspection.
- Made older pre-instrumentation runs report that diagnostics are unavailable instead of implying a clean “no leaks” result.
- This release stays intentionally diagnostic-first:
- it improves operator evidence for duplicate leakage under stress
- it does not yet change the underlying dedupe or final-drain behavior
- Completed validation for this scope through fresh duplicate-leak instrumentation and inspection workflows rather than a new tuning contract.

## v1.0.8

- Completed the topology-validation release for the existing single-cluster runtime harness.
- Completed primary release goals:
  - preserved the validated `3`-node path as the default baseline
  - added an opt-in topology configuration path so larger single-cluster runs can be exercised without hardcoding new node counts into the default runtime flow
- Completed required scope:
  - kept the current `3`-node default behavior unchanged
  - supported opt-in single-cluster node-topology selection through configuration rather than repeated code edits
  - used the new path to validate `n=5`, then `n=8`
  - made the topology model extensible enough for later arbitrary `n` rather than only special-casing `5` and `8`
- Completed packaging scope:
  - included the npm metadata improvement for package discoverability in the same release
  - preserved published-manifest alignment so package keywords survive the publish-dist flow
- Completed evidence trail:
  - validated `1h` `n=5 -> n=8` comparison evidence
  - validated `8h` `n=8` endurance evidence
  - preserved tracked operator evidence under `test-artifacts/`

## v1.1.0

- Treat this as the first operator-ready milestone for `@causal-order/dedupe`.
- Expected scope:
  - named presets are in place
  - config-file driven setup is available
  - basic runtime stats are exposed
  - duplicate-leak diagnostics are available for fresh runtime runs
  - the operator workflow is documented clearly in the README
- The intent of `v1.1.0` is to mark the point where the package feels like an operational product, not just a low-level dedupe helper.

## Longer Term

- Bring the local `profiles/` harness and operator-facing package presets closer together so testing language matches deployment language.
- Publish a short operator guide for choosing presets in practice.
- Revisit preset defaults once real-world deployment data becomes available.
- Keep manual raw timing as an escape hatch, but continue to prefer config-valid preset outcomes over hand-tuned windows when the validated workload evidence is already clean.
- Explore a dedicated website project for `@causal-order/dedupe` once the package surface and operator story have settled.
- Use an initial website stack built around:
  - `Astro` for the site shell and static-first routing
  - existing repo Markdown under `guides/` as the guides content source
  - existing repo evidence under `test-artifacts/` as the artifacts and scenario source
  - plain `Markdown` first, with `MDX` only if specific pages later need embedded live components
  - `React` only for selective interactive islands such as simulators, inspectors, or comparison views
  - `Tailwind CSS` or an equally light custom styling layer rather than a heavy UI framework
  - `Cloudflare Pages` as the initial deployment target
- Keep the website content model source-of-truth in this repo instead of duplicating docs into a second content tree:
  - render `guides/` directly as the guides section
  - reuse `test-artifacts/` directly for evidence, comparisons, and scenario pages
- Favor a custom `Astro` site over a generic docs shell so the package can have a more distinctive visual identity than the current common landing-page patterns.
- Treat interactive pieces as focused islands instead of turning the whole site into a heavy app:
  - keep most pages static
  - add small client-side components later for timelines, topology views, scenario inspectors, or artifact comparison widgets
- Prefer an interactive visual simulator over a hosted terminal-first experience:
  - simulate event ordering, duplicates, late arrivals, and replay behavior in the browser
  - use simulated time by default so long-duration scenarios can be explored quickly
  - keep the initial site Cloudflare-friendly by avoiding unnecessary server-side terminal infrastructure
