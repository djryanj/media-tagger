import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

import { createFixture, expectTaggedPayload } from "./helpers/media-roundtrip";

const execFileAsync = promisify(execFile);

const GIF_FFMPEG_ARGS = [
  "-f",
  "lavfi",
  "-i",
  "testsrc=size=24x24:rate=2",
  "-t",
  "1",
];

const MP4_READ_FIELDS = [
  "ItemList:Comment",
  "UserData:Comment",
  "Keys:Comment",
  "ItemList:Description",
  "UserData:Description",
  "Keys:Description",
  "XMP-dc:Description",
];

test("converts GIF to MP4 with tags when conversion is enabled (shared mode)", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "media-tagger-e2e-gif2mp4-"),
  );
  const sourcePath = join(temporaryDirectory, "sample.gif");
  const downloadPath = join(temporaryDirectory, "download.mp4");

  try {
    await createFixture(sourcePath, GIF_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(sourcePath);

    // The GIF-to-MP4 conversion section should appear
    const conversionSection = page.getByLabel("GIF to MP4 conversion");
    await expect(conversionSection).toBeVisible();

    // The checkbox should be checked by default
    const conversionCheckbox = conversionSection.getByRole("checkbox");
    await expect(conversionCheckbox).toBeChecked();

    await page.locator("#media-tags").fill("forest, timelapse");

    const submitButton = page.getByRole("button", {
      name: "Tag all and download",
    });
    await expect(submitButton).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      submitButton.click({ force: true }),
    ]);

    // The downloaded file should be an MP4
    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(/\.mp4$/i);

    await download.saveAs(downloadPath);

    await expectTaggedPayload(downloadPath, MP4_READ_FIELDS);

    await expect(
      page.getByText(`Downloaded ${suggestedFilename}.`),
    ).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("keeps GIF format when conversion is disabled (shared mode)", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "media-tagger-e2e-gif2mp4-"),
  );
  const sourcePath = join(temporaryDirectory, "sample.gif");
  const downloadPath = join(temporaryDirectory, "download.gif");

  try {
    await createFixture(sourcePath, GIF_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(sourcePath);

    // Uncheck the conversion checkbox
    const conversionCheckbox = page
      .getByLabel("GIF to MP4 conversion")
      .getByRole("checkbox");
    await expect(conversionCheckbox).toBeChecked();
    await conversionCheckbox.uncheck();
    await expect(conversionCheckbox).not.toBeChecked();

    await page.locator("#media-tags").fill("forest, timelapse");

    const submitButton = page.getByRole("button", {
      name: "Tag all and download",
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      submitButton.click({ force: true }),
    ]);

    // When conversion is disabled, the file should remain a GIF
    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(/\.gif$/i);

    await download.saveAs(downloadPath);

    await expectTaggedPayload(downloadPath, ["XMP-dc:Description"]);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("shows per-file Convert to MP4 checkbox in individual mode for GIF files", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "media-tagger-e2e-gif2mp4-"),
  );
  const gifPath = join(temporaryDirectory, "sample.gif");

  try {
    await createFixture(gifPath, GIF_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(gifPath);

    // Switch to individual mode
    await page.getByRole("button", { name: "Tag images individually" }).click();

    // The per-file "Convert to MP4" checkbox should be visible and checked by default
    const individualSection = page.getByLabel("Individual tags");
    const convertCheckbox = individualSection.getByRole("checkbox", {
      name: /Convert to MP4/i,
    });
    await expect(convertCheckbox).toBeVisible();
    await expect(convertCheckbox).toBeChecked();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("converts GIF to MP4 in individual mode when per-file checkbox is checked", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "media-tagger-e2e-gif2mp4-"),
  );
  const gifPath = join(temporaryDirectory, "sample.gif");
  const downloadPath = join(temporaryDirectory, "download.mp4");

  try {
    await createFixture(gifPath, GIF_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(gifPath);

    // Switch to individual mode
    await page.getByRole("button", { name: "Tag images individually" }).click();

    // Ensure the per-file convert checkbox is checked
    const convertCheckbox = page
      .getByLabel("Individual tags")
      .getByRole("checkbox", { name: /Convert to MP4/i });
    await expect(convertCheckbox).toBeChecked();

    // Fill tags and submit via the file-level button
    const tagsInput = page.getByRole("textbox", {
      name: /Tags for sample.gif/i,
    });
    await tagsInput.fill("forest, timelapse");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: /Tag and download sample.gif/i })
        .click({ force: true }),
    ]);

    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(/\.mp4$/i);

    await download.saveAs(downloadPath);

    await expectTaggedPayload(downloadPath, MP4_READ_FIELDS);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("GIF conversion option does not appear for non-GIF files", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "media-tagger-e2e-gif2mp4-"),
  );
  const jpgPath = join(temporaryDirectory, "sample.jpg");

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=32x32",
      "-frames:v",
      "1",
      jpgPath,
    ]);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(jpgPath);

    // GIF conversion section should NOT appear for non-GIF files
    await expect(page.getByLabel("GIF to MP4 conversion")).not.toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
