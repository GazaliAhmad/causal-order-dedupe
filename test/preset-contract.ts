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
