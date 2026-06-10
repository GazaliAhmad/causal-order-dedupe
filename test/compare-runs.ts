import { readFile } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const RUNS_DIR = resolve("artifacts/runs");

type JsonRecord = Record<string, any>;

interface RunMetrics {
  name: string;
  runDir: string;
  status: string;
  assessment: string;
  verdict: string;
  profileName: string;
  model: string;
  dedupeLabel: string;
  generated: number;
  delivered: number;
  ordered: number;
  duplicatesInjected: number;
  duplicateLeakage: number;
  duplicateLeakageRatio: number | null;
  anomalies: number;
  late: number;
  lateRatio: number;
  warnings: number;
  errors: number;
  maxQueue: number;
  wallElapsedMs: number;
  peakRssMb: number | null;
  lastRssMb: number | null;
}

function main(): void {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }

  const pathArgs = process.argv.slice(2).filter((token) => token !== "--help");

  resolveSummaryPaths(pathArgs)
    .then(async ([leftPath, rightPath]) => {
      const [left, right] = await Promise.all([
        loadRunMetrics(leftPath),
        loadRunMetrics(rightPath),
      ]);
      console.log(buildComparisonReport(left, right));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

function printHelp(): void {
  console.log("usage: compare-runs.ts [left] [right]");
  console.log("");
  console.log("Compare two run directories or summary.json files.");
  console.log("If no paths are provided, compares the two most recent runs.");
  console.log("");
  console.log("positional arguments:");
  console.log("  left        Optional path to a run directory or summary.json.");
  console.log("  right       Optional path to a run directory or summary.json.");
}

async function resolveSummaryPaths(pathArgs: string[]): Promise<[string, string]> {
  if (pathArgs.length === 0) {
    const latest = findLatestRuns(RUNS_DIR, 2);
    if (latest.length < 2) {
      throw new Error(`Need at least two run folders with summary.json under ${RUNS_DIR}`);
    }
    return [resolve(latest[1], "summary.json"), resolve(latest[0], "summary.json")];
  }

  if (pathArgs.length !== 2) {
    throw new Error("Provide zero paths or exactly two paths. See --help for usage.");
  }

  return [resolveSummaryPath(pathArgs[0]), resolveSummaryPath(pathArgs[1])];
}

function resolveSummaryPath(pathArg: string): string {
  const path = resolve(pathArg);
  const summaryPath = path.endsWith(".json") ? path : resolve(path, "summary.json");

  if (!existsSync(summaryPath)) {
    throw new Error(`Summary file not found: ${summaryPath}`);
  }

  return summaryPath;
}

function findLatestRuns(runsDir: string, count: number): string[] {
  if (!existsSync(runsDir)) {
    return [];
  }

  const candidates: Array<{ modifiedMs: number; path: string }> = [];
  for (const entry of readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const path = resolve(runsDir, entry.name);
    const summaryPath = resolve(path, "summary.json");
    if (!existsSync(summaryPath)) {
      continue;
    }

    candidates.push({
      modifiedMs: statSync(summaryPath).mtimeMs,
      path,
    });
  }

  candidates.sort((left, right) => right.modifiedMs - left.modifiedMs);
  return candidates.slice(0, count).map((entry) => entry.path);
}

async function loadRunMetrics(summaryPath: string): Promise<RunMetrics> {
  const summary = JSON.parse(await readFile(summaryPath, "utf8")) as JsonRecord;
  const runDir = resolve(summaryPath, "..");
  const runtimeConfig = await loadOptionalJson(resolve(runDir, "run-config.json"));
  const heartbeats = await loadNdjson(resolve(runDir, "heartbeats.ndjson"));

  const outcome = summary.outcome ?? {};
  const timing = summary.timing ?? {};
  const config = summary.config ?? {};
  const stream = summary.stream ?? {};
  const simulation = summary.simulation ?? {};
  const transport = summary.transport ?? {};
  const delivered = Number(
    simulation.delivered ?? transport.receivedEvents ?? simulation.sent ?? 0,
  );
  const generated = Number(simulation.generated ?? 0);
  const ordered = Number(stream.orderedEvents ?? 0);
  const anomalies = Number(stream.anomalies ?? 0);
  const late = Number(stream.byAnomalyType?.late_arrival ?? 0);
  const warnings = Number(stream.byAnomalySeverity?.warning ?? 0);
  const errors = Number(stream.byAnomalySeverity?.error ?? 0);
  const duplicatesInjected = Number(simulation.duplicatesInjected ?? 0);
  const duplicateLeakage = Math.max(delivered - generated, 0);
  const duplicateLeakageRatio =
    duplicatesInjected > 0 ? duplicateLeakage / duplicatesInjected : null;
  const maxQueue = Number(
    simulation.maxQueueDepth ?? simulation.maxPendingQueueDepth ?? 0,
  );
  const wallElapsedMs = Number(timing.wallElapsedMs ?? 0);

  let peakRssMb: number | null = null;
  let lastRssMb: number | null = null;
  if (heartbeats.length > 0) {
    peakRssMb =
      Math.max(...heartbeats.map((row) => Number(row.rssBytes ?? 0)), 0) /
      (1024 * 1024);
    lastRssMb = Number(heartbeats.at(-1)?.rssBytes ?? 0) / (1024 * 1024);
  }

  const status = String(outcome.status ?? "unknown");
  const { assessment } = assessRun({
    status,
    errors,
    late,
    anomalies,
    generated,
    maxQueue,
    delivered,
    ordered,
  });

  return {
    name: runDir.split(/[\\/]/).at(-1) ?? runDir,
    runDir,
    status,
    assessment,
    verdict: deriveVerdict({ status, assessment }),
    profileName: String(config.profileName ?? "unknown"),
    model: String(config.model ?? "single_process"),
    dedupeLabel: formatDedupeLabel(config, runtimeConfig),
    generated,
    delivered,
    ordered,
    duplicatesInjected,
    duplicateLeakage,
    duplicateLeakageRatio,
    anomalies,
    late,
    lateRatio: delivered > 0 ? late / delivered : 0,
    warnings,
    errors,
    maxQueue,
    wallElapsedMs,
    peakRssMb,
    lastRssMb,
  };
}

async function loadNdjson(path: string): Promise<JsonRecord[]> {
  if (!existsSync(path)) {
    return [];
  }

  const rows: JsonRecord[] = [];
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
    if (line.trim()) {
      rows.push(JSON.parse(line) as JsonRecord);
    }
  }
  return rows;
}

async function loadOptionalJson(path: string): Promise<JsonRecord | null> {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(await readFile(path, "utf8")) as JsonRecord;
}

function formatDedupeLabel(summaryConfig: JsonRecord, runtimeConfig: JsonRecord | null): string {
  const dedupeConfig =
    summaryConfig.dedupeConfig ?? runtimeConfig?.dedupeConfig ?? {};
  if (typeof dedupeConfig.preset === "string" && dedupeConfig.preset.trim()) {
    return `preset:${dedupeConfig.preset}`;
  }

  const sliding = dedupeConfig.slidingWindowSeconds;
  const maxSliding = dedupeConfig.maxSlidingWindowSeconds;
  if (sliding !== undefined && maxSliding !== undefined) {
    return `manual:${sliding}/${maxSliding}s`;
  }

  return "unknown";
}

function buildComparisonReport(left: RunMetrics, right: RunMetrics): string {
  const lines: string[] = [];
  lines.push(`Compare: ${left.name} -> ${right.name}`);
  lines.push(
    `Profiles: ${left.profileName} vs ${right.profileName} | Dedupe: ${left.dedupeLabel} vs ${right.dedupeLabel}`,
  );
  lines.push(`Paths: ${left.runDir} | ${right.runDir}`);
  lines.push("");
  lines.push(
    `Verdict: ${left.verdict} -> ${right.verdict} | Status: ${left.status} -> ${right.status}`,
  );
  lines.push(
    `Wall: ${formatDurationMs(left.wallElapsedMs)} -> ${formatDurationMs(right.wallElapsedMs)}`,
  );
  lines.push(
    `Traffic: generated=${left.generated} -> ${right.generated} | delivered=${left.delivered} -> ${right.delivered} | ordered=${left.ordered} -> ${right.ordered}`,
  );
  lines.push(
    `Duplicate leakage: ${formatLeakage(left)} -> ${formatLeakage(right)} | delta=${formatDeltaNumber(right.duplicateLeakage - left.duplicateLeakage)}`,
  );
  lines.push(
    `Late ratio: ${formatPercent(left.lateRatio)} -> ${formatPercent(right.lateRatio)} | delta=${formatSignedPercent(right.lateRatio - left.lateRatio)}`,
  );
  lines.push(
    `Queue peak: ${left.maxQueue} -> ${right.maxQueue} | delta=${formatDeltaNumber(right.maxQueue - left.maxQueue)}`,
  );
  lines.push(
    `Anomalies: total=${left.anomalies} -> ${right.anomalies} | warn=${left.warnings} -> ${right.warnings} | error=${left.errors} -> ${right.errors}`,
  );

  if (left.peakRssMb !== null || right.peakRssMb !== null) {
    lines.push(
      `Peak RSS: ${formatMaybeMb(left.peakRssMb)} -> ${formatMaybeMb(right.peakRssMb)} | delta=${formatDeltaMb(deltaMaybe(left.peakRssMb, right.peakRssMb))}`,
    );
  }

  lines.push("Equilibrium:");
  lines.push(
    `  Correctness: ${describeCorrectness(left)} -> ${describeCorrectness(right)}`,
  );
  lines.push(
    `  Pressure: ${describePressure(left)} -> ${describePressure(right)}`,
  );
  lines.push(
    `  Backlog: ${describeBacklog(left)} -> ${describeBacklog(right)}`,
  );

  lines.push("Reading:");
  for (const line of buildReading(left, right)) {
    lines.push(`  - ${line}`);
  }

  return lines.join("\n");
}

function buildReading(left: RunMetrics, right: RunMetrics): string[] {
  const notes: string[] = [];

  if (left.profileName !== right.profileName) {
    notes.push("the two runs use different workload profiles, so treat the comparison as directional rather than apples-to-apples");
  }

  if (left.errors === 0 && right.errors === 0) {
    notes.push("both runs preserved correctness at the error-level gate, so the comparison is mainly about pressure, backlog, and duplicate leakage");
  } else if (right.errors < left.errors) {
    notes.push("the newer run reduced error-level anomalies, which is the strongest correctness improvement");
  } else if (right.errors > left.errors) {
    notes.push("the newer run introduced more error-level anomalies, which is a meaningful regression even if other metrics improved");
  }

  if (right.duplicateLeakage < left.duplicateLeakage) {
    notes.push("duplicate leakage improved in the newer run");
  } else if (right.duplicateLeakage > left.duplicateLeakage) {
    notes.push("duplicate leakage worsened in the newer run");
  } else {
    notes.push("duplicate leakage was unchanged between the two runs");
  }

  if (right.lateRatio < left.lateRatio) {
    notes.push("the newer run saw a lower late-arrival ratio");
  } else if (right.lateRatio > left.lateRatio) {
    notes.push("the newer run saw a higher late-arrival ratio");
  }

  if (right.maxQueue < left.maxQueue) {
    notes.push("backlog pressure eased in the newer run");
  } else if (right.maxQueue > left.maxQueue) {
    notes.push("backlog pressure increased in the newer run");
  }

  if (right.lateRatio > left.lateRatio && right.maxQueue <= left.maxQueue && right.errors === 0) {
    notes.push("the newer run absorbed more lateness without extra backlog, which suggests stronger operational elasticity");
  } else if (
    right.lateRatio > left.lateRatio &&
    right.maxQueue > left.maxQueue &&
    right.errors === 0
  ) {
    notes.push("the newer run stayed correct under higher pressure, but the added lateness also pushed backlog higher");
  }

  if (notes.length === 0) {
    notes.push("no strong directional difference stood out in the selected metrics");
  }

  return notes;
}

function assessRun(input: {
  status: string;
  errors: number;
  late: number;
  anomalies: number;
  generated: number;
  maxQueue: number;
  delivered: number;
  ordered: number;
}): { assessment: string; reasons: string[] } {
  const reasons: string[] = [];

  if (input.status === "failed") {
    reasons.push("the run ended with a failed status");
    return { assessment: "failed", reasons };
  }

  if (input.errors > 0) {
    reasons.push(`${input.errors} error-level anomalies were recorded`);
  }

  if (input.late > 0 && input.delivered > 0) {
    const lateRatio = input.late / input.delivered;
    if (lateRatio >= 0.5) {
      reasons.push("late arrivals were very high");
    } else if (lateRatio >= 0.2) {
      reasons.push("late arrivals were elevated");
    }
  }

  if (input.maxQueue > 0 && input.generated > 0) {
    const queueRatio = input.maxQueue / input.generated;
    if (queueRatio >= 0.5) {
      reasons.push("queue backlog grew large relative to generated volume");
    } else if (queueRatio >= 0.2) {
      reasons.push("queue backlog was noticeable");
    }
  }

  if (input.ordered < input.delivered) {
    reasons.push("ordered count ended below delivered count");
  }

  if (input.status === "interrupted") {
    reasons.push("the run was interrupted before a normal completion");
  }

  if (input.status === "completed" && reasons.length === 0 && input.anomalies === 0) {
    return { assessment: "healthy", reasons };
  }

  if (input.status === "completed" && reasons.length === 0) {
    return { assessment: "healthy", reasons };
  }

  if (input.status === "completed") {
    return { assessment: "degraded", reasons };
  }

  return { assessment: input.status, reasons };
}

function deriveVerdict(input: { status: string; assessment: string }): string {
  if (input.status === "failed") {
    return "FAIL";
  }
  if (input.status === "interrupted") {
    return "INTERRUPTED";
  }
  if (input.status === "completed" && input.assessment === "healthy") {
    return "PASS";
  }
  if (input.status === "completed" && input.assessment === "degraded") {
    return "PASS WITH STRESS";
  }
  return input.status.toUpperCase();
}

function formatDurationMs(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "0s";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${minutes.toString().padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function formatPercent(value: number): string {
  return value.toLocaleString(undefined, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value)}`;
}

function formatLeakage(run: RunMetrics): string {
  const ratio =
    run.duplicateLeakageRatio === null ? "n/a" : formatPercent(run.duplicateLeakageRatio);
  return `${run.duplicateLeakage}/${run.duplicatesInjected} (${ratio})`;
}

function describeCorrectness(run: RunMetrics): string {
  if (run.errors > 0) {
    return `degraded (${run.errors} error anomalies)`;
  }
  if (run.ordered < run.delivered) {
    return "degraded (ordered below delivered)";
  }
  if (run.duplicateLeakage === 0) {
    return "strong (no leaked duplicates observed)";
  }
  return `strong (${run.duplicateLeakage} leaked duplicates, ${formatPercent(run.duplicateLeakageRatio ?? 0)})`;
}

function describePressure(run: RunMetrics): string {
  if (run.lateRatio >= 0.5) {
    return `extreme (${formatPercent(run.lateRatio)} late)`;
  }
  if (run.lateRatio >= 0.2) {
    return `high (${formatPercent(run.lateRatio)} late)`;
  }
  if (run.lateRatio >= 0.05) {
    return `moderate (${formatPercent(run.lateRatio)} late)`;
  }
  return `low (${formatPercent(run.lateRatio)} late)`;
}

function describeBacklog(run: RunMetrics): string {
  const queueRatio = run.generated > 0 ? run.maxQueue / run.generated : 0;
  if (queueRatio >= 0.5) {
    return `heavy (${run.maxQueue} peak queue)`;
  }
  if (queueRatio >= 0.2) {
    return `elevated (${run.maxQueue} peak queue)`;
  }
  return `controlled (${run.maxQueue} peak queue)`;
}

function formatDeltaNumber(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatMaybeMb(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(1)}MB`;
}

function formatDeltaMb(value: number | null): string {
  return value === null ? "n/a" : `${value > 0 ? "+" : ""}${value.toFixed(1)}MB`;
}

function deltaMaybe(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return null;
  }
  return right - left;
}

main();
