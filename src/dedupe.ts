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

export class DedupeGateway {
  #maxSlidingWindowMs: bigint;
  #currentWindowMs: bigint;
  #cache: Map<string, bigint>;
  #nowProvider: () => bigint | number;
  #autoCleanupEnabled: boolean;
  #autoCleanupIntervalMs: bigint;
  #lastCleanupAtMs: bigint | null;

  constructor(config: DedupeGatewayConfig = {}) {
    const preset = resolveDedupePreset(config.preset);
    const maxSeconds = resolvePositiveSeconds({
      value: config.maxSlidingWindowSeconds,
      fallback: preset.maxSlidingWindowSeconds,
      label: "maxSlidingWindowSeconds",
    });
    const initialSeconds = resolvePositiveSeconds({
      value: config.slidingWindowSeconds,
      fallback: preset.slidingWindowSeconds,
      label: "slidingWindowSeconds",
    });

    if (initialSeconds > maxSeconds) {
      throw new Error(
        "slidingWindowSeconds must be less than or equal to maxSlidingWindowSeconds",
      );
    }

    this.#maxSlidingWindowMs = BigInt(Math.floor(maxSeconds * 1000));
    this.#currentWindowMs = BigInt(Math.floor(initialSeconds * 1000));
    this.#cache = new Map();
    this.#nowProvider =
      config.nowProvider ??
      config.now_provider ??
      (() => BigInt(Date.now()));
    this.#autoCleanupEnabled = config.autoCleanup ?? true;
    this.#autoCleanupIntervalMs = BigInt(
      Math.floor(
        resolvePositiveSeconds({
          value: config.autoCleanupIntervalSeconds,
          fallback: 30,
          label: "autoCleanupIntervalSeconds",
        }) * 1000,
      ),
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

function resolveDedupePreset(preset: DedupeGatewayConfig["preset"]): {
  slidingWindowSeconds: number;
  maxSlidingWindowSeconds: number;
} {
  if (preset === undefined) {
    return DEDUPE_PRESET_WINDOWS.standard;
  }

  const resolved = DEDUPE_PRESET_WINDOWS[preset];
  if (!resolved) {
    throw new Error(`Unsupported dedupe preset: ${preset}`);
  }

  return resolved;
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
    throw new Error(`${label} must be a positive finite number`);
  }

  return value;
}
