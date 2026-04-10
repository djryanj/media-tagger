import { test } from "@playwright/test";

import { runMediaRoundTrip } from "./helpers/media-roundtrip";

test("round-trips JPG metadata", async ({ page }) => {
  await runMediaRoundTrip(page, {
    filename: "sample.jpg",
    readFields: ["XMP-dc:Description"],
    ffmpegArgs: ["-f", "lavfi", "-i", "color=c=#336699:s=24x24", "-frames:v", "1", "-q:v", "2"],
  });
});