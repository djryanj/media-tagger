import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { expect, test } from "@playwright/test";

import { createFixture } from "./helpers/media-roundtrip";

const PNG_FFMPEG_ARGS = [
  "-f",
  "lavfi",
  "-i",
  "color=c=#336699:s=24x24",
  "-frames:v",
  "1",
];

test("previews the pipe cross-product under the shared tags input", async ({
  page,
}) => {
  await page.goto("/");

  const preview = page.getByLabel("Tag preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("No tags yet.")).toBeVisible();

  await page.locator("#media-tags").fill("big|huge trees");

  await expect(preview.getByText("2 tags")).toBeVisible();
  await expect(preview.locator(".tag-chip", { hasText: "big trees" })).toBeVisible();
  await expect(preview.locator(".tag-chip", { hasText: "huge trees" })).toBeVisible();

  // The preview updates live as the expression grows.
  await page.locator("#media-tags").fill("big|huge red|green trees");

  await expect(preview.getByText("4 tags")).toBeVisible();
  await expect(
    preview.locator(".tag-chip", { hasText: "huge green trees" }),
  ).toBeVisible();
});

test("previews blank pipe segments and drops duplicates", async ({ page }) => {
  await page.goto("/");

  await page.locator("#media-tags").fill("large trees|, large |trees, LARGE");

  const preview = page.getByLabel("Tag preview");
  await expect(preview.getByText("2 tags")).toBeVisible();
  await expect(preview.locator(".tag-chip", { hasText: /^large$/ })).toBeVisible();
  await expect(
    preview.locator(".tag-chip", { hasText: "large trees" }),
  ).toBeVisible();
});

test("previews tags under each individual tag input", async ({ page }) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-tp-"));
  const firstPath = join(temporaryDirectory, "sample-a.png");
  const secondPath = join(temporaryDirectory, "sample-b.png");

  try {
    await createFixture(firstPath, PNG_FFMPEG_ARGS);
    await createFixture(secondPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles([firstPath, secondPath]);
    await page.getByRole("button", { name: "Tag images individually" }).click();

    await page
      .getByRole("textbox", { name: "Tags for sample-a.png" })
      .fill("small|big cat");

    const firstPreview = page.getByLabel("Tag preview for sample-a.png");
    const secondPreview = page.getByLabel("Tag preview for sample-b.png");

    await expect(firstPreview.locator(".tag-chip", { hasText: "small cat" })).toBeVisible();
    await expect(firstPreview.locator(".tag-chip", { hasText: "big cat" })).toBeVisible();
    await expect(secondPreview.getByText("No tags yet.")).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

test("the previewed tags match the tags the server writes", async ({ page }) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-tp-"));
  const pngPath = join(temporaryDirectory, "sample-a.png");

  try {
    await createFixture(pngPath, PNG_FFMPEG_ARGS);

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(pngPath);
    await page.locator("#media-tags").fill("big|huge trees, sunrise");

    const previewedTags = await page
      .getByLabel("Tag preview")
      .locator(".tag-chip")
      .allTextContents();

    await page
      .getByRole("button", { name: "Tag all and download" })
      .click({ force: true });

    await expect(page.locator(".download-item-downloaded")).toHaveCount(1);

    await page
      .getByRole("button", { name: "Toggle details for sample-a.png" })
      .click();

    await expect(page.locator(".download-item .tag-chip").first()).toBeVisible();

    const appliedTags = await page
      .locator(".download-item .tag-chips-row .tag-chip")
      .allTextContents();

    expect(appliedTags).toEqual(previewedTags);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
