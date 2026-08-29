import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { expect, test, type Download } from "@playwright/test";

import { createFixture, expectTaggedPayload } from "./helpers/media-roundtrip";

const PNG_FFMPEG_ARGS = [
  "-f",
  "lavfi",
  "-i",
  "color=c=#336699:s=24x24",
  "-frames:v",
  "1",
];

const WEBP_FFMPEG_ARGS = [
  "-f",
  "lavfi",
  "-i",
  "color=c=#884422:s=24x24",
  "-frames:v",
  "1",
];

const GIF_FFMPEG_ARGS = [
  "-f",
  "lavfi",
  "-i",
  "testsrc=size=24x24:rate=2",
  "-t",
  "1",
];

test("lists every queued file, downloads none of them on its own, and turns a row green once saved", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-dm-"));
  const pngPath = join(temporaryDirectory, "sample-a.png");
  const webpPath = join(temporaryDirectory, "sample-b.webp");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);
    await createFixture(webpPath, WEBP_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles([pngPath, webpPath]);
    await page.locator("#media-tags").fill("forest, timelapse");

    const downloads: Download[] = [];
    page.on("download", (download) => downloads.push(download));

    await page
      .getByRole("button", { name: "Tag all files" })
      .click({ force: true });

    const downloadManager = page.getByLabel("Downloads");
    await expect(downloadManager).toBeVisible();

    // Both files are listed, not just the one that finished first.
    await expect(downloadManager.locator(".download-item")).toHaveCount(2);
    await expect(
      downloadManager.getByRole("button", { name: "Toggle details for sample-a.png" }),
    ).toBeVisible();
    await expect(
      downloadManager.getByRole("button", { name: "Toggle details for sample-b.webp" }),
    ).toBeVisible();

    // Nothing downloads on its own, so the rows wait at amber.
    await expect(downloadManager.locator(".download-item-ready")).toHaveCount(2);
    await expect(downloadManager.getByText("Ready to download")).toHaveCount(2);
    await expect(
      downloadManager.locator(".download-item-downloaded"),
    ).toHaveCount(0);
    await expect(downloadManager.getByText("0 of 2 downloaded")).toBeVisible();

    // Rows animate between states, so settle on the final computed colour.
    await expect
      .poll(() =>
        downloadManager
          .locator(".download-item-ready")
          .first()
          .evaluate((row) => getComputedStyle(row).backgroundColor),
      )
      .toBe("rgb(253, 246, 230)");

    expect(downloads).toHaveLength(0);

    // Tapping a row's own download button is the only way a file is saved.
    const downloadButtons = downloadManager.locator(".download-item-download");

    await downloadButtons.first().evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(
      downloadManager.locator(".download-item-downloaded"),
    ).toHaveCount(1);
    await expect(downloadManager.getByText("1 of 2 downloaded")).toBeVisible();

    await downloadButtons.nth(1).evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(
      downloadManager.locator(".download-item-downloaded"),
    ).toHaveCount(2);
    await expect(
      downloadManager.getByText("Downloaded", { exact: true }),
    ).toHaveCount(2);
    await expect(downloadManager.getByText("2 of 2 downloaded")).toBeVisible();

    await expect
      .poll(() =>
        downloadManager
          .locator(".download-item-downloaded")
          .first()
          .evaluate((row) => getComputedStyle(row).backgroundColor),
      )
      .toBe("rgb(237, 248, 237)");

    await expect
      .poll(() => downloads.length, { message: "Expected 2 download events." })
      .toBe(2);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("expands a download row to show the thumbnail, saved name, and tags", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-dm-"));
  const pngPath = join(temporaryDirectory, "sample-a.png");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);
    await page.locator("#media-tags").fill("big|huge trees");

    await page
      .getByRole("button", { name: "Tag all files" })
      .click({ force: true });

    const row = page.locator(".download-item").first();
    await expect(row).toBeVisible();

    // A thumbnail identifies which file the row belongs to.
    await expect(
      row.getByRole("img", { name: "Thumbnail of sample-a.png" }),
    ).toBeVisible();

    const toggle = page.getByRole("button", {
      name: "Toggle details for sample-a.png",
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(row.locator(".download-result-name")).toHaveCount(0);

    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(row.getByText("Saves as sample-a.png")).toBeVisible();
    await expect(
      row.locator(".tag-chip", { hasText: "big trees" }),
    ).toBeVisible();
    await expect(
      row.locator(".tag-chip", { hasText: "huge trees" }),
    ).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("downloads a tagged file from its download row", async ({ page }) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-dm-"));
  const pngPath = join(temporaryDirectory, "sample-a.png");
  const downloadPath = join(temporaryDirectory, "manual-sample-a.png");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);
    await page.locator("#media-tags").fill("forest, timelapse");

    await page
      .getByRole("button", { name: "Tag all files" })
      .click({ force: true });

    await expect(page.locator(".download-item-ready")).toHaveCount(1);

    const [manualDownload] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Download sample-a.png" })
        .evaluate((button) => {
          (button as HTMLButtonElement).click();
        }),
    ]);

    await manualDownload.saveAs(downloadPath);
    await expectTaggedPayload(downloadPath, ["XMP-dc:Description"]);
    await expect(page.getByText("Downloaded sample-a.png.")).toBeVisible();
    await expect(page.locator(".download-item-downloaded")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Download sample-a.png" }),
    ).toHaveText("Download again");
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("tells the user how to save the file inside a ready row", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-dm-"));
  const pngPath = join(temporaryDirectory, "sample-a.png");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);
    await page.locator("#media-tags").fill("forest");

    await page
      .getByRole("button", { name: "Tag all files" })
      .click({ force: true });

    const row = page.locator(".download-item").first();
    await expect(row).toHaveClass(/download-item-ready/);

    await page
      .getByRole("button", { name: "Toggle details for sample-a.png" })
      .click();

    await expect(
      row.getByText(
        "Tap Download to save this file. Nothing is saved until you do.",
      ),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Download sample-a.png" })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
      });

    await expect(row).toHaveClass(/download-item-downloaded/);
    await expect(row.locator(".download-item-note")).toHaveCount(0);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("shows GIF conversion status inside the download row", async ({ page }) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-dm-"));
  const gifPath = join(temporaryDirectory, "animation.gif");

  try {
    await createFixture(gifPath, GIF_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(gifPath);
    await page.locator("#media-tags").fill("forest");

    await page
      .getByRole("button", { name: "Tag all files" })
      .click({ force: true });

    const row = page.locator(".download-item").first();
    await expect(row).toBeVisible();

    // The conversion finishes quickly for a tiny GIF, so assert on the end
    // state and on the row reporting the converted filename.
    await expect(row).toHaveClass(/download-item-ready/);

    await page
      .getByRole("button", { name: "Toggle details for animation.gif" })
      .click();

    await expect(row.getByText("Saves as animation.mp4")).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("marks a failed file as failed and keeps the other rows intact", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-dm-"));
  const pngPath = join(temporaryDirectory, "sample-a.png");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles([
      {
        name: "sample-a.png",
        mimeType: "image/png",
        buffer: await readFile(pngPath),
      },
      {
        name: "broken.png",
        mimeType: "image/png",
        buffer: Buffer.from("this is not a real image"),
      },
    ]);
    await page.locator("#media-tags").fill("forest");

    await page
      .getByRole("button", { name: "Tag all files" })
      .click({ force: true });

    const downloadManager = page.getByLabel("Downloads");
    await expect(downloadManager.locator(".download-item")).toHaveCount(2);
    await expect(downloadManager.locator(".download-item-failed")).toHaveCount(1);
    await expect(downloadManager.locator(".download-item-ready")).toHaveCount(1);

    await page
      .getByRole("button", { name: "Toggle details for broken.png" })
      .click();

    await expect(
      downloadManager.locator(".download-item-error"),
    ).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
