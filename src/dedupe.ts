import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

export interface DedupeEvent {
  id?: string | null;
  nodeId?: string | null;
  sequence?: bigint | number | string;
}

export type DedupeIdentitySource = "id" | "node_sequence" | "none";

export type DedupeFilterReason =
  | "accepted"
  | "duplicate"
  | "accepted_without_identity";

export interface DedupeFilterResult {
  accepted: boolean;
  reason: DedupeFilterReason;
  identitySource: DedupeIdentitySource;
}

export interface DedupeIdentityLedgerStats {
  storedIdentities: number;
  maxIdentities: number;
  databasePath: string;
}

export interface DedupeIdentityLedger {
  claim(identityKey: string, acceptedAtMs: bigint): boolean;
  getStats?(): DedupeIdentityLedgerStats;
  close?(): void;
}

export interface SqliteIdentityLedgerConfig {
  databasePath: string;
  maxIdentities: number;
}

export class DedupeIdentityLedgerCapacityError extends Error {
  readonly code = "ERR_DEDUPE_IDENTITY_LEDGER_CAPACITY";
  readonly storedIdentities: number;
  readonly maxIdentities: number;

  constructor(storedIdentities: number, maxIdentities: number) {
    super(
      `Durable dedupe identity ledger capacity exhausted (${storedIdentities}/${maxIdentities}); refusing a new identity`,
    );
    this.name = "DedupeIdentityLedgerCapacityError";
    this.storedIdentities = storedIdentities;
    this.maxIdentities = maxIdentities;
  }
}

export class SqliteIdentityLedger implements DedupeIdentityLedger {
  readonly databasePath: string;
  readonly maxIdentities: number;
  #database: DatabaseSync;
  #containsStatement: StatementSync;
  #insertStatement: StatementSync;
  #incrementCountStatement: StatementSync;
  #countStatement: StatementSync;
  #closed = false;

  constructor(config: SqliteIdentityLedgerConfig) {
    const databasePath = resolveDurableLedgerPath(config.databasePath);
    const maxIdentities = resolvePositiveSafeInteger(
      config.maxIdentities,
      "maxDurableIdentities",
    );
    this.databasePath = databasePath;
    this.maxIdentities = maxIdentities;
    this.#database = new DatabaseSync(databasePath);
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec("PRAGMA busy_timeout = 5000");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS dedupe_processed_identities (
        identity_key TEXT PRIMARY KEY,
        accepted_at_ms INTEGER NOT NULL
      ) STRICT
    `);
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS dedupe_identity_ledger_metadata (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        identity_count INTEGER NOT NULL,
        max_identities INTEGER NOT NULL
      ) STRICT
    `);
    this.#database
      .prepare(`
        INSERT OR IGNORE INTO dedupe_identity_ledger_metadata (
          singleton_id,
          identity_count,
          max_identities
        ) VALUES (
          1,
          (SELECT COUNT(*) FROM dedupe_processed_identities),
          ?
        )
      `)
      .run(maxIdentities);
    const metadata = this.#database
      .prepare(`
        SELECT max_identities
        FROM dedupe_identity_ledger_metadata
        WHERE singleton_id = 1
      `)
      .get() as { max_identities?: number | bigint } | undefined;
    const recordedMaxIdentities = Number(metadata?.max_identities ?? 0);
    if (recordedMaxIdentities !== maxIdentities) {
      this.#database.close();
      throw invalidDedupeConfigError(
        `durable ledger was created with maxDurableIdentities=${recordedMaxIdentities}, not ${maxIdentities}`,
      );
    }
    this.#containsStatement = this.#database.prepare(`
      SELECT 1 AS present
      FROM dedupe_processed_identities
      WHERE identity_key = ?
    `);
    this.#insertStatement = this.#database.prepare(`
      INSERT INTO dedupe_processed_identities (
        identity_key,
        accepted_at_ms
      ) VALUES (?, ?)
    `);
    this.#incrementCountStatement = this.#database.prepare(`
      UPDATE dedupe_identity_ledger_metadata
      SET identity_count = identity_count + 1
      WHERE singleton_id = 1
    `);
    this.#countStatement = this.#database.prepare(`
      SELECT identity_count
      FROM dedupe_identity_ledger_metadata
      WHERE singleton_id = 1
    `);
  }

  claim(identityKey: string, acceptedAtMs: bigint): boolean {
    this.#requireOpen();
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      if (this.#containsStatement.get(identityKey)) {
        this.#database.exec("COMMIT");
        return false;
      }
      const storedIdentities = this.#readStoredIdentityCount();
      if (storedIdentities >= this.maxIdentities) {
        throw new DedupeIdentityLedgerCapacityError(
          storedIdentities,
          this.maxIdentities,
        );
      }
      this.#insertStatement.run(identityKey, acceptedAtMs);
      this.#incrementCountStatement.run();
      this.#database.exec("COMMIT");
      return true;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  getStats(): DedupeIdentityLedgerStats {
    this.#requireOpen();
    const row = this.#countStatement.get() as
      | { identity_count?: number | bigint }
      | undefined;
    return {
      storedIdentities: Number(row?.identity_count ?? 0),
      maxIdentities: this.maxIdentities,
      databasePath: this.databasePath,
    };
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#database.close();
  }

  #requireOpen(): void {
    if (this.#closed) {
      throw new Error("Dedupe identity ledger is closed");
    }
  }

  #readStoredIdentityCount(): number {
    const row = this.#countStatement.get() as
      | { identity_count?: number | bigint }
      | undefined;
    return Number(row?.identity_count ?? 0);
  }
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
  identityLedger?: DedupeIdentityLedger;
  durableIdentityLedgerPath?: string;
  maxDurableIdentities?: number;
}

export interface DedupeGatewayFileConfig {
  preset?: DedupePreset;
  maxSlidingWindowSeconds?: number;
  slidingWindowSeconds?: number;
  autoCleanup?: boolean;
  autoCleanupIntervalSeconds?: number;
  durableIdentityLedgerPath?: string;
  maxDurableIdentities?: number;
}

export interface DedupeGatewayStats {
  acceptedEvents: number;
  droppedDuplicates: number;
  currentCacheSize: number;
  activeWindowSeconds: number;
  durableLedger?: DedupeIdentityLedgerStats;
}

interface ResolvedDedupeGatewayConfig {
  maxSlidingWindowSeconds: number;
  slidingWindowSeconds: number;
  autoCleanup: boolean;
  autoCleanupIntervalSeconds: number;
  nowProvider: (() => bigint | number) | null;
  identityLedger: DedupeIdentityLedger | null;
  durableIdentityLedgerPath: string | null;
  maxDurableIdentities: number | null;
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
  #minSlidingWindowMs: bigint;
  #maxSlidingWindowMs: bigint;
  #currentWindowMs: bigint;
  #cache: Map<string, bigint>;
  #acceptedEvents: number;
  #droppedDuplicates: number;
  #nowProvider: () => bigint | number;
  #autoCleanupEnabled: boolean;
  #autoCleanupIntervalMs: bigint;
  #lastCleanupAtMs: bigint | null;
  #identityLedger: DedupeIdentityLedger | null;
  #ownsIdentityLedger: boolean;
  #destroyed = false;

  constructor(config: DedupeGatewayConfig = {}) {
    const resolved = resolveGatewayConfig(config);

    this.#minSlidingWindowMs = BigInt(
      Math.floor(resolved.slidingWindowSeconds * 1000),
    );
    this.#maxSlidingWindowMs = BigInt(
      Math.floor(resolved.maxSlidingWindowSeconds * 1000),
    );
    this.#currentWindowMs = this.#minSlidingWindowMs;
    this.#cache = new Map();
    this.#acceptedEvents = 0;
    this.#droppedDuplicates = 0;
    this.#nowProvider = resolved.nowProvider ?? (() => BigInt(Date.now()));
    this.#autoCleanupEnabled = resolved.autoCleanup;
    this.#autoCleanupIntervalMs = BigInt(
      Math.floor(resolved.autoCleanupIntervalSeconds * 1000),
    );
    this.#lastCleanupAtMs = null;
    this.#identityLedger =
      resolved.identityLedger ??
      (resolved.durableIdentityLedgerPath
        ? new SqliteIdentityLedger({
            databasePath: resolved.durableIdentityLedgerPath,
            maxIdentities: resolved.maxDurableIdentities as number,
          })
        : null);
    this.#ownsIdentityLedger =
      resolved.identityLedger === null &&
      resolved.durableIdentityLedgerPath !== null;
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

  getStats(): DedupeGatewayStats {
    const stats: DedupeGatewayStats = {
      acceptedEvents: this.#acceptedEvents,
      droppedDuplicates: this.#droppedDuplicates,
      currentCacheSize: this.#cache.size,
      activeWindowSeconds: Number(this.#currentWindowMs) / 1000,
    };
    const durableLedger = this.#destroyed
      ? undefined
      : this.#identityLedger?.getStats?.();
    if (durableLedger) {
      stats.durableLedger = durableLedger;
    }
    return stats;
  }

  updateWindow(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    let targetMs = BigInt(Math.floor(seconds * 1000));

    if (targetMs < this.#minSlidingWindowMs) {
      targetMs = this.#minSlidingWindowMs;
    }

    if (targetMs > this.#maxSlidingWindowMs) {
      targetMs = this.#maxSlidingWindowMs;
    }

    this.#currentWindowMs = targetMs;
  }

  filter(event?: DedupeEvent | null): boolean {
    return this.filterWithResult(event).accepted;
  }

  filterWithResult(event?: DedupeEvent | null): DedupeFilterResult {
    if (this.#destroyed) {
      throw new Error("Dedupe gateway is destroyed");
    }
    if (!event) {
      this.#acceptedEvents += 1;
      return {
        accepted: true,
        reason: "accepted_without_identity",
        identitySource: "none",
      };
    }

    let identityKey = event.id;
    let identitySource: DedupeIdentitySource = identityKey ? "id" : "none";
    if (!identityKey && event.nodeId && event.sequence !== undefined) {
      identityKey = `${event.nodeId}::${event.sequence}`;
      identitySource = "node_sequence";
    }

    if (!identityKey) {
      this.#acceptedEvents += 1;
      return {
        accepted: true,
        reason: "accepted_without_identity",
        identitySource: "none",
      };
    }

    const currentTime = BigInt(this.#nowProvider());
    this.#maybeAutoCleanup(currentTime);

    if (this.#cache.has(identityKey)) {
      this.#droppedDuplicates += 1;
      return {
        accepted: false,
        reason: "duplicate",
        identitySource,
      };
    }

    if (
      this.#identityLedger &&
      !this.#identityLedger.claim(identityKey, currentTime)
    ) {
      this.#droppedDuplicates += 1;
      return {
        accepted: false,
        reason: "duplicate",
        identitySource,
      };
    }

    this.#cache.set(identityKey, currentTime);
    this.#acceptedEvents += 1;
    return {
      accepted: true,
      reason: "accepted",
      identitySource,
    };
  }

  cleanup(): void {
    this.#cleanupAt(BigInt(this.#nowProvider()));
  }

  destroy(): void {
    this.#cache.clear();
    this.#acceptedEvents = 0;
    this.#droppedDuplicates = 0;
    this.#lastCleanupAtMs = null;
    this.#destroyed = true;
    if (this.#ownsIdentityLedger) {
      this.#identityLedger?.close?.();
    }
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

  if (config.identityLedger && config.durableIdentityLedgerPath) {
    throw invalidDedupeConfigError(
      "choose either identityLedger or durableIdentityLedgerPath, not both",
    );
  }
  const hasDurablePath = config.durableIdentityLedgerPath !== undefined;
  const hasDurableCapacity = config.maxDurableIdentities !== undefined;
  if (hasDurablePath !== hasDurableCapacity) {
    throw invalidDedupeConfigError(
      "durableIdentityLedgerPath and maxDurableIdentities must be configured together",
    );
  }
  if (
    config.identityLedger !== undefined &&
    typeof config.identityLedger.claim !== "function"
  ) {
    throw invalidDedupeConfigError("identityLedger must implement claim()");
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
    nowProvider: config.nowProvider ?? null,
    identityLedger: config.identityLedger ?? null,
    durableIdentityLedgerPath:
      config.durableIdentityLedgerPath === undefined
        ? null
        : resolveDurableLedgerPath(config.durableIdentityLedgerPath),
    maxDurableIdentities:
      config.maxDurableIdentities === undefined
        ? null
        : resolvePositiveSafeInteger(
            config.maxDurableIdentities,
            "maxDurableIdentities",
          ),
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
    "durableIdentityLedgerPath",
    "maxDurableIdentities",
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

  if ("durableIdentityLedgerPath" in record) {
    config.durableIdentityLedgerPath = parseFileLedgerPath(
      record.durableIdentityLedgerPath,
      resolvedPath,
    );
  }
  if ("maxDurableIdentities" in record) {
    config.maxDurableIdentities = parsePositiveSafeInteger(
      record.maxDurableIdentities,
      `Dedupe config file field "maxDurableIdentities" in ${resolvedPath}`,
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

function parsePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number") {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return resolvePositiveSafeInteger(value, label);
}

function resolvePositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function resolveDurableLedgerPath(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidDedupeConfigError(
      "durableIdentityLedgerPath must be a non-empty string",
    );
  }
  if (value === ":memory:") {
    throw invalidDedupeConfigError(
      'durableIdentityLedgerPath cannot be ":memory:"',
    );
  }
  return resolve(value);
}

function parseFileLedgerPath(value: unknown, configPath: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Dedupe config file field "durableIdentityLedgerPath" in ${configPath} must be a non-empty string`,
    );
  }
  if (value === ":memory:") {
    throw invalidDedupeConfigFileError(
      configPath,
      'durableIdentityLedgerPath cannot be ":memory:"',
    );
  }
  return isAbsolute(value) ? value : resolve(dirname(configPath), value);
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
