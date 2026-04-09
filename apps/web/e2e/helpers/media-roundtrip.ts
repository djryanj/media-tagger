import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { expect, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const TEST_TAGS = "forest, timelapse";
const EXPECTED_PAYLOAD = "tags:forest,timelapse;";

export type MediaFixture = {
  filename: string;
  readField: string;
  ffmpegArgs: string[];
};

export async function runMediaRoundTrip(page: Page, fixture: MediaFixture) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-"));
  const sourcePath = join(temporaryDirectory, fixture.filename);
  const downloadPath = join(temporaryDirectory, `download-${fixture.filename}`);

  try {
    await createFixture(sourcePath, fixture.ffmpegArgs);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(sourcePath);
    await page.locator("#media-tags").fill(TEST_TAGS);
    await page.locator("#semicolon-toggle").check();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Tag and download" }).click();
    const download = await downloadPromise;

    await download.saveAs(downloadPath);

    const { stdout } = await execFileAsync("exiftool", [
      "-s3",
      `-${fixture.readField}`,
      downloadPath,
    ]);

    expect(stdout.trim()).toBe(EXPECTED_PAYLOAD);
    await expect(
      page.getByText(`Downloaded ${download.suggestedFilename()}.`),
    ).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function createFixture(outputPath: string, ffmpegArgs: string[]) {
  await execFileAsync("ffmpeg", ["-y", ...ffmpegArgs, outputPath]);
}