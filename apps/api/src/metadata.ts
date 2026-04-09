import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { getMediaSpec } from "./media.js";

const execFileAsync = promisify(execFile);

export class MetadataWriteError extends Error {}

type WriteTaggedMediaInput = {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  payload: string;
};

type WriteTaggedMediaResult = {
  buffer: Buffer;
  contentType: string;
  filename: string;
};

export async function writeTaggedMedia({
  buffer,
  filename,
  mimetype,
  payload,
}: WriteTaggedMediaInput): Promise<WriteTaggedMediaResult> {
  const mediaSpec = getMediaSpec(filename, mimetype);
  const workingDirectory = await mkdtemp(join(tmpdir(), "media-tagger-"));
  const targetPath = join(workingDirectory, mediaSpec.safeFilename);

  try {
    await writeFile(targetPath, buffer);

    await runExifTool([
      "-overwrite_original",
      "-api",
      "LargeFileSupport=1",
      `-${mediaSpec.writeField}=${payload}`,
      targetPath,
    ]);

    const readbackValue = (
      await runExifTool(["-s3", `-${mediaSpec.readField}`, targetPath])
    ).trim();

    if (readbackValue !== payload) {
      throw new MetadataWriteError(
        `Metadata verification failed after write. Expected "${payload}" but read back "${readbackValue}".`,
      );
    }

    return {
      buffer: await readFile(targetPath),
      contentType: mediaSpec.contentType,
      filename: mediaSpec.safeFilename,
    };
  } finally {
    await rm(workingDirectory, { force: true, recursive: true });
  }
}

async function runExifTool(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("exiftool", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown exiftool failure";

    throw new MetadataWriteError(`Exiftool failed while processing the file. ${message}`);
  }
}
