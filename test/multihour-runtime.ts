import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createHlcClock, orderEventStream } from "causal-order";

type JsonRecord = Record<string, any>;

const DEFAULTS = {
  durationMs: parseDurationToMs("4h"),
  steadyRatio: 0.3,
  eventsPerSecond: 16,
  chaosMultiplier: 1.8,
  batchSize: 200,
  maxLateArrivalMs: 60_000n,
  maxTailDrainMs: parseDurationToMs("5m"),
  lateArrivalPolicy: "flag",
  reportEveryMs: parseDurationToMs("30s"),
  timeScale: 1,
  outputDir: "artifacts/runs",
  sampleLimit: 20,
  maxLateArrivalSamples: 200,
  strict: false,
  allowUnknownOrder: true,
  detectAnomalies: true,
  tieBreaker: "ingestion_order",
};

const HELP_TEXT = `Usage:
  npm run test:runtime -- [options]

Options:
  --duration <value>           Total simulated runtime. Supports ms, s, m, h. Default: 4h
  --steady-for <value>         Simulated steady phase duration before chaos begins
  --steady-ratio <0..1>        Portion of total duration spent steady when --steady-for is omitted
  --events-per-second <n>      Average total steady-state throughput across both nodes. Default: 16
  --chaos-multiplier <n>       Multiplier applied during chaotic phase. Default: 1.8
  --batch-size <n>             orderEventStream batch size. Default: 200
  --max-late-arrival-ms <n>    Late-arrival window in milliseconds. Default: 60000
  --max-tail-drain <value>     Max extra simulated drain time for delayed events. Default: 5m
  --late-policy <value>        flag | drop | emit_correction | fail. Default: flag
  --report-every <value>       Progress log interval in simulated time. Default: 30s
  --time-scale <n>             1 = realtime, 60 = one simulated minute per wall second
  --output <path>              Explicit summary JSON path
  --output-dir <path>          Base directory for run artifacts. Default: artifacts/runs
  --run-name <value>           Optional label appended to the run folder name
  --sample-limit <n>           Number of anomaly/correction samples to retain. Default: 20
  --strict                     Enable strict stream validation
  --disallow-unknown-order     Force allowUnknownOrder=false
  --help                       Show this message

Examples:
  npm run test:runtime -- --duration 6h --steady-for 90m --time-scale 1
  npm run test:runtime -- --duration 20m --time-scale 60 --report-every 2m
  npm run test:runtime -- --duration 10h --steady-for 2h --run-name overnight-laptop
`;

async function main(): Promise<void> {
  const config = buildConfig(process.argv.slice(2));
  if ("help" in config) {
    console.log(HELP_TEXT);
    return;
  }

  const runtime = createRuntimeState(config);
  const summary = createSummary(runtime);
  prepareRunArtifacts(runtime, summary);
  installSignalHandlers(runtime);
  await appendLifecycleEvent(runtime, "run_started", {
    message: "Overnight causal-order runtime harness started",
  });

  try {
    printConfig(runtime);

    const source = generateSource(runtime, summary);

    for await (const batch of orderEventStream(source as any, {
      batchSize: config.batchSize,
      maxLateArrivalMs: config.maxLateArrivalMs,
      lateArrivalPolicy: config.lateArrivalPolicy,
      strict: config.strict,
      allowUnknownOrder: config.allowUnknownOrder,
      detectAnomalies: config.detectAnomalies,
      tieBreaker: config.tieBreaker,
    })) {
      await ingestBatch(batch as JsonRecord, runtime, summary);
      await maybePrintProgress(runtime, summary);
    }

    runtime.outcome.status = runtime.stopRequested ? "interrupted" : "completed";
  } catch (error) {
    runtime.outcome.status = "failed";
    runtime.outcome.failure = serializeError(error);
    await appendLifecycleEvent(runtime, "run_failed", {
      error: runtime.outcome.failure,
    });
    throw error;
  } finally {
    finalizeSummary(runtime, summary);
    await appendNdjson(
      runtime.artifactPaths.heartbeatPath,
      buildHeartbeat(runtime, summary, "final"),
    );
    await writeSummary(runtime.artifactPaths.summaryPath, summary);
    await appendLifecycleEvent(runtime, "run_finished", {
      status: runtime.outcome.status,
      summaryPath: runtime.artifactPaths.summaryPath,
    });
    printFinalSummary(summary, runtime.artifactPaths.summaryPath);
  }
}

function buildConfig(argv: string[]): JsonRecord | { help: true } {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    return { help: true };
  }

  const durationMs = parsed.durationMs ?? DEFAULTS.durationMs;
  const steadyRatio = parsed.steadyRatio ?? DEFAULTS.steadyRatio;
  const steadyForMs =
    parsed.steadyForMs ?? BigInt(Math.floor(Number(durationMs) * steadyRatio));

  if (steadyForMs < 0n || steadyForMs > durationMs) {
    throw new Error("Steady phase must be between 0 and total duration");
  }

  return {
    durationMs,
    steadyForMs,
    eventsPerSecond: parsed.eventsPerSecond ?? DEFAULTS.eventsPerSecond,
    chaosMultiplier: parsed.chaosMultiplier ?? DEFAULTS.chaosMultiplier,
    batchSize: parsed.batchSize ?? DEFAULTS.batchSize,
    maxLateArrivalMs: parsed.maxLateArrivalMs ?? DEFAULTS.maxLateArrivalMs,
    maxTailDrainMs: parsed.maxTailDrainMs ?? DEFAULTS.maxTailDrainMs,
    lateArrivalPolicy: parsed.lateArrivalPolicy ?? DEFAULTS.lateArrivalPolicy,
    reportEveryMs: parsed.reportEveryMs ?? DEFAULTS.reportEveryMs,
    timeScale: parsed.timeScale ?? DEFAULTS.timeScale,
    outputPath: parsed.outputPath ?? null,
    outputDir: parsed.outputDir ?? DEFAULTS.outputDir,
    runName: parsed.runName ?? null,
    sampleLimit: parsed.sampleLimit ?? DEFAULTS.sampleLimit,
    maxLateArrivalSamples: DEFAULTS.maxLateArrivalSamples,
    strict: parsed.strict ?? DEFAULTS.strict,
    allowUnknownOrder: parsed.allowUnknownOrder ?? DEFAULTS.allowUnknownOrder,
    detectAnomalies: parsed.detectAnomalies ?? DEFAULTS.detectAnomalies,
    tieBreaker: DEFAULTS.tieBreaker,
  };
}

function parseArgs(argv: string[]): JsonRecord {
  const result: JsonRecord = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") {
      return { help: true };
    }

    const [rawKey, inlineValue] = token.split("=", 2);
    const value = inlineValue !== undefined ? inlineValue : argv[index + 1];

    switch (rawKey) {
      case "--duration":
        result.durationMs = parseDurationToMs(requireValue(rawKey, value));
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--steady-for":
        result.steadyForMs = parseDurationToMs(requireValue(rawKey, value));
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--steady-ratio":
        result.steadyRatio = parseUnitInterval(requireValue(rawKey, value), rawKey);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--events-per-second":
        result.eventsPerSecond = parsePositiveNumber(
          requireValue(rawKey, value),
          rawKey,
        );
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--chaos-multiplier":
        result.chaosMultiplier = parsePositiveNumber(
          requireValue(rawKey, value),
          rawKey,
        );
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--batch-size":
        result.batchSize = parsePositiveInteger(requireValue(rawKey, value), rawKey);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--max-late-arrival-ms":
        result.maxLateArrivalMs = parseNonNegativeBigInt(
          requireValue(rawKey, value),
          rawKey,
        );
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--max-tail-drain":
        result.maxTailDrainMs = parseDurationToMs(requireValue(rawKey, value));
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--late-policy":
        result.lateArrivalPolicy = parseLatePolicy(requireValue(rawKey, value));
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--report-every":
        result.reportEveryMs = parseDurationToMs(requireValue(rawKey, value));
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--time-scale":
        result.timeScale = parsePositiveNumber(requireValue(rawKey, value), rawKey);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--output":
        result.outputPath = requireValue(rawKey, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--output-dir":
        result.outputDir = requireValue(rawKey, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--run-name":
        result.runName = requireValue(rawKey, value);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--sample-limit":
        result.sampleLimit = parsePositiveInteger(requireValue(rawKey, value), rawKey);
        index += inlineValue === undefined ? 1 : 0;
        break;
      case "--strict":
        result.strict = true;
        break;
      case "--disallow-unknown-order":
        result.allowUnknownOrder = false;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return result;
}

function requireValue(flag: string, value?: string): string {
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseDurationToMs(input: string): bigint {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration "${input}". Use values like 500ms, 30s, 15m, 4h`);
  }

  const [, amountText, unit] = match;
  const amount = Number(amountText);
  const multiplierByUnit = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
  };
  const milliseconds = Math.floor(amount * multiplierByUnit[unit.toLowerCase()]);
  return BigInt(milliseconds);
}

function parsePositiveInteger(input: string, label: string): number {
  const value = Number.parseInt(input, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function parsePositiveNumber(input: string, label: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return value;
}

function parseNonNegativeBigInt(input: string, label: string): bigint {
  if (!/^\d+$/.test(input)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return BigInt(input);
}

function parseUnitInterval(input: string, label: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1`);
  }
  return value;
}

function parseLatePolicy(input: string): string {
  const value = input.trim();
  const supported = new Set(["flag", "drop", "emit_correction", "fail"]);
  if (!supported.has(value)) {
    throw new Error(`Unsupported late policy: ${value}`);
  }
  return value;
}

function createRuntimeState(config: JsonRecord): JsonRecord {
  const wallStartMs = Date.now();
  const simulatedStartMs = BigInt(wallStartMs);
  const simulatedEndMs = simulatedStartMs + config.durationMs;

  const simulationNowMs = () =>
    simulatedStartMs + BigInt(Math.floor((Date.now() - wallStartMs) * config.timeScale));

  const nodes = [
    createNodeState("edge-a", simulationNowMs),
    createNodeState("edge-b", simulationNowMs),
  ];

  const nextReportAtMs = simulationNowMs() + config.reportEveryMs;

  return {
    config,
    wallStartMs,
    simulatedStartMs,
    simulatedEndMs,
    simulationNowMs,
    stopRequested: false,
    nextReportAtMs,
    nodes,
    flowCounter: 0,
    entityCounter: 0,
    recentEvents: [],
    recentByNode: new Map(nodes.map((node) => [node.nodeId, []])),
    artifactPaths: null,
    persistedLateArrivalSamples: 0,
    outcome: {
      status: "running",
      failure: null,
    },
  };
}

function createNodeState(nodeId: string, now: () => bigint): JsonRecord {
  const clock = createHlcClock({ nodeId, now });
  return {
    nodeId,
    clock,
    sequence: 0n,
    nextEmitAtMs: now() + sampleIntervalMs(8),
    lastScheduledDeliveryAtMs: 0n,
  };
}

function createSummary(runtime: JsonRecord): JsonRecord {
  return {
    outcome: {
      status: runtime.outcome.status,
      failure: null,
    },
    artifacts: {
      runDir: null,
      summaryPath: null,
      heartbeatPath: null,
      anomalyPath: null,
      lifecyclePath: null,
      configPath: null,
    },
    config: {
      durationMs: runtime.config.durationMs.toString(),
      steadyForMs: runtime.config.steadyForMs.toString(),
      eventsPerSecond: runtime.config.eventsPerSecond,
      chaosMultiplier: runtime.config.chaosMultiplier,
      batchSize: runtime.config.batchSize,
      maxLateArrivalMs: runtime.config.maxLateArrivalMs.toString(),
      maxTailDrainMs: runtime.config.maxTailDrainMs.toString(),
      lateArrivalPolicy: runtime.config.lateArrivalPolicy,
      reportEveryMs: runtime.config.reportEveryMs.toString(),
      timeScale: runtime.config.timeScale,
      outputDir: runtime.config.outputDir,
      runName: runtime.config.runName,
      strict: runtime.config.strict,
      allowUnknownOrder: runtime.config.allowUnknownOrder,
      detectAnomalies: runtime.config.detectAnomalies,
      tieBreaker: runtime.config.tieBreaker,
    },
    timing: {
      startedAtIso: new Date(runtime.wallStartMs).toISOString(),
      finishedAtIso: null,
      wallElapsedMs: null,
      simulatedElapsedMs: null,
      interrupted: false,
    },
    simulation: {
      generated: 0,
      delivered: 0,
      currentQueueDepth: 0,
      generatedByNode: {},
      generatedByPhase: {},
      crossNodeDependencies: 0,
      sameNodeDependencies: 0,
      duplicatesInjected: 0,
      delayedDeliveries: 0,
      maxQueueDepth: 0,
    },
    stream: {
      batches: 0,
      correctionBatches: 0,
      finalBatches: 0,
      orderedEvents: 0,
      anomalies: 0,
      maxWatermarkMs: "0",
      lastWatermarkMs: "0",
      byAnomalyType: {},
      byAnomalySeverity: {},
      byOrderBasis: {},
      byConfidence: {},
    },
    samples: {
      anomalies: [],
      corrections: [],
    },
  };
}

function prepareRunArtifacts(runtime: JsonRecord, summary: JsonRecord): void {
  const artifactPaths = buildArtifactPaths(runtime);
  runtime.artifactPaths = artifactPaths;

  mkdirSync(artifactPaths.runDir, { recursive: true });
  writeFileSync(
    artifactPaths.configPath,
    `${JSON.stringify(summary.config, null, 2)}\n`,
    "utf8",
  );

  summary.artifacts.runDir = artifactPaths.runDir;
  summary.artifacts.summaryPath = artifactPaths.summaryPath;
  summary.artifacts.heartbeatPath = artifactPaths.heartbeatPath;
  summary.artifacts.anomalyPath = artifactPaths.anomalyPath;
  summary.artifacts.lifecyclePath = artifactPaths.lifecyclePath;
  summary.artifacts.configPath = artifactPaths.configPath;
}

function buildArtifactPaths(runtime: JsonRecord): JsonRecord {
  const explicitSummaryPath = runtime.config.outputPath
    ? resolve(runtime.config.outputPath)
    : null;
  const runLabel = createRunLabel(runtime.wallStartMs, runtime.config.runName);
  const runDir = explicitSummaryPath
    ? dirname(explicitSummaryPath)
    : resolve(runtime.config.outputDir, runLabel);

  return {
    runDir,
    summaryPath: explicitSummaryPath ?? resolve(runDir, "summary.json"),
    heartbeatPath: resolve(runDir, "heartbeats.ndjson"),
    anomalyPath: resolve(runDir, "anomalies.ndjson"),
    lifecyclePath: resolve(runDir, "lifecycle.ndjson"),
    configPath: resolve(runDir, "run-config.json"),
  };
}

function createRunLabel(wallStartMs: number, runName: string | null): string {
  const stamp = new Date(wallStartMs)
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\.\d{3}Z$/, "Z");
  const safeRunName = runName ? `-${sanitizeRunName(runName)}` : "";
  return `${stamp}${safeRunName}`;
}

function sanitizeRunName(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "run"
  );
}

function installSignalHandlers(runtime: JsonRecord): void {
  const requestStop = (signal: string) => {
    runtime.stopRequested = true;
    runtime.outcome.status = "interrupted";
    appendNdjsonSync(runtime.artifactPaths.lifecyclePath, {
      timestampIso: new Date().toISOString(),
      event: "signal_received",
      signal,
      message: "Stop requested, draining queued events",
    });
  };

  process.once("SIGINT", () => requestStop("SIGINT"));
  process.once("SIGTERM", () => requestStop("SIGTERM"));
  process.once("uncaughtException", (error) => {
    runtime.outcome.status = "failed";
    runtime.outcome.failure = serializeError(error);
    appendNdjsonSync(runtime.artifactPaths.lifecyclePath, {
      timestampIso: new Date().toISOString(),
      event: "uncaught_exception",
      error: runtime.outcome.failure,
    });
  });
  process.once("unhandledRejection", (reason) => {
    runtime.outcome.status = "failed";
    runtime.outcome.failure = serializeError(reason);
    appendNdjsonSync(runtime.artifactPaths.lifecyclePath, {
      timestampIso: new Date().toISOString(),
      event: "unhandled_rejection",
      error: runtime.outcome.failure,
    });
  });
}

function printConfig(runtime: JsonRecord): void {
  const config = runtime.config;
  const wallHours = Number(config.durationMs) / config.timeScale / 3_600_000;

  console.log("Starting causal-order runtime harness");
  console.log(
    [
      `duration=${formatDuration(config.durationMs)}`,
      `steady=${formatDuration(config.steadyForMs)}`,
      `rate=${config.eventsPerSecond}/s total`,
      `chaosMultiplier=${config.chaosMultiplier}`,
      `latePolicy=${config.lateArrivalPolicy}`,
      `timeScale=${config.timeScale}x`,
      `estimatedWallTime=${wallHours.toFixed(2)}h`,
      `runDir=${runtime.artifactPaths.runDir}`,
    ].join(" | "),
  );
}

async function appendLifecycleEvent(
  runtime: JsonRecord,
  event: string,
  details: JsonRecord = {},
): Promise<void> {
  await appendNdjson(runtime.artifactPaths.lifecyclePath, {
    timestampIso: new Date().toISOString(),
    event,
    wallElapsedMs: Date.now() - runtime.wallStartMs,
    simulatedElapsedMs: (
      runtime.simulationNowMs() - runtime.simulatedStartMs
    ).toString(),
    ...details,
  });
}

async function appendNdjson(path: string, record: JsonRecord): Promise<void> {
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

function appendNdjsonSync(path: string, record: JsonRecord): void {
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

function serializeError(error: unknown): JsonRecord {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    name: "NonError",
    message: String(error),
    stack: null,
  };
}

async function* generateSource(runtime: JsonRecord, summary: JsonRecord): AsyncGenerator<JsonRecord> {
  const queue: JsonRecord[] = [];

  while (true) {
    const now = runtime.simulationNowMs();
    const inMainWindow = now < runtime.simulatedEndMs && !runtime.stopRequested;

    if (inMainWindow) {
      scheduleDueEvents(runtime, summary, queue, now);
    }

    queue.sort((left, right) =>
      left.deliverAtMs < right.deliverAtMs ? -1 : left.deliverAtMs > right.deliverAtMs ? 1 : 0,
    );

    if (queue.length > summary.simulation.maxQueueDepth) {
      summary.simulation.maxQueueDepth = queue.length;
    }
    summary.simulation.currentQueueDepth = queue.length;

    let deliveredAny = false;
    while (queue[0] && queue[0].deliverAtMs <= runtime.simulationNowMs()) {
      const delivery = queue.shift()!;
      summary.simulation.delivered += 1;
      deliveredAny = true;
      yield materializeDelivery(delivery.baseEvent, runtime.simulationNowMs());
    }

    const shouldStop =
      (!inMainWindow && queue.length === 0) ||
      (runtime.stopRequested && queue.length === 0);

    if (shouldStop) {
      return;
    }

    if (deliveredAny) {
      continue;
    }

    const nextActionAtMs = findNextActionTime(runtime, queue);
    if (nextActionAtMs === null) {
      return;
    }

    await sleepForSimulatedGap(runtime, nextActionAtMs - runtime.simulationNowMs());
  }
}

function scheduleDueEvents(runtime: JsonRecord, summary: JsonRecord, queue: JsonRecord[], now: bigint): void {
  for (const node of runtime.nodes) {
    while (node.nextEmitAtMs <= now && now < runtime.simulatedEndMs) {
      const phase = getPhase(runtime, now);
      const eventRecord = createEventRecord(runtime, summary, node, phase, now);
      const remainingMainWindowMs = runtime.simulatedEndMs - now;
      const baseDelayMs = sampleDeliveryDelayMs(phase);
      const maxAllowedDelayMs = remainingMainWindowMs + runtime.config.maxTailDrainMs;
      const appliedDelayMs = baseDelayMs > maxAllowedDelayMs ? maxAllowedDelayMs : baseDelayMs;

      if (appliedDelayMs > runtime.config.maxLateArrivalMs) {
        summary.simulation.delayedDeliveries += 1;
      }

      const deliverAtMs = chooseDeliveryTime(node, phase, now + appliedDelayMs);

      queue.push({
        baseEvent: eventRecord.event,
        deliverAtMs,
      });

      maybeInjectDuplicate(summary, queue, eventRecord, now, runtime);
      rememberEvent(runtime, eventRecord);
      scheduleNextNodeEmit(runtime, node, phase);
    }
  }
}

function createEventRecord(runtime: JsonRecord, summary: JsonRecord, node: JsonRecord, phase: string, now: bigint): JsonRecord {
  const dependencyChoice = chooseDependency(runtime, node, phase);
  const traceId = dependencyChoice?.traceId ?? nextTraceId(runtime);
  const entityId = dependencyChoice?.entityId ?? nextEntityId(runtime);

  let clock;
  if (dependencyChoice?.event) {
    clock = node.clock.receive(dependencyChoice.event.clock);
  } else {
    clock = node.clock.now();
  }

  node.sequence += 1n;

  const eventId = `${node.nodeId}-${node.sequence.toString().padStart(12, "0")}`;
  const payload = {
    phase,
    service: node.nodeId,
    entityId,
    traceId,
    operation: chooseOperation(phase, dependencyChoice),
  };

  const event = {
    id: eventId,
    nodeId: node.nodeId,
    clock,
    sequence: node.sequence,
    traceId,
    parentEventId:
      dependencyChoice?.relation === "parent" ? dependencyChoice.event.id : undefined,
    dependencyEventIds:
      dependencyChoice?.relation === "dependency" ? [dependencyChoice.event.id] : undefined,
    payload,
  };

  summary.simulation.generated += 1;
  countInto(summary.simulation.generatedByNode, node.nodeId);
  countInto(summary.simulation.generatedByPhase, phase);

  if (dependencyChoice?.event) {
    if (dependencyChoice.event.nodeId === node.nodeId) {
      summary.simulation.sameNodeDependencies += 1;
    } else {
      summary.simulation.crossNodeDependencies += 1;
    }
  }

  return {
    event,
    traceId,
    entityId,
    createdAtMs: now,
  };
}

function getPhase(runtime: JsonRecord, now: bigint): string {
  return now - runtime.simulatedStartMs < runtime.config.steadyForMs ? "steady" : "chaotic";
}

function chooseDependency(runtime: JsonRecord, node: JsonRecord, phase: string): JsonRecord | null {
  const sameNodeHistory = runtime.recentByNode.get(node.nodeId) ?? [];
  const otherNodeHistory =
    runtime.recentByNode.get(node.nodeId === "edge-a" ? "edge-b" : "edge-a") ?? [];

  const sameNodeChance = phase === "steady" ? 0.38 : 0.22;
  const crossNodeChance = phase === "steady" ? 0.24 : 0.46;
  const roll = Math.random();

  if (roll < crossNodeChance && otherNodeHistory.length > 0) {
    const event = pickRecentEvent(otherNodeHistory);
    return {
      event,
      isCrossNode: true,
      relation: Math.random() < 0.7 ? "parent" : "dependency",
      traceId: event.traceId,
      entityId: event.payload.entityId,
    };
  }

  if (roll < crossNodeChance + sameNodeChance && sameNodeHistory.length > 0) {
    const event = pickRecentEvent(sameNodeHistory);
    return {
      event,
      isCrossNode: false,
      relation: Math.random() < 0.8 ? "parent" : "dependency",
      traceId: event.traceId,
      entityId: event.payload.entityId,
    };
  }

  return null;
}

function pickRecentEvent(history: JsonRecord[]): JsonRecord {
  const window = history.slice(-Math.min(history.length, 32));
  return window[Math.floor(Math.random() * window.length)];
}

function nextTraceId(runtime: JsonRecord): string {
  runtime.flowCounter += 1;
  return `trace-${runtime.flowCounter.toString().padStart(8, "0")}`;
}

function nextEntityId(runtime: JsonRecord): string {
  runtime.entityCounter += 1;
  return `entity-${runtime.entityCounter.toString().padStart(8, "0")}`;
}

function chooseOperation(phase: string, dependencyChoice: JsonRecord | null): string {
  if (dependencyChoice?.isCrossNode) {
    const crossNodeOperations = [
      "replica.applied",
      "payment.confirmed",
      "inventory.reserved",
      "projection.updated",
      "compensation.scheduled",
    ];
    return crossNodeOperations[Math.floor(Math.random() * crossNodeOperations.length)];
  }

  const steadyOperations = [
    "ingress.accepted",
    "order.created",
    "state.persisted",
    "workflow.advanced",
  ];
  const chaoticOperations = [
    "replay.applied",
    "reconciliation.requested",
    "projection.rebuilt",
    "device.resynced",
    "backfill.merged",
  ];
  const source = phase === "steady" ? steadyOperations : chaoticOperations;
  return source[Math.floor(Math.random() * source.length)];
}

function maybeInjectDuplicate(summary: JsonRecord, queue: JsonRecord[], eventRecord: JsonRecord, now: bigint, runtime: JsonRecord): void {
  const phase = eventRecord.event.payload.phase;
  const duplicateChance = phase === "steady" ? 0.002 : 0.018;
  if (Math.random() >= duplicateChance) {
    return;
  }

  summary.simulation.duplicatesInjected += 1;
  const duplicateDelayMs = sampleDeliveryDelayMs("chaotic") + 250n;
  const remainingMainWindowMs = runtime.simulatedEndMs - now;
  const maxAllowedDelayMs = remainingMainWindowMs + runtime.config.maxTailDrainMs;
  const appliedDelayMs = duplicateDelayMs > maxAllowedDelayMs ? maxAllowedDelayMs : duplicateDelayMs;

  queue.push({
    baseEvent: eventRecord.event,
    deliverAtMs: now + appliedDelayMs,
  });
}

function chooseDeliveryTime(node: JsonRecord, phase: string, candidateDeliverAtMs: bigint): bigint {
  const shouldPreserveNodeOrder = phase === "steady" || Math.random() < 0.88;

  if (!shouldPreserveNodeOrder) {
    if (candidateDeliverAtMs > node.lastScheduledDeliveryAtMs) {
      node.lastScheduledDeliveryAtMs = candidateDeliverAtMs;
    }
    return candidateDeliverAtMs;
  }

  const earliestDeliverAtMs =
    node.lastScheduledDeliveryAtMs > 0n
      ? node.lastScheduledDeliveryAtMs + BigInt(randomInt(1, 12))
      : candidateDeliverAtMs;
  const deliverAtMs =
    candidateDeliverAtMs > earliestDeliverAtMs ? candidateDeliverAtMs : earliestDeliverAtMs;

  node.lastScheduledDeliveryAtMs = deliverAtMs;
  return deliverAtMs;
}

function rememberEvent(runtime: JsonRecord, eventRecord: JsonRecord): void {
  runtime.recentEvents.push(eventRecord.event);
  if (runtime.recentEvents.length > 256) {
    runtime.recentEvents.shift();
  }

  const history = runtime.recentByNode.get(eventRecord.event.nodeId);
  if (history) {
    history.push(eventRecord.event);
    if (history.length > 128) {
      history.shift();
    }
  }
}

function scheduleNextNodeEmit(runtime: JsonRecord, node: JsonRecord, phase: string): void {
  const perNodeRate = resolvePerNodeRate(runtime, node, phase);
  node.nextEmitAtMs += sampleIntervalMs(perNodeRate);
}

function resolvePerNodeRate(runtime: JsonRecord, node: JsonRecord, phase: string): number {
  const steadyTotalRate = runtime.config.eventsPerSecond;
  const chaosTotalRate =
    runtime.config.eventsPerSecond * runtime.config.chaosMultiplier * randomBetween(0.85, 1.2);

  const nodeBias = node.nodeId === "edge-a" ? 0.95 : 1.05;
  const totalRate = phase === "steady" ? steadyTotalRate : chaosTotalRate;
  return Math.max(0.25, (totalRate * nodeBias) / 2);
}

function sampleIntervalMs(ratePerSecond: number): bigint {
  const u = Math.max(1e-12, Math.random());
  const milliseconds = Math.max(1, Math.round((-Math.log(u) * 1_000) / ratePerSecond));
  return BigInt(milliseconds);
}

function sampleDeliveryDelayMs(phase: string): bigint {
  if (phase === "steady") {
    let delayMs = BigInt(randomInt(20, 120));
    if (Math.random() < 0.03) {
      delayMs += BigInt(randomInt(250, 800));
    }
    return delayMs;
  }

  let delayMs = BigInt(randomInt(40, 250));
  if (Math.random() < 0.08) {
    delayMs += BigInt(randomInt(1_500, 8_000));
  }
  if (Math.random() < 0.02) {
    delayMs += BigInt(randomInt(10_000, 45_000));
  }
  if (Math.random() < 0.005) {
    delayMs += BigInt(randomInt(60_000, 180_000));
  }
  return delayMs;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function materializeDelivery(baseEvent: JsonRecord, ingestedAt: bigint): JsonRecord {
  return {
    ...baseEvent,
    clock: { ...baseEvent.clock },
    dependencyEventIds: baseEvent.dependencyEventIds ? [...baseEvent.dependencyEventIds] : undefined,
    payload: { ...baseEvent.payload },
    ingestedAt,
  };
}

function findNextActionTime(runtime: JsonRecord, queue: JsonRecord[]): bigint | null {
  const now = runtime.simulationNowMs();
  let nextAt: bigint | null = null;

  if (!runtime.stopRequested && now < runtime.simulatedEndMs) {
    for (const node of runtime.nodes) {
      if (nextAt === null || node.nextEmitAtMs < nextAt) {
        nextAt = node.nextEmitAtMs;
      }
    }
  }

  if (queue[0] && (nextAt === null || queue[0].deliverAtMs < nextAt)) {
    nextAt = queue[0].deliverAtMs;
  }

  return nextAt;
}

async function sleepForSimulatedGap(runtime: JsonRecord, gapMs: bigint): Promise<void> {
  if (gapMs <= 0n) {
    return;
  }

  const wallDelayMs = Math.max(
    1,
    Math.min(1_000, Math.ceil(Number(gapMs) / runtime.config.timeScale)),
  );
  await new Promise((resolveDelay) => {
    setTimeout(resolveDelay, wallDelayMs);
  });
}

async function ingestBatch(batch: JsonRecord, runtime: JsonRecord, summary: JsonRecord): Promise<void> {
  summary.stream.batches += 1;
  summary.stream.orderedEvents += batch.events.length;
  summary.stream.anomalies += batch.anomalies.length;
  summary.stream.lastWatermarkMs = batch.watermark.toString();

  if (BigInt(summary.stream.maxWatermarkMs) < batch.watermark) {
    summary.stream.maxWatermarkMs = batch.watermark.toString();
  }

  if (batch.correction) {
    summary.stream.correctionBatches += 1;
    pushLimited(summary.samples.corrections, {
      triggerEventId: batch.correction.triggerEventId,
      reason: batch.correction.reason,
      scope: batch.correction.scope,
      watermarkMs: batch.watermark.toString(),
    }, runtime.config.sampleLimit);
  }

  if (batch.isFinal) {
    summary.stream.finalBatches += 1;
  }

  for (const orderedEvent of batch.events) {
    countInto(summary.stream.byOrderBasis, orderedEvent.orderBasis);
    countInto(summary.stream.byConfidence, orderedEvent.confidence);
  }

  for (const anomaly of batch.anomalies) {
    countInto(summary.stream.byAnomalyType, anomaly.type);
    countInto(summary.stream.byAnomalySeverity, anomaly.severity);

    pushLimited(summary.samples.anomalies, {
      type: anomaly.type,
      severity: anomaly.severity,
      eventId: anomaly.event?.id ?? null,
      relatedEventIds: anomaly.relatedEvents?.map((event: JsonRecord) => event.id) ?? [],
      message: anomaly.message,
    }, runtime.config.sampleLimit);
  }

  await persistBatchAnomalies(batch, runtime);
}

function countInto(bucket: JsonRecord, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

function pushLimited(bucket: JsonRecord[], entry: JsonRecord, limit: number): void {
  if (bucket.length >= limit) {
    return;
  }
  bucket.push(entry);
}

async function maybePrintProgress(runtime: JsonRecord, summary: JsonRecord): Promise<void> {
  const now = runtime.simulationNowMs();
  if (now < runtime.nextReportAtMs) {
    return;
  }

  runtime.nextReportAtMs += runtime.config.reportEveryMs;

  console.log(
    [
      `[sim ${formatDuration(now - runtime.simulatedStartMs)}]`,
      `generated=${summary.simulation.generated}`,
      `delivered=${summary.simulation.delivered}`,
      `queued=${summary.simulation.currentQueueDepth}`,
      `batches=${summary.stream.batches}`,
      `ordered=${summary.stream.orderedEvents}`,
      `anomalies=${summary.stream.anomalies}`,
      `late=${summary.stream.byAnomalyType.late_arrival ?? 0}`,
      `corrections=${summary.stream.correctionBatches}`,
      `phase=${getPhase(runtime, now)}`,
    ].join(" "),
  );

  await appendNdjson(runtime.artifactPaths.heartbeatPath, buildHeartbeat(runtime, summary, "progress"));
}

function finalizeSummary(runtime: JsonRecord, summary: JsonRecord): void {
  const wallEndMs = Date.now();
  const simulatedEndMs = runtime.simulationNowMs();

  summary.outcome.status = runtime.outcome.status;
  summary.outcome.failure = runtime.outcome.failure;
  summary.timing.finishedAtIso = new Date(wallEndMs).toISOString();
  summary.timing.wallElapsedMs = wallEndMs - runtime.wallStartMs;
  summary.timing.simulatedElapsedMs = (simulatedEndMs - runtime.simulatedStartMs).toString();
  summary.timing.interrupted = runtime.stopRequested;
}

async function writeSummary(outputPath: string, summary: JsonRecord): Promise<void> {
  const absolutePath = resolve(outputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function printFinalSummary(summary: JsonRecord, outputPath: string): void {
  console.log("Run complete");
  console.log(
    [
      `status=${summary.outcome.status}`,
      `generated=${summary.simulation.generated}`,
      `delivered=${summary.simulation.delivered}`,
      `ordered=${summary.stream.orderedEvents}`,
      `anomalies=${summary.stream.anomalies}`,
      `late=${summary.stream.byAnomalyType.late_arrival ?? 0}`,
      `duplicates=${summary.simulation.duplicatesInjected}`,
      `corrections=${summary.stream.correctionBatches}`,
      `output=${resolve(outputPath)}`,
    ].join(" | "),
  );
}

function buildHeartbeat(runtime: JsonRecord, summary: JsonRecord, kind: string): JsonRecord {
  const memory = process.memoryUsage();

  return {
    timestampIso: new Date().toISOString(),
    kind,
    status: runtime.outcome.status,
    wallElapsedMs: Date.now() - runtime.wallStartMs,
    simulatedElapsedMs: (
      runtime.simulationNowMs() - runtime.simulatedStartMs
    ).toString(),
    generated: summary.simulation.generated,
    delivered: summary.simulation.delivered,
    ordered: summary.stream.orderedEvents,
    anomalies: summary.stream.anomalies,
    lateAnomalies: summary.stream.byAnomalyType.late_arrival ?? 0,
    batches: summary.stream.batches,
    queueDepth: summary.simulation.currentQueueDepth,
    maxQueueDepth: summary.simulation.maxQueueDepth,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    externalBytes: memory.external,
  };
}

async function persistBatchAnomalies(batch: JsonRecord, runtime: JsonRecord): Promise<void> {
  if (batch.anomalies.length === 0) {
    return;
  }

  const records: JsonRecord[] = [];
  for (const anomaly of batch.anomalies) {
    if (!shouldPersistAnomaly(anomaly, runtime)) {
      continue;
    }

    records.push({
      timestampIso: new Date().toISOString(),
      type: anomaly.type,
      severity: anomaly.severity,
      eventId: anomaly.event?.id ?? null,
      nodeId: anomaly.event?.nodeId ?? null,
      relatedEventIds: anomaly.relatedEvents?.map((event: JsonRecord) => event.id) ?? [],
      message: anomaly.message,
    });
  }

  if (records.length === 0) {
    return;
  }

  await appendFile(
    runtime.artifactPaths.anomalyPath,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    "utf8",
  );
}

function shouldPersistAnomaly(anomaly: JsonRecord, runtime: JsonRecord): boolean {
  if (anomaly.type !== "late_arrival") {
    return true;
  }

  if (anomaly.severity !== "warning") {
    return true;
  }

  if (runtime.persistedLateArrivalSamples >= runtime.config.maxLateArrivalSamples) {
    return false;
  }

  runtime.persistedLateArrivalSamples += 1;
  return true;
}

function formatDuration(milliseconds: number | bigint): string {
  const totalMs = Number(milliseconds);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const ms = totalMs % 1_000;

  if (hours > 0) {
    return `${hours}h${minutes.toString().padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
  }
  if (seconds > 0) {
    return `${seconds}s`;
  }
  return `${ms}ms`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
