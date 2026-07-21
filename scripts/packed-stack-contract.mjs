import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testingRoot = resolve(
  process.env.CAUSAL_ORDER_TESTING_REPO ??
    resolve(repositoryRoot, "..", "causal-order-test"),
);
const npmCli = process.env.npm_execpath;

assert.ok(npmCli, "run this contract through npm so npm_execpath is available");
assert.ok(
  existsSync(join(testingRoot, "package.json")),
  `@causal-order/testing repository was not found at ${testingRoot}`,
);

function runNpm(args, cwd, capture = false) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) {
      process.stderr.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    throw new Error(`npm ${args.join(" ")} failed with ${result.status}`);
  }
  return result.stdout ?? "";
}

function parsePackFilename(output) {
  const firstBracket = output.indexOf("[");
  assert.notEqual(firstBracket, -1, "npm pack --json should emit a JSON array");
  const rows = JSON.parse(output.slice(firstBracket));
  assert.equal(rows.length, 1, "npm pack should create one artifact");
  return rows[0].filename;
}

function isWithin(parent, candidate) {
  const child = relative(parent, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

const workspace = mkdtempSync(join(tmpdir(), "causal-order-dedupe-packed-stack-"));
const artifacts = join(workspace, "artifacts");
const consumer = join(workspace, "consumer");
mkdirSync(artifacts, { recursive: true });
mkdirSync(consumer, { recursive: true });

try {
  runNpm(["run", "prepare:dist"], repositoryRoot);
  const dedupePackOutput = runNpm(
    ["pack", "--json", "./publish-dist", "--pack-destination", artifacts],
    repositoryRoot,
    true,
  );
  const testingPackOutput = runNpm(
    ["pack", "--json", "--pack-destination", artifacts],
    testingRoot,
    true,
  );
  const dedupeTarball = join(artifacts, parsePackFilename(dedupePackOutput));
  const testingTarball = join(artifacts, parsePackFilename(testingPackOutput));

  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify(
      {
        name: "causal-order-dedupe-packed-stack-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@causal-order/dedupe": `file:${dedupeTarball}`,
          "@causal-order/monitor": "0.5.0",
          "@causal-order/testing": `file:${testingTarball}`,
          "@causal-order/transport": "0.1.2",
          "causal-order": "1.0.0",
        },
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    join(consumer, "verify.mjs"),
    `
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { orderEvents } from "causal-order";
import { harnessPipeline } from "@causal-order/testing/providers/default";

let now = 1_000n;
const databasePath = fileURLToPath(new URL("./monitor.sqlite", import.meta.url));
const orderInput = [];
const routingModes = [];
const dedupeResults = [];
let replayDeliveries = 0;

const dedupe = harnessPipeline.createDedupeAdapter({
  config: { preset: "standard" },
  nowProvider: () => now,
});
assert.equal(typeof dedupe.filterWithResult, "function");

const pushThroughDedupe = (event) => {
  const result = dedupe.filterWithResult(event);
  dedupeResults.push(result);
  if (result.accepted) orderInput.push(event);
};

const monitor = await harnessPipeline.createMonitorAdapter({
  runtimeConfig: {
    monitorConfig: {
      moduleSpecifier: "@causal-order/monitor",
      databasePath,
      rollingBufferWindowMs: 14_400_000n,
      fullOutageMaxWindowMs: 21_600_000n,
      pruneIntervalMs: 60_000n,
    },
  },
  nowProvider: () => now,
  deliverToDedupe(event, context) {
    if (context.replay === true) replayDeliveries += 1;
    pushThroughDedupe(event);
  },
  deliverToOrder(event) {
    orderInput.push(event);
  },
  onDecision(_event, decision) {
    routingModes.push(String(decision.routingMode));
  },
});

const event = (sequence) => ({
  id: "packed-stack-" + sequence,
  nodeId: "packed-stack",
  sequence: BigInt(sequence),
  clock: {
    physicalTimeMs: 1_000n + BigInt(sequence),
    logicalCounter: 0,
    nodeId: "packed-stack",
  },
  payload: { sequence },
});

for (const component of ["transport", "dedupe", "causal-order"]) {
  monitor.observeHeartbeat(component, now);
}

await monitor.ingest(event(1));
await monitor.ingest(event(1));

now += 1n;
await monitor.updateComponentHealth("causal-order", "offline", {
  reason: "packed-stack-order-outage",
});
await monitor.ingest(event(2));
await monitor.ingest(event(2));
await monitor.ingest(event(3));

now += 10_000n;
for (let index = 0; index < 3; index += 1) {
  monitor.observeHeartbeat("transport", now);
  monitor.observeHeartbeat("dedupe", now);
  monitor.observeHeartbeat("causal-order", now);
}

for (let index = 0; index < 10; index += 1) {
  await monitor.reconcileRecovery(10);
  if (Number(monitor.getSnapshot().reservoir.totalPendingRows) === 0) break;
  now += 1_000n;
}

const snapshot = monitor.getSnapshot();
assert.equal(Number(snapshot.reservoir.totalPendingRows), 0);
assert.ok(routingModes.includes("order_buffer_only"));
assert.ok(!routingModes.includes("dedupe_bypass_throttled"));
assert.equal(replayDeliveries, 3);

const stats = dedupe.getStats();
assert.equal(stats.acceptedEvents, 3);
assert.equal(stats.droppedDuplicates, 2);
assert.equal(dedupeResults.filter((result) => result.reason === "duplicate").length, 2);

const ordered = orderEvents(orderInput, {
  strict: false,
  detectAnomalies: true,
});
assert.deepEqual(
  ordered.ordered.map((entry) => entry.event.id),
  ["packed-stack-1", "packed-stack-2", "packed-stack-3"],
);
assert.equal(
  ordered.anomalies.filter((anomaly) => anomaly.type === "duplicate_event").length,
  0,
);

monitor.close();
dedupe.destroy();
console.log("packed four-package stack contract passed");
`,
  );

  runNpm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefer-offline",
    ],
    consumer,
  );
  const verify = spawnSync(process.execPath, ["verify.mjs"], {
    cwd: consumer,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (verify.error) throw verify.error;
  assert.equal(verify.status, 0, "packed stack verification should pass");
} finally {
  const resolvedWorkspace = realpathSync(workspace);
  assert.ok(
    isWithin(realpathSync(tmpdir()), resolvedWorkspace) &&
      basename(resolvedWorkspace).startsWith("causal-order-dedupe-packed-stack-"),
    "temporary cleanup target should remain scoped to the expected directory",
  );
  rmSync(resolvedWorkspace, { recursive: true, force: true });
}
