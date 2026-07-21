import assert from "node:assert/strict";

import { DedupeGateway } from "../src/dedupe.js";

function run(): void {
  let nowMs = 0n;
  const gateway = new DedupeGateway({
    slidingWindowSeconds: 1,
    maxSlidingWindowSeconds: 1,
    autoCleanup: false,
    nowProvider: () => nowMs,
  });

  assert.deepEqual(gateway.filterWithResult({ id: "window-boundary" }), {
    accepted: true,
    reason: "accepted",
    identitySource: "id",
  });

  nowMs = 1_000n;
  gateway.cleanup();
  assert.deepEqual(gateway.filterWithResult({ id: "window-boundary" }), {
    accepted: false,
    reason: "duplicate",
    identitySource: "id",
  });

  nowMs = 1_001n;
  gateway.cleanup();
  assert.deepEqual(gateway.filterWithResult({ id: "window-boundary" }), {
    accepted: true,
    reason: "accepted",
    identitySource: "id",
  });

  assert.deepEqual(gateway.getStats(), {
    acceptedEvents: 2,
    droppedDuplicates: 1,
    currentCacheSize: 1,
    activeWindowSeconds: 1,
  });

  const beforeRestart = new DedupeGateway({ autoCleanup: false });
  assert.equal(beforeRestart.filter({ id: "restart-boundary" }), true);
  assert.equal(beforeRestart.filter({ id: "restart-boundary" }), false);

  const afterRestart = new DedupeGateway({ autoCleanup: false });
  assert.deepEqual(afterRestart.filterWithResult({ id: "restart-boundary" }), {
    accepted: true,
    reason: "accepted",
    identitySource: "id",
  });
  assert.deepEqual(afterRestart.getStats(), {
    acceptedEvents: 1,
    droppedDuplicates: 0,
    currentCacheSize: 1,
    activeWindowSeconds: 180,
  });

  const replayGateway = new DedupeGateway({ autoCleanup: false });
  const acceptedForOrder: string[] = [];
  for (const id of ["replay-a", "replay-a", "replay-b", "replay-b"]) {
    const result = replayGateway.filterWithResult({ id });
    if (result.accepted) {
      acceptedForOrder.push(id);
    }
  }
  assert.deepEqual(acceptedForOrder, ["replay-a", "replay-b"]);
  assert.deepEqual(replayGateway.getStats(), {
    acceptedEvents: 2,
    droppedDuplicates: 2,
    currentCacheSize: 2,
    activeWindowSeconds: 180,
  });

  gateway.destroy();
  beforeRestart.destroy();
  afterRestart.destroy();
  replayGateway.destroy();

  console.log(
    "dedupe stack contract passed: inclusive window boundary, post-window acceptance, in-memory restart redelivery, and replay suppression",
  );
}

run();
