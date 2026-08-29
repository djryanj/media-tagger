import { writeFile } from "node:fs/promises";
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

const { buildServer } = await import("./server.js");

type SseEvent = Record<string, unknown>;

function parseSseEvents(body: string): SseEvent[] {
  const events: SseEvent[] = [];

  for (const block of body.split("\n\n")) {
    const dataLine = block
      .split("\n")
      .find((l) => l.startsWith("data: "));

    if (!dataLine) continue;

    try {
      events.push(JSON.parse(dataLine.slice(6)) as SseEvent);
    } catch {
      // skip malformed lines
    }
  }

  return events;
}

function buildMultipartBody(
  fields: Record<string, string>,
  fileField: { name: string; filename: string; contentType: string; content: Buffer } | null,
  boundary: string,
): Buffer {
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  if (fileField) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.contentType}\r\n\r\n`,
      ),
    );
    parts.push(fileField.content);
    parts.push(Buffer.from("\r\n"));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return Buffer.concat(parts);
}

describe("POST /api/media/tag-stream", () => {
  afterEach(() => {
    execFileMock.mockReset();
    execFileAsyncMock.mockReset();
    spawnMock.mockReset();
  });

  it("returns 400 when no file is provided", async () => {
    const app = buildServer();
    const boundary = "test-boundary";
    const body = buildMultipartBody({ tags: "cats", fileSize: "0" }, null, boundary);

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag-stream",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toContain(
      "media file is required",
    );
  });

  it("returns 400 when tags are missing", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    const gifBytes = Buffer.from("GIF89a");
    const body = buildMultipartBody(
      { fileSize: String(gifBytes.length) },
      { name: "file", filename: "test.gif", contentType: "image/gif", content: gifBytes },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag-stream",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toContain(
      "tag is required",
    );
  });

  it("streams progress and done events for a GIF-to-MP4 conversion", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    const gifBytes = Buffer.from("GIF89a fake gif content");
    const payload = "tags:cats,dogs";

    // exiftool: detectMediaType → gif (actual type check)
    queueExecFileSuccess("gif\nimage/gif\n");
    // exiftool: getGifFrameCount → 10 frames
    queueExecFileSuccess("10\n");

    // ffmpeg spawn: capture actual output path, write fake MP4, emit progress, succeed
    spawnMock.mockImplementationOnce(
      (_cmd: string, args: string[]) => {
        const outputPath = args[args.length - 1] as string;
        return buildFakeProcessWithProgressAndOutput(
          ["frame=5\n", "frame=10\n"],
          outputPath,
        );
      },
    );

    // exiftool: detect converted mp4 type
    queueExecFileSuccess("mp4\nvideo/mp4\n");
    // exiftool: write metadata
    queueExecFileSuccess("1 image files updated\n");
    // exiftool: readback
    queueExecFileSuccess(`${payload}\n`);

    const body = buildMultipartBody(
      {
        convertGifToMp4: "true",
        tags: "cats,dogs",
        fileSize: String(gifBytes.length),
      },
      {
        name: "file",
        filename: "animation.gif",
        contentType: "image/gif",
        content: gifBytes,
      },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag-stream",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = parseSseEvents(response.body);

    const progressEvents = events.filter((e) => e["type"] === "progress");
    expect(progressEvents.length).toBeGreaterThan(0);

    const doneEvent = events.find((e) => e["type"] === "done");
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.["filename"]).toMatch(/\.mp4$/i);
    expect(doneEvent?.["contentType"]).toBe("video/mp4");
    expect(typeof doneEvent?.["data"]).toBe("string");
    expect(Array.isArray(doneEvent?.["tags"])).toBe(true);
  });

  it("sends an error SSE event when the GIF conversion fails", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    const gifBytes = Buffer.from("GIF89a fake gif content");

    // exiftool: detectMediaType → gif (actual type check)
    queueExecFileSuccess("gif\nimage/gif\n");
    // exiftool: getGifFrameCount
    queueExecFileSuccess("5\n");
    // ffmpeg spawn: fail immediately
    spawnMock.mockImplementationOnce(() => buildFakeProcess(1, "Invalid data"));

    const body = buildMultipartBody(
      {
        convertGifToMp4: "true",
        tags: "cats",
        fileSize: String(gifBytes.length),
      },
      {
        name: "file",
        filename: "broken.gif",
        contentType: "image/gif",
        content: gifBytes,
      },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag-stream",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = parseSseEvents(response.body);
    const errorEvent = events.find((e) => e["type"] === "error");

    expect(errorEvent).toBeDefined();
    expect(typeof errorEvent?.["message"]).toBe("string");
  });

  it("converts a JPG that is actually a GIF when convertGifToMp4 is true", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    // Use real GIF magic bytes but a .jpg filename
    const gifBytes = Buffer.from("GIF89a fake gif content");
    const payload = "tags:cats";

    // exiftool: detectMediaType → gif (detected from bytes, not filename)
    queueExecFileSuccess("gif\nimage/gif\n");
    // exiftool: getGifFrameCount
    queueExecFileSuccess("8\n");

    // ffmpeg spawn: write fake MP4 to output path, succeed
    spawnMock.mockImplementationOnce((_cmd: string, args: string[]) => {
      const outputPath = args[args.length - 1] as string;
      return buildFakeProcessWithProgressAndOutput(
        ["frame=4\n", "frame=8\n"],
        outputPath,
      );
    });

    // exiftool: detect converted mp4 type
    queueExecFileSuccess("mp4\nvideo/mp4\n");
    // exiftool: write metadata
    queueExecFileSuccess("1 image files updated\n");
    // exiftool: readback
    queueExecFileSuccess(`${payload}\n`);

    const body = buildMultipartBody(
      {
        convertGifToMp4: "true",
        tags: "cats",
        fileSize: String(gifBytes.length),
      },
      {
        name: "file",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        content: gifBytes,
      },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag-stream",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = parseSseEvents(response.body);
    const doneEvent = events.find((e) => e["type"] === "done");

    expect(doneEvent).toBeDefined();
    expect(doneEvent?.["filename"]).toMatch(/\.mp4$/i);
    expect(doneEvent?.["contentType"]).toBe("video/mp4");
  });

  it("tags a real JPG without conversion when convertGifToMp4 is true", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    const jpgBytes = Buffer.from("\xff\xd8\xff fake jpeg content");
    const payload = "tags:cats";

    // exiftool: detectMediaType → jpg (not a GIF)
    queueExecFileSuccess("jpg\nimage/jpeg\n");
    // exiftool: writeTaggedMedia detectMediaType
    queueExecFileSuccess("jpg\nimage/jpeg\n");
    // exiftool: write metadata
    queueExecFileSuccess("1 image files updated\n");
    // exiftool: readback
    queueExecFileSuccess(`${payload}\n`);

    const body = buildMultipartBody(
      {
        convertGifToMp4: "true",
        tags: "cats",
        fileSize: String(jpgBytes.length),
      },
      {
        name: "file",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        content: jpgBytes,
      },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag-stream",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = parseSseEvents(response.body);
    // No conversion should happen — spawnMock should not be called
    expect(spawnMock).not.toHaveBeenCalled();

    const doneEvent = events.find((e) => e["type"] === "done");
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.["filename"]).toMatch(/\.jpg$/i);
    expect(doneEvent?.["contentType"]).toBe("image/jpeg");
  });
});

describe("POST /api/media/tag with convertPngToJpg", () => {
  afterEach(() => {
    execFileMock.mockReset();
    execFileAsyncMock.mockReset();
    spawnMock.mockReset();
  });

  it("converts a PNG to JPG before writing metadata", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    const pngBytes = Buffer.from("\x89PNG\r\n\x1a\n fake png content");
    const payload = "tags:cats,dogs";

    // exiftool: detectMediaType → png (actual type check before converting)
    queueExecFileSuccess("png\nimage/png\n");

    // ffmpeg spawn: write a fake JPEG to the requested output path
    spawnMock.mockImplementationOnce((_cmd: string, args: string[]) => {
      const outputPath = args[args.length - 1] as string;
      return buildFakeProcessWithOutput(outputPath);
    });

    // exiftool: writeTaggedMedia detectMediaType → jpg
    queueExecFileSuccess("jpg\nimage/jpeg\n");
    // exiftool: write metadata
    queueExecFileSuccess("1 image files updated\n");
    // exiftool: readback
    queueExecFileSuccess(`${payload}\n`);

    const body = buildMultipartBody(
      {
        convertPngToJpg: "true",
        tags: "cats,dogs",
        fileSize: String(pngBytes.length),
      },
      {
        name: "file",
        filename: "photo.png",
        contentType: "image/png",
        content: pngBytes,
      },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.statusCode).toBe(200);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[0]).toBe("ffmpeg");
    expect(response.headers["content-disposition"]).toContain("photo.jpg");
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.headers["x-media-tagger-confirmed-tags"]).toBe(
      JSON.stringify(["cats", "dogs"]),
    );
  });

  it("keeps the PNG format when conversion is not requested", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    const pngBytes = Buffer.from("\x89PNG\r\n\x1a\n fake png content");
    const payload = "tags:cats";

    // exiftool: writeTaggedMedia detectMediaType → png
    queueExecFileSuccess("png\nimage/png\n");
    // exiftool: write metadata
    queueExecFileSuccess("1 image files updated\n");
    // exiftool: readback
    queueExecFileSuccess(`${payload}\n`);

    const body = buildMultipartBody(
      { tags: "cats", fileSize: String(pngBytes.length) },
      {
        name: "file",
        filename: "photo.png",
        contentType: "image/png",
        content: pngBytes,
      },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.statusCode).toBe(200);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(response.headers["content-disposition"]).toContain("photo.png");
    expect(response.headers["content-type"]).toContain("image/png");
  });

  it("tags a real JPG without conversion when convertPngToJpg is true", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    const jpgBytes = Buffer.from("\xff\xd8\xff fake jpeg content");
    const payload = "tags:cats";

    // exiftool: detectMediaType → jpg (not a PNG, so no conversion)
    queueExecFileSuccess("jpg\nimage/jpeg\n");
    // exiftool: writeTaggedMedia detectMediaType
    queueExecFileSuccess("jpg\nimage/jpeg\n");
    // exiftool: write metadata
    queueExecFileSuccess("1 image files updated\n");
    // exiftool: readback
    queueExecFileSuccess(`${payload}\n`);

    const body = buildMultipartBody(
      {
        convertPngToJpg: "true",
        tags: "cats",
        fileSize: String(jpgBytes.length),
      },
      {
        name: "file",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        content: jpgBytes,
      },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.statusCode).toBe(200);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(response.headers["content-disposition"]).toContain("photo.jpg");
    expect(response.headers["content-type"]).toContain("image/jpeg");
  });

  it("converts a PNG that is disguised with a .jpg extension", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    const pngBytes = Buffer.from("\x89PNG\r\n\x1a\n fake png content");
    const payload = "tags:cats";

    // exiftool: detectMediaType → png (detected from bytes, not the filename)
    queueExecFileSuccess("png\nimage/png\n");

    spawnMock.mockImplementationOnce((_cmd: string, args: string[]) => {
      const outputPath = args[args.length - 1] as string;
      return buildFakeProcessWithOutput(outputPath);
    });

    queueExecFileSuccess("jpg\nimage/jpeg\n");
    queueExecFileSuccess("1 image files updated\n");
    queueExecFileSuccess(`${payload}\n`);

    const body = buildMultipartBody(
      {
        convertPngToJpg: "true",
        tags: "cats",
        fileSize: String(pngBytes.length),
      },
      {
        name: "file",
        filename: "disguised.jpg",
        contentType: "image/jpeg",
        content: pngBytes,
      },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.statusCode).toBe(200);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(response.headers["content-disposition"]).toContain("disguised.jpg");
    expect(response.headers["content-type"]).toContain("image/jpeg");
  });

  it("returns a 422 when the PNG conversion fails", async () => {
    const app = buildServer();
    const boundary = "test-boundary";

    const pngBytes = Buffer.from("\x89PNG\r\n\x1a\n fake png content");

    // exiftool: detectMediaType → png
    queueExecFileSuccess("png\nimage/png\n");
    // ffmpeg spawn: fail
    spawnMock.mockImplementationOnce(() =>
      buildFakeProcess(1, "Invalid PNG data"),
    );

    const body = buildMultipartBody(
      {
        convertPngToJpg: "true",
        tags: "cats",
        fileSize: String(pngBytes.length),
      },
      {
        name: "file",
        filename: "broken.png",
        contentType: "image/png",
        content: pngBytes,
      },
      boundary,
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/media/tag",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    expect(response.statusCode).toBe(422);
    expect((response.json() as { error: string }).error).toContain(
      "PNG-to-JPG conversion failed",
    );
  });
});

function queueExecFileSuccess(stdout: string, stderr = ""): void {
  execFileAsyncMock.mockResolvedValueOnce({ stderr, stdout });
}

type FakeProcess = {
  stdout: EventEmitter & { resume(): void };
  stderr: EventEmitter;
  on(event: string, handler: ((code: number | null) => void) & ((err: Error) => void)): void;
};

function buildFakeProcess(exitCode: number, stderrOutput = ""): FakeProcess {
  const stdout = Object.assign(new EventEmitter(), { resume() {} });
  const stderr = new EventEmitter();
  const closeHandlers: Array<(code: number | null) => void> = [];

  const proc: FakeProcess = {
    stdout,
    stderr,
    on(event: string, handler: ((code: number | null) => void) & ((err: Error) => void)) {
      if (event === "close") {
        closeHandlers.push(handler);
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

function buildFakeProcessWithOutput(outputPath: string): FakeProcess {
  return buildFakeProcessWithProgressAndOutput([], outputPath);
}

function buildFakeProcessWithProgressAndOutput(
  progressChunks: string[],
  outputPath: string,
): FakeProcess {
  const stdout = Object.assign(new EventEmitter(), { resume() {} });
  const stderr = new EventEmitter();
  const closeHandlers: Array<(code: number | null) => void> = [];

  const proc: FakeProcess = {
    stdout,
    stderr,
    on(event: string, handler: ((code: number | null) => void) & ((err: Error) => void)) {
      if (event === "close") {
        closeHandlers.push(handler);
      }
    },
  };

  setImmediate(async () => {
    for (const chunk of progressChunks) {
      stdout.emit("data", Buffer.from(chunk));
    }

    // Write a fake MP4 file to the actual output path so the server can tag it
    await writeFile(outputPath, Buffer.from("fake mp4 bytes"));

    for (const h of closeHandlers) h(0);
  });

  return proc;
}
