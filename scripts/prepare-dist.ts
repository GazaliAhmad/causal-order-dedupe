import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(".");
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
  type: rootPackage.type,
  main: "./src/dedupe.js",
  types: "./src/dedupe.d.ts",
  exports: {
    ".": {
      types: "./src/dedupe.d.ts",
      import: "./src/dedupe.js",
    },
  },
  files: ["src/", "README.md", "LICENSE"],
  engines: rootPackage.engines,
  dependencies: rootPackage.dependencies,
};

mkdirSync(distDir, { recursive: true });
mkdirSync(resolve(distDir, "src"), { recursive: true });

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
