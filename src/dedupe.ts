export interface DedupeEvent {
  id?: string | null;
  nodeId?: string | null;
  sequence?: bigint | number | string;
}

export interface DedupeGatewayConfig {
  maxSlidingWindowSeconds?: number;
  slidingWindowSeconds?: number;
  nowProvider?: () => bigint | number;
  now_provider?: () => bigint | number;
}

export class DedupeGateway {
  maxSlidingWindowMs: bigint;
  currentWindowMs: bigint;
  cache: Map<string, bigint>;
  nowProvider: () => bigint | number;

  constructor(config: DedupeGatewayConfig = {}) {
    const maxSeconds = config.maxSlidingWindowSeconds ?? 300;
    this.maxSlidingWindowMs = BigInt(maxSeconds * 1000);

    const initialSeconds = config.slidingWindowSeconds ?? 180;
    this.currentWindowMs = BigInt(initialSeconds * 1000);

    this.cache = new Map();
    this.nowProvider =
      config.nowProvider ??
      config.now_provider ??
      (() => BigInt(Date.now()));
  }

  updateWindow(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }

    let targetMs = BigInt(Math.floor(seconds * 1000));

    if (targetMs > this.maxSlidingWindowMs) {
      targetMs = this.maxSlidingWindowMs;
    }

    this.currentWindowMs = targetMs;
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

    const currentTime = BigInt(this.nowProvider());

    if (this.cache.has(identityKey)) {
      return false;
    }

    this.cache.set(identityKey, currentTime);
    return true;
  }

  cleanup(): void {
    const currentTime = BigInt(this.nowProvider());
    const threshold = currentTime - this.currentWindowMs;

    for (const [id, timestamp] of this.cache.entries()) {
      if (timestamp < threshold) {
        this.cache.delete(id);
      } else {
        break;
      }
    }
  }

  destroy(): void {
    this.cache.clear();
  }
}
