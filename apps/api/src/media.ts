import { basename, extname } from "node:path";

export class UnsupportedMediaError extends Error {}

type MediaSpec = {
  canonicalExtension: string;
  format: string;
  contentTypes: string[];
  writeField: string;
  readField: string;
};

export type MediaResolution = {
  declaredMimeType: string;
  detectedContentType: string;
  detectedExtension: string;
  filenameChanged: boolean;
  originalExtension: string;
  originalFilename: string;
  outputFilename: string;
  warning: string | null;
};

const MEDIA_SPECS: Record<string, MediaSpec> = {
  ".gif": {
    canonicalExtension: ".gif",
    contentTypes: ["image/gif"],
    format: "gif",
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
  ".jpeg": {
    canonicalExtension: ".jpg",
    contentTypes: ["image/jpeg", "image/jpg", "image/pjpeg"],
    format: "jpeg",
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
  ".jpg": {
    canonicalExtension: ".jpg",
    contentTypes: ["image/jpeg", "image/jpg", "image/pjpeg"],
    format: "jpeg",
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
  ".mov": {
    canonicalExtension: ".mov",
    contentTypes: ["video/quicktime", "video/mov"],
    format: "mov",
    writeField: "QuickTime:Comment",
    readField: "QuickTime:Comment",
  },
  ".mp4": {
    canonicalExtension: ".mp4",
    contentTypes: ["video/mp4", "application/mp4", "audio/mp4"],
    format: "mp4",
    writeField: "QuickTime:Comment",
    readField: "QuickTime:Comment",
  },
  ".png": {
    canonicalExtension: ".png",
    contentTypes: ["image/png", "image/x-png"],
    format: "png",
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
  ".webp": {
    canonicalExtension: ".webp",
    contentTypes: ["image/webp"],
    format: "webp",
    writeField: "XMP-dc:Description",
    readField: "XMP-dc:Description",
  },
};

type GetMediaSpecInput = {
  declaredMimeType: string;
  detectedContentType?: string;
  detectedExtension?: string;
  filename: string;
};

export function getMediaSpec({
  declaredMimeType,
  detectedContentType,
  detectedExtension,
  filename,
}: GetMediaSpecInput): MediaSpec & {
  contentType: string;
  extension: string;
  resolution: MediaResolution;
  safeFilename: string;
} {
  const originalFilename = sanitizeFilename(filename);
  const originalExtensionLiteral = extname(originalFilename);
  const originalExtension = originalExtensionLiteral.toLocaleLowerCase();
  const normalizedDeclaredMimeType = declaredMimeType.toLocaleLowerCase();
  const normalizedDetectedExtension = normalizeExtension(detectedExtension);
  const normalizedDetectedContentType =
    detectedContentType?.toLocaleLowerCase() ?? "";

  const detectedSpec = normalizedDetectedExtension
    ? MEDIA_SPECS[normalizedDetectedExtension]
    : undefined;
  const extensionSpec = MEDIA_SPECS[originalExtension];
  const mimeSpec = getMediaSpecByContentType(
    normalizedDetectedContentType || normalizedDeclaredMimeType,
  );
  const resolvedExtension =
    normalizedDetectedExtension ||
    (extensionSpec ? originalExtension : "") ||
    mimeSpec?.extension;
  const resolvedSpec = resolvedExtension
    ? MEDIA_SPECS[resolvedExtension]
    : undefined;

  if (!resolvedSpec || !resolvedExtension) {
    throw new UnsupportedMediaError(
      "Unsupported file type. Current support covers JPG, JPEG, PNG, WebP, GIF, MP4, and MOV.",
    );
  }

  if (normalizedDetectedExtension && !detectedSpec) {
    throw new UnsupportedMediaError(
      `The uploaded file bytes were detected as ${normalizedDetectedExtension}, which is not currently supported for metadata writing.`,
    );
  }

  if (
    !normalizedDetectedExtension &&
    !extensionSpec &&
    (!mimeSpec || mimeSpec.extension !== resolvedExtension)
  ) {
    throw new UnsupportedMediaError(
      "Unsupported file type. Current support covers JPG, JPEG, PNG, WebP, GIF, MP4, and MOV.",
    );
  }

  const originalFormat = extensionSpec?.format;
  const resolvedFormat = resolvedSpec.format;
  const safeFilename =
    originalFormat && originalFormat === resolvedFormat
      ? originalFilename
      : replaceExtension(originalFilename, resolvedSpec.canonicalExtension);
  const mismatchReasons: string[] = [];

  if (
    originalExtension &&
    originalFormat !== resolvedFormat &&
    originalExtension !== resolvedSpec.canonicalExtension
  ) {
    mismatchReasons.push(
      `the filename extension ${originalExtension} did not match detected ${resolvedExtension}`,
    );
  }

  if (
    normalizedDeclaredMimeType &&
    normalizedDeclaredMimeType !== "application/octet-stream" &&
    !resolvedSpec.contentTypes.includes(normalizedDeclaredMimeType)
  ) {
    mismatchReasons.push(
      `the reported MIME type ${normalizedDeclaredMimeType} did not match detected ${resolvedSpec.contentTypes[0]}`,
    );
  }

  const warning =
    mismatchReasons.length > 0
      ? `${originalFilename}: ${mismatchReasons.join("; ")}. Tagged the detected media type without transcoding${safeFilename !== originalFilename ? ` and renamed the download to ${safeFilename}` : ""}.`
      : null;

  return {
    ...resolvedSpec,
    contentType: resolvedSpec.contentTypes[0],
    extension: resolvedExtension,
    resolution: {
      declaredMimeType: normalizedDeclaredMimeType,
      detectedContentType:
        normalizedDetectedContentType || resolvedSpec.contentTypes[0],
      detectedExtension: resolvedExtension,
      filenameChanged: safeFilename !== originalFilename,
      originalExtension,
      originalFilename,
      outputFilename: safeFilename,
      warning,
    },
    safeFilename,
  };
}

export function sanitizeFilename(filename: string): string {
  const resolvedName = basename(filename || "tagged-media").trim();

  if (!resolvedName) {
    return "tagged-media";
  }

  return resolvedName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function getMediaSpecByContentType(contentType: string):
  | (MediaSpec & { extension: string })
  | undefined {
  const entry = Object.entries(MEDIA_SPECS).find(([, spec]) =>
    spec.contentTypes.includes(contentType),
  );

  if (!entry) {
    return undefined;
  }

  const [extension, spec] = entry;

  return {
    ...spec,
    extension,
  };
}

function normalizeExtension(extension: string | undefined): string {
  if (!extension) {
    return "";
  }

  const normalized = extension.trim().toLocaleLowerCase();

  if (!normalized) {
    return "";
  }

  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function replaceExtension(filename: string, extension: string): string {
  const currentExtension = extname(filename);

  if (!currentExtension) {
    return `${filename}${extension}`;
  }

  return `${filename.slice(0, -currentExtension.length)}${extension}`;
}
