#!/usr/bin/env node

import { execFileSync } from "node:child_process";
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
  const contents = readPackageContents(file);

  return {
    file,
    pkg: parsePackageJson(file, contents),
  };
});

if (isCheckOnly) {
  process.exit(0);
}

for (const { file, pkg } of parsedPackages) {
  pkg.version = version;

  writeFileSync(file, `${JSON.stringify(pkg, null, 4)}\n`);
}

function readPackageContents(file) {
  const contents = readFileSync(file, "utf8");

  if (contents.trim()) {
    return contents;
  }

  const headContents = readPackageContentsFromHead(file);

  if (!headContents.trim()) {
    console.error(`Error: ${file} is empty.`);
    process.exit(1);
  }

  return headContents;
}

function parsePackageJson(file, contents) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    const headContents = readPackageContentsFromHead(file);

    if (headContents.trim()) {
      try {
        return JSON.parse(headContents);
      } catch {
        // Fall through to the original parse error below.
      }
    }

    const message =
      error instanceof Error ? error.message : "Unknown JSON parse error.";
    console.error(`Error: ${file} is not valid JSON. ${message}`);
    process.exit(1);
  }
}

function readPackageContentsFromHead(file) {
  try {
    return execFileSync("git", ["show", `HEAD:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}
