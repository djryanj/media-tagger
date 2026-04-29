import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { expect, test } from "@playwright/test";

import { createFixture } from "./helpers/media-roundtrip";

test("shows shared-mode previews and removes files from the queue", async ({ page }) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-"));
  const fixtures = [
    {
      filename: "sample-a.png",
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        "color=c=#336699:s=24x24",
        "-frames:v",
        "1",
      ],
    },
    {
      filename: "sample-b.webp",
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        "color=c=#884422:s=24x24",
        "-frames:v",
        "1",
      ],
    },
  ];
  const sourcePaths = fixtures.map((fixture) =>
    join(temporaryDirectory, fixture.filename),
  );

  try {
    await Promise.all(
      fixtures.map((fixture, index) =>
        createFixture(sourcePaths[index] ?? fixture.filename, fixture.ffmpegArgs),
      ),
    );

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(sourcePaths);

    await expect(page.getByRole("img", { name: "Preview of sample-a.png" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Preview of sample-b.webp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove sample-a.png" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove sample-b.webp" })).toBeVisible();

    await page.getByRole("button", { name: "Remove sample-b.webp" }).click({ force: true });

    await expect(page.getByRole("img", { name: "Preview of sample-b.webp" })).toHaveCount(0);
    await expect(page.getByText("Removed sample-b.webp from the queue. 1 file remains.")).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});