import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { expect, test, type Download } from "@playwright/test";

import {
  createFixture,
  expectTaggedPayload,
  type MediaFixture,
} from "./helpers/media-roundtrip";

type IndividualFixture = MediaFixture & {
  expectedPayload: string;
  tags: string;
};

test("round-trips metadata for individually tagged files with copy and paste", async ({
  page,
}) => {
  const fixtures: [IndividualFixture, IndividualFixture] = [
    {
      filename: "sample-a.png",
      expectedPayload: "tags:forest,sunrise",
      readFields: ["XMP-dc:Description"],
      tags: "forest, sunrise",
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
      expectedPayload: "tags:desert,canyon",
      readFields: ["XMP-dc:Description"],
      tags: "desert, canyon",
      ffmpegArgs: [
        "-f",
        "lavfi",
        "-i",
        "color=c=#884422:s=24x24",
        "-frames:v",
        "1",
      ],
    },
  ];
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "media-tagger-e2e-"));
  const sourcePaths = fixtures.map((fixture) =>
    join(temporaryDirectory, fixture.filename),
  );
  const downloadPaths = fixtures.map((fixture) =>
    join(temporaryDirectory, `download-${fixture.filename}`),
  );

  try {
    await Promise.all(
      fixtures.map((fixture, index) =>
        createFixture(sourcePaths[index] ?? fixture.filename, fixture.ffmpegArgs),
      ),
    );

    await page.goto("/");
    await page.locator("#media-file").setInputFiles(sourcePaths);
    await page.getByRole("button", { name: "Tag images individually" }).click();

    await expect(
      page.getByRole("img", { name: "Preview of sample-a.png" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Preview of sample-b.webp" }),
    ).toBeVisible();

    await page.getByLabel("Tags for sample-a.png").fill(fixtures[0].tags);
    await page.getByRole("button", { name: "Copy tags" }).nth(0).click();
    await page
      .getByRole("button", { name: "Paste copied tags from sample-a.png" })
      .nth(1)
      .click();
    await expect(page.getByLabel("Tags for sample-b.webp")).toHaveValue(
      fixtures[0].tags,
    );
    await page.getByLabel("Tags for sample-b.webp").fill(fixtures[1].tags);

    const submitButton = page.getByRole("button", {
      name: "Tag and download files",
    });
    await expect(submitButton).toBeEnabled();

    const downloads: Download[] = [];
    const handleDownload = (download: Download) => {
      downloads.push(download);
    };

    page.on("download", handleDownload);

    await submitButton.click({ force: true });

    await expect
      .poll(() => downloads.length, {
        message: `Expected ${fixtures.length} download events.`,
      })
      .toBe(fixtures.length);

    page.off("download", handleDownload);

    await Promise.all(
      downloads.map(async (download, index) => {
        const fixture = fixtures[index];
        const downloadPath = downloadPaths[index];

        if (!fixture || !downloadPath) {
          return;
        }

        await download.saveAs(downloadPath);
        await expectTaggedPayload(
          downloadPath,
          fixture.readFields,
          fixture.expectedPayload,
        );
      }),
    );

    await expect(page.getByText("Downloaded 2 of 2 files.")).toBeVisible();
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});