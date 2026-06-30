import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// This test checks that an MP4 file shows a <video> preview in shared mode

test("shows a video preview for MP4 in shared mode", async ({ page }) => {
  // Create a temporary directory for the fixture
  const tmpPath = mkdtempSync(join(tmpdir(), "playwright-mp4-"));
  const mp4Path = join(tmpPath, "preview-test.mp4");

  // Create a minimal MP4 fixture using ffmpeg
  execSync(
    [
      "ffmpeg", "-y",
      "-f", "lavfi",
      "-i", "color=c=blue:s=32x32:d=1",
      "-c:v", "mpeg4",
      "-pix_fmt", "yuv420p",
      JSON.stringify(mp4Path),
    ].join(" "),
    { stdio: "pipe" },
  );

  expect(existsSync(mp4Path)).toBe(true);

  await page.goto("/");
  await page.locator("#media-file").setInputFiles(mp4Path);

  // Should render a clickable preview button containing a <video> element
  const previewButton = page.getByLabel("Open video preview for preview-test.mp4");
  await expect(previewButton).toBeVisible();
  await expect(previewButton.locator("video")).toHaveAttribute("src", /blob:/);

  // Should not render an <img> for this file
  await expect(
    page.getByRole("img", { name: /preview-test\.mp4/i }),
  ).toHaveCount(0);
});
