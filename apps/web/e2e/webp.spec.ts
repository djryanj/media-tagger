import { test } from "@playwright/test";

import { runMediaRoundTrip } from "./helpers/media-roundtrip";

test("round-trips WebP metadata", async ({ page }) => {
  await runMediaRoundTrip(page, {
    filename: "sample.webp",
    readField: "XMP-dc:Description",
    ffmpegArgs: ["-f", "lavfi", "-i", "color=c=#118866:s=24x24", "-frames:v", "1"],
  });
});