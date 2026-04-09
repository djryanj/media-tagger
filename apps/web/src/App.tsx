import { ChangeEvent, FormEvent, useState } from "react";

const ACCEPTED_FILE_TYPES = ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov";

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tags, setTags] = useState("");
  const [terminateWithSemicolon, setTerminateWithSemicolon] = useState(false);
  const [status, setStatus] = useState<string>("Ready for upload.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setErrorMessage("Choose a file before submitting.");
      return;
    }

    if (!tags.trim()) {
      setErrorMessage("Enter at least one tag.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("tags", tags);
    formData.append("terminateWithSemicolon", String(terminateWithSemicolon));

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatus("Writing metadata...");

    try {
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
        ) ?? selectedFile.name;

      triggerDownload(blob, downloadFilename);
      setStatus(`Downloaded ${downloadFilename}.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Upload failed unexpectedly.",
      );
      setStatus("Request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);

    if (file) {
      setStatus(`Selected ${file.name}.`);
      setErrorMessage(null);
    }
  }

  return (
    <main className="app-shell">
      <section className="app-panel">
        <header className="panel-header">
          <h1>Media Tagger</h1>
          <p className="lede">
            Upload a supported file, enter tags, and download the updated media
            with a canonical metadata payload.
          </p>
        </header>

        <form className="tagger-form" onSubmit={handleSubmit}>
          <label className="field-card" htmlFor="media-file">
            <span className="field-label">File</span>
            <span className="field-help">
              Supported formats: JPG, JPEG, PNG, WebP, GIF, MP4, and MOV.
            </span>
            <span className="file-picker-row">
              <span className="file-picker-button">Choose file</span>
              <span className="field-value file-name">
                {selectedFile ? selectedFile.name : "No file selected"}
              </span>
            </span>
            <input
              id="media-file"
              accept={ACCEPTED_FILE_TYPES}
              className="file-input"
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
            {isSubmitting ? "Writing metadata..." : "Tag and download"}
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
  anchor.click();

  URL.revokeObjectURL(objectUrl);
}
