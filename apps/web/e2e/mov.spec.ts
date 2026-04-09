import { test } from "@playwright/test";

import { runMediaRoundTrip } from "./helpers/media-roundtrip";

test("round-trips MOV metadata", async ({ page }) => {
  await runMediaRoundTrip(page, {
    filename: "sample.mov",
    readField: "QuickTime:Comment",
    ffmpegArgs: [
      "-f",
      "lavfi",
      "-i",
      "color=c=#225588:s=32x32:d=1",
      "-c:v",
      "mpeg4",
      "-pix_fmt",
      "yuv420p",
    ],
  });
});