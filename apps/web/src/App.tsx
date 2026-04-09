import { ChangeEvent, FormEvent, useState } from "react";

const ACCEPTED_FILE_TYPES = ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov";
const MAX_FILES = 10;

export default function App() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [tags, setTags] = useState("");
  const [terminateWithSemicolon, setTerminateWithSemicolon] = useState(false);
  const [status, setStatus] = useState<string>("Ready for upload.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedFiles.length === 0) {
      setErrorMessage("Choose at least one file before submitting.");
      return;
    }

    if (!tags.trim()) {
      setErrorMessage("Enter at least one tag.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const failures: Array<{ file: string; message: string }> = [];
    const downloadedFilenames: string[] = [];

    try {
      for (const [index, file] of selectedFiles.entries()) {
        setStatus(
          selectedFiles.length === 1
            ? `Writing metadata for ${file.name}...`
            : `Writing metadata for ${index + 1} of ${selectedFiles.length} files...`,
        );

        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("tags", tags);
          formData.append(
            "terminateWithSemicolon",
            String(terminateWithSemicolon),
          );

          const response = await fetch("/api/media/tag", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const responseError = await readErrorMessage(response);
            throw new Error(responseError);
          }

          const blob = await response.blob();
          const downloadFilename =
            getFilenameFromContentDisposition(
              response.headers.get("content-disposition"),
            ) ?? file.name;

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
      setErrorMessage(`Choose no more than ${MAX_FILES} files at once.`);
      setStatus("Ready for upload.");
      return;
    }

    setSelectedFiles(files);

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
            Upload up to 10 supported files, enter one set of tags, and download
            each updated file with a canonical metadata payload.
          </p>
        </header>

        <form className="tagger-form" onSubmit={handleSubmit}>
          <label className="field-card" htmlFor="media-file">
            <span className="field-label">Files</span>
            <span className="field-help">
              Supported formats: JPG, JPEG, PNG, WebP, GIF, MP4, and MOV. Tag up
              to 10 files at once, then download each result individually.
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

          <label className="field-card" htmlFor="media-tags">
            <span className="field-label">Tags</span>
            <span className="field-help">
              Separate tags with commas or new lines. Duplicate tags are
              removed.
            </span>
            <textarea
              id="media-tags"
              className="tags-input"
              onChange={(event) => setTags(event.target.value)}
              placeholder="forest, timelapse, sunrise"
              rows={4}
              value={tags}
            />
          </label>

          <label className="toggle-card" htmlFor="semicolon-toggle">
            <div>
              <span className="field-label">Terminate with semicolon</span>
              <p className="field-help">
                Adds a trailing semicolon so the final payload becomes
                <strong> tags:tag-one,tag-two;</strong>
              </p>
            </div>

            <input
              checked={terminateWithSemicolon}
              className="toggle-input"
              id="semicolon-toggle"
              onChange={(event) =>
                setTerminateWithSemicolon(event.target.checked)
              }
              type="checkbox"
            />
          </label>

          <button
            className="submit-button"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Writing metadata..." : "Tag and download files"}
          </button>
        </form>

        <footer className="status-strip" aria-live="polite">
          <span>{status}</span>
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
