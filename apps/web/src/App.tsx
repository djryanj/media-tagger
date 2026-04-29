import { ChangeEvent, FormEvent, useEffect, useState } from "react";

const ACCEPTED_FILE_TYPES = ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov";
const MAX_FILES = 20;

type TagMode = "shared" | "individual";

type ServerConfig = {
  gitHash: string;
  inMemoryUploadLimitBytes: number;
  maxUploadBytes: number;
  version: string;
};

type ProcessedDownload = {
  id: string;
  downloadFilename: string;
  sourceFilename: string;
  blob: Blob;
};

type ConfirmedTagGroup = {
  sourceFilename: string;
  tags: string[];
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
  const [confirmedTagGroups, setConfirmedTagGroups] = useState<
    ConfirmedTagGroup[]
  >([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processedDownloads, setProcessedDownloads] = useState<
    ProcessedDownload[]
  >([]);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [serverConfigState, setServerConfigState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [warningMessages, setWarningMessages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setPreviewUrls(nextPreviewUrls);

    return () => {
      for (const url of Object.values(nextPreviewUrls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [selectedFiles]);

  const visibleConfirmedTagGroups = getVisibleConfirmedTagGroups(
    tagMode,
    confirmedTagGroups,
  );

  function handleManualDownload(download: ProcessedDownload) {
    triggerDownload(download.blob, download.downloadFilename);
    setStatus(`Manual download started for ${download.downloadFilename}.`);
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

    if (selectedFiles.length === 0) {
      setErrorMessage("Choose at least one file before submitting.");
      return;
    }

    const tagAssignments = selectedFiles.map((file) => ({
      file,
      value:
        tagMode === "shared" ? tags : (perFileTags[buildFileId(file)] ?? ""),
    }));

    if (tagMode === "shared" && !tags.trim()) {
      setErrorMessage("Enter at least one tag.");
      return;
    }

    const missingTagsAssignment = tagAssignments.find(
      ({ value }) => !value.trim(),
    );

    if (missingTagsAssignment) {
      setErrorMessage(
        tagMode === "shared"
          ? "Enter at least one tag."
          : `Enter at least one tag for ${missingTagsAssignment.file.name}.`,
      );
      return;
    }

    if (
      serverConfig &&
      selectedFiles.some((file) => file.size > serverConfig.maxUploadBytes)
    ) {
      setErrorMessage(
        `Choose files no larger than ${formatBytes(serverConfig.maxUploadBytes)}.`,
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setProcessedDownloads([]);
    setWarningMessages([]);
    setConfirmedTagGroups([]);

    const failures: Array<{ file: string; message: string }> = [];
    const downloadedFilenames: string[] = [];
    const responseWarnings = new Set<string>();
    const nextConfirmedTagGroups: ConfirmedTagGroup[] = [];

    try {
      for (const [index, assignment] of tagAssignments.entries()) {
        const { file, value } = assignment;

        setStatus(
          selectedFiles.length === 1
            ? `Writing metadata for ${file.name}...`
            : `Writing metadata for ${index + 1} of ${selectedFiles.length} files...`,
        );

        try {
          const formData = new FormData();
          formData.append("fileSize", String(file.size));
          formData.append("tags", value);
          formData.append("file", file);

          const response = await fetch("/api/media/tag", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const responseError = await readErrorMessage(response);
            throw new Error(responseError);
          }

          const confirmedTagsHeader = response.headers.get(
            "x-media-tagger-confirmed-tags",
          );

          if (confirmedTagsHeader) {
            try {
              nextConfirmedTagGroups.push({
                sourceFilename: file.name,
                tags: JSON.parse(confirmedTagsHeader) as string[],
              });
            } catch {
              // ignore invalid header payloads
            }
          }

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

          const completedDownload = {
            id: `${index}-${file.name}-${downloadFilename}`,
            blob,
            downloadFilename,
            sourceFilename: file.name,
          };

          setProcessedDownloads((previousDownloads) => {
            if (
              previousDownloads.some(
                (previousDownload) =>
                  previousDownload.id === completedDownload.id,
              )
            ) {
              return previousDownloads;
            }

            return [...previousDownloads, completedDownload];
          });
          triggerDownload(blob, downloadFilename);
          downloadedFilenames.push(downloadFilename);
        } catch (error) {
          failures.push({
            file: file.name,
            message:
              error instanceof Error
                ? error.message
                : "Upload failed unexpectedly.",
          });
        }
      }

      if (failures.length > 0) {
        setErrorMessage(formatFailureMessage(failures));
      }

      setWarningMessages(Array.from(responseWarnings));

      if (nextConfirmedTagGroups.length > 0) {
        setConfirmedTagGroups(nextConfirmedTagGroups);
      }

      if (downloadedFilenames.length === 0) {
        setStatus("Request failed.");
        return;
      }

      setStatus(
        downloadedFilenames.length === 1 && failures.length === 0
          ? `Downloaded ${downloadedFilenames[0]}.`
          : `Downloaded ${downloadedFilenames.length} of ${selectedFiles.length} files.`,
      );
    } finally {
      setIsSubmitting(false);
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
      setProcessedDownloads([]);
      setErrorMessage(`Choose no more than ${MAX_FILES} files at once.`);
      setStatus("Ready for upload.");
      return;
    }

    setSelectedFiles(files);
    setPerFileTags((previousTags) =>
      buildPerFileTagMap(files, previousTags, tags),
    );
    setCopiedTags(null);
    setCopiedFromFilename(null);
    setProcessedDownloads([]);
    setConfirmedTagGroups([]);

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

  return (
    <main className="app-shell">
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
            {selectedFiles.length > 0 ? (
              <span className="selected-file-list" aria-live="polite">
                {selectedFiles.map((file) => (
                  <span
                    className="selected-file-item"
                    key={`${file.name}-${file.size}`}
                  >
                    {file.name}
                  </span>
                ))}
              </span>
            ) : null}
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

          {tagMode === "shared" ? (
            <section className="field-card" aria-label="Tags">
              <label className="field-label" htmlFor="media-tags">
                Tags
              </label>
              <span className="field-help">
                Separate tags with commas, new lines, or use <code>|</code> for
                expansion. Duplicate tags are removed.
              </span>
              <textarea
                id="media-tags"
                className="tags-input"
                onChange={(event) => setTags(event.target.value)}
                placeholder="forest, big|huge trees, sunrise"
                rows={4}
                value={tags}
              />
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
                    const previewUrl = previewUrls[fileId] ?? null;
                    const copiedFromLabel = copiedFromFilename
                      ? `Paste copied tags from ${copiedFromFilename}`
                      : "Paste copied tags";
                    const showVideoPreview = isVideoFile(file) && previewUrl;

                    return (
                      <article className="individual-tag-item" key={fileId}>
                        <div className="preview-frame">
                          {showVideoPreview ? (
                            <video
                              aria-label={`Preview of ${file.name}`}
                              className="preview-image"
                              muted
                              playsInline
                              preload="metadata"
                              src={previewUrl}
                            />
                          ) : previewUrl ? (
                            <img
                              alt={`Preview of ${file.name}`}
                              className="preview-image"
                              src={previewUrl}
                            />
                          ) : (
                            <div
                              className="preview-placeholder"
                              aria-label={`No preview available for ${file.name}`}
                            >
                              <span>{formatPreviewLabel(file)}</span>
                            </div>
                          )}
                        </div>
                        <div className="individual-tag-copy">
                          <span className="field-value individual-tag-filename">
                            {file.name}
                          </span>
                          <label
                            className="individual-tag-label"
                            htmlFor={`media-tags-${fileId}`}
                          >
                            Tags for {file.name}
                          </label>
                          <textarea
                            id={`media-tags-${fileId}`}
                            className="tags-input individual-tags-input"
                            onChange={(event) =>
                              handlePerFileTagsChange(
                                fileId,
                                event.target.value,
                              )
                            }
                            placeholder="forest, big|huge trees, sunrise"
                            rows={3}
                            value={perFileTags[fileId] ?? ""}
                          />
                          <div className="individual-tag-actions">
                            <button
                              className="secondary-button"
                              onClick={() => handleCopyTags(file)}
                              type="button"
                            >
                              Copy tags
                            </button>
                            <button
                              className="secondary-button"
                              disabled={copiedTags === null}
                              onClick={() => handlePasteTags(file)}
                              type="button"
                            >
                              {copiedFromLabel}
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
            {isSubmitting ? "Writing metadata..." : "Tag and download files"}
          </button>

          {visibleConfirmedTagGroups.length > 0 ? (
            <div className="confirmed-tags-block">
              <div className="confirmed-tags-label">
                Tags applied by the server:
              </div>
              <div className="confirmed-tags-groups">
                {visibleConfirmedTagGroups.map((group) => (
                  <section
                    className="confirmed-tags-group"
                    key={`${group.sourceFilename}-${group.tags.join("|")}`}
                  >
                    {tagMode === "individual" ? (
                      <div className="confirmed-tags-file">
                        {group.sourceFilename}
                      </div>
                    ) : null}
                    <div
                      className="tag-chips-row"
                      aria-label={`Confirmed tags for ${group.sourceFilename}`}
                    >
                      {group.tags.map((tag) => (
                        <span
                          className="tag-chip"
                          key={`${group.sourceFilename}-${tag}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          ) : null}
        </form>

        {processedDownloads.length > 0 ? (
          <section className="download-results" aria-label="Processed files">
            <div className="download-results-header">
              <h2>Processed files</h2>
              <p className="field-help">
                Automatic download was attempted for each file. If your device
                delayed or blocked one, use the download button next to that
                file.
              </p>
            </div>

            <ul className="download-result-list">
              {processedDownloads.map((download) => (
                <li className="download-result-item" key={download.id}>
                  <div className="download-result-copy">
                    <span
                      className="field-value download-filename"
                      title={download.sourceFilename}
                    >
                      {download.sourceFilename}
                    </span>
                    <span
                      className="download-result-name"
                      title={download.downloadFilename}
                    >
                      Saves as {download.downloadFilename}
                    </span>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => handleManualDownload(download)}
                    type="button"
                  >
                    Download
                  </button>
                </li>
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

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "Upload failed.";
  }

  const message = await response.text();
  return message || "Upload failed.";
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

function isPreviewableFile(file: File): boolean {
  return isImageFile(file) || isVideoFile(file);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
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

function getVisibleConfirmedTagGroups(
  tagMode: TagMode,
  confirmedTagGroups: ConfirmedTagGroup[],
): ConfirmedTagGroup[] {
  if (confirmedTagGroups.length === 0) {
    return confirmedTagGroups;
  }

  if (tagMode === "shared") {
    return [
      {
        sourceFilename: "All files",
        tags: confirmedTagGroups[0]?.tags ?? [],
      },
    ];
  }

  return confirmedTagGroups;
}
