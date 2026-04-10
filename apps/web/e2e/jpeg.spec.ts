import { test } from "@playwright/test";

import { runMediaRoundTrip } from "./helpers/media-roundtrip";

test("round-trips JPEG metadata", async ({ page }) => {
  await runMediaRoundTrip(page, {
    filename: "sample.jpeg",
    readFields: ["XMP-dc:Description"],
    ffmpegArgs: ["-f", "lavfi", "-i", "color=c=#8844aa:s=24x24", "-frames:v", "1", "-q:v", "2"],
  });
});