#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const [version, ...files] = process.argv.slice(2);

if (!version) {
  console.error("Error: version argument is required.");
  process.exit(1);
}

if (files.length === 0) {
  console.error("Error: at least one package.json path is required.");
  process.exit(1);
}

for (const file of files) {
  const contents = readFileSync(file, "utf8");
  const pkg = JSON.parse(contents);

  pkg.version = version;

  writeFileSync(file, `${JSON.stringify(pkg, null, 4)}\n`);
}
