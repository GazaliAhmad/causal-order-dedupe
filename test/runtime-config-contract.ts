import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { buildConfig, formatOperatorError } from "./deployment-common.js";

function run(): void {
  const tempDir = mkdtempSync(resolve(tmpdir(), "runtime-config-"));

  const unknownTopLevelProfilePath = resolve(tempDir, "profile-unknown-top.json");
  writeFileSync(
    unknownTopLevelProfilePath,
    `${JSON.stringify(
      {
        unexpectedTopLevel: true,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  assert.throws(
    () => buildConfig(["--profile-file", unknownTopLevelProfilePath]),
    /Invalid workload profile .*: unknown field "unexpectedTopLevel"/,
  );

  const unknownNestedProfilePath = resolve(tempDir, "profile-unknown-nested.json");
  writeFileSync(
    unknownNestedProfilePath,
    `${JSON.stringify(
      {
        phaseRates: {
          madeUpField: 123,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  assert.throws(
    () => buildConfig(["--profile-file", unknownNestedProfilePath]),
    /Invalid workload profile .*: unknown field "madeUpField" under "phaseRates"/,
  );

  const invalidDelayRangeProfilePath = resolve(tempDir, "profile-delay-range.json");
  writeFileSync(
    invalidDelayRangeProfilePath,
    `${JSON.stringify(
      {
        delays: {
          steady: {
            baseMinMs: 500,
            baseMaxMs: 100,
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  assert.throws(
    () => buildConfig(["--profile-file", invalidDelayRangeProfilePath]),
    /Invalid workload profile .*: "delays\.steady\.baseMinMs" cannot be greater than "delays\.steady\.baseMaxMs"/,
  );

  const invalidProbabilityProfilePath = resolve(tempDir, "profile-probability-sum.json");
  writeFileSync(
    invalidProbabilityProfilePath,
    `${JSON.stringify(
      {
        dependencies: {
          steadySameNodeChance: 0.8,
          steadyCrossNodeChance: 0.4,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  assert.throws(
    () => buildConfig(["--profile-file", invalidProbabilityProfilePath]),
    /Invalid workload profile .*: "dependencies\.steadySameNodeChance" \+ "dependencies\.steadyCrossNodeChance" cannot be greater than 1/,
  );

  const conflictingDedupeConfigPath = resolve(tempDir, "dedupe-conflict.json");
  writeFileSync(
    conflictingDedupeConfigPath,
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
    () => buildConfig(["--dedupe-config", conflictingDedupeConfigPath]),
    /Invalid dedupe config file .*: choose either "preset" or explicit "slidingWindowSeconds" and "maxSlidingWindowSeconds", not both/,
  );

  const validDedupeConfigPath = resolve(tempDir, "dedupe-valid.json");
  writeFileSync(
    validDedupeConfigPath,
    `${JSON.stringify(
      {
        slidingWindowSeconds: 210,
        maxSlidingWindowSeconds: 420,
        autoCleanup: false,
        autoCleanupIntervalSeconds: 15,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const runtimeConfig = buildConfig(["--dedupe-config", validDedupeConfigPath]);
  assert.ok(!("help" in runtimeConfig));
  assert.deepEqual(runtimeConfig.dedupeConfig, {
    slidingWindowSeconds: 210,
    maxSlidingWindowSeconds: 420,
    autoCleanup: false,
    autoCleanupIntervalSeconds: 15,
  });

  let formatted = "";
  try {
    buildConfig(["--dedupe-config", conflictingDedupeConfigPath]);
  } catch (error) {
    formatted = formatOperatorError(error);
  }

  assert.match(
    formatted,
    /^Error: Invalid dedupe config file .*choose either "preset" or explicit "slidingWindowSeconds" and "maxSlidingWindowSeconds", not both$/,
  );

  console.log("runtime config validation checks passed");
}

run();
