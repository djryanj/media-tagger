import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();
const execFileAsyncMock = vi.fn();
const execFileMockWithCustomPromisify = execFileMock as typeof execFileMock & {
  [promisify.custom]: typeof execFileAsyncMock;
};

execFileMockWithCustomPromisify[promisify.custom] = execFileAsyncMock;

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

const { MetadataWriteError, writeTaggedMedia } = await import("./metadata.js");

describe("metadata writes", () => {
  afterEach(() => {
    execFileMock.mockReset();
    execFileAsyncMock.mockReset();
  });

  it("treats exiftool minor warnings as recoverable when the write succeeds", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "metadata-write-"));
    const inputPath = join(workingDirectory, "clip.mp4");
    const payload = "tags:cats,dogs";

    await writeFile(inputPath, Buffer.from("video bytes"));

    queueExecFileSuccess("mp4\nvideo/mp4\n");
    queueExecFileFailure({
      message: "Command failed: exiftool -overwrite_original ...",
      stderr:
        "Error: [minor] Terminator found in Meta with 136 bytes remaining - /tmp/clip.mp4\n",
    });
    queueExecFileSuccess("\n");
    queueExecFileSuccess(`${payload}\n`);

    await expect(
      writeTaggedMedia({
        filename: "clip.mp4",
        inputPath,
        mimetype: "video/mp4",
        payload,
      }),
    ).resolves.toMatchObject({
      contentType: "video/mp4",
      filename: "clip.mp4",
      outputPath: inputPath,
      resolution: {
        detectedContentType: "video/mp4",
        detectedExtension: ".mp4",
      },
    });

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("keeps non-minor exiftool failures fatal", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "metadata-write-"));
    const inputPath = join(workingDirectory, "clip.mp4");

    await writeFile(inputPath, Buffer.from("video bytes"));

    queueExecFileSuccess("mp4\nvideo/mp4\n");
    queueExecFileFailure({
      message: "Command failed: exiftool -overwrite_original ...",
      stderr: "Error: Corrupted MP4 container\n",
    });

    await expect(
      writeTaggedMedia({
        filename: "clip.mp4",
        inputPath,
        mimetype: "video/mp4",
        payload: "tags:cats,dogs",
      }),
    ).rejects.toThrow(MetadataWriteError);

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("remuxes MP4 containers and retries when metadata does not persist", async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), "metadata-write-"));
    const inputPath = join(workingDirectory, "clip.mp4");
    const remuxedPath = `${inputPath}.remuxed.mp4`;
    const payload = "tags:cats,dogs";

    await writeFile(inputPath, Buffer.from("video bytes"));

    queueExecFileSuccess("mp4\nvideo/mp4\n");
    queueExecFileFailure({
      message: "Command failed: exiftool -overwrite_original ...",
      stderr:
        "Error: [minor] Terminator found in Meta with 136 bytes remaining - /tmp/clip.mp4\n",
    });
    queueExecFileSuccess("\n");
    queueExecFileSuccess("\n");
    queueExecFileSuccess("\n");
    queueExecFileSuccess("\n");
    queueExecFileSuccess("\n");
    queueExecFileSuccess("\n");
    queueExecFileSuccess("\n");
    queueFfmpegRemuxSuccess(remuxedPath);
    queueExecFileSuccess("");
    queueExecFileSuccess(`${payload}\n`);

    await expect(
      writeTaggedMedia({
        filename: "clip.mp4",
        inputPath,
        mimetype: "video/mp4",
        payload,
      }),
    ).resolves.toMatchObject({
      contentType: "video/mp4",
      filename: "clip.mp4",
      outputPath: inputPath,
    });

    await rm(workingDirectory, { force: true, recursive: true });
  });
});

function queueExecFileSuccess(stdout: string, stderr = ""): void {
  execFileAsyncMock.mockResolvedValueOnce({
    stderr,
    stdout,
  });
}

function queueFfmpegRemuxSuccess(remuxedPath: string): void {
  execFileAsyncMock.mockImplementationOnce(
    async (file: string, args: string[]) => {
      expect(file).toBe("ffmpeg");
      expect(args.at(-1)).toBe(remuxedPath);

      await writeFile(remuxedPath, Buffer.from("remuxed video bytes"));

      return {
        stderr: "",
        stdout: "",
      };
    },
  );
}

function queueExecFileFailure({
  code = 1,
  message,
  stderr,
  stdout = "",
}: {
  code?: number | string;
  message: string;
  stderr: string;
  stdout?: string;
}): void {
  execFileAsyncMock.mockRejectedValueOnce(
    Object.assign(new Error(message), {
      code,
      stderr,
      stdout,
    }),
  );
}