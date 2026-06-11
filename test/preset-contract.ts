import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  createDedupeGatewayFromConfigFile,
  DedupeGateway,
  type DedupeGatewayConfig,
  type DedupePreset,
  loadDedupeGatewayConfigFile,
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
  const tempDir = mkdtempSync(resolve(tmpdir(), "dedupe-config-"));
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
  assert.deepEqual(defaultGateway.getStats(), {
    acceptedEvents: 0,
    droppedDuplicates: 0,
    currentCacheSize: 0,
    activeWindowSeconds: 180,
  });

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
    /Invalid dedupe config: unsupported preset "not-a-real-preset"/,
  );

  assert.throws(
    () =>
      new DedupeGateway({
        slidingWindowSeconds: -1,
      }),
    /Invalid dedupe config: slidingWindowSeconds must be a positive finite number/,
  );

  assert.throws(
    () =>
      new DedupeGateway({
        slidingWindowSeconds: 400,
        maxSlidingWindowSeconds: 300,
      }),
    /Invalid dedupe config: slidingWindowSeconds cannot be greater than maxSlidingWindowSeconds/,
  );

  let nowMs = 0;
  const autoCleanupGateway = new DedupeGateway({
    slidingWindowSeconds: 1,
    maxSlidingWindowSeconds: 1,
    autoCleanupIntervalSeconds: 1,
    nowProvider: () => nowMs,
  });
  assert.equal(autoCleanupGateway.filter({ id: "event-a" }), true);
  assert.deepEqual(autoCleanupGateway.getStats(), {
    acceptedEvents: 1,
    droppedDuplicates: 0,
    currentCacheSize: 1,
    activeWindowSeconds: 1,
  });
  nowMs = 2_500;
  assert.equal(autoCleanupGateway.filter({ id: "event-b" }), true);
  assert.deepEqual(autoCleanupGateway.getStats(), {
    acceptedEvents: 2,
    droppedDuplicates: 0,
    currentCacheSize: 1,
    activeWindowSeconds: 1,
  });
  assert.equal(autoCleanupGateway.filter({ id: "event-a" }), true);
  assert.deepEqual(autoCleanupGateway.getStats(), {
    acceptedEvents: 3,
    droppedDuplicates: 0,
    currentCacheSize: 2,
    activeWindowSeconds: 1,
  });

  nowMs = 0;
  const manualCleanupGateway = new DedupeGateway({
    slidingWindowSeconds: 1,
    maxSlidingWindowSeconds: 1,
    autoCleanup: false,
    nowProvider: () => nowMs,
  });
  assert.equal(manualCleanupGateway.filter({ id: "event-a" }), true);
  assert.deepEqual(manualCleanupGateway.getStats(), {
    acceptedEvents: 1,
    droppedDuplicates: 0,
    currentCacheSize: 1,
    activeWindowSeconds: 1,
  });
  nowMs = 2_500;
  assert.equal(manualCleanupGateway.filter({ id: "event-a" }), false);
  assert.deepEqual(manualCleanupGateway.getStats(), {
    acceptedEvents: 1,
    droppedDuplicates: 1,
    currentCacheSize: 1,
    activeWindowSeconds: 1,
  });
  manualCleanupGateway.cleanup();
  assert.deepEqual(manualCleanupGateway.getStats(), {
    acceptedEvents: 1,
    droppedDuplicates: 1,
    currentCacheSize: 0,
    activeWindowSeconds: 1,
  });
  assert.equal(manualCleanupGateway.filter({ id: "event-a" }), true);
  assert.deepEqual(manualCleanupGateway.getStats(), {
    acceptedEvents: 2,
    droppedDuplicates: 1,
    currentCacheSize: 1,
    activeWindowSeconds: 1,
  });

  const identityFallbackGateway = new DedupeGateway({
    slidingWindowSeconds: 2,
    maxSlidingWindowSeconds: 4,
  });
  assert.equal(identityFallbackGateway.filter({}), true);
  assert.equal(
    identityFallbackGateway.filter({ nodeId: "node-a", sequence: 1 }),
    true,
  );
  assert.equal(
    identityFallbackGateway.filter({ nodeId: "node-a", sequence: 1 }),
    false,
  );
  identityFallbackGateway.updateWindow(3);
  assert.deepEqual(identityFallbackGateway.getStats(), {
    acceptedEvents: 2,
    droppedDuplicates: 1,
    currentCacheSize: 1,
    activeWindowSeconds: 3,
  });
  identityFallbackGateway.updateWindow(1);
  assert.deepEqual(identityFallbackGateway.getStats(), {
    acceptedEvents: 2,
    droppedDuplicates: 1,
    currentCacheSize: 1,
    activeWindowSeconds: 2,
  });
  identityFallbackGateway.destroy();
  assert.deepEqual(identityFallbackGateway.getStats(), {
    acceptedEvents: 0,
    droppedDuplicates: 0,
    currentCacheSize: 0,
    activeWindowSeconds: 2,
  });

  const manualFloorGateway = new DedupeGateway({
    slidingWindowSeconds: 210,
    maxSlidingWindowSeconds: 420,
  });
  manualFloorGateway.updateWindow(77.408);
  assert.deepEqual(manualFloorGateway.getStats(), {
    acceptedEvents: 0,
    droppedDuplicates: 0,
    currentCacheSize: 0,
    activeWindowSeconds: 210,
  });
  manualFloorGateway.updateWindow(600);
  assert.deepEqual(manualFloorGateway.getStats(), {
    acceptedEvents: 0,
    droppedDuplicates: 0,
    currentCacheSize: 0,
    activeWindowSeconds: 420,
  });

  const presetConfigPath = resolve(tempDir, "dedupe-preset.json");
  writeFileSync(
    presetConfigPath,
    `${JSON.stringify(
      {
        preset: "cross-node-busy",
        autoCleanup: false,
        autoCleanupIntervalSeconds: 10,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  assert.deepEqual(loadDedupeGatewayConfigFile(presetConfigPath), {
    preset: "cross-node-busy",
    autoCleanup: false,
    autoCleanupIntervalSeconds: 10,
  });

  const presetFileGateway = createDedupeGatewayFromConfigFile(presetConfigPath);
  assert.equal(
    presetFileGateway.currentWindowMs,
    PRESET_EXPECTATIONS["cross-node-busy"].currentWindowMs,
  );
  assert.equal(
    presetFileGateway.maxSlidingWindowMs,
    PRESET_EXPECTATIONS["cross-node-busy"].maxSlidingWindowMs,
  );

  nowMs = 0;
  const presetFileBehaviorGateway = createDedupeGatewayFromConfigFile(
    presetConfigPath,
    {
      nowProvider: () => nowMs,
    },
  );
  assert.equal(presetFileBehaviorGateway.filter({ id: "event-a" }), true);
  nowMs = 11_000;
  assert.equal(presetFileBehaviorGateway.filter({ id: "event-b" }), true);
  assert.deepEqual(presetFileBehaviorGateway.getStats(), {
    acceptedEvents: 2,
    droppedDuplicates: 0,
    currentCacheSize: 2,
    activeWindowSeconds: 240,
  });
  assert.equal(presetFileBehaviorGateway.filter({ id: "event-a" }), false);

  const manualConfigPath = resolve(tempDir, "dedupe-manual.json");
  writeFileSync(
    manualConfigPath,
    `${JSON.stringify(
      {
        slidingWindowSeconds: 210,
        maxSlidingWindowSeconds: 420,
        autoCleanupIntervalSeconds: 15,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  assert.deepEqual(loadDedupeGatewayConfigFile(manualConfigPath), {
    slidingWindowSeconds: 210,
    maxSlidingWindowSeconds: 420,
    autoCleanupIntervalSeconds: 15,
  });

  const manualFileGateway = createDedupeGatewayFromConfigFile(manualConfigPath);
  assert.equal(manualFileGateway.currentWindowMs, 210_000n);
  assert.equal(manualFileGateway.maxSlidingWindowMs, 420_000n);

  const intervalConfigPath = resolve(tempDir, "dedupe-interval.json");
  writeFileSync(
    intervalConfigPath,
    `${JSON.stringify(
      {
        slidingWindowSeconds: 1,
        maxSlidingWindowSeconds: 1,
        autoCleanupIntervalSeconds: 5,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  nowMs = 0;
  const intervalFileGateway = createDedupeGatewayFromConfigFile(
    intervalConfigPath,
    {
      nowProvider: () => nowMs,
    },
  );
  assert.equal(intervalFileGateway.filter({ id: "event-a" }), true);
  nowMs = 2_500;
  assert.equal(intervalFileGateway.filter({ id: "event-b" }), true);
  assert.deepEqual(intervalFileGateway.getStats(), {
    acceptedEvents: 2,
    droppedDuplicates: 0,
    currentCacheSize: 2,
    activeWindowSeconds: 1,
  });
  nowMs = 5_500;
  assert.equal(intervalFileGateway.filter({ id: "event-c" }), true);
  assert.deepEqual(intervalFileGateway.getStats(), {
    acceptedEvents: 3,
    droppedDuplicates: 0,
    currentCacheSize: 1,
    activeWindowSeconds: 1,
  });

  const conflictingConfigPath = resolve(tempDir, "dedupe-conflict.json");
  writeFileSync(
    conflictingConfigPath,
    `${JSON.stringify(
      {
        preset: "standard",
        slidingWindowSeconds: 180,
        maxSlidingWindowSeconds: 300,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  assert.throws(
    () => loadDedupeGatewayConfigFile(conflictingConfigPath),
    /Invalid dedupe config file .*: choose either "preset" or explicit "slidingWindowSeconds" and "maxSlidingWindowSeconds", not both/,
  );

  const partialConfigPath = resolve(tempDir, "dedupe-partial.json");
  writeFileSync(
    partialConfigPath,
    `${JSON.stringify(
      {
        slidingWindowSeconds: 180,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  assert.throws(
    () => loadDedupeGatewayConfigFile(partialConfigPath),
    /Invalid dedupe config file .*: explicit window config requires both "slidingWindowSeconds" and "maxSlidingWindowSeconds"/,
  );

  const unknownFieldConfigPath = resolve(tempDir, "dedupe-unknown.json");
  writeFileSync(
    unknownFieldConfigPath,
    `${JSON.stringify(
      {
        preset: "standard",
        cleanupMode: "auto",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  assert.throws(
    () => loadDedupeGatewayConfigFile(unknownFieldConfigPath),
    /Invalid dedupe config file .*: unknown field "cleanupMode"/,
  );

  console.log("preset and config-file contract checks passed");
}

run();
