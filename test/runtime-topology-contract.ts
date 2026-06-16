import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentModuleDir = dirname(fileURLToPath(import.meta.url));
const deploymentRuntimePath = resolve(currentModuleDir, "deployment-runtime.js");

const CUSTOM_NODE_IDS = [
  "edge-a",
  "edge-b",
  "edge-c",
  "edge-d",
  "edge-e",
];

async function run(): Promise<void> {
  const tempDir = mkdtempSync(resolve(tmpdir(), "runtime-topology-"));
  const summaryPath = resolve(tempDir, "summary.json");

  const { code, stdout, stderr } = await spawnProcess(process.execPath, [
    deploymentRuntimePath,
    "--duration",
    "100ms",
    "--steady-for",
    "50ms",
    "--report-every",
    "100ms",
    "--time-scale",
    "1000",
    "--node-ids",
    CUSTOM_NODE_IDS.join(","),
    "--output",
    summaryPath,
    "--run-name",
    "runtime-topology-contract",
  ]);

  assert.equal(
    code,
    0,
    `deployment runtime exited with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );

  assert.ok(existsSync(summaryPath), "summary.json should be written");

  const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as Record<string, any>;
  assert.deepEqual(summary.config?.nodeIds, CUSTOM_NODE_IDS);

  const runConfigPath = resolve(tempDir, "run-config.json");
  assert.ok(existsSync(runConfigPath), "run-config.json should be written");
  const runConfig = JSON.parse(readFileSync(runConfigPath, "utf8")) as Record<string, any>;
  assert.deepEqual(runConfig.nodeIds, CUSTOM_NODE_IDS);

  assert.deepEqual(
    Object.keys(summary.transport?.connectedNodes ?? {}).sort(),
    [...CUSTOM_NODE_IDS].sort(),
  );
  assert.deepEqual(
    Object.keys(summary.transport?.nodeStats ?? {}).sort(),
    [...CUSTOM_NODE_IDS].sort(),
  );

  const nodeArtifactNames = readdirSync(resolve(tempDir, "nodes")).sort();
  for (const nodeId of CUSTOM_NODE_IDS) {
    assert.ok(
      nodeArtifactNames.includes(`${nodeId}.stdout.log`),
      `missing stdout log for ${nodeId}`,
    );
    assert.ok(
      nodeArtifactNames.includes(`${nodeId}.stderr.log`),
      `missing stderr log for ${nodeId}`,
    );
  }

  console.log("runtime topology contract checks passed");
}

function spawnProcess(
  command: string,
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveSpawn, rejectSpawn) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.once("error", rejectSpawn);
    child.once("exit", (code) => {
      resolveSpawn({ code, stdout, stderr });
    });
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
