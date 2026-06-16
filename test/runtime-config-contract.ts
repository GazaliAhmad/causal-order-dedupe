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

  const faultInjectedRuntimeConfig = buildConfig([
    "--node-ids",
    "edge-a,edge-b,edge-c,edge-d,edge-e,edge-f",
    "--dark-nodes",
    "edge-b,edge-e",
    "--dark-interval",
    "20m",
    "--dark-duration",
    "4m",
    "--dark-start-after",
    "12m",
    "--dark-stagger",
    "5m",
    "--jitter-nodes",
    "edge-c,edge-f",
    "--jitter-extra-delay-min",
    "150ms",
    "--jitter-extra-delay-max",
    "900ms",
    "--jitter-spike-chance",
    "0.2",
    "--jitter-spike-min",
    "2s",
    "--jitter-spike-max",
    "9s",
  ]);
  assert.ok(!("help" in faultInjectedRuntimeConfig));
  assert.deepEqual(faultInjectedRuntimeConfig.faultInjection.darkNodeIds, [
    "edge-b",
    "edge-e",
  ]);
  assert.equal(faultInjectedRuntimeConfig.faultInjection.darkIntervalMs, 1_200_000n);
  assert.equal(faultInjectedRuntimeConfig.faultInjection.darkDurationMs, 240_000n);
  assert.equal(
    faultInjectedRuntimeConfig.faultInjection.darkStartAfterMs,
    720_000n,
  );
  assert.equal(faultInjectedRuntimeConfig.faultInjection.darkStaggerMs, 300_000n);
  assert.deepEqual(faultInjectedRuntimeConfig.faultInjection.jitterNodeIds, [
    "edge-c",
    "edge-f",
  ]);
  assert.equal(
    faultInjectedRuntimeConfig.faultInjection.jitterExtraDelayMinMs,
    150n,
  );
  assert.equal(
    faultInjectedRuntimeConfig.faultInjection.jitterExtraDelayMaxMs,
    900n,
  );
  assert.equal(faultInjectedRuntimeConfig.faultInjection.jitterSpikeChance, 0.2);
  assert.equal(faultInjectedRuntimeConfig.faultInjection.jitterSpikeMinMs, 2_000n);
  assert.equal(faultInjectedRuntimeConfig.faultInjection.jitterSpikeMaxMs, 9_000n);

  assert.throws(
    () =>
      buildConfig([
        "--node-ids",
        "edge-a,edge-b,edge-c",
        "--dark-nodes",
        "edge-z",
      ]),
    /--dark-nodes cannot include unknown node ID "edge-z"/,
  );

  assert.throws(
    () =>
      buildConfig([
        "--node-ids",
        "edge-a,edge-b,edge-c",
        "--jitter-nodes",
        "edge-z",
      ]),
    /--jitter-nodes cannot include unknown node ID "edge-z"/,
  );

  assert.throws(
    () =>
      buildConfig([
        "--node-ids",
        "edge-a,edge-b,edge-c",
        "--dark-nodes",
        "edge-b",
        "--jitter-nodes",
        "edge-b",
      ]),
    /Fault injection node "edge-b" cannot be both dark and jitter-prone in the same run/,
  );

  assert.throws(
    () =>
      buildConfig([
        "--node-ids",
        "edge-a,edge-b,edge-c",
        "--dark-nodes",
        "edge-b",
        "--dark-interval",
        "3m",
        "--dark-duration",
        "5m",
      ]),
    /--dark-duration cannot be greater than --dark-interval/,
  );

  assert.throws(
    () =>
      buildConfig([
        "--node-ids",
        "edge-a,edge-b,edge-c",
        "--jitter-nodes",
        "edge-c",
        "--jitter-extra-delay-min",
        "2s",
        "--jitter-extra-delay-max",
        "1s",
      ]),
    /--jitter-extra-delay-min cannot be greater than --jitter-extra-delay-max/,
  );

  assert.throws(
    () =>
      buildConfig([
        "--node-ids",
        "edge-a,edge-b,edge-c",
        "--jitter-nodes",
        "edge-c",
        "--jitter-spike-min",
        "5s",
        "--jitter-spike-max",
        "2s",
      ]),
    /--jitter-spike-min cannot be greater than --jitter-spike-max/,
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
  assert.ok(Math.abs(defaultNodeShareSum - 1) < 1e-12);

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
  assert.ok(Math.abs(weightedShareSum - 1) < 1e-12);

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
