import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { expect, type Page } from "@playwright/test";
import type { Download } from "@playwright/test";

const execFileAsync = promisify(execFile);
const TEST_TAGS = "forest, timelapse";
const EXPECTED_PAYLOAD = "tags:forest,timelapse";

export type MediaFixture = {
  filename: string;
  readFields: string[];
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

    const submitButton = page.getByRole("button", {
      name: "Tag and download files",
    });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      submitButton.click({ force: true }),
    ]);

    await download.saveAs(downloadPath);

    await expectTaggedPayload(downloadPath, fixture.readFields);
    await expect(
      page.getByText(`Downloaded ${download.suggestedFilename()}.`),
    ).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

export async function runMultiFileRoundTrip(
  page: Page,
  fixtures: [MediaFixture, MediaFixture],
) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-"));
  const sourcePaths = fixtures.map((fixture) =>
    join(temporaryDirectory, fixture.filename),
  );
  const downloadPaths = fixtures.map((fixture) =>
    join(temporaryDirectory, `download-${fixture.filename}`),
  );

  try {
    await Promise.all(
      fixtures.map((fixture, index) =>
        createFixture(sourcePaths[index] ?? fixture.filename, fixture.ffmpegArgs),
      ),
    );

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(sourcePaths);
    await page.locator("#media-tags").fill(TEST_TAGS);

    const submitButton = page.getByRole("button", {
      name: "Tag and download files",
    });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    const downloads: Download[] = [];
    const handleDownload = (download: Download) => {
      downloads.push(download);
    };

    page.on("download", handleDownload);

    await submitButton.click({ force: true });

    await expect
      .poll(() => downloads.length, {
        message: `Expected ${fixtures.length} download events.`,
      })
      .toBe(fixtures.length);

    page.off("download", handleDownload);

    await Promise.all(
      downloads.map(async (download, index) => {
        const downloadPath = downloadPaths[index];
        const fixture = fixtures[index];

        if (!downloadPath || !fixture) {
          return;
        }

        await download.saveAs(downloadPath);

        await expectTaggedPayload(downloadPath, fixture.readFields);
      }),
    );

    await expect(page.getByText("Downloaded 2 of 2 files.")).toBeVisible();
    const processedFiles = page.getByLabel("Processed files");
    const firstManualDownloadButton = processedFiles
      .getByRole("button", { name: "Download" })
      .first();

    await expect(processedFiles).toBeVisible();
    await expect(processedFiles.getByRole("button", { name: "Download" })).toHaveCount(2);
    await firstManualDownloadButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(
      page.getByText(`Manual download started for ${downloads[0]?.suggestedFilename()}.`),
    ).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function createFixture(outputPath: string, ffmpegArgs: string[]) {
  await execFileAsync("ffmpeg", ["-y", ...ffmpegArgs, outputPath]);
}

async function expectTaggedPayload(
  filePath: string,
  readFields: string[],
  expectedPayload = EXPECTED_PAYLOAD,
): Promise<void> {
  for (const readField of readFields) {
    const { stdout } = await execFileAsync("exiftool", [
      "-s3",
      `-${readField}`,
      filePath,
    ]);

    if (stdout.trim() === expectedPayload) {
      return;
    }
  }

  throw new Error(
    `Expected one of ${readFields.join(", ")} to equal ${expectedPayload}.`,
  );
}

export { createFixture, expectTaggedPayload };