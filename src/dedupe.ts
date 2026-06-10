import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface DedupeEvent {
  id?: string | null;
  nodeId?: string | null;
  sequence?: bigint | number | string;
}

export type DedupePreset =
  | "standard"
  | "heavy-duplicates"
  | "high-latency"
  | "cross-node-busy";

const DEDUPE_PRESET_WINDOWS = {
  standard: {
    slidingWindowSeconds: 180,
    maxSlidingWindowSeconds: 300,
  },
  "heavy-duplicates": {
    slidingWindowSeconds: 300,
    maxSlidingWindowSeconds: 600,
  },
  "high-latency": {
    slidingWindowSeconds: 480,
    maxSlidingWindowSeconds: 900,
  },
  "cross-node-busy": {
    slidingWindowSeconds: 240,
    maxSlidingWindowSeconds: 480,
  },
} satisfies Record<
  DedupePreset,
  {
    slidingWindowSeconds: number;
    maxSlidingWindowSeconds: number;
  }
>;

export interface DedupeGatewayConfig {
  preset?: DedupePreset;
  maxSlidingWindowSeconds?: number;
  slidingWindowSeconds?: number;
  autoCleanup?: boolean;
  autoCleanupIntervalSeconds?: number;
  nowProvider?: () => bigint | number;
  now_provider?: () => bigint | number;
}

export interface DedupeGatewayFileConfig {
  preset?: DedupePreset;
  maxSlidingWindowSeconds?: number;
  slidingWindowSeconds?: number;
  autoCleanup?: boolean;
  autoCleanupIntervalSeconds?: number;
}

interface ResolvedDedupeGatewayConfig {
  maxSlidingWindowSeconds: number;
  slidingWindowSeconds: number;
  autoCleanup: boolean;
  autoCleanupIntervalSeconds: number;
  nowProvider: (() => bigint | number) | null;
}

export function loadDedupeGatewayConfigFile(
  configPath: string,
): DedupeGatewayFileConfig {
  const resolvedPath = resolve(configPath);
  const rawConfig = readJsonConfigFile(resolvedPath);
  return parseDedupeGatewayConfigFile(rawConfig, resolvedPath);
}

export function createDedupeGatewayFromConfigFile(
  configPath: string,
  overrides: DedupeGatewayConfig = {},
): DedupeGateway {
  return new DedupeGateway({
    ...loadDedupeGatewayConfigFile(configPath),
    ...overrides,
  });
}

export class DedupeGateway {
  #maxSlidingWindowMs: bigint;
  #currentWindowMs: bigint;
  #cache: Map<string, bigint>;
  #nowProvider: () => bigint | number;
  #autoCleanupEnabled: boolean;
  #autoCleanupIntervalMs: bigint;
  #lastCleanupAtMs: bigint | null;

  constructor(config: DedupeGatewayConfig = {}) {
    const resolved = resolveGatewayConfig(config);

    this.#maxSlidingWindowMs = BigInt(
      Math.floor(resolved.maxSlidingWindowSeconds * 1000),
    );
    this.#currentWindowMs = BigInt(
      Math.floor(resolved.slidingWindowSeconds * 1000),
    );
    this.#cache = new Map();
    this.#nowProvider = resolved.nowProvider ?? (() => BigInt(Date.now()));
    this.#autoCleanupEnabled = resolved.autoCleanup;
    this.#autoCleanupIntervalMs = BigInt(
      Math.floor(resolved.autoCleanupIntervalSeconds * 1000),
    );
    this.#lastCleanupAtMs = null;
  }

  get maxSlidingWindowMs(): bigint {
    return this.#maxSlidingWindowMs;
  }

  get currentWindowMs(): bigint {
    return this.#currentWindowMs;
  }

  get cacheSize(): number {
    return this.#cache.size;
  }

  updateWindow(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    let targetMs = BigInt(Math.floor(seconds * 1000));

    if (targetMs > this.#maxSlidingWindowMs) {
      targetMs = this.#maxSlidingWindowMs;
    }

    this.#currentWindowMs = targetMs;
  }

  filter(event?: DedupeEvent | null): boolean {
    if (!event) {
      return true;
    }

    let identityKey = event.id;
    if (!identityKey && event.nodeId && event.sequence !== undefined) {
      identityKey = `${event.nodeId}::${event.sequence}`;
    }

    if (!identityKey) {
      return true;
    }

    const currentTime = BigInt(this.#nowProvider());
    this.#maybeAutoCleanup(currentTime);

    if (this.#cache.has(identityKey)) {
      return false;
    }

    this.#cache.set(identityKey, currentTime);
    return true;
  }

  cleanup(): void {
    this.#cleanupAt(BigInt(this.#nowProvider()));
  }

  destroy(): void {
    this.#cache.clear();
    this.#lastCleanupAtMs = null;
  }

  #maybeAutoCleanup(currentTime: bigint): void {
    if (!this.#autoCleanupEnabled) {
      return;
    }

    if (
      this.#lastCleanupAtMs === null ||
      currentTime < this.#lastCleanupAtMs ||
      currentTime - this.#lastCleanupAtMs >= this.#autoCleanupIntervalMs
    ) {
      this.#cleanupAt(currentTime);
      this.#lastCleanupAtMs = currentTime;
    }
  }

  #cleanupAt(currentTime: bigint): void {
    const threshold = currentTime - this.#currentWindowMs;

    for (const [id, timestamp] of this.#cache.entries()) {
      if (timestamp < threshold) {
        this.#cache.delete(id);
      } else {
        break;
      }
    }
  }
}

function resolveGatewayConfig(
  config: DedupeGatewayConfig,
): ResolvedDedupeGatewayConfig {
  const preset = resolveDedupePreset(config.preset);
  const maxSlidingWindowSeconds = resolvePositiveSeconds({
    value: config.maxSlidingWindowSeconds,
    fallback: preset.maxSlidingWindowSeconds,
    label: "maxSlidingWindowSeconds",
  });
  const slidingWindowSeconds = resolvePositiveSeconds({
    value: config.slidingWindowSeconds,
    fallback: preset.slidingWindowSeconds,
    label: "slidingWindowSeconds",
  });

  if (slidingWindowSeconds > maxSlidingWindowSeconds) {
    throw invalidDedupeConfigError(
      "slidingWindowSeconds cannot be greater than maxSlidingWindowSeconds",
    );
  }

  return {
    maxSlidingWindowSeconds,
    slidingWindowSeconds,
    autoCleanup: config.autoCleanup ?? true,
    autoCleanupIntervalSeconds: resolvePositiveSeconds({
      value: config.autoCleanupIntervalSeconds,
      fallback: 30,
      label: "autoCleanupIntervalSeconds",
    }),
    nowProvider: config.nowProvider ?? config.now_provider ?? null,
  };
}

function resolveDedupePreset(preset: DedupeGatewayConfig["preset"]): {
  slidingWindowSeconds: number;
  maxSlidingWindowSeconds: number;
} {
  if (preset === undefined) {
    return DEDUPE_PRESET_WINDOWS.standard;
  }

  const resolved = DEDUPE_PRESET_WINDOWS[resolveDedupePresetName(preset)];
  if (!resolved) {
    throw invalidDedupeConfigError(`unsupported preset "${preset}"`);
  }

  return resolved;
}

function resolveDedupePresetName(preset: string): DedupePreset {
  return preset.trim() as DedupePreset;
}

function resolvePositiveSeconds({
  value,
  fallback,
  label,
}: {
  value: number | undefined;
  fallback: number;
  label: string;
}): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw invalidDedupeConfigError(
      `${label} must be a positive finite number`,
    );
  }

  return value;
}

function readJsonConfigFile(resolvedPath: string): unknown {
  try {
    return JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to read dedupe config file ${resolvedPath}: ${message}`,
    );
  }
}

function parseDedupeGatewayConfigFile(
  value: unknown,
  resolvedPath: string,
): DedupeGatewayFileConfig {
  const record = resolveObjectRecord(
    value,
    `Dedupe config file ${resolvedPath}`,
  );
  const supportedKeys = new Set([
    "preset",
    "slidingWindowSeconds",
    "maxSlidingWindowSeconds",
    "autoCleanup",
    "autoCleanupIntervalSeconds",
  ]);

  for (const key of Object.keys(record)) {
    if (!supportedKeys.has(key)) {
      throw invalidDedupeConfigFileError(
        resolvedPath,
        `unknown field "${key}"`,
      );
    }
  }

  const hasPreset = "preset" in record;
  const hasSlidingWindow = "slidingWindowSeconds" in record;
  const hasMaxSlidingWindow = "maxSlidingWindowSeconds" in record;
  const hasExplicitWindowConfig = hasSlidingWindow || hasMaxSlidingWindow;

  if (hasPreset && hasExplicitWindowConfig) {
    throw invalidDedupeConfigFileError(
      resolvedPath,
      'choose either "preset" or explicit "slidingWindowSeconds" and "maxSlidingWindowSeconds", not both',
    );
  }

  if (hasExplicitWindowConfig && !(hasSlidingWindow && hasMaxSlidingWindow)) {
    throw invalidDedupeConfigFileError(
      resolvedPath,
      'explicit window config requires both "slidingWindowSeconds" and "maxSlidingWindowSeconds"',
    );
  }

  const config: DedupeGatewayFileConfig = {};

  if (hasPreset) {
    config.preset = parseFilePreset(
      record.preset,
      `Dedupe config file field "preset" in ${resolvedPath}`,
    );
  }

  if (hasSlidingWindow) {
    config.slidingWindowSeconds = parsePositiveFiniteNumber(
      record.slidingWindowSeconds,
      `Dedupe config file field "slidingWindowSeconds" in ${resolvedPath}`,
    );
  }

  if (hasMaxSlidingWindow) {
    config.maxSlidingWindowSeconds = parsePositiveFiniteNumber(
      record.maxSlidingWindowSeconds,
      `Dedupe config file field "maxSlidingWindowSeconds" in ${resolvedPath}`,
    );
  }

  if ("autoCleanup" in record) {
    config.autoCleanup = parseBooleanValue(
      record.autoCleanup,
      `Dedupe config file field "autoCleanup" in ${resolvedPath}`,
    );
  }

  if ("autoCleanupIntervalSeconds" in record) {
    config.autoCleanupIntervalSeconds = parsePositiveFiniteNumber(
      record.autoCleanupIntervalSeconds,
      `Dedupe config file field "autoCleanupIntervalSeconds" in ${resolvedPath}`,
    );
  }

  resolveGatewayConfig(config);
  return config;
}

function resolveObjectRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }

  return value as Record<string, unknown>;
}

function parseFilePreset(value: unknown, label: string): DedupePreset {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  const preset = resolveDedupePresetName(value);
  if (!DEDUPE_PRESET_WINDOWS[preset]) {
    throw invalidDedupeConfigError(`unsupported preset "${value}"`);
  }

  return preset;
}

function parsePositiveFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }

  return value;
}

function parseBooleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}

function invalidDedupeConfigError(detail: string): Error {
  return new Error(`Invalid dedupe config: ${detail}`);
}

function invalidDedupeConfigFileError(
  resolvedPath: string,
  detail: string,
): Error {
  return new Error(`Invalid dedupe config file ${resolvedPath}: ${detail}`);
}
