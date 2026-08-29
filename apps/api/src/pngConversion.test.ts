import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();
const execFileAsyncMock = vi.fn();
const execFileMockWithCustomPromisify = execFileMock as typeof execFileMock & {
  [promisify.custom]: typeof execFileAsyncMock;
};

execFileMockWithCustomPromisify[promisify.custom] = execFileAsyncMock;

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
  spawn: spawnMock,
}));

const { PngConversionError, convertPngToJpg } = await import(
  "./pngConversion.js"
);

describe("convertPngToJpg", () => {
  afterEach(() => {
    execFileAsyncMock.mockReset();
    execFileMock.mockReset();
    spawnMock.mockReset();
  });

  it("resolves when ffmpeg exits with code 0", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "png-conversion-test-"),
    );
    const inputPath = join(workingDirectory, "test.png");
    const outputPath = join(workingDirectory, "test.jpg");

    await writeFile(inputPath, Buffer.from("\x89PNG\r\n\x1a\n"));

    spawnMock.mockReturnValueOnce(buildFakeProcess(0));

    await expect(
      convertPngToJpg({ inputPath, outputPath }),
    ).resolves.toBeUndefined();

    expect(spawnMock).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining(["-i", inputPath, outputPath]),
      expect.any(Object),
    );

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("writes a single JPEG frame with the configured quality", async () => {
    spawnMock.mockReturnValueOnce(buildFakeProcess(0));

    await convertPngToJpg({
      inputPath: "/tmp/in.png",
      outputPath: "/tmp/out.jpg",
    });

    const args: string[] = spawnMock.mock.calls[0][1];

    expect(args).toContain("-frames:v");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("1");
    expect(args).toContain("-q:v");
    expect(args[args.indexOf("-q:v") + 1]).toBe("2");
    expect(args).toContain("-pix_fmt");
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuvj420p");
    expect(args[args.length - 1]).toBe("/tmp/out.jpg");
  });

  it("flattens transparency onto a white background", async () => {
    spawnMock.mockReturnValueOnce(buildFakeProcess(0));

    await convertPngToJpg({
      inputPath: "/tmp/in.png",
      outputPath: "/tmp/out.jpg",
    });

    const args: string[] = spawnMock.mock.calls[0][1];
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("color=white");
    expect(filterGraph).toContain("overlay");
  });

  it("honours a custom quality value", async () => {
    spawnMock.mockReturnValueOnce(buildFakeProcess(0));

    await convertPngToJpg({
      inputPath: "/tmp/in.png",
      outputPath: "/tmp/out.jpg",
      quality: 6,
    });

    const args: string[] = spawnMock.mock.calls[0][1];

    expect(args[args.indexOf("-q:v") + 1]).toBe("6");
  });

  it("rejects with PngConversionError when ffmpeg exits non-zero", async () => {
    spawnMock.mockReturnValueOnce(buildFakeProcess(1, "Invalid PNG data"));

    await expect(
      convertPngToJpg({ inputPath: "/tmp/in.png", outputPath: "/tmp/out.jpg" }),
    ).rejects.toThrow(PngConversionError);
  });

  it("includes the ffmpeg stderr output in the error message", async () => {
    spawnMock.mockReturnValueOnce(buildFakeProcess(1, "Invalid PNG data"));

    await expect(
      convertPngToJpg({ inputPath: "/tmp/in.png", outputPath: "/tmp/out.jpg" }),
    ).rejects.toThrow(/Invalid PNG data/);
  });

  it("rejects with PngConversionError when the ffmpeg process errors", async () => {
    spawnMock.mockReturnValueOnce(buildFakeProcessWithError("spawn ENOENT"));

    await expect(
      convertPngToJpg({ inputPath: "/tmp/in.png", outputPath: "/tmp/out.jpg" }),
    ).rejects.toThrow(PngConversionError);
  });
});

type FakeProcess = {
  stdout: EventEmitter & { resume(): void };
  stderr: EventEmitter;
  on(
    event: string,
    handler: ((code: number | null) => void) & ((err: Error) => void),
  ): void;
};

function buildFakeProcess(exitCode: number, stderrOutput = ""): FakeProcess {
  const stdout = Object.assign(new EventEmitter(), { resume() {} });
  const stderr = new EventEmitter();
  const closeHandlers: Array<(code: number | null) => void> = [];

  const proc: FakeProcess = {
    stdout,
    stderr,
    on(
      event: string,
      handler: ((code: number | null) => void) & ((err: Error) => void),
    ) {
      if (event === "close") {
        closeHandlers.push(handler);
      }
    },
  };

  setImmediate(() => {
    if (stderrOutput) {
      stderr.emit("data", Buffer.from(stderrOutput));
    }

    for (const handler of closeHandlers) handler(exitCode);
  });

  return proc;
}

function buildFakeProcessWithError(message: string): FakeProcess {
  const stdout = Object.assign(new EventEmitter(), { resume() {} });
  const stderr = new EventEmitter();
  const errorHandlers: Array<(err: Error) => void> = [];

  const proc: FakeProcess = {
    stdout,
    stderr,
    on(
      event: string,
      handler: ((code: number | null) => void) & ((err: Error) => void),
    ) {
      if (event === "error") {
        errorHandlers.push(handler);
      }
    },
  };

  setImmediate(() => {
    for (const handler of errorHandlers) handler(new Error(message));
  });

  return proc;
}
