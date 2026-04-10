import { test } from "@playwright/test";

import { runMultiFileRoundTrip } from "./helpers/media-roundtrip";

test("round-trips metadata for multiple files with one tag set", async ({ page }) => {
  await runMultiFileRoundTrip(page, [
    {
      filename: "sample-a.png",
      readFields: ["XMP-dc:Description"],
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        "color=c=#336699:s=24x24",
        "-frames:v",
        "1",
      ],
    },
    {
      filename: "sample-b.webp",
      readFields: ["XMP-dc:Description"],
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        "color=c=#884422:s=24x24",
        "-frames:v",
        "1",
      ],
    },
  ]);
});