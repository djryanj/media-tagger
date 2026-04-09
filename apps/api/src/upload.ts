import { once } from "node:events";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Readable } from "node:stream";

import { sanitizeFilename } from "./media.js";

export type UploadProcessingMode = "memory" | "disk";

export type ConsumedUpload = {
  actualFileSize: number;
  buffer: Buffer | null;
  declaredFileSize: number | null;
  inputPath: string | null;
  processingMode: UploadProcessingMode;
};

type ConsumeUploadedFileInput = {
  declaredFileSize: number | null;
  filename: string;
  fileStream: Readable;
  inMemoryUploadLimitBytes: number;
};

export async function consumeUploadedFile({
  declaredFileSize,
  filename,
  fileStream,
  inMemoryUploadLimitBytes,
}: ConsumeUploadedFileInput): Promise<ConsumedUpload> {
  let actualFileSize = 0;
  let bufferedChunks: Buffer[] = [];
  let inputPath: string | null = null;
  let processingMode = shouldBufferUploadInMemory(
    declaredFileSize,
    inMemoryUploadLimitBytes,
  )
    ? "memory"
    : "disk";
  let uploadDirectory: string | null = null;
  let writeStream: WriteStream | null = null;

  const ensureDiskWriter = async () => {
    if (writeStream && inputPath) {
      return writeStream;
    }

    uploadDirectory = await mkdtemp(join(tmpdir(), "media-tagger-upload-"));
    inputPath = join(uploadDirectory, sanitizeFilename(filename));
    writeStream = createWriteStream(inputPath);

    return writeStream;
  };

  try {
    for await (const chunk of fileStream) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      actualFileSize += bufferChunk.length;

      if (processingMode === "memory") {
        bufferedChunks.push(bufferChunk);

        if (actualFileSize <= inMemoryUploadLimitBytes) {
          continue;
        }

        processingMode = "disk";
        const diskWriter = await ensureDiskWriter();

        for (const bufferedChunk of bufferedChunks) {
          await writeChunk(diskWriter, bufferedChunk);
        }

        bufferedChunks = [];
        continue;
      }

      const diskWriter = await ensureDiskWriter();
      await writeChunk(diskWriter, bufferChunk);
    }

    if (writeStream) {
      await closeWriteStream(writeStream);

      return {
        actualFileSize,
        buffer: null,
        declaredFileSize,
        inputPath,
        processingMode: "disk",
      };
    }

    return {
      actualFileSize,
      buffer: Buffer.concat(bufferedChunks),
      declaredFileSize,
      inputPath: null,
      processingMode: "memory",
    };
  } catch (error) {
    if (uploadDirectory) {
      await rm(uploadDirectory, { force: true, recursive: true });
    }

    throw error;
  }
}

export function parseDeclaredFileSize(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null;
  }

  return parsedValue;
}

export function shouldBufferUploadInMemory(
  declaredFileSize: number | null,
  inMemoryUploadLimitBytes: number,
): boolean {
  return declaredFileSize !== null && declaredFileSize <= inMemoryUploadLimitBytes;
}

async function closeWriteStream(writeStream: WriteStream): Promise<void> {
  writeStream.end();
  await once(writeStream, "finish");
}

async function writeChunk(
  writeStream: WriteStream,
  chunk: Buffer,
): Promise<void> {
  if (writeStream.write(chunk)) {
    return;
  }

  await once(writeStream, "drain");
}