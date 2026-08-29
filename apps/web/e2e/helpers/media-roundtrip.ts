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

/**
 * Nothing downloads automatically, so every round trip finishes by saving the
 * file from its download-manager row.
 */
export async function saveFromDownloadRow(
  page: Page,
  rowIndex = 0,
): Promise<Download> {
  const downloadButton = page.locator(".download-item-download").nth(rowIndex);

  await expect(downloadButton).toBeEnabled();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
    }),
  ]);

  return download;
}

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
      name: "Tag all files",
    });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    await submitButton.click({ force: true });

    await expect(page.locator(".download-item-ready")).toHaveCount(1);

    const download = await saveFromDownloadRow(page);

    await download.saveAs(downloadPath);

    await expectTaggedPayload(downloadPath, fixture.readFields);
    await expect(
      page.getByText(`Downloaded ${download.suggestedFilename()}.`),
    ).toBeVisible();
    await expect(page.locator(".download-item-downloaded")).toHaveCount(1);
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
      name: "Tag all files",
    });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    await submitButton.click({ force: true });

    await expect(page.getByText("Tagged 2 of 2 files.")).toBeVisible();

    const downloadManager = page.getByLabel("Downloads");
    const manualDownloadButtons = downloadManager.locator(
      ".download-item-download",
    );

    await expect(downloadManager).toBeVisible();
    await expect(manualDownloadButtons).toHaveCount(2);
    await expect(downloadManager.locator(".download-item-ready")).toHaveCount(2);

    const downloads: Download[] = [];

    for (let rowIndex = 0; rowIndex < fixtures.length; rowIndex += 1) {
      downloads.push(await saveFromDownloadRow(page, rowIndex));
    }

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

    await expect(
      page.getByText(`Downloaded ${downloads[1]?.suggestedFilename()}.`),
    ).toBeVisible();
    await expect(
      downloadManager.locator(".download-item-downloaded"),
    ).toHaveCount(2);
    await expect(downloadManager.getByText("2 of 2 downloaded")).toBeVisible();
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