import { test } from "@playwright/test";

import { runMediaRoundTrip } from "./helpers/media-roundtrip";

test("round-trips MP4 metadata", async ({ page }) => {
  await runMediaRoundTrip(page, {
    filename: "sample.mp4",
    readField: "QuickTime:Comment",
    ffmpegArgs: [
      "-f",
      "lavfi",
      "-i",
      "color=c=#336699:s=32x32:d=1",
      "-c:v",
      "mpeg4",
      "-pix_fmt",
      "yuv420p",
    ],
  });
});