import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = findRepoRoot(scriptDir);
const buildDir = resolve(rootDir, ".build");
const distDir = resolve(rootDir, "publish-dist");
const rootPackagePath = resolve(rootDir, "package.json");

const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as Record<
  string,
  any
>;

const publishedPackage = {
  name: rootPackage.name,
  version: rootPackage.version,
  description: rootPackage.description,
  keywords: rootPackage.keywords,
  license: rootPackage.license,
  repository: rootPackage.repository,
  type: rootPackage.type,
  sideEffects: rootPackage.sideEffects ?? false,
  main: "./src/dedupe.js",
  types: "./src/dedupe.d.ts",
  exports: {
    ".": {
      types: "./src/dedupe.d.ts",
      import: "./src/dedupe.js",
    },
  },
  files: ["src/", "README.md", "LICENSE"],
  scripts: {
    prepack:
      "node -e \"const { existsSync } = require('node:fs'); const { execFileSync } = require('node:child_process'); const script = '../.build/scripts/prepare-dist.js'; if (existsSync(script)) execFileSync(process.execPath, [script], { stdio: 'inherit' });\"",
  },
  engines: rootPackage.engines,
  dependencies: rootPackage.dependencies,
};

mkdirSync(distDir, { recursive: true });
mkdirSync(resolve(distDir, "src"), { recursive: true });
removeIfExists(resolve(distDir, "guides"));
removeIfExists(resolve(distDir, "COMPATIBILITY.md"));
removeIfExists(resolve(distDir, "SECURITY.md"));
removeIfExists(resolve(distDir, "CODE_OF_CONDUCT.md"));

writeFileSync(
  resolve(distDir, "src", "dedupe.js"),
  readFileSync(resolve(buildDir, "src", "dedupe.js")),
);
writeFileSync(
  resolve(distDir, "src", "dedupe.d.ts"),
  readFileSync(resolve(buildDir, "src", "dedupe.d.ts")),
);
writeFileSync(
  resolve(distDir, "README.md"),
  readFileSync(resolve(rootDir, "README.md")),
);
writeFileSync(
  resolve(distDir, "LICENSE"),
  readFileSync(resolve(rootDir, "LICENSE")),
);

writeFileSync(
  resolve(distDir, "package.json"),
  `${JSON.stringify(publishedPackage, null, 2)}\n`,
  "utf8",
);

process.stdout.write(`Prepared publishable package in ${distDir}\n`);

function findRepoRoot(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    const candidatePackagePath = resolve(currentDir, "package.json");
    const candidateSourcePath = resolve(currentDir, "src", "dedupe.ts");

    if (existsSync(candidatePackagePath) && existsSync(candidateSourcePath)) {
      return currentDir;
    }

    const parentDir = resolve(currentDir, "..");
    if (parentDir === currentDir) {
      throw new Error(`Unable to locate repository root from ${startDir}`);
    }

    currentDir = parentDir;
  }
}

function removeIfExists(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch (error: any) {
    if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
      return;
    }
    throw error;
  }
}
