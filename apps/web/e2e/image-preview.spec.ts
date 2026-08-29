import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { expect, test } from "@playwright/test";

import { createFixture } from "./helpers/media-roundtrip";

const PNG_FFMPEG_ARGS = [
  "-f",
  "lavfi",
  "-i",
  "color=c=#336699:s=64x64",
  "-frames:v",
  "1",
];

test("opens a zoomable lightbox for images in shared mode", async ({ page }) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-img-"));
  const pngPath = join(temporaryDirectory, "sample-a.png");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);

    await page
      .getByRole("button", { name: "Open image preview for sample-a.png" })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "Image preview for sample-a.png",
    });
    await expect(dialog).toBeVisible();

    const image = dialog.getByRole("img", {
      name: "Full preview of sample-a.png",
    });
    await expect(image).toBeVisible();

    // Zoom in twice, then reset.
    await expect(page.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.getByText("150%")).toBeVisible();
    await expect(image).toHaveAttribute("style", /width: 150%/);

    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.getByText("200%")).toBeVisible();

    await page.getByRole("button", { name: "Reset zoom" }).click();
    await expect(page.getByText("100%")).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("opens a zoomable lightbox for images in individual mode", async ({
  page,
}) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-img-"));
  const pngPath = join(temporaryDirectory, "sample-a.png");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);
    await page.getByRole("button", { name: "Tag images individually" }).click();

    await page
      .getByRole("button", { name: "Open image preview for sample-a.png" })
      .click();

    await expect(
      page.getByRole("dialog", { name: "Image preview for sample-a.png" }),
    ).toBeVisible();

    // Escape closes the lightbox.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Image preview for sample-a.png" }),
    ).toHaveCount(0);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
