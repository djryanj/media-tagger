import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

import { normalizeTags } from "./normalizeTags";

type GifTagStreamDoneEvent = {
  type: "done";
  contentType: string;
  data: string;
  filename: string;
  resolutionWarning: string | null;
  tags: string[];
};

const ACCEPTED_FILE_TYPES = ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov";
const MAX_FILES = 20;

type TagMode = "shared" | "individual";

type ServerConfig = {
  gitHash: string;
  inMemoryUploadLimitBytes: number;
  maxUploadBytes: number;
  version: string;
};

/**
 * Nothing downloads on its own. A browser cannot tell us that a blob download
 * landed on the device — the anchor click is fire-and-forget, and mobile
 * browsers routinely stack, defer, or silently drop those notifications — so
 * automatic downloads produced saves nobody could see or verify. A tagged file
 * waits at `ready` until the user downloads it from its row, which is the one
 * thing we can observe.
 */
type DownloadStatus =
  | "queued"
  | "converting"
  | "tagging"
  | "ready"
  | "downloaded"
  | "failed";

type DownloadItem = {
  blob: Blob | null;
  conversionPercent: number | null;
  downloadFilename: string | null;
  errorMessage: string | null;
  file: File;
  id: string;
  sourceFilename: string;
  status: DownloadStatus;
  tags: string[];
};

type TagAssignment = {
  file: File;
  value: string;
};

type ProcessTagAssignmentsResult = {
  failures: Array<{ file: string; message: string }>;
  taggedFilenames: string[];
};

type LightboxTarget = {
  file: File;
  kind: "image" | "video";
};

export default function App() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [tagMode, setTagMode] = useState<TagMode>("shared");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<string>("Ready for upload.");
  const [perFileTags, setPerFileTags] = useState<Record<string, string>>({});
  const [copiedTags, setCopiedTags] = useState<string | null>(null);
  const [copiedFromFilename, setCopiedFromFilename] = useState<string | null>(
    null,
  );
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadItems, setDownloadItems] = useState<DownloadItem[]>([]);
  const [expandedDownloadIds, setExpandedDownloadIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [serverConfigState, setServerConfigState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [warningMessages, setWarningMessages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightboxTarget, setLightboxTarget] = useState<LightboxTarget | null>(
    null,
  );
  const [convertGifsToMp4, setConvertGifsToMp4] = useState(true);
  const [convertPngsToJpg, setConvertPngsToJpg] = useState(false);
  const [perFileConvertGif, setPerFileConvertGif] = useState<
    Record<string, boolean>
  >({});
  const [perFileConvertPng, setPerFileConvertPng] = useState<
    Record<string, boolean>
  >({});
  const [detectedGifIds, setDetectedGifIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [detectedPngIds, setDetectedPngIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  useEffect(() => {
    let isActive = true;

    async function loadServerConfig() {
      try {
        const response = await fetch("/api/config");

        if (!response.ok) {
          throw new Error("Config request failed.");
        }

        const payload = (await response.json()) as ServerConfig;

        if (!isActive) {
          return;
        }

        setServerConfig(payload);
        setServerConfigState("ready");
      } catch {
        if (!isActive) {
          return;
        }

        setServerConfigState("unavailable");
      }
    }

    void loadServerConfig();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const nextPreviewUrls: Record<string, string> = {};

    for (const file of selectedFiles) {
      if (!isPreviewableFile(file)) {
        continue;
      }
      nextPreviewUrls[buildFileId(file)] = URL.createObjectURL(file);
    }

    // Schedule setState in a microtask to avoid ESLint error
    Promise.resolve().then(() => setPreviewUrls(nextPreviewUrls));

    return () => {
      for (const url of Object.values(nextPreviewUrls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [selectedFiles]);

  useEffect(() => {
    const candidates = selectedFiles.filter(
      (file) => isImageFile(file) && !(isGifFile(file) && isPngFile(file)),
    );

    if (candidates.length === 0) {
      Promise.resolve().then(() => {
        setDetectedGifIds(new Set());
        setDetectedPngIds(new Set());
      });
      return;
    }

    let cancelled = false;

    async function detectDisguisedImages() {
      const gifIds = new Set<string>();
      const pngIds = new Set<string>();

      for (const file of candidates) {
        const signature = await readImageSignature(file);

        if (signature === "gif" && !isGifFile(file)) {
          gifIds.add(buildFileId(file));
        }

        if (signature === "png" && !isPngFile(file)) {
          pngIds.add(buildFileId(file));
        }
      }

      if (!cancelled) {
        setDetectedGifIds(gifIds);
        setDetectedPngIds(pngIds);
      }
    }

    void detectDisguisedImages();

    return () => {
      cancelled = true;
    };
  }, [selectedFiles]);

  function getTagAssignments(
    files: File[],
    modeOverride: TagMode = tagMode,
  ): TagAssignment[] {
    return files.map((file) => ({
      file,
      value:
        modeOverride === "shared"
          ? tags
          : (perFileTags[buildFileId(file)] ?? ""),
    }));
  }

  function isEffectivelyGif(file: File): boolean {
    return isGifFile(file) || detectedGifIds.has(buildFileId(file));
  }

  function isEffectivelyPng(file: File): boolean {
    if (isEffectivelyGif(file)) {
      return false;
    }

    return isPngFile(file) || detectedPngIds.has(buildFileId(file));
  }

  function shouldConvertGif(file: File): boolean {
    if (!isEffectivelyGif(file)) return false;
    if (tagMode === "individual") {
      return perFileConvertGif[buildFileId(file)] ?? true;
    }
    return convertGifsToMp4;
  }

  function shouldConvertPng(file: File): boolean {
    if (!isEffectivelyPng(file)) return false;
    if (tagMode === "individual") {
      return perFileConvertPng[buildFileId(file)] ?? false;
    }
    return convertPngsToJpg;
  }

  function updateDownloadItem(fileId: string, patch: Partial<DownloadItem>) {
    setDownloadItems((previousItems) =>
      previousItems.map((item) =>
        item.id === fileId ? { ...item, ...patch } : item,
      ),
    );
  }

  function toggleDownloadDetails(fileId: string) {
    setExpandedDownloadIds((previousIds) => {
      const nextIds = new Set(previousIds);

      if (nextIds.has(fileId)) {
        nextIds.delete(fileId);
      } else {
        nextIds.add(fileId);
      }

      return nextIds;
    });
  }

  function removeQueuedFile(fileToRemove: File, skipStatusUpdate = false) {
    const fileIdToRemove = buildFileId(fileToRemove);

    setPerFileConvertGif((prev) => {
      const next = { ...prev };
      delete next[fileIdToRemove];
      return next;
    });

    setPerFileConvertPng((prev) => {
      const next = { ...prev };
      delete next[fileIdToRemove];
      return next;
    });

    setDetectedGifIds((prev) => {
      const next = new Set(prev);
      next.delete(fileIdToRemove);
      return next;
    });

    setDetectedPngIds((prev) => {
      const next = new Set(prev);
      next.delete(fileIdToRemove);
      return next;
    });

    setSelectedFiles((previousFiles) => {
      const nextFiles = previousFiles.filter(
        (file) => buildFileId(file) !== fileIdToRemove,
      );

      setPerFileTags((previousTags) => {
        const nextEntries = Object.entries(previousTags).filter(
          ([fileId]) => fileId !== fileIdToRemove,
        );

        return Object.fromEntries(nextEntries);
      });

      if (copiedFromFilename === fileToRemove.name) {
        setCopiedTags(null);
        setCopiedFromFilename(null);
      }

      setErrorMessage(null);

      if (!skipStatusUpdate) {
        setStatus(
          nextFiles.length === 0
            ? `Removed ${fileToRemove.name} from the queue.`
            : `Removed ${fileToRemove.name} from the queue. ${nextFiles.length} file${nextFiles.length === 1 ? " remains" : "s remain"}.`,
        );
      }

      return nextFiles;
    });
  }

  function validateTagAssignments(
    tagAssignments: TagAssignment[],
    modeOverride: TagMode,
  ): string | null {
    if (tagAssignments.length === 0) {
      return "Choose at least one file before submitting.";
    }

    if (modeOverride === "shared" && !tags.trim()) {
      return "Enter at least one tag.";
    }

    const missingTagsAssignment = tagAssignments.find(
      ({ value }) => !value.trim(),
    );

    if (missingTagsAssignment) {
      return modeOverride === "shared"
        ? "Enter at least one tag."
        : `Enter at least one tag for ${missingTagsAssignment.file.name}.`;
    }

    if (
      serverConfig &&
      tagAssignments.some(({ file }) => file.size > serverConfig.maxUploadBytes)
    ) {
      return `Choose files no larger than ${formatBytes(serverConfig.maxUploadBytes)}.`;
    }

    return null;
  }

  async function processTagAssignments(
    tagAssignments: TagAssignment[],
    options?: {
      resetResults?: boolean;
      successStatus?: (taggedFilenames: string[]) => string;
      totalCountLabel?: number;
    },
  ): Promise<ProcessTagAssignmentsResult> {
    const resetResults = options?.resetResults ?? true;
    const totalCountLabel = options?.totalCountLabel ?? tagAssignments.length;

    setIsSubmitting(true);
    setErrorMessage(null);

    if (resetResults) {
      setWarningMessages([]);
    }

    // The whole queue is listed up front so the download manager shows what is
    // pending instead of appearing one row at a time.
    const queuedItems: DownloadItem[] = tagAssignments.map(({ file }) => ({
      blob: null,
      conversionPercent: null,
      downloadFilename: null,
      errorMessage: null,
      file,
      id: buildFileId(file),
      sourceFilename: file.name,
      status: "queued",
      tags: [],
    }));

    setDownloadItems((previousItems) =>
      resetResults
        ? queuedItems
        : mergeDownloadItems(previousItems, queuedItems),
    );

    const failures: Array<{ file: string; message: string }> = [];
    const taggedFilenames: string[] = [];
    const responseWarnings = new Set<string>();

    try {
      for (const [index, assignment] of tagAssignments.entries()) {
        const { file, value } = assignment;
        const fileId = buildFileId(file);
        const convertsGif = shouldConvertGif(file);

        setStatus(
          totalCountLabel === 1
            ? `Writing metadata for ${file.name}...`
            : `Writing metadata for ${index + 1} of ${totalCountLabel} files...`,
        );

        updateDownloadItem(fileId, {
          conversionPercent: convertsGif ? 0 : null,
          errorMessage: null,
          status: convertsGif ? "converting" : "tagging",
        });

        try {
          if (convertsGif) {
            const gifFormData = new FormData();
            gifFormData.append("convertGifToMp4", "true");
            gifFormData.append("fileSize", String(file.size));
            gifFormData.append("tags", value);
            gifFormData.append("file", file);

            const streamResponse = await fetch("/api/media/tag-stream", {
              method: "POST",
              body: gifFormData,
            });

            if (!streamResponse.ok || !streamResponse.body) {
              const errorMsg = await readErrorMessage(streamResponse);
              throw new Error(errorMsg);
            }

            const reader = streamResponse.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = "";
            let donePayload: GifTagStreamDoneEvent | null = null;

            try {
              readLoop: while (true) {
                const { value: chunk, done } = await reader.read();

                if (done) {
                  break;
                }

                sseBuffer += decoder.decode(chunk, { stream: true });
                const sseEvents = sseBuffer.split("\n\n");
                sseBuffer = sseEvents.pop() ?? "";

                for (const sseEvent of sseEvents) {
                  const dataLine = sseEvent
                    .split("\n")
                    .find((l) => l.startsWith("data: "));

                  if (!dataLine) {
                    continue;
                  }

                  let parsed: unknown;

                  try {
                    parsed = JSON.parse(dataLine.slice(6));
                  } catch {
                    continue;
                  }

                  if (
                    !parsed ||
                    typeof parsed !== "object" ||
                    !("type" in parsed)
                  ) {
                    continue;
                  }

                  const evt = parsed as Record<string, unknown>;

                  if (
                    evt["type"] === "progress" &&
                    typeof evt["percent"] === "number"
                  ) {
                    updateDownloadItem(fileId, {
                      conversionPercent: evt["percent"] as number,
                      status: "converting",
                    });
                  } else if (
                    evt["type"] === "done" &&
                    typeof evt["filename"] === "string" &&
                    typeof evt["contentType"] === "string" &&
                    typeof evt["data"] === "string"
                  ) {
                    donePayload = evt as unknown as GifTagStreamDoneEvent;
                    break readLoop;
                  } else if (evt["type"] === "error") {
                    throw new Error(
                      typeof evt["message"] === "string"
                        ? evt["message"]
                        : "GIF conversion failed.",
                    );
                  }
                }
              }
            } finally {
              reader.releaseLock();
            }

            if (!donePayload) {
              throw new Error("GIF conversion stream ended without a result.");
            }

            updateDownloadItem(fileId, {
              conversionPercent: null,
              status: "tagging",
            });

            const gifBytes = Uint8Array.from(atob(donePayload.data), (c) =>
              c.charCodeAt(0),
            );
            const gifBlob = new Blob([gifBytes], {
              type: donePayload.contentType,
            });
            const gifDownloadFilename = donePayload.filename;

            taggedFilenames.push(gifDownloadFilename);

            updateDownloadItem(fileId, {
              blob: gifBlob,
              downloadFilename: gifDownloadFilename,
              status: "ready",
              tags: Array.isArray(donePayload.tags)
                ? donePayload.tags
                : normalizeTags(value),
            });

            if (donePayload.resolutionWarning) {
              responseWarnings.add(donePayload.resolutionWarning);
            }
          } else {
            const formData = new FormData();
            formData.append("fileSize", String(file.size));
            formData.append("tags", value);

            if (shouldConvertPng(file)) {
              formData.append("convertPngToJpg", "true");
            }

            formData.append("file", file);

            const response = await fetch("/api/media/tag", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              const responseError = await readErrorMessage(response);
              throw new Error(responseError);
            }

            const confirmedTags = parseConfirmedTags(
              response.headers.get("x-media-tagger-confirmed-tags"),
            );

            const blob = await response.blob();
            const downloadFilename =
              getFilenameFromContentDisposition(
                response.headers.get("content-disposition"),
              ) ?? file.name;
            const resolutionWarning = response.headers.get(
              "x-media-tagger-file-resolution",
            );

            if (resolutionWarning) {
              responseWarnings.add(resolutionWarning);
            }

            taggedFilenames.push(downloadFilename);

            updateDownloadItem(fileId, {
              blob,
              downloadFilename,
              status: "ready",
              tags: confirmedTags ?? normalizeTags(value),
            });
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Upload failed unexpectedly.";

          failures.push({
            file: file.name,
            message,
          });

          updateDownloadItem(fileId, {
            conversionPercent: null,
            errorMessage: message,
            status: "failed",
          });
        }
      }

      if (failures.length > 0) {
        setErrorMessage(formatFailureMessage(failures));
      }

      if (responseWarnings.size > 0) {
        setWarningMessages((previousWarnings) =>
          resetResults
            ? Array.from(responseWarnings)
            : Array.from(new Set([...previousWarnings, ...responseWarnings])),
        );
      }

      if (taggedFilenames.length === 0) {
        setStatus("Request failed.");
        return { failures, taggedFilenames };
      }

      setStatus(
        options?.successStatus
          ? options.successStatus(taggedFilenames)
          : taggedFilenames.length === 1 && failures.length === 0
            ? `Tagged ${taggedFilenames[0]}.`
            : `Tagged ${taggedFilenames.length} of ${totalCountLabel} files.`,
      );

      return { failures, taggedFilenames };
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderMediaPreview(file: File) {
    const previewUrl = previewUrls[buildFileId(file)] ?? null;
    const videoDetected = isVideoFile(file);

    if (!previewUrl) {
      return (
        <div className="preview-frame">
          <div
            className="preview-placeholder"
            aria-label={`No preview available for ${file.name}`}
          >
            <span>{formatPreviewLabel(file)}</span>
          </div>
        </div>
      );
    }

    if (videoDetected) {
      return (
        <button
          aria-label={`Open video preview for ${file.name}`}
          className="preview-frame-button"
          onClick={() => setLightboxTarget({ file, kind: "video" })}
          type="button"
        >
          <div className="preview-frame">
            <video
              aria-hidden="true"
              className="preview-image"
              muted
              playsInline
              preload="metadata"
              src={previewUrl}
            />
            <div aria-hidden="true" className="preview-play-icon">
              <div className="preview-play-circle">&#9654;</div>
            </div>
          </div>
        </button>
      );
    }

    return (
      <button
        aria-label={`Open image preview for ${file.name}`}
        className="preview-frame-button"
        onClick={() => setLightboxTarget({ file, kind: "image" })}
        type="button"
      >
        <div className="preview-frame">
          <img
            alt={`Preview of ${file.name}`}
            className="preview-image"
            src={previewUrl}
          />
          <div aria-hidden="true" className="preview-zoom-icon">
            <div className="preview-zoom-circle">&#9906;</div>
          </div>
        </div>
      </button>
    );
  }

  function handleManualDownload(item: DownloadItem) {
    if (!item.blob || !item.downloadFilename) {
      return;
    }

    // The only download the app ever starts, and the only one it can report on:
    // the user asked for it, so they can see it happen.
    triggerDownload(item.blob, item.downloadFilename);
    updateDownloadItem(item.id, { status: "downloaded" });
    setStatus(`Downloaded ${item.downloadFilename}.`);
  }

  function handleTagModeChange(nextMode: TagMode) {
    setTagMode(nextMode);
    setErrorMessage(null);

    if (nextMode === "individual") {
      setPerFileTags((previousTags) =>
        buildPerFileTagMap(selectedFiles, previousTags, tags),
      );
    }
  }

  function handlePerFileTagsChange(fileId: string, value: string) {
    setPerFileTags((previousTags) => ({
      ...previousTags,
      [fileId]: value,
    }));
  }

  function handleCopyTags(file: File) {
    const copiedValue = perFileTags[buildFileId(file)] ?? "";

    setCopiedTags(copiedValue);
    setCopiedFromFilename(file.name);
    setStatus(
      copiedValue.trim()
        ? `Copied tags from ${file.name}.`
        : `Copied an empty tag field from ${file.name}.`,
    );
  }

  function handlePasteTags(file: File) {
    if (copiedTags === null) {
      return;
    }

    setPerFileTags((previousTags) => ({
      ...previousTags,
      [buildFileId(file)]: copiedTags,
    }));
    setErrorMessage(null);
    setStatus(`Pasted copied tags into ${file.name}.`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const tagAssignments = getTagAssignments(selectedFiles);
    const validationError = validateTagAssignments(tagAssignments, tagMode);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    await processTagAssignments(tagAssignments, {
      resetResults: true,
      totalCountLabel: selectedFiles.length,
    });
  }

  async function handleSingleFileSubmit(file: File) {
    const tagAssignments = getTagAssignments([file], "individual");
    const validationError = validateTagAssignments(
      tagAssignments,
      "individual",
    );

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const result = await processTagAssignments(tagAssignments, {
      resetResults: false,
      totalCountLabel: 1,
      successStatus: (taggedFilenames) =>
        `Tagged ${taggedFilenames[0] ?? file.name} and removed ${file.name} from the queue.`,
    });

    if (result.taggedFilenames.length > 0 && result.failures.length === 0) {
      removeQueuedFile(file, true);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length > MAX_FILES) {
      event.target.value = "";
      setSelectedFiles([]);
      setPerFileTags({});
      setCopiedTags(null);
      setCopiedFromFilename(null);
      setDownloadItems([]);
      setErrorMessage(`Choose no more than ${MAX_FILES} files at once.`);
      setStatus("Ready for upload.");
      return;
    }

    setSelectedFiles(files);
    setPerFileTags((previousTags) =>
      buildPerFileTagMap(files, previousTags, tags),
    );
    setPerFileConvertGif({});
    setPerFileConvertPng({});
    setCopiedTags(null);
    setCopiedFromFilename(null);
    setDownloadItems([]);
    setExpandedDownloadIds(new Set());

    if (files.length > 0) {
      setStatus(
        files.length === 1
          ? `Selected ${files[0]?.name ?? "file"}.`
          : `Selected ${files.length} files.`,
      );
      setErrorMessage(null);
      return;
    }

    setStatus("Ready for upload.");
  }

  const lightboxPreviewUrl = lightboxTarget
    ? (previewUrls[buildFileId(lightboxTarget.file)] ?? null)
    : null;

  return (
    <main className="app-shell">
      {lightboxTarget && lightboxPreviewUrl ? (
        <MediaLightbox
          file={lightboxTarget.file}
          kind={lightboxTarget.kind}
          onClose={() => setLightboxTarget(null)}
          previewUrl={lightboxPreviewUrl}
        />
      ) : null}
      <section className="app-panel">
        <header className="panel-header">
          <h1>Media Tagger</h1>
          <p className="lede">
            Upload up to 20 supported files, apply one shared tag set or tag
            each file individually, and download each updated file with a
            canonical metadata payload.
          </p>
          <p className="build-metadata">
            {formatBuildMetadata(serverConfig, serverConfigState)}
          </p>
        </header>

        <form className="tagger-form" onSubmit={handleSubmit}>
          <label className="field-card" htmlFor="media-file">
            <span className="field-label">Files</span>
            <span className="field-help">
              Supported formats: JPG, JPEG, PNG, WebP, GIF, MP4, and MOV. Tag up
              to 20 files at once, then download each result individually.
            </span>
            <span className="field-help">
              {formatServerThresholdCopy(serverConfig, serverConfigState)}
            </span>
            <span className="file-picker-row">
              <span className="file-picker-button">Choose files</span>
              <span className="field-value file-name">
                {formatSelectedFileSummary(selectedFiles)}
              </span>
            </span>
            <input
              id="media-file"
              accept={ACCEPTED_FILE_TYPES}
              className="file-input"
              multiple
              onChange={handleFileChange}
              type="file"
            />
          </label>

          <fieldset className="field-card mode-card">
            <legend className="field-label">Tagging mode</legend>
            <p className="field-help">
              Apply one tag set to every selected file, or enter tags for each
              file separately.
            </p>
            <div
              className="mode-options"
              aria-label="Tagging mode"
              role="group"
            >
              <button
                aria-pressed={tagMode === "shared"}
                className={`mode-button ${tagMode === "shared" ? "mode-button-active" : ""}`}
                onClick={() => handleTagModeChange("shared")}
                type="button"
              >
                Tag all images the same
              </button>
              <button
                aria-pressed={tagMode === "individual"}
                className={`mode-button ${tagMode === "individual" ? "mode-button-active" : ""}`}
                onClick={() => handleTagModeChange("individual")}
                type="button"
              >
                Tag images individually
              </button>
            </div>
          </fieldset>

          {selectedFiles.some(isEffectivelyGif) && tagMode === "shared" ? (
            <section className="field-card" aria-label="GIF to MP4 conversion">
              <span className="field-label">GIF to MP4 conversion</span>
              <p className="field-help">
                Convert GIF files to MP4 for dramatically smaller file sizes at
                equivalent visual quality.
              </p>
              <label className="convert-gif-toggle">
                <input
                  checked={convertGifsToMp4}
                  disabled={isSubmitting}
                  onChange={(e) => setConvertGifsToMp4(e.target.checked)}
                  type="checkbox"
                />
                <span>Convert GIF files to MP4 (recommended)</span>
              </label>
            </section>
          ) : null}

          {selectedFiles.some(isEffectivelyPng) && tagMode === "shared" ? (
            <section className="field-card" aria-label="PNG to JPG conversion">
              <span className="field-label">PNG to JPG conversion</span>
              <p className="field-help">
                Convert PNG files to JPG for much smaller file sizes. JPG has no
                alpha channel, so transparency is flattened onto a white
                background.
              </p>
              <label className="convert-gif-toggle">
                <input
                  checked={convertPngsToJpg}
                  disabled={isSubmitting}
                  onChange={(e) => setConvertPngsToJpg(e.target.checked)}
                  type="checkbox"
                />
                <span>Convert PNG files to JPG</span>
              </label>
            </section>
          ) : null}

          {tagMode === "shared" ? (
            <section className="field-card" aria-label="Tags">
              <label className="field-label" htmlFor="media-tags">
                Tags
              </label>
              <span className="field-help">
                Separate tags with commas, new lines, or use <code>|</code> for
                expansion. Duplicate tags are removed.
              </span>
              {selectedFiles.length > 0 ? (
                <div
                  className="shared-preview-list"
                  aria-label="Selected files"
                >
                  {selectedFiles.map((file) => {
                    const fileId = buildFileId(file);

                    return (
                      <article className="shared-preview-item" key={fileId}>
                        {renderMediaPreview(file)}
                        <div className="shared-preview-copy">
                          <span
                            className="field-value individual-tag-filename"
                            title={file.name}
                          >
                            {file.name}
                          </span>
                          <button
                            aria-label={`Remove ${file.name}`}
                            className="secondary-button"
                            disabled={isSubmitting}
                            onClick={() => removeQueuedFile(file)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <span className="field-value">
                  Choose files to preview and tag.
                </span>
              )}
              <textarea
                id="media-tags"
                className="tags-input"
                onChange={(event) => setTags(event.target.value)}
                placeholder="forest, big|huge trees, large trees|, large |trees, sunrise"
                rows={4}
                value={tags}
              />
              <TagPreview label="Tag preview" value={tags} />
            </section>
          ) : (
            <section
              className="field-card individual-tags-card"
              aria-label="Individual tags"
            >
              <span className="field-label">Individual tags</span>
              <span className="field-help">
                Enter tags for each selected file. Copy one field, then paste it
                into another when you want to reuse the same tag set.
              </span>
              {selectedFiles.length > 0 ? (
                <div className="individual-tags-list">
                  {selectedFiles.map((file) => {
                    const fileId = buildFileId(file);
                    const copiedFromLabel = copiedFromFilename
                      ? `Paste copied tags from ${copiedFromFilename}`
                      : "Paste copied tags";

                    return (
                      <article className="individual-tag-item" key={fileId}>
                        {renderMediaPreview(file)}
                        <div className="individual-tag-copy">
                          <span
                            className="field-value individual-tag-filename"
                            title={file.name}
                          >
                            {file.name}
                          </span>
                          {isEffectivelyGif(file) ? (
                            <label className="convert-gif-toggle">
                              <input
                                checked={perFileConvertGif[fileId] ?? true}
                                disabled={isSubmitting}
                                onChange={(e) =>
                                  setPerFileConvertGif((prev) => ({
                                    ...prev,
                                    [fileId]: e.target.checked,
                                  }))
                                }
                                type="checkbox"
                              />
                              <span>Convert to MP4</span>
                            </label>
                          ) : null}
                          {isEffectivelyPng(file) ? (
                            <label className="convert-gif-toggle">
                              <input
                                checked={perFileConvertPng[fileId] ?? false}
                                disabled={isSubmitting}
                                onChange={(e) =>
                                  setPerFileConvertPng((prev) => ({
                                    ...prev,
                                    [fileId]: e.target.checked,
                                  }))
                                }
                                type="checkbox"
                              />
                              <span>Convert to JPG</span>
                            </label>
                          ) : null}
                          <label
                            className="individual-tag-label"
                            htmlFor={`media-tags-${fileId}`}
                          >
                            Tags
                          </label>
                          <textarea
                            aria-label={`Tags for ${file.name}`}
                            id={`media-tags-${fileId}`}
                            className="tags-input individual-tags-input"
                            onChange={(event) =>
                              handlePerFileTagsChange(
                                fileId,
                                event.target.value,
                              )
                            }
                            placeholder="forest, big|huge trees, large trees|, large |trees, sunrise"
                            rows={3}
                            value={perFileTags[fileId] ?? ""}
                          />
                          <TagPreview
                            label={`Tag preview for ${file.name}`}
                            value={perFileTags[fileId] ?? ""}
                          />
                          <div className="individual-tag-actions">
                            <button
                              className="secondary-button"
                              disabled={isSubmitting}
                              onClick={() => handleCopyTags(file)}
                              type="button"
                            >
                              Copy tags
                            </button>
                            <button
                              className="secondary-button"
                              disabled={copiedTags === null || isSubmitting}
                              onClick={() => handlePasteTags(file)}
                              type="button"
                            >
                              {copiedFromLabel}
                            </button>
                            <button
                              aria-label={`Tag ${file.name}`}
                              className="secondary-button"
                              disabled={isSubmitting}
                              onClick={() => void handleSingleFileSubmit(file)}
                              type="button"
                            >
                              Tag file
                            </button>
                            <button
                              aria-label={`Remove ${file.name}`}
                              className="secondary-button"
                              disabled={isSubmitting}
                              onClick={() => removeQueuedFile(file)}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <span className="field-value">
                  Choose files to enter individual tags.
                </span>
              )}
            </section>
          )}

          <section
            className="field-card warning-card"
            aria-label="Overwrite warning"
          >
            <span className="field-label">Overwrite warning</span>
            <p className="field-help">
              Existing metadata in the supported description or comment field
              for each uploaded file will be replaced by the new payload.
            </p>
          </section>

          <button
            className="submit-button"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Writing metadata..." : "Tag all files"}
          </button>
        </form>

        {downloadItems.length > 0 ? (
          <section className="download-manager" aria-label="Downloads">
            <div className="download-manager-header">
              <h2>Downloads</h2>
              <p className="field-help">
                Every queued file is listed here. Tap a row&rsquo;s download
                button to save that file; the row turns green once you do.
                Nothing downloads on its own, so nothing gets lost behind a
                dismissed browser prompt.
              </p>
              <p
                aria-live="polite"
                className="download-manager-summary"
              >{`${countConfirmedDownloads(downloadItems)} of ${downloadItems.length} downloaded`}</p>
            </div>

            <ul className="download-item-list">
              {downloadItems.map((item) => (
                <DownloadRow
                  isExpanded={expandedDownloadIds.has(item.id)}
                  item={item}
                  key={item.id}
                  onDownload={() => handleManualDownload(item)}
                  onToggle={() => toggleDownloadDetails(item.id)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="status-strip" aria-live="polite">
          <span>{status}</span>
          {warningMessages.map((message) => (
            <span className="status-warning" key={message}>
              {message}
            </span>
          ))}
          {errorMessage ? (
            <span className="status-error">{errorMessage}</span>
          ) : null}
        </footer>
      </section>
    </main>
  );
}

function TagPreview({ label, value }: { label: string; value: string }) {
  const previewTags = normalizeTags(value);

  return (
    <div aria-label={label} aria-live="polite" className="tag-preview">
      <span className="tag-preview-label">
        {previewTags.length === 0
          ? "No tags yet."
          : `${previewTags.length} ${previewTags.length === 1 ? "tag" : "tags"}`}
      </span>
      {previewTags.length > 0 ? (
        <div className="tag-chips-row">
          {previewTags.map((tag) => (
            <span className="tag-chip tag-preview-chip" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DownloadRow({
  isExpanded,
  item,
  onDownload,
  onToggle,
}: {
  isExpanded: boolean;
  item: DownloadItem;
  onDownload: () => void;
  onToggle: () => void;
}) {
  const thumbnailUrl = useObjectUrl(item.file);
  const detailsId = `download-details-${buildElementId(item.id)}`;

  return (
    <li className={`download-item download-item-${item.status}`}>
      <div className="download-item-summary">
        <button
          aria-controls={detailsId}
          aria-expanded={isExpanded}
          aria-label={`Toggle details for ${item.sourceFilename}`}
          className="download-item-toggle"
          onClick={onToggle}
          type="button"
        >
          <span className="download-item-thumb">
            {thumbnailUrl && isVideoFile(item.file) ? (
              <video
                aria-hidden="true"
                className="download-item-thumb-media"
                muted
                playsInline
                preload="metadata"
                // The media fragment nudges the browser into painting a frame
                // instead of an empty box for the thumbnail.
                src={`${thumbnailUrl}#t=0.1`}
              />
            ) : thumbnailUrl ? (
              <img
                alt={`Thumbnail of ${item.sourceFilename}`}
                className="download-item-thumb-media"
                src={thumbnailUrl}
              />
            ) : (
              <span className="download-item-thumb-placeholder">
                {formatPreviewLabel(item.file)}
              </span>
            )}
          </span>
          <span className="download-item-copy">
            <span className="download-filename" title={item.sourceFilename}>
              {item.sourceFilename}
            </span>
            <span className="download-item-status">
              {formatDownloadStatus(item)}
            </span>
          </span>
          <span aria-hidden="true" className="download-item-chevron">
            {isExpanded ? "▴" : "▾"}
          </span>
        </button>
        <button
          aria-label={`Download ${item.downloadFilename ?? item.sourceFilename}`}
          className={`secondary-button download-item-download ${
            item.status === "ready" ? "download-item-download-pending" : ""
          }`}
          disabled={!item.blob}
          onClick={onDownload}
          type="button"
        >
          {item.status === "downloaded" ? "Download again" : "Download"}
        </button>
      </div>

      {item.conversionPercent != null ? (
        <div className="encoding-progress-wrapper">
          <progress
            aria-label={`Encoding progress for ${item.sourceFilename}`}
            className="encoding-progress"
            max={100}
            value={item.conversionPercent}
          />
        </div>
      ) : null}

      {isExpanded ? (
        <div className="download-item-details" id={detailsId}>
          {item.downloadFilename ? (
            <span
              className="download-result-name"
              title={item.downloadFilename}
            >
              Saves as {item.downloadFilename}
            </span>
          ) : null}
          {item.tags.length > 0 ? (
            <div
              aria-label={`Tags applied to ${item.sourceFilename}`}
              className="tag-chips-row"
            >
              {item.tags.map((tag) => (
                <span className="tag-chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <span className="download-item-note">
              No tags confirmed by the server yet.
            </span>
          )}
          {item.status === "ready" ? (
            <span className="download-item-note">
              Tap Download to save this file. Nothing is saved until you do.
            </span>
          ) : null}
          {item.errorMessage ? (
            <span className="download-item-error">{item.errorMessage}</span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !isPreviewableFile(file)) {
      // Schedule setState in a microtask to avoid ESLint error
      Promise.resolve().then(() => setObjectUrl(null));
      return;
    }

    const nextObjectUrl = URL.createObjectURL(file);
    Promise.resolve().then(() => setObjectUrl(nextObjectUrl));

    return () => {
      URL.revokeObjectURL(nextObjectUrl);
    };
  }, [file]);

  return objectUrl;
}

function MediaLightbox({
  file,
  kind,
  previewUrl,
  onClose,
}: {
  file: File;
  kind: "image" | "video";
  previewUrl: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Non-passive touchmove so we can preventDefault on pinch to block browser zoom.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length !== 2 || pinchStartDistRef.current === null) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const raw = pinchStartZoomRef.current * (dist / pinchStartDistRef.current);
      setZoom(Math.round(Math.min(4, Math.max(1, raw)) * 10) / 10);
    }
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleTouchMove);
  }, []);

  const zoomStyle = zoom !== 1 ? { width: `${zoom * 100}%` } : undefined;

  return (
    <div
      aria-label={`${kind === "video" ? "Video" : "Image"} preview for ${file.name}`}
      aria-modal="true"
      className="media-lightbox-backdrop"
      onClick={onClose}
      role="dialog"
    >
      <div className="media-lightbox" onClick={(e) => e.stopPropagation()}>
        <div className="media-lightbox-header">
          <span className="media-lightbox-filename" title={file.name}>
            {file.name}
          </span>
          <button
            autoFocus
            className="media-lightbox-close"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div
          className="media-lightbox-media-wrapper"
          onTouchEnd={() => {
            pinchStartDistRef.current = null;
          }}
          onTouchStart={(e) => {
            if (e.touches.length === 2) {
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              pinchStartDistRef.current = Math.hypot(dx, dy);
              pinchStartZoomRef.current = zoom;
            }
          }}
          ref={wrapperRef}
        >
          {kind === "video" ? (
            <video
              autoPlay
              className="media-lightbox-media"
              controls
              playsInline
              src={previewUrl}
              style={zoomStyle}
            />
          ) : (
            <img
              alt={`Full preview of ${file.name}`}
              className="media-lightbox-media"
              src={previewUrl}
              style={zoomStyle}
            />
          )}
        </div>
        <div className="media-lightbox-footer">
          <button
            aria-label="Zoom out"
            className="media-lightbox-zoom-btn"
            disabled={zoom <= 1}
            onClick={() =>
              setZoom((z) => Math.max(Math.round((z - 0.5) * 10) / 10, 1))
            }
            type="button"
          >
            −
          </button>
          <button
            aria-label="Reset zoom"
            aria-live="polite"
            className="media-lightbox-zoom-level"
            disabled={zoom === 1}
            onClick={() => setZoom(1)}
            type="button"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            aria-label="Zoom in"
            className="media-lightbox-zoom-btn"
            disabled={zoom >= 4}
            onClick={() =>
              setZoom((z) => Math.min(Math.round((z + 0.5) * 10) / 10, 4))
            }
            type="button"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "Upload failed.";
  }

  const message = await response.text();
  return message || "Upload failed.";
}

function parseConfirmedTags(header: string | null): string[] | null {
  if (!header) {
    return null;
  }

  try {
    const parsed = JSON.parse(header) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function getFilenameFromContentDisposition(
  header: string | null,
): string | null {
  if (!header) {
    return null;
  }

  const match = header.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

function triggerDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(objectUrl);
}

function mergeDownloadItems(
  previousItems: DownloadItem[],
  queuedItems: DownloadItem[],
): DownloadItem[] {
  const queuedById = new Map(queuedItems.map((item) => [item.id, item]));
  const merged = previousItems.map(
    (item) => queuedById.get(item.id) ?? item,
  );
  const existingIds = new Set(previousItems.map((item) => item.id));

  return [
    ...merged,
    ...queuedItems.filter((item) => !existingIds.has(item.id)),
  ];
}

function formatDownloadStatus(item: DownloadItem): string {
  switch (item.status) {
    case "queued":
      return "Queued";
    case "converting":
      return item.conversionPercent === null
        ? "Converting to MP4..."
        : `Converting to MP4... ${item.conversionPercent}%`;
    case "tagging":
      return "Writing metadata...";
    case "ready":
      return "Ready to download";
    case "downloaded":
      return "Downloaded";
    case "failed":
      return "Failed";
  }
}

function countConfirmedDownloads(items: DownloadItem[]): number {
  return items.filter((item) => item.status === "downloaded").length;
}

function formatSelectedFileSummary(files: File[]): string {
  if (files.length === 0) {
    return "No files selected";
  }

  if (files.length === 1) {
    return files[0]?.name ?? "1 file selected";
  }

  return `${files.length} files selected`;
}

function formatFailureMessage(
  failures: Array<{ file: string; message: string }>,
): string {
  if (failures.length === 1) {
    const failure = failures[0];
    return `${failure?.file}: ${failure?.message}`;
  }

  return `Failed files: ${failures
    .map((failure) => `${failure.file} (${failure.message})`)
    .join("; ")}`;
}

function formatServerThresholdCopy(
  serverConfig: ServerConfig | null,
  serverConfigState: "loading" | "ready" | "unavailable",
): string {
  if (serverConfigState === "loading") {
    return "Loading server upload threshold...";
  }

  if (serverConfigState === "unavailable" || !serverConfig) {
    return "Server upload configuration unavailable. The server will still accept uploads, but the exact memory threshold and upload cap could not be loaded.";
  }

  return `The server accepts files up to ${formatBytes(serverConfig.maxUploadBytes)}.`;
}

function formatBuildMetadata(
  serverConfig: ServerConfig | null,
  serverConfigState: "loading" | "ready" | "unavailable",
): string {
  if (serverConfigState === "loading") {
    return "Loading build metadata...";
  }

  if (serverConfigState === "unavailable" || !serverConfig) {
    return "Build metadata unavailable.";
  }

  return `Version ${serverConfig.version} | Commit ${serverConfig.gitHash}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${stripTrailingZeroes((bytes / (1024 * 1024 * 1024)).toFixed(1))} GB`;
  }

  if (bytes >= 1024 * 1024) {
    return `${stripTrailingZeroes((bytes / (1024 * 1024)).toFixed(1))} MB`;
  }

  if (bytes >= 1024) {
    return `${stripTrailingZeroes((bytes / 1024).toFixed(1))} KB`;
  }

  return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
}

function stripTrailingZeroes(value: string): string {
  return value.replace(/\.0$/, "");
}

function buildFileId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function buildElementId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function isGifFile(file: File): boolean {
  return file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
}

function isPngFile(file: File): boolean {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
}

/**
 * Reads the leading magic bytes of an image file so that files carrying the
 * wrong extension (a `.jpg` that is really a GIF or PNG) still get the right
 * conversion option.
 */
async function readImageSignature(
  file: File,
): Promise<"gif" | "png" | "unknown"> {
  try {
    const buffer = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // GIF87a / GIF89a
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return "gif";
    }

    // \x89PNG\r\n\x1a\n
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "png";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

function isPreviewableFile(file: File): boolean {
  return isImageFile(file) || isVideoFile(file);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function isVideoFile(file: File): boolean {
  // Accept if browser detects as video/* or if extension is .mp4 or .mov
  if (file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "mp4" || ext === "mov";
}

function buildPerFileTagMap(
  files: File[],
  previousTags: Record<string, string>,
  fallbackTags: string,
): Record<string, string> {
  return Object.fromEntries(
    files.map((file) => {
      const fileId = buildFileId(file);
      return [fileId, previousTags[fileId] ?? fallbackTags];
    }),
  );
}

function formatPreviewLabel(file: File): string {
  const extension = file.name.split(".").pop()?.toUpperCase();
  return extension ?? "MEDIA";
}
