import { describe, expect, it } from "vitest";

import { getMediaSpec, UnsupportedMediaError } from "./media.js";

describe("media validation", () => {
  it("resolves a supported image spec", () => {
    expect(getMediaSpec("clip.JPG", "image/jpeg")).toMatchObject({
      contentType: "image/jpeg",
      extension: ".jpg",
      readField: "XMP-dc:Description",
    });
  });

  it("rejects unsupported extensions", () => {
    expect(() => getMediaSpec("notes.txt", "text/plain")).toThrow(
      UnsupportedMediaError,
    );
  });

  it("rejects mismatched mime types", () => {
    expect(() => getMediaSpec("clip.mp4", "image/png")).toThrow(
      UnsupportedMediaError,
    );
  });
});
