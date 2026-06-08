import assert from "node:assert/strict";

import {
  DedupeGateway,
  type DedupeGatewayConfig,
  type DedupePreset,
} from "../src/dedupe.js";

const PRESET_EXPECTATIONS: Record<
  DedupePreset,
  { currentWindowMs: bigint; maxSlidingWindowMs: bigint }
> = {
  standard: {
    currentWindowMs: 180_000n,
    maxSlidingWindowMs: 300_000n,
  },
  "heavy-duplicates": {
    currentWindowMs: 300_000n,
    maxSlidingWindowMs: 600_000n,
  },
  "high-latency": {
    currentWindowMs: 480_000n,
    maxSlidingWindowMs: 900_000n,
  },
  "cross-node-busy": {
    currentWindowMs: 240_000n,
    maxSlidingWindowMs: 480_000n,
  },
};

function run(): void {
  const supportedPresets = Object.keys(PRESET_EXPECTATIONS) as DedupePreset[];

  for (const preset of supportedPresets) {
    const config: DedupeGatewayConfig = { preset };
    const gateway = new DedupeGateway(config);

    assert.equal(typeof config.preset, "string");
    assert.equal(
      gateway.currentWindowMs,
      PRESET_EXPECTATIONS[preset].currentWindowMs,
    );
    assert.equal(
      gateway.maxSlidingWindowMs,
      PRESET_EXPECTATIONS[preset].maxSlidingWindowMs,
    );
  }

  const defaultGateway = new DedupeGateway();
  assert.equal(
    defaultGateway.currentWindowMs,
    PRESET_EXPECTATIONS.standard.currentWindowMs,
  );
  assert.equal(
    defaultGateway.maxSlidingWindowMs,
    PRESET_EXPECTATIONS.standard.maxSlidingWindowMs,
  );

  const manualGateway = new DedupeGateway({
    slidingWindowSeconds: 240,
    maxSlidingWindowSeconds: 600,
  });
  assert.equal(manualGateway.currentWindowMs, 240_000n);
  assert.equal(manualGateway.maxSlidingWindowMs, 600_000n);

  const manualOverrideGateway = new DedupeGateway({
    preset: "high-latency",
    slidingWindowSeconds: 210,
    maxSlidingWindowSeconds: 420,
  });
  assert.equal(manualOverrideGateway.currentWindowMs, 210_000n);
  assert.equal(manualOverrideGateway.maxSlidingWindowMs, 420_000n);

  assert.throws(
    () =>
      new DedupeGateway({
        preset: "not-a-real-preset" as DedupePreset,
      }),
    /Unsupported dedupe preset/,
  );

  assert.throws(
    () =>
      new DedupeGateway({
        slidingWindowSeconds: -1,
      }),
    /slidingWindowSeconds must be a positive finite number/,
  );

  assert.throws(
    () =>
      new DedupeGateway({
        slidingWindowSeconds: 400,
        maxSlidingWindowSeconds: 300,
      }),
    /slidingWindowSeconds must be less than or equal to maxSlidingWindowSeconds/,
  );

  let nowMs = 0;
  const autoCleanupGateway = new DedupeGateway({
    slidingWindowSeconds: 1,
    maxSlidingWindowSeconds: 1,
    autoCleanupIntervalSeconds: 1,
    nowProvider: () => nowMs,
  });
  assert.equal(autoCleanupGateway.filter({ id: "event-a" }), true);
  nowMs = 2_500;
  assert.equal(autoCleanupGateway.filter({ id: "event-b" }), true);
  assert.equal(autoCleanupGateway.filter({ id: "event-a" }), true);

  nowMs = 0;
  const manualCleanupGateway = new DedupeGateway({
    slidingWindowSeconds: 1,
    maxSlidingWindowSeconds: 1,
    autoCleanup: false,
    nowProvider: () => nowMs,
  });
  assert.equal(manualCleanupGateway.filter({ id: "event-a" }), true);
  nowMs = 2_500;
  assert.equal(manualCleanupGateway.filter({ id: "event-a" }), false);
  manualCleanupGateway.cleanup();
  assert.equal(manualCleanupGateway.filter({ id: "event-a" }), true);

  console.log("preset contract checks passed");
}

run();
