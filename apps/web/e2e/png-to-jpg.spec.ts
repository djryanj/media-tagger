import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

import {
  createFixture,
  expectTaggedPayload,
  saveFromDownloadRow,
} from "./helpers/media-roundtrip";

const execFileAsync = promisify(execFile);

// A photographic-looking source so the JPEG really is smaller than the PNG.
const PNG_FFMPEG_ARGS = [
  "-f",
  "lavfi",
  "-i",
  "mandelbrot=s=320x240",
  "-frames:v",
  "1",
];

const TRANSPARENT_PNG_FFMPEG_ARGS = [
  "-f",
  "lavfi",
  "-i",
  "color=c=red@0.5:s=64x64,format=rgba",
  "-frames:v",
  "1",
];

async function detectFileType(filePath: string): Promise<string> {
  const { stdout } = await execFileAsync("exiftool", [
    "-s3",
    "-FileTypeExtension",
    filePath,
  ]);

  return stdout.trim().toLowerCase();
}

test("offers PNG-to-JPG conversion, unchecked by default", async ({ page }) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-png-"));
  const pngPath = join(temporaryDirectory, "sample.png");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);

    const conversionSection = page.getByLabel("PNG to JPG conversion");
    await expect(conversionSection).toBeVisible();

    const conversionCheckbox = conversionSection.getByRole("checkbox");
    await expect(conversionCheckbox).not.toBeChecked();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("converts a PNG to a tagged JPG when the option is enabled", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-png-"));
  const pngPath = join(temporaryDirectory, "sample.png");
  const downloadPath = join(temporaryDirectory, "download.jpg");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);
    await page.getByLabel("PNG to JPG conversion").getByRole("checkbox").check();
    await page.locator("#media-tags").fill("forest, timelapse");

    await page
      .getByRole("button", { name: "Tag all files" })
      .click({ force: true });

    const download = await saveFromDownloadRow(page);

    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(/\.jpg$/i);

    await download.saveAs(downloadPath);

    expect(await detectFileType(downloadPath)).toBe("jpg");
    await expectTaggedPayload(downloadPath, ["XMP-dc:Description"]);

    const [sourceStats, downloadStats] = await Promise.all([
      stat(pngPath),
      stat(downloadPath),
    ]);
    expect(downloadStats.size).toBeLessThan(sourceStats.size);

    await expect(page.getByText(`Downloaded ${suggestedFilename}.`)).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("keeps the PNG format when the option is left disabled", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-png-"));
  const pngPath = join(temporaryDirectory, "sample.png");
  const downloadPath = join(temporaryDirectory, "download.png");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);
    await page.locator("#media-tags").fill("forest, timelapse");

    await page
      .getByRole("button", { name: "Tag all files" })
      .click({ force: true });

    const download = await saveFromDownloadRow(page);

    expect(download.suggestedFilename()).toMatch(/\.png$/i);

    await download.saveAs(downloadPath);

    expect(await detectFileType(downloadPath)).toBe("png");
    await expectTaggedPayload(downloadPath, ["XMP-dc:Description"]);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("flattens transparency when converting a PNG with an alpha channel", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-png-"));
  const pngPath = join(temporaryDirectory, "transparent.png");
  const downloadPath = join(temporaryDirectory, "transparent.jpg");

  try {
    await createFixture(pngPath, TRANSPARENT_PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);
    await page.getByLabel("PNG to JPG conversion").getByRole("checkbox").check();
    await page.locator("#media-tags").fill("forest, timelapse");

    await page
      .getByRole("button", { name: "Tag all files" })
      .click({ force: true });

    const download = await saveFromDownloadRow(page);

    await download.saveAs(downloadPath);

    expect(await detectFileType(downloadPath)).toBe("jpg");
    await expectTaggedPayload(downloadPath, ["XMP-dc:Description"]);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("converts a per-file PNG in individual mode", async ({ page }) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-png-"));
  const pngPath = join(temporaryDirectory, "sample.png");
  const downloadPath = join(temporaryDirectory, "download.jpg");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);
    await page.getByRole("button", { name: "Tag images individually" }).click();

    const convertCheckbox = page
      .getByLabel("Individual tags")
      .getByRole("checkbox", { name: /Convert to JPG/i });
    await expect(convertCheckbox).not.toBeChecked();
    await convertCheckbox.check();

    await page
      .getByRole("textbox", { name: "Tags for sample.png" })
      .fill("forest, timelapse");

    await page
      .getByRole("button", { name: "Tag sample.png" })
      .click({ force: true });

    const download = await saveFromDownloadRow(page);

    expect(download.suggestedFilename()).toMatch(/\.jpg$/i);

    await download.saveAs(downloadPath);

    expect(await detectFileType(downloadPath)).toBe("jpg");
    await expectTaggedPayload(downloadPath, ["XMP-dc:Description"]);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("does not offer PNG conversion for a JPG", async ({ page }) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-png-"));
  const jpgPath = join(temporaryDirectory, "sample.jpg");

  try {
    await createFixture(jpgPath, [
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=32x32",
      "-frames:v",
      "1",
    ]);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(jpgPath);

    await expect(page.getByLabel("PNG to JPG conversion")).toHaveCount(0);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
