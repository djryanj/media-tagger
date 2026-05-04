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

const { GifConversionError, convertGifToMp4, getGifFrameCount } =
  await import("./gifConversion.js");

describe("getGifFrameCount", () => {
  afterEach(() => {
    execFileAsyncMock.mockReset();
    execFileMock.mockReset();
  });

  it("returns the parsed frame count from exiftool output", async () => {
    execFileAsyncMock.mockResolvedValueOnce({ stdout: "42\n", stderr: "" });

    const count = await getGifFrameCount("/tmp/test.gif");

    expect(count).toBe(42);
  });

  it("returns 0 when exiftool output is not a valid number", async () => {
    execFileAsyncMock.mockResolvedValueOnce({
      stdout: "N/A\n",
      stderr: "",
    });

    const count = await getGifFrameCount("/tmp/test.gif");

    expect(count).toBe(0);
  });

  it("returns 0 when exiftool output is empty", async () => {
    execFileAsyncMock.mockResolvedValueOnce({ stdout: "\n", stderr: "" });

    const count = await getGifFrameCount("/tmp/test.gif");

    expect(count).toBe(0);
  });

  it("returns 0 when exiftool throws", async () => {
    execFileAsyncMock.mockRejectedValueOnce(new Error("exiftool not found"));

    const count = await getGifFrameCount("/tmp/test.gif");

    expect(count).toBe(0);
  });
});

describe("convertGifToMp4", () => {
  afterEach(() => {
    execFileAsyncMock.mockReset();
    execFileMock.mockReset();
    spawnMock.mockReset();
  });

  it("resolves when ffmpeg exits with code 0", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "gif-conversion-test-"),
    );
    const inputPath = join(workingDirectory, "test.gif");
    const outputPath = join(workingDirectory, "test.mp4");

    await writeFile(inputPath, Buffer.from("GIF89a"));

    // exiftool mock for getGifFrameCount (returns 0 so no progress args)
    execFileAsyncMock.mockResolvedValueOnce({ stdout: "0\n", stderr: "" });

    const fakeProc = buildFakeProcess(0);
    spawnMock.mockReturnValueOnce(fakeProc);

    await expect(
      convertGifToMp4({ inputPath, outputPath }),
    ).resolves.toBeUndefined();

    expect(spawnMock).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining(["-i", inputPath, outputPath]),
      expect.any(Object),
    );

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("uses libx264 with CRF 15 and yuv420p pixel format", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "gif-conversion-test-"),
    );
    const inputPath = join(workingDirectory, "test.gif");
    const outputPath = join(workingDirectory, "test.mp4");

    await writeFile(inputPath, Buffer.from("GIF89a"));

    execFileAsyncMock.mockResolvedValueOnce({ stdout: "0\n", stderr: "" });

    const fakeProc = buildFakeProcess(0);
    spawnMock.mockReturnValueOnce(fakeProc);

    await convertGifToMp4({ inputPath, outputPath });

    const args: string[] = spawnMock.mock.calls[0][1];

    expect(args).toContain("-c:v");
    expect(args[args.indexOf("-c:v") + 1]).toBe("libx264");
    expect(args).toContain("-crf");
    expect(args[args.indexOf("-crf") + 1]).toBe("23");
    expect(args).toContain("-pix_fmt");
    expect(args[args.indexOf("-pix_fmt") + 1]).toBe("yuv420p");

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("includes faststart movflags for streaming-friendly MP4", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "gif-conversion-test-"),
    );
    const inputPath = join(workingDirectory, "test.gif");
    const outputPath = join(workingDirectory, "test.mp4");

    await writeFile(inputPath, Buffer.from("GIF89a"));

    execFileAsyncMock.mockResolvedValueOnce({ stdout: "0\n", stderr: "" });

    const fakeProc = buildFakeProcess(0);
    spawnMock.mockReturnValueOnce(fakeProc);

    await convertGifToMp4({ inputPath, outputPath });

    const args: string[] = spawnMock.mock.calls[0][1];

    expect(args).toContain("-movflags");
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("includes even-dimension scale filter for H.264 compatibility", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "gif-conversion-test-"),
    );
    const inputPath = join(workingDirectory, "test.gif");
    const outputPath = join(workingDirectory, "test.mp4");

    await writeFile(inputPath, Buffer.from("GIF89a"));

    execFileAsyncMock.mockResolvedValueOnce({ stdout: "0\n", stderr: "" });

    const fakeProc = buildFakeProcess(0);
    spawnMock.mockReturnValueOnce(fakeProc);

    await convertGifToMp4({ inputPath, outputPath });

    const args: string[] = spawnMock.mock.calls[0][1];

    expect(args).toContain("-vf");
    expect(args[args.indexOf("-vf") + 1]).toBe(
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    );

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("adds -progress pipe:1 when frame count is known and onProgress provided", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "gif-conversion-test-"),
    );
    const inputPath = join(workingDirectory, "test.gif");
    const outputPath = join(workingDirectory, "test.mp4");

    await writeFile(inputPath, Buffer.from("GIF89a"));

    // exiftool returns 10 frames
    execFileAsyncMock.mockResolvedValueOnce({ stdout: "10\n", stderr: "" });

    const fakeProc = buildFakeProcessWithProgress(["frame=5\n", "frame=10\n"]);
    spawnMock.mockReturnValueOnce(fakeProc);

    const progressValues: number[] = [];
    await convertGifToMp4({
      inputPath,
      outputPath,
      onProgress: (p) => progressValues.push(p),
    });

    const args: string[] = spawnMock.mock.calls[0][1];

    expect(args).toContain("-progress");
    expect(args[args.indexOf("-progress") + 1]).toBe("pipe:1");
    expect(progressValues).toContain(50);
    expect(progressValues[progressValues.length - 1]).toBe(100);

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("skips -progress when frame count is 0", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "gif-conversion-test-"),
    );
    const inputPath = join(workingDirectory, "test.gif");
    const outputPath = join(workingDirectory, "test.mp4");

    await writeFile(inputPath, Buffer.from("GIF89a"));

    execFileAsyncMock.mockResolvedValueOnce({ stdout: "0\n", stderr: "" });

    const fakeProc = buildFakeProcess(0);
    spawnMock.mockReturnValueOnce(fakeProc);

    await convertGifToMp4({ inputPath, outputPath, onProgress: () => {} });

    const args: string[] = spawnMock.mock.calls[0][1];

    expect(args).not.toContain("-progress");

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("throws GifConversionError when ffmpeg exits with non-zero code", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "gif-conversion-test-"),
    );
    const inputPath = join(workingDirectory, "test.gif");
    const outputPath = join(workingDirectory, "test.mp4");

    await writeFile(inputPath, Buffer.from("GIF89a"));

    execFileAsyncMock.mockResolvedValueOnce({ stdout: "0\n", stderr: "" });

    const fakeProc = buildFakeProcess(1, "Invalid data found when processing input");
    spawnMock.mockReturnValueOnce(fakeProc);

    await expect(
      convertGifToMp4({ inputPath, outputPath }),
    ).rejects.toThrow(GifConversionError);

    await rm(workingDirectory, { force: true, recursive: true });
  });

  it("throws GifConversionError when the ffmpeg process fails to spawn", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "gif-conversion-test-"),
    );
    const inputPath = join(workingDirectory, "test.gif");
    const outputPath = join(workingDirectory, "test.mp4");

    await writeFile(inputPath, Buffer.from("GIF89a"));

    execFileAsyncMock.mockResolvedValueOnce({ stdout: "0\n", stderr: "" });

    const fakeProc = buildFakeProcessWithError(new Error("spawn ENOENT"));
    spawnMock.mockReturnValueOnce(fakeProc);

    await expect(
      convertGifToMp4({ inputPath, outputPath }),
    ).rejects.toThrow(GifConversionError);

    await rm(workingDirectory, { force: true, recursive: true });
  });
});

type FakeProcess = {
  stdout: EventEmitter & { resume(): void };
  stderr: EventEmitter;
  on(event: string, handler: ((code: number | null) => void) & ((err: Error) => void)): void;
};

function buildFakeProcess(
  exitCode: number,
  stderrOutput = "",
): FakeProcess {
  const stdout = Object.assign(new EventEmitter(), { resume() {} });
  const stderr = new EventEmitter();
  const closeHandlers: Array<(code: number | null) => void> = [];
  const errorHandlers: Array<(err: Error) => void> = [];

  const proc: FakeProcess = {
    stdout,
    stderr,
    on(event: string, handler: ((code: number | null) => void) & ((err: Error) => void)) {
      if (event === "close") {
        closeHandlers.push(handler);
      } else if (event === "error") {
        errorHandlers.push(handler);
      }
    },
  };

  setImmediate(() => {
    if (stderrOutput) {
      stderr.emit("data", Buffer.from(stderrOutput));
    }
    for (const h of closeHandlers) h(exitCode);
  });

  return proc;
}

function buildFakeProcessWithProgress(
  progressChunks: string[],
): FakeProcess {
  const stdout = Object.assign(new EventEmitter(), { resume() {} });
  const stderr = new EventEmitter();
  const closeHandlers: Array<(code: number | null) => void> = [];
  const errorHandlers: Array<(err: Error) => void> = [];

  const proc: FakeProcess = {
    stdout,
    stderr,
    on(event: string, handler: ((code: number | null) => void) & ((err: Error) => void)) {
      if (event === "close") {
        closeHandlers.push(handler);
      } else if (event === "error") {
        errorHandlers.push(handler);
      }
    },
  };

  setImmediate(() => {
    for (const chunk of progressChunks) {
      stdout.emit("data", Buffer.from(chunk));
    }
    for (const h of closeHandlers) h(0);
  });

  return proc;
}

function buildFakeProcessWithError(err: Error): FakeProcess {
  const stdout = Object.assign(new EventEmitter(), { resume() {} });
  const stderr = new EventEmitter();
  const closeHandlers: Array<(code: number | null) => void> = [];
  const errorHandlers: Array<(err: Error) => void> = [];

  const proc: FakeProcess = {
    stdout,
    stderr,
    on(event: string, handler: ((code: number | null) => void) & ((err: Error) => void)) {
      if (event === "close") {
        closeHandlers.push(handler);
      } else if (event === "error") {
        errorHandlers.push(handler);
      }
    },
  };

  setImmediate(() => {
    for (const h of errorHandlers) h(err);
  });

  return proc;
}
