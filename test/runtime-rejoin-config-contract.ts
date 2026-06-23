import assert from "node:assert/strict";

import { formatOperatorError, parseDurationToMs } from "./deployment-common.js";
import {
  buildRejoinHarnessConfig,
  formatRejoinHarnessHelp,
} from "./deployment-rejoin-common.js";

function run(): void {
  const helpText = formatRejoinHarnessHelp();
  assert.match(helpText, /--recovery-window/);
  assert.match(helpText, /--recovery-rate-per-second/);
  assert.match(helpText, /--recovery-burst-size/);

  const built = buildRejoinHarnessConfig([
    "--duration",
    "10m",
    "--recovery-window",
    "8m",
    "--recovery-rate-per-second",
    "3.5",
    "--recovery-burst-size",
    "18",
    "--node-ids",
    "edge-a,edge-b,edge-c,edge-d",
  ]);
  assert.ok(!("help" in built));
  assert.equal(built.runtimeConfig.durationMs, parseDurationToMs("10m"));
  assert.deepEqual(built.runtimeConfig.nodeIds, [
    "edge-a",
    "edge-b",
    "edge-c",
    "edge-d",
  ]);
  assert.equal(built.rejoinShaping.recoveryWindowMs, parseDurationToMs("8m"));
  assert.equal(built.rejoinShaping.tokenRatePerSecond, 3.5);
  assert.equal(built.rejoinShaping.burstSize, 18);

  const inlineBuilt = buildRejoinHarnessConfig([
    "--duration=12m",
    "--recovery-window=7m",
    "--recovery-rate-per-second=2.5",
    "--recovery-burst-size=12",
  ]);
  assert.ok(!("help" in inlineBuilt));
  assert.equal(inlineBuilt.runtimeConfig.durationMs, parseDurationToMs("12m"));
  assert.equal(inlineBuilt.rejoinShaping.recoveryWindowMs, parseDurationToMs("7m"));
  assert.equal(inlineBuilt.rejoinShaping.tokenRatePerSecond, 2.5);
  assert.equal(inlineBuilt.rejoinShaping.burstSize, 12);

  assert.throws(
    () =>
      buildRejoinHarnessConfig([
        "--recovery-window",
        "0m",
      ]),
    /must be a positive duration/i,
  );

  assert.throws(
    () =>
      buildRejoinHarnessConfig([
        "--recovery-rate-per-second",
        "0",
      ]),
    /--recovery-rate-per-second must be a positive finite number/,
  );

  assert.throws(
    () =>
      buildRejoinHarnessConfig([
        "--recovery-burst-size",
        "0",
      ]),
    /--recovery-burst-size must be a positive integer/,
  );

  let formatted = "";
  try {
    buildRejoinHarnessConfig(["--recovery-rate-per-second", "0"]);
  } catch (error) {
    formatted = formatOperatorError(error);
  }
  assert.match(
    formatted,
    /^Error: --recovery-rate-per-second must be a positive finite number$/,
  );

  console.log("runtime rejoin config validation checks passed");
}

run();
