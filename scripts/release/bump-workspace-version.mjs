#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const isCheckOnly = args[0] === "--check";
const [version, ...files] = isCheckOnly ? args.slice(1) : args;

if (!version) {
  console.error("Error: version argument is required.");
  process.exit(1);
}

if (files.length === 0) {
  console.error("Error: at least one package.json path is required.");
  process.exit(1);
}

const parsedPackages = files.map((file) => {
  const contents = readFileSync(file, "utf8");

  if (!contents.trim()) {
    console.error(`Error: ${file} is empty.`);
    process.exit(1);
  }

  try {
    return {
      file,
      pkg: JSON.parse(contents),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown JSON parse error.";
    console.error(`Error: ${file} is not valid JSON. ${message}`);
    process.exit(1);
  }
});

if (isCheckOnly) {
  process.exit(0);
}

for (const { file, pkg } of parsedPackages) {
  pkg.version = version;

  writeFileSync(file, `${JSON.stringify(pkg, null, 4)}\n`);
}
