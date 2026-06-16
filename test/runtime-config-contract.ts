import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  DEFAULT_SINGLE_CLUSTER_NODE_IDS,
  buildConfig,
  formatOperatorError,
  resolveConfiguredNodeRateShare,
} from "./deployment-common.js";

function run(): void {
  const tempDir = mkdtempSync(resolve(tmpdir(), "runtime-config-"));

  const defaultRuntimeConfig = buildConfig([]);
  assert.ok(!("help" in defaultRuntimeConfig));
  assert.deepEqual(
    defaultRuntimeConfig.nodeIds,
    [...DEFAULT_SINGLE_CLUSTER_NODE_IDS],
  );

  (defaultRuntimeConfig.nodeIds as string[]).push("edge-z");

  const freshDefaultRuntimeConfig = buildConfig([]);
  assert.ok(!("help" in freshDefaultRuntimeConfig));
  assert.deepEqual(
    freshDefaultRuntimeConfig.nodeIds,
    [...DEFAULT_SINGLE_CLUSTER_NODE_IDS],
  );

  const customNodeRuntimeConfig = buildConfig([
    "--node-ids",
    "edge-a,edge-b,edge-c,edge-d,edge-e",
  ]);
  assert.ok(!("help" in customNodeRuntimeConfig));
  assert.deepEqual(customNodeRuntimeConfig.nodeIds, [
    "edge-a",
    "edge-b",
    "edge-c",
    "edge-d",
    "edge-e",
  ]);
  assert.deepEqual(customNodeRuntimeConfig.workloadProfile.nodeWeights, {
    "edge-a": 1,
    "edge-b": 1,
    "edge-c": 1,
    "edge-d": 1,
    "edge-e": 1,
  });

  assert.throws(
    () => buildConfig(["--node-ids", "edge-a,edge-b,edge-a"]),
    /--node-ids cannot include duplicate node ID "edge-a"/,
  );

  assert.throws(
    () => buildConfig(["--node-ids", " , , "]),
    /--node-ids must include at least one node ID/,
  );

  const defaultNodeShareSum = [...DEFAULT_SINGLE_CLUSTER_NODE_IDS]
    .map((nodeId) =>
      resolveConfiguredNodeRateShare(
        [...DEFAULT_SINGLE_CLUSTER_NODE_IDS],
        {
          "edge-a": 1,
          "edge-b": 1,
          "edge-c": 1,
        },
        nodeId,
      ),
    )
    .reduce((total, share) => total + share, 0);
  assert.equal(defaultNodeShareSum, 1);

  const weightedNodeIds = ["edge-a", "edge-b", "edge-c", "edge-d", "edge-e"];
  const weightedNodeWeights = {
    "edge-a": 1.2,
    "edge-b": 0.8,
    "edge-c": 1.0,
    "edge-d": 1.5,
    "edge-e": 0.5,
  };
  const weightedShareSum = weightedNodeIds
    .map((nodeId) =>
      resolveConfiguredNodeRateShare(
        weightedNodeIds,
        weightedNodeWeights,
        nodeId,
      ),
    )
    .reduce((total, share) => total + share, 0);
  assert.equal(weightedShareSum, 1);

  const fallbackWeightShare = resolveConfiguredNodeRateShare(
    ["edge-a", "edge-z"],
    {
      "edge-a": 2,
    },
    "edge-z",
  );
  assert.equal(fallbackWeightShare, 1 / 3);

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
  assert.deepEqual(runtimeConfig.nodeIds, [...DEFAULT_SINGLE_CLUSTER_NODE_IDS]);
  assert.deepEqual(runtimeConfig.workloadProfile.nodeWeights, {
    "edge-a": 1,
    "edge-b": 1,
    "edge-c": 1,
  });
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
