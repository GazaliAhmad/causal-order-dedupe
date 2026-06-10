import { type ChildProcess, fork } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HELP_TEXT,
  buildConfig,
  buildRunArtifacts,
  formatOperatorError,
  formatDuration,
  serializeConfig,
  type RuntimeArtifacts,
  type RuntimeConfig,
} from "./deployment-common.js";

interface RuntimeConfigWithArtifacts extends RuntimeConfig {
  wallStartMs: number;
  artifacts: RuntimeArtifacts;
}

const currentModulePath = fileURLToPath(import.meta.url);
const currentModuleDir = dirname(currentModulePath);
const currentModuleExt = extname(currentModulePath);

async function main(): Promise<void> {
  const maybeConfig = buildConfig(process.argv.slice(2));
  if ("help" in maybeConfig) {
    console.log(HELP_TEXT);
    return;
  }

  const config = maybeConfig;
  const wallStartMs = Date.now() + 2_000;
  const artifacts = buildRunArtifacts(config, wallStartMs);
  const runtimeConfig: RuntimeConfigWithArtifacts = {
    ...config,
    wallStartMs,
    artifacts,
  };
  const serializedConfig = JSON.stringify(serializeConfig(runtimeConfig));

  mkdirSync(artifacts.runDir, { recursive: true });
  mkdirSync(artifacts.nodesDir, { recursive: true });
  writeFileSync(
    artifacts.configPath,
    `${JSON.stringify(serializeConfig(runtimeConfig), null, 2)}\n`,
    "utf8",
  );

  const orchestratorLog = createWriteStream(artifacts.orchestratorLogPath, {
    flags: "a",
  });
  const log = (message: string) => {
    const line = `${new Date().toISOString()} ${message}\n`;
    process.stdout.write(line);
    orchestratorLog.write(line);
  };

  log(`starting deployment-style runtime in ${artifacts.runDir}`);
  log(
    [
      `duration=${formatDuration(config.durationMs)}`,
      `steady=${formatDuration(config.steadyForMs)}`,
      `rate=${config.eventsPerSecond}/s`,
      `chaosMultiplier=${config.chaosMultiplier}`,
      `latePolicy=${config.lateArrivalPolicy}`,
      `timeScale=${config.timeScale}x`,
    ].join(" | "),
  );

  const children: ChildProcess[] = [];
  const cleanup = (signal: NodeJS.Signals) => {
    for (const child of children) {
      if (!child.killed) {
        child.kill(signal);
      }
    }
  };

  process.once("SIGINT", () => cleanup("SIGINT"));
  process.once("SIGTERM", () => cleanup("SIGTERM"));

  const collector = spawnChild({
    name: "collector",
    script: siblingScriptPath("deployment-collector"),
    serializedConfig,
    stdoutPath: artifacts.collectorStdoutPath,
    stderrPath: artifacts.collectorStderrPath,
    log,
  });
  children.push(collector.child);

  const collectorReady = await waitForCollectorReady(collector.child);
  log(`collector ready on 127.0.0.1:${collectorReady.port}`);

  const nodeChildren = runtimeConfig.nodeIds.map((nodeId) => {
    const nodeLabel = resolve(artifacts.nodesDir, `${nodeId}.stdout.log`);
    const nodeErr = resolve(artifacts.nodesDir, `${nodeId}.stderr.log`);
    const childInfo = spawnChild({
      name: nodeId,
      script: siblingScriptPath("deployment-node"),
      serializedConfig,
      stdoutPath: nodeLabel,
      stderrPath: nodeErr,
      log,
      extraEnv: {
        RUNTIME_NODE_ID: nodeId,
        RUNTIME_COLLECTOR_PORT: String(collectorReady.port),
      },
    });
    children.push(childInfo.child);
    return childInfo.child;
  });

  const collectorExitPromise = waitForExit(collector.child, "collector");
  const nodeExitPromises = nodeChildren.map((child, index) =>
    waitForExit(child, runtimeConfig.nodeIds[index]),
  );

  try {
    await Promise.all(
      [collectorExitPromise, ...nodeExitPromises].map((promise) =>
        promise.then((result) => {
          if (result.code !== 0) {
            throw new Error(
              `${result.name} exited unexpectedly with code=${result.code}`,
            );
          }
          return result;
        }),
      ),
    );
    log("all processes completed cleanly");
  } catch (error) {
    log(formatOperatorError(error));
    cleanup("SIGTERM");
    await Promise.allSettled([collectorExitPromise, ...nodeExitPromises]);
    process.exitCode = 1;
  }
}

function spawnChild({
  name,
  script,
  serializedConfig,
  stdoutPath,
  stderrPath,
  log,
  extraEnv = {},
}: {
  name: string;
  script: string;
  serializedConfig: string;
  stdoutPath: string;
  stderrPath: string;
  log: (message: string) => void;
  extraEnv?: Record<string, string>;
}): { child: ChildProcess; stdoutStream: NodeJS.WritableStream; stderrStream: NodeJS.WritableStream } {
  mkdirSync(dirname(stdoutPath), { recursive: true });
  mkdirSync(dirname(stderrPath), { recursive: true });

  const stdoutStream = createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = createWriteStream(stderrPath, { flags: "a" });
  const child = fork(script, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUNTIME_DEPLOYMENT_CONFIG: serializedConfig,
      ...extraEnv,
    },
    silent: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  child.stdout?.pipe(stdoutStream);
  child.stderr?.pipe(stderrStream);
  log(`spawned ${name} pid=${child.pid}`);

  return { child, stdoutStream, stderrStream };
}

function siblingScriptPath(baseName: string): string {
  return resolve(currentModuleDir, `${baseName}${currentModuleExt}`);
}

function waitForCollectorReady(child: ChildProcess): Promise<{ port: number }> {
  return new Promise((resolveReady, rejectReady) => {
    const onMessage = (message: any) => {
      if (message?.type === "collector_ready") {
        child.off("message", onMessage);
        resolveReady(message);
      }
    };

    child.on("message", onMessage);
    child.once("exit", (code) => {
      rejectReady(new Error(`collector exited before ready with code ${code}`));
    });
  });
}

function waitForExit(
  child: ChildProcess,
  name: string,
): Promise<{ name: string; code: number; signal: NodeJS.Signals | null }> {
  return new Promise((resolveExit) => {
    child.once("exit", (code, signal) => {
      resolveExit({ name, code: code ?? 0, signal });
    });
  });
}

main().catch((error) => {
  console.error(formatOperatorError(error));
  process.exitCode = 1;
});
