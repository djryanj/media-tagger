import { execFile } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";

import { getMediaSpec, sanitizeFilename } from "./media.js";

const execFileAsync = promisify(execFile);

export class MetadataWriteError extends Error {}

type WriteTaggedMediaInput = {
  filename: string;
  inputPath: string;
  mimetype: string;
  payload: string;
};

type WriteTaggedMediaFromBufferInput = {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  payload: string;
};

type WriteTaggedMediaResult = {
  contentType: string;
  filename: string;
  outputPath: string;
  resolution: ReturnType<typeof getMediaSpec>["resolution"];
};

type WriteTaggedMediaFromBufferResult = {
  buffer: Buffer;
  contentType: string;
  filename: string;
  resolution: ReturnType<typeof getMediaSpec>["resolution"];
};

export async function writeTaggedMedia({
  filename,
  inputPath,
  mimetype,
  payload,
}: WriteTaggedMediaInput): Promise<WriteTaggedMediaResult> {
  const workingDirectory = dirname(inputPath);
  const initialTargetPath = join(workingDirectory, sanitizeFilename(filename));
  let targetPath = initialTargetPath;

  try {
    if (initialTargetPath !== inputPath) {
      await rename(inputPath, initialTargetPath);
    }

    const detectedMedia = await detectMediaType(initialTargetPath);
    const mediaSpec = getMediaSpec({
      declaredMimeType: mimetype,
      detectedContentType: detectedMedia.contentType,
      detectedExtension: detectedMedia.extension,
      filename,
    });

    const resolvedTargetPath = join(workingDirectory, mediaSpec.safeFilename);

    if (resolvedTargetPath !== initialTargetPath) {
      await rename(initialTargetPath, resolvedTargetPath);
      targetPath = resolvedTargetPath;
    }

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
      contentType: mediaSpec.contentType,
      filename: mediaSpec.safeFilename,
      outputPath: targetPath,
      resolution: mediaSpec.resolution,
    };
  } catch (error) {
    await rm(workingDirectory, { force: true, recursive: true });
    throw error;
  }
}

export async function writeTaggedMediaFromBuffer({
  buffer,
  filename,
  mimetype,
  payload,
}: WriteTaggedMediaFromBufferInput): Promise<WriteTaggedMediaFromBufferResult> {
  const workingDirectory = await mkdtemp(join(tmpdir(), "media-tagger-buffer-"));
  const initialTargetPath = join(workingDirectory, sanitizeFilename(filename));

  try {
    await writeFile(initialTargetPath, buffer);

    const taggedMedia = await writeTaggedMedia({
      filename,
      inputPath: initialTargetPath,
      mimetype,
      payload,
    });

    return {
      buffer: await readFile(taggedMedia.outputPath),
      contentType: taggedMedia.contentType,
      filename: taggedMedia.filename,
      resolution: taggedMedia.resolution,
    };
  } finally {
    await rm(workingDirectory, { force: true, recursive: true });
  }
}

async function detectMediaType(
  targetPath: string,
): Promise<{ contentType: string; extension: string }> {
  const output = await runExifTool(["-s3", "-FileTypeExtension", "-MIMEType", targetPath]);
  const [rawExtension = "", rawContentType = ""] = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    contentType: rawContentType.toLocaleLowerCase(),
    extension: rawExtension.toLocaleLowerCase(),
  };
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
