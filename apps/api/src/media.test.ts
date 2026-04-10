import { describe, expect, it } from "vitest";

import { getMediaSpec, UnsupportedMediaError } from "./media.js";

describe("media validation", () => {
  it("resolves a supported image spec", () => {
    expect(
      getMediaSpec({
        declaredMimeType: "image/jpeg",
        detectedContentType: "image/jpeg",
        detectedExtension: "jpg",
        filename: "clip.JPG",
      }),
    ).toMatchObject({
      contentType: "image/jpeg",
      extension: ".jpg",
      readField: "XMP-dc:Description",
      readFields: ["XMP-dc:Description"],
    });
  });

  it("rejects unsupported extensions", () => {
    expect(
      () =>
        getMediaSpec({
          declaredMimeType: "text/plain",
          detectedContentType: "text/plain",
          detectedExtension: "txt",
          filename: "notes.txt",
        }),
    ).toThrow(UnsupportedMediaError);
  });

  it("prefers the detected type when the filename and MIME type are wrong", () => {
    expect(
      getMediaSpec({
        declaredMimeType: "video/quicktime",
        detectedContentType: "video/mp4",
        detectedExtension: "mp4",
        filename: "clip.MOV",
      }),
    ).toMatchObject({
      contentType: "video/mp4",
      extension: ".mp4",
      safeFilename: "clip.mp4",
      readFields: [
        "ItemList:Comment",
        "UserData:Comment",
        "Keys:Comment",
        "ItemList:Description",
        "UserData:Description",
        "Keys:Description",
        "XMP-dc:Description",
      ],
      writeFields: ["Comment", "Description"],
      resolution: {
        filenameChanged: true,
        outputFilename: "clip.mp4",
      },
    });
  });

  it("keeps the filename extension when only the reported MIME type is wrong", () => {
    expect(
      getMediaSpec({
        declaredMimeType: "video/quicktime",
        detectedContentType: "video/mp4",
        detectedExtension: "mp4",
        filename: "clip.mp4",
      }).resolution.warning,
    ).toContain("reported MIME type video/quicktime did not match detected video/mp4");
  });

  it("treats video/mov as a valid MOV MIME alias without forcing a rename", () => {
    expect(
      getMediaSpec({
        declaredMimeType: "video/mov",
        detectedContentType: "video/quicktime",
        detectedExtension: "mov",
        filename: "MVI_3302.MOV",
      }),
    ).toMatchObject({
      contentType: "video/quicktime",
      extension: ".mov",
      safeFilename: "MVI_3302.MOV",
      resolution: {
        filenameChanged: false,
        outputFilename: "MVI_3302.MOV",
        warning: null,
      },
    });
  });

  it("treats jpg and jpeg as the same image format without forcing a rename", () => {
    expect(
      getMediaSpec({
        declaredMimeType: "image/jpeg",
        detectedContentType: "image/jpeg",
        detectedExtension: "jpg",
        filename: "photo.jpeg",
      }),
    ).toMatchObject({
      contentType: "image/jpeg",
      extension: ".jpg",
      safeFilename: "photo.jpeg",
      resolution: {
        filenameChanged: false,
        outputFilename: "photo.jpeg",
        warning: null,
      },
    });
  });

  it("accepts common JPEG MIME aliases without emitting a mismatch warning", () => {
    expect(
      getMediaSpec({
        declaredMimeType: "image/pjpeg",
        detectedContentType: "image/jpeg",
        detectedExtension: "jpg",
        filename: "photo.jpg",
      }).resolution.warning,
    ).toBeNull();
  });

  it("accepts the legacy PNG MIME alias without emitting a mismatch warning", () => {
    expect(
      getMediaSpec({
        declaredMimeType: "image/x-png",
        detectedContentType: "image/png",
        detectedExtension: "png",
        filename: "graphic.png",
      }).resolution.warning,
    ).toBeNull();
  });

  it("accepts common MP4 MIME aliases without emitting a mismatch warning", () => {
    expect(
      getMediaSpec({
        declaredMimeType: "application/mp4",
        detectedContentType: "video/mp4",
        detectedExtension: "mp4",
        filename: "clip.mp4",
      }).resolution.warning,
    ).toBeNull();
  });
});
