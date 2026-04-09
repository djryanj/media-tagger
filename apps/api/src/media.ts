import { basename, extname } from "node:path";

export class UnsupportedMediaError extends Error {}

type MediaSpec = {
  contentTypes: string[];
  writeField: string;
  readField: string;
};

const MEDIA_SPECS: Record<string, MediaSpec> = {
  ".gif": {
    contentTypes: ["image/gif"],
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
  ".jpeg": {
    contentTypes: ["image/jpeg"],
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
  ".jpg": {
    contentTypes: ["image/jpeg"],
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
  ".mov": {
    contentTypes: ["video/quicktime"],
    writeField: "QuickTime:Comment",
    readField: "QuickTime:Comment",
  },
  ".mp4": {
    contentTypes: ["video/mp4"],
    writeField: "QuickTime:Comment",
    readField: "QuickTime:Comment",
  },
  ".png": {
    contentTypes: ["image/png"],
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
  ".webp": {
    contentTypes: ["image/webp"],
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
};

export function getMediaSpec(filename: string, mimetype: string): MediaSpec & {
  contentType: string;
  extension: string;
  safeFilename: string;
} {
  const safeFilename = getSafeFilename(filename);
  const extension = extname(safeFilename).toLocaleLowerCase();
  const spec = MEDIA_SPECS[extension];

  if (!spec) {
    throw new UnsupportedMediaError(
      "Unsupported file type. Current support covers JPG, JPEG, PNG, WebP, GIF, MP4, and MOV.",
    );
  }

  const normalizedMimeType = mimetype.toLocaleLowerCase();

  if (
    normalizedMimeType &&
    !spec.contentTypes.includes(normalizedMimeType) &&
    normalizedMimeType !== "application/octet-stream"
  ) {
    throw new UnsupportedMediaError(
      `The uploaded file type does not match the filename extension for ${safeFilename}.`,
    );
  }

  return {
    ...spec,
    contentType: spec.contentTypes[0],
    extension,
    safeFilename,
  };
}

function getSafeFilename(filename: string): string {
  const resolvedName = basename(filename || "tagged-media").trim();

  if (!resolvedName) {
    return "tagged-media";
  }

  return resolvedName.replace(/[^a-zA-Z0-9._-]/g, "-");
}
