import { test } from "@playwright/test";

import { runMediaRoundTrip } from "./helpers/media-roundtrip";

test("round-trips GIF metadata", async ({ page }) => {
  await runMediaRoundTrip(page, {
    filename: "sample.gif",
    readField: "XMP-dc:Description",
    ffmpegArgs: ["-f", "lavfi", "-i", "testsrc=size=24x24:rate=2", "-t", "1"],
  });
});