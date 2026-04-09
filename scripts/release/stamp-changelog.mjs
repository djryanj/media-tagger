#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const [version, changelogPath = "CHANGELOG.md"] = process.argv.slice(2);

if (!version) {
  console.error("Error: version argument is required.");
  process.exit(1);
}

const current = readFileSync(changelogPath, "utf8");
const today = new Date().toISOString().slice(0, 10);
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = new RegExp(`^## \\[${escapedVersion}\\] - Unreleased$`, "m");

if (!pattern.test(current)) {
  console.error(
    `Error: ${changelogPath} does not contain \"## [${version}] - Unreleased\".`,
  );
  process.exit(1);
}

writeFileSync(
  changelogPath,
  current.replace(pattern, `## [${version}] - ${today}`),
);
