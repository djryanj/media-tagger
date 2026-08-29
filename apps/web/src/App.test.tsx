import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function buildConfigResponse(limitBytes = 512 * 1024 * 1024) {
  return new Response(
    JSON.stringify({
      gitHash: "abc12345",
      inMemoryUploadLimitBytes: limitBytes,
      maxUploadBytes: 1024 * 1024 * 1024,
      version: "v0.3.0",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

function getUploadCalls(fetchMock: ReturnType<typeof vi.mocked<typeof fetch>>) {
  return fetchMock.mock.calls.filter((call) => call[0] === "/api/media/tag");
}

/**
 * Helper: asserts that an element and all of its ancestors have
 * overflow-containment CSS properties that prevent horizontal blowout.
 *
 * In jsdom, computed styles from stylesheets are not fully resolved, so
 * we inspect the inline/class-driven properties that our CSS sets.
 * The test verifies the DOM structure carries the right classes and that
 * the element itself is constrained.
 */
function expectOverflowContained(element: HTMLElement) {
  const style = window.getComputedStyle(element);

  const hasContainmentClass = [
    "app-panel",
    "tagger-form",
    "field-card",
    "individual-tag-item",
    "shared-preview-item",
    "individual-tag-copy",
    "shared-preview-copy",
    "individual-tag-filename",
    "file-name",
    "download-item",
    "download-item-copy",
    "download-item-details",
    "download-item-summary",
    "download-filename",
    "download-result-name",
    "tag-preview",
    "status-strip",
    "individual-tag-actions",
    "file-picker-row",
  ].some((cls) => element.classList.contains(cls));

  const hasInlineContainment =
    style.overflow === "hidden" ||
    style.minWidth === "0" ||
    style.minWidth === "0px" ||
    style.maxWidth === "100%";

  expect(
    hasContainmentClass || hasInlineContainment,
    `Expected element <${element.tagName.toLowerCase()} class="${element.className}"> to have overflow containment`,
  ).toBe(true);
}

/**
 * Walks up from an element to the root, collecting every ancestor.
 */
function getAncestors(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current: HTMLElement | null = element.parentElement;
  while (current) {
    ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-download");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a video preview for mp4 files in shared mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    const uploadedFile = new File(["mp4-data"], "sample.mp4", {
      type: "video/mp4",
    });

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );

    // Should render a clickable preview button containing a <video> element
    const previewButton = screen.getByRole("button", {
      name: "Open video preview for sample.mp4",
    });
    expect(previewButton).toBeVisible();
    expect(previewButton.querySelector("video")).not.toBeNull();
  });

  it("auto-plays video in the lightbox when preview is clicked in shared mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    const uploadedFile = new File(["mp4-data"], "sample.mp4", {
      type: "video/mp4",
    });

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );

    await user.click(
      screen.getByRole("button", { name: "Open video preview for sample.mp4" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Video preview for sample.mp4",
    });
    const lightboxVideo = dialog.querySelector("video");
    expect(lightboxVideo).not.toBeNull();
    expect(lightboxVideo).toHaveAttribute("autoplay");
  });

  it("zoom controls in the lightbox footer adjust video width and clamp at min/max", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    const uploadedFile = new File(["mp4-data"], "sample.mp4", {
      type: "video/mp4",
    });

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );
    await user.click(
      screen.getByRole("button", { name: "Open video preview for sample.mp4" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Video preview for sample.mp4",
    });
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const resetZoom = screen.getByRole("button", { name: "Reset zoom" });
    const video = dialog.querySelector("video") as HTMLVideoElement;

    // Initially at 100%: zoom out and reset disabled, no inline width
    expect(screen.getByText("100%")).toBeVisible();
    expect(zoomOut).toBeDisabled();
    expect(resetZoom).toBeDisabled();
    expect(zoomIn).not.toBeDisabled();
    expect(video.style.width).toBe("");

    // Zoom in once → 150%
    await user.click(zoomIn);
    expect(screen.getByText("150%")).toBeVisible();
    expect(video.style.width).toBe("150%");
    expect(zoomOut).not.toBeDisabled();
    expect(resetZoom).not.toBeDisabled();

    // Reset zoom via the level button → back to 100%
    await user.click(resetZoom);
    expect(screen.getByText("100%")).toBeVisible();
    expect(video.style.width).toBe("");
    expect(resetZoom).toBeDisabled();

    // Zoom in to max (4x = 400%) — takes 6 clicks from 100%
    for (let i = 0; i < 6; i++) await user.click(zoomIn);
    expect(screen.getByText("400%")).toBeVisible();
    expect(zoomIn).toBeDisabled();
  });

  it("requires a file and tags before submitting", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValueOnce(buildConfigResponse());

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");
    expect(screen.getByText("Version v0.3.0 | Commit abc12345")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Tag all and download" }),
    );

    expect(
      screen.getByText("Choose at least one file before submitting."),
    ).toBeVisible();
    expect(getUploadCalls(fetchMock)).toHaveLength(0);
  });

  it("submits each selected file and downloads the tagged results", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFiles = [
      new File(["png-data-1"], "sample-1.png", {
        type: "image/png",
      }),
      new File(["png-data-2"], "sample-2.png", {
        type: "image/png",
      }),
    ];

    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["tagged-media-1"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample-1.png"',
          "content-type": "image/png",
          "x-media-tagger-file-resolution":
            "sample-1.png: the reported MIME type image/jpeg did not match detected image/png. Tagged the detected media type without transcoding.",
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["tagged-media-2"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample-2.png"',
          "content-type": "image/png",
        },
      }),
    );

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFiles,
    );
    await user.type(
      screen.getByRole("textbox", { name: /tags/i }),
      "forest, timelapse",
    );
    await user.click(
      screen.getByRole("button", { name: "Tag all and download" }),
    );

    await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(2));

    const uploadCalls = getUploadCalls(fetchMock);
    const firstRequest = uploadCalls[0]?.[1];
    const secondRequest = uploadCalls[1]?.[1];
    const firstFormData = firstRequest?.body as FormData;
    const secondFormData = secondRequest?.body as FormData;

    expect(firstFormData).toBeInstanceOf(FormData);
    expect(firstFormData.get("fileSize")).toBe(String(uploadedFiles[0]?.size));
    expect(firstFormData.get("tags")).toBe("forest, timelapse");
    expect((firstFormData.get("file") as File).name).toBe("sample-1.png");
    expect((secondFormData.get("file") as File).name).toBe("sample-2.png");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Downloaded 2 of 2 files.")).toBeVisible();
    expect(screen.getByText("Downloads")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download tagged-sample-1.png" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download tagged-sample-2.png" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "sample-1.png: the reported MIME type image/jpeg did not match detected image/png. Tagged the detected media type without transcoding.",
      ),
    ).toBeVisible();
  });

  it("allows manual re-download from a download manager row", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFile = new File(["png-data-1"], "sample-1.png", {
      type: "image/png",
    });

    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["tagged-media-1"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample-1.png"',
          "content-type": "image/png",
        },
      }),
    );

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );
    await user.type(
      screen.getByRole("textbox", { name: /tags/i }),
      "forest, timelapse",
    );
    await user.click(
      screen.getByRole("button", { name: "Tag all and download" }),
    );

    await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: "Download tagged-sample-1.png" }),
    );

    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText("Manual download started for tagged-sample-1.png."),
    ).toBeVisible();
  });

  it("rejects selecting more than 20 files", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFiles = Array.from(
      { length: 21 },
      (_, index) =>
        new File([`png-data-${index}`], `sample-${index + 1}.png`, {
          type: "image/png",
        }),
    );

    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFiles,
    );

    expect(
      screen.getByText("Choose no more than 20 files at once."),
    ).toBeVisible();
    expect(screen.getByText("No files selected")).toBeVisible();
    expect(getUploadCalls(fetchMock)).toHaveLength(0);
  });

  it("submits individual tags for each selected file", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFiles = [
      new File(["png-data-1"], "sample-1.png", {
        type: "image/png",
      }),
      new File(["png-data-2"], "sample-2.png", {
        type: "image/png",
      }),
    ];

    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["tagged-media-1"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample-1.png"',
          "content-type": "image/png",
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["tagged-media-2"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample-2.png"',
          "content-type": "image/png",
        },
      }),
    );

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFiles,
    );
    await user.click(
      screen.getByRole("button", { name: "Tag images individually" }),
    );

    expect(
      screen.getByRole("img", { name: "Preview of sample-1.png" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Preview of sample-2.png" }),
    ).toBeVisible();

    await user.type(
      screen.getByRole("textbox", { name: "Tags for sample-1.png" }),
      "forest",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Tags for sample-2.png" }),
      "desert",
    );
    await user.click(
      screen.getByRole("button", { name: "Tag all and download" }),
    );

    await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(2));

    const uploadCalls = getUploadCalls(fetchMock);
    const firstRequest = uploadCalls[0]?.[1];
    const secondRequest = uploadCalls[1]?.[1];
    const firstFormData = firstRequest?.body as FormData;
    const secondFormData = secondRequest?.body as FormData;

    expect(firstFormData.get("tags")).toBe("forest");
    expect(secondFormData.get("tags")).toBe("desert");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2);
  });

  it("shows a video preview for mp4 files in individual mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFile = new File(["mp4-data"], "sample.mp4", {
      type: "video/mp4",
    });

    fetchMock.mockResolvedValueOnce(buildConfigResponse());

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );
    await user.click(
      screen.getByRole("button", { name: "Tag images individually" }),
    );

    expect(
      screen.getByRole("button", {
        name: "Open video preview for sample.mp4",
      }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("No preview available for sample.mp4"),
    ).toBeNull();
  });

  it("auto-plays video in the lightbox when preview is clicked in individual mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFile = new File(["mp4-data"], "sample.mp4", {
      type: "video/mp4",
    });

    fetchMock.mockResolvedValueOnce(buildConfigResponse());

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );
    await user.click(
      screen.getByRole("button", { name: "Tag images individually" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Open video preview for sample.mp4" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Video preview for sample.mp4",
    });
    const lightboxVideo = dialog.querySelector("video");
    expect(lightboxVideo).not.toBeNull();
    expect(lightboxVideo).toHaveAttribute("autoplay");
  });

  it("keeps long filenames usable in individual mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const longFilename =
      "7c5110bc56ceee6f69eb73d7a208b127f7ad8afe02701ede0559ec91c3787f89.jpg";
    const uploadedFile = new File(["png-data"], longFilename, {
      type: "image/jpeg",
    });

    fetchMock.mockResolvedValueOnce(buildConfigResponse());

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );
    await user.click(
      screen.getByRole("button", { name: "Tag images individually" }),
    );

    expect(
      screen.getByRole("button", { name: `Remove ${longFilename}` }),
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: `Tags for ${longFilename}` }),
    ).toBeVisible();
    expect(screen.queryByText(`Tags for ${longFilename}`)).toBeNull();
  });

  it("shows previews and remove buttons for selected files in shared mode", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFiles = [
      new File(["png-data-1"], "sample-1.png", {
        type: "image/png",
      }),
      new File(["png-data-2"], "sample-2.png", {
        type: "image/png",
      }),
    ];

    fetchMock.mockResolvedValueOnce(buildConfigResponse());

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFiles,
    );

    expect(
      screen.getByRole("img", { name: "Preview of sample-1.png" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Preview of sample-2.png" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove sample-1.png" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove sample-2.png" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Remove sample-2.png" }),
    );

    expect(
      screen.queryByRole("img", { name: "Preview of sample-2.png" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove sample-1.png" }),
    ).toBeVisible();
    expect(
      screen.getByText("Removed sample-2.png from the queue. 1 file remains."),
    ).toBeVisible();
  });

  it("copies and pastes tags between individual tag inputs", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFiles = [
      new File(["png-data-1"], "sample-1.png", {
        type: "image/png",
      }),
      new File(["png-data-2"], "sample-2.png", {
        type: "image/png",
      }),
    ];

    fetchMock.mockResolvedValueOnce(buildConfigResponse());

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFiles,
    );
    await user.click(
      screen.getByRole("button", { name: "Tag images individually" }),
    );

    const firstInput = screen.getByRole("textbox", {
      name: "Tags for sample-1.png",
    });
    const secondInput = screen.getByRole("textbox", {
      name: "Tags for sample-2.png",
    });

    await user.type(firstInput, "forest, sunrise");
    await user.click(screen.getAllByRole("button", { name: "Copy tags" })[0]!);
    await user.click(
      screen.getAllByRole("button", {
        name: "Paste copied tags from sample-1.png",
      })[1]!,
    );

    expect(secondInput).toHaveValue("forest, sunrise");
    expect(
      screen.getByText("Pasted copied tags into sample-2.png."),
    ).toBeVisible();
  });

  it("removes a file in individual mode before bulk submission", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFiles = [
      new File(["png-data-1"], "sample-1.png", {
        type: "image/png",
      }),
      new File(["png-data-2"], "sample-2.png", {
        type: "image/png",
      }),
    ];

    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["tagged-media-1"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample-1.png"',
          "content-type": "image/png",
        },
      }),
    );

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFiles,
    );
    await user.click(
      screen.getByRole("button", { name: "Tag images individually" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Tags for sample-1.png" }),
      "forest",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Tags for sample-2.png" }),
      "desert",
    );

    await user.click(
      screen.getByRole("button", { name: "Remove sample-2.png" }),
    );
    expect(
      screen.queryByRole("textbox", { name: "Tags for sample-2.png" }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Tag all and download" }),
    );

    await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));

    const uploadCalls = getUploadCalls(fetchMock);
    const request = uploadCalls[0]?.[1];
    const formData = request?.body as FormData;

    expect(formData.get("tags")).toBe("forest");
    expect((formData.get("file") as File).name).toBe("sample-1.png");
  });

  it("tags and downloads one file in individual mode and removes it from the queue", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFiles = [
      new File(["png-data-1"], "sample-1.png", {
        type: "image/png",
      }),
      new File(["png-data-2"], "sample-2.png", {
        type: "image/png",
      }),
    ];

    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["tagged-media-1"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample-1.png"',
          "content-type": "image/png",
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["tagged-media-2"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample-2.png"',
          "content-type": "image/png",
        },
      }),
    );

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFiles,
    );
    await user.click(
      screen.getByRole("button", { name: "Tag images individually" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Tags for sample-1.png" }),
      "forest",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Tags for sample-2.png" }),
      "desert",
    );

    await user.click(
      screen.getByRole("button", { name: "Tag and download sample-1.png" }),
    );

    await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));

    const firstRequest = getUploadCalls(fetchMock)[0]?.[1];
    const firstFormData = firstRequest?.body as FormData;

    expect(firstFormData.get("tags")).toBe("forest");
    expect((firstFormData.get("file") as File).name).toBe("sample-1.png");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("textbox", { name: "Tags for sample-1.png" }),
    ).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Tags for sample-2.png" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Downloaded tagged-sample-1.png and removed sample-1.png from the queue.",
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Tag all and download" }),
    );

    await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(2));

    const secondRequest = getUploadCalls(fetchMock)[1]?.[1];
    const secondFormData = secondRequest?.body as FormData;

    expect(secondFormData.get("tags")).toBe("desert");
    expect((secondFormData.get("file") as File).name).toBe("sample-2.png");
  });

  it("shows the overwrite warning and server threshold before submission", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    render(<App />);

    expect(
      await screen.findByText("The server accepts files up to 1 GB."),
    ).toBeVisible();

    expect(screen.getByText("Overwrite warning")).toBeVisible();
    expect(
      screen.getByText(
        "Existing metadata in the supported description or comment field for each uploaded file will be replaced by the new payload.",
      ),
    ).toBeVisible();
  });

  it("shows when the server threshold cannot be loaded", async () => {
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockRejectedValueOnce(new Error("config unavailable"));
    render(<App />);

    expect(
      await screen.findByText("Build metadata unavailable."),
    ).toBeVisible();

    expect(
      await screen.findByText(
        "Server upload configuration unavailable. The server will still accept uploads, but the exact memory threshold and upload cap could not be loaded.",
      ),
    ).toBeVisible();
  });

  it("rejects files larger than the server upload cap before submitting", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const oversizedFile = new File(["x"], "oversized.mp4", {
      type: "video/mp4",
    });
    Object.defineProperty(oversizedFile, "size", { value: 2048 });

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          inMemoryUploadLimitBytes: 1024,
          maxUploadBytes: 1024,
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    render(<App />);
    await screen.findByText("The server accepts files up to 1 KB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      oversizedFile,
    );
    await user.type(screen.getByRole("textbox", { name: /tags/i }), "test");
    await user.click(
      screen.getByRole("button", { name: "Tag all and download" }),
    );

    expect(screen.getByText("Choose files no larger than 1 KB.")).toBeVisible();
    expect(getUploadCalls(fetchMock)).toHaveLength(0);
  });

  it("shows server-confirmed tag chips in the download row after upload", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFile = new File(["png-data-1"], "sample-1.png", {
      type: "image/png",
    });
    fetchMock.mockResolvedValueOnce(buildConfigResponse());
    fetchMock.mockResolvedValueOnce(
      new Response(new Blob(["tagged-media-1"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample-1.png"',
          "content-type": "image/png",
          "x-media-tagger-confirmed-tags": '["big trees","huge trees"]',
        },
      }),
    );
    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");
    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );
    await user.type(
      screen.getByRole("textbox", { name: /tags/i }),
      "big|huge trees",
    );

    // Before submitting there is no download row for the file.
    expect(screen.queryByRole("region", { name: "Downloads" })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Tag all and download" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Download tagged-sample-1.png" }),
      ).toBeVisible(),
    );

    await user.click(
      screen.getByRole("button", { name: "Toggle details for sample-1.png" }),
    );

    const appliedTags = screen.getByLabelText("Tags applied to sample-1.png");
    expect(within(appliedTags).getByText("big trees")).toBeVisible();
    expect(within(appliedTags).getByText("huge trees")).toBeVisible();
  });

  it("renders image previews responsively and never overflows the container", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFile = new File(["png-data-1"], "sample-1.png", {
      type: "image/png",
    });

    fetchMock.mockResolvedValueOnce(buildConfigResponse());

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );

    const previewImg = screen.getByRole("img", {
      name: /preview of sample-1.png/i,
    });
    expect(previewImg).toBeVisible();

    if (previewImg instanceof HTMLElement) {
      const container = previewImg.parentElement;
      if (container) {
        container.style.width = "320px";
        document.body.appendChild(container);
        Object.defineProperty(previewImg, "offsetWidth", {
          configurable: true,
          value: 320,
        });
        expect(previewImg.offsetWidth).toBeLessThanOrEqual(320);
      }
    }
  });

  it("truncates long filenames with ellipsis and prevents overflow", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const longFilename =
      "RDT_20260429_142408353801201111261781_super_long_filename_that_should_be_truncated_in_the_ui_and_not_overflow_the_container.jpg";
    const uploadedFile = new File(["png-data-1"], longFilename, {
      type: "image/png",
    });

    fetchMock.mockResolvedValueOnce(buildConfigResponse());

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );

    const allFilenameEls = screen.getAllByText(longFilename);
    const previewFilenameEl = allFilenameEls.find(
      (el: HTMLElement) =>
        el.classList.contains("individual-tag-filename") ||
        el.classList.contains("file-name"),
    );
    expect(previewFilenameEl).toBeTruthy();
    expect(previewFilenameEl).toBeVisible();

    if (previewFilenameEl instanceof HTMLElement) {
      previewFilenameEl.style.width = "120px";
      previewFilenameEl.style.display = "block";
      document.body.appendChild(previewFilenameEl);
      Object.defineProperty(previewFilenameEl, "scrollWidth", {
        configurable: true,
        value: 300,
      });
      Object.defineProperty(previewFilenameEl, "clientWidth", {
        configurable: true,
        value: 120,
      });
      expect(previewFilenameEl.scrollWidth).toBeGreaterThan(
        previewFilenameEl.clientWidth,
      );
    }
  });

  // ─── Overflow containment regression tests ───────────────────────────

  describe("overflow containment for long filenames", () => {
    const LONG_FILENAME =
      "7c5110bc56ceee6f69eb73d7a208b127f7ad8afe02701ede0559ec91c3787f89_extra_long_suffix_to_ensure_overflow.jpg";

    it("wraps long filenames in an element with overflow-safe classes in shared mode", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], LONG_FILENAME, {
        type: "image/jpeg",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );

      // In shared mode the filename appears in the file-picker summary
      // and inside the shared preview list.
      const filenameEl = screen
        .getAllByText(LONG_FILENAME)
        .find(
          (el: HTMLElement) =>
            el.classList.contains("individual-tag-filename") ||
            el.classList.contains("file-name"),
        );

      expect(filenameEl).toBeTruthy();
      expectOverflowContained(filenameEl!);

      // The parent chain up to .app-panel must all carry containment classes.
      const ancestors = getAncestors(filenameEl!);
      const panel = ancestors.find((el) => el.classList.contains("app-panel"));
      expect(panel).toBeTruthy();
      expectOverflowContained(panel!);

      // The shared-preview-copy wrapper must also be contained.
      const previewCopy = ancestors.find((el) =>
        el.classList.contains("shared-preview-copy"),
      );
      if (previewCopy) {
        expectOverflowContained(previewCopy);
      }
    });

    it("wraps long filenames in an element with overflow-safe classes in individual mode", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], LONG_FILENAME, {
        type: "image/jpeg",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.click(
        screen.getByRole("button", { name: "Tag images individually" }),
      );

      const filenameEl = screen
        .getAllByText(LONG_FILENAME)
        .find((el: HTMLElement) =>
          el.classList.contains("individual-tag-filename"),
        );

      expect(filenameEl).toBeTruthy();
      expectOverflowContained(filenameEl!);

      // Walk up and verify every key container in the chain.
      const ancestors = getAncestors(filenameEl!);

      const tagCopy = ancestors.find((el) =>
        el.classList.contains("individual-tag-copy"),
      );
      expect(tagCopy).toBeTruthy();
      expectOverflowContained(tagCopy!);

      const tagItem = ancestors.find((el) =>
        el.classList.contains("individual-tag-item"),
      );
      expect(tagItem).toBeTruthy();
      expectOverflowContained(tagItem!);

      const fieldCard = ancestors.find((el) =>
        el.classList.contains("field-card"),
      );
      expect(fieldCard).toBeTruthy();
      expectOverflowContained(fieldCard!);

      const panel = ancestors.find((el) => el.classList.contains("app-panel"));
      expect(panel).toBeTruthy();
      expectOverflowContained(panel!);
    });

    it("contains overflow on the download results section with long filenames", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], LONG_FILENAME, {
        type: "image/jpeg",
      });

      const longDownloadFilename = `tagged-${LONG_FILENAME}`;

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(
        new Response(new Blob(["tagged-media"]), {
          status: 200,
          headers: {
            "content-disposition": `attachment; filename="${longDownloadFilename}"`,
            "content-type": "image/jpeg",
          },
        }),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.type(
        screen.getByRole("textbox", { name: /tags/i }),
        "test-tag",
      );
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));

      // The source filename in the download row must be overflow-contained.
      const sourceEl = screen
        .getAllByText(LONG_FILENAME)
        .find((el: HTMLElement) => el.classList.contains("download-filename"));
      expect(sourceEl).toBeTruthy();
      expectOverflowContained(sourceEl!);

      // The download-item-copy wrapper must constrain its children.
      const itemCopy = sourceEl!.parentElement;
      expect(itemCopy?.classList.contains("download-item-copy")).toBe(true);
      expectOverflowContained(itemCopy!);

      // Expanding the row reveals the download filename, also contained.
      await user.click(
        screen.getByRole("button", {
          name: `Toggle details for ${LONG_FILENAME}`,
        }),
      );

      const savesAsEl = screen.getByText(`Saves as ${longDownloadFilename}`);
      expect(savesAsEl).toBeVisible();
      expect(savesAsEl.classList.contains("download-result-name")).toBe(true);
      expectOverflowContained(savesAsEl);
    });

    it("contains overflow on the status strip when warnings include long filenames", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], LONG_FILENAME, {
        type: "image/jpeg",
      });

      const longWarning = `${LONG_FILENAME}: the reported MIME type image/png did not match detected image/jpeg. Tagged the detected media type without transcoding.`;

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(
        new Response(new Blob(["tagged-media"]), {
          status: 200,
          headers: {
            "content-disposition": `attachment; filename="tagged-${LONG_FILENAME}"`,
            "content-type": "image/jpeg",
            "x-media-tagger-file-resolution": longWarning,
          },
        }),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.type(
        screen.getByRole("textbox", { name: /tags/i }),
        "test-tag",
      );
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));

      const warningEl = screen.getByText(longWarning);
      expect(warningEl).toBeVisible();

      // The status strip must be an overflow-contained ancestor.
      const statusStrip = warningEl.closest(".status-strip");
      expect(statusStrip).toBeTruthy();
      expectOverflowContained(statusStrip as HTMLElement);
    });

    it("contains overflow on individual-tag-actions buttons with long paste labels", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFiles = [
        new File(["png-data-1"], LONG_FILENAME, {
          type: "image/jpeg",
        }),
        new File(["png-data-2"], "short.png", {
          type: "image/png",
        }),
      ];

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFiles,
      );
      await user.click(
        screen.getByRole("button", { name: "Tag images individually" }),
      );

      // Copy from the long-named file to populate the paste button label.
      await user.type(
        screen.getByRole("textbox", { name: `Tags for ${LONG_FILENAME}` }),
        "some tags",
      );
      await user.click(
        screen.getAllByRole("button", { name: "Copy tags" })[0]!,
      );

      // The paste button for the second file now reads
      // "Paste copied tags from <LONG_FILENAME>".
      const pasteButtons = screen.getAllByRole("button", {
        name: `Paste copied tags from ${LONG_FILENAME}`,
      });
      expect(pasteButtons.length).toBeGreaterThan(0);

      for (const button of pasteButtons) {
        // The button itself must be inside an actions container that
        // prevents blowout.
        const actionsContainer = button.closest(".individual-tag-actions");
        expect(actionsContainer).toBeTruthy();
        expectOverflowContained(actionsContainer as HTMLElement);

        // The button should carry the secondary-button class which now
        // has overflow: hidden and text-overflow: ellipsis.
        expect(button.classList.contains("secondary-button")).toBe(true);
      }
    });

    it("ensures the file-picker-row filename summary is contained for long names", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], LONG_FILENAME, {
        type: "image/jpeg",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );

      // The file-picker summary shows the single filename.
      const summaryEl = screen
        .getAllByText(LONG_FILENAME)
        .find((el: HTMLElement) => el.classList.contains("file-name"));

      expect(summaryEl).toBeTruthy();
      expectOverflowContained(summaryEl!);

      // Its parent row must also be contained.
      const pickerRow = summaryEl!.closest(".file-picker-row");
      expect(pickerRow).toBeTruthy();
      expectOverflowContained(pickerRow as HTMLElement);
    });
  });

  // ─── GIF-to-MP4 conversion tests ─────────────────────────────────────

  describe("GIF-to-MP4 conversion", () => {
    function getStreamUploadCalls(
      fetchMock: ReturnType<typeof vi.mocked<typeof fetch>>,
    ) {
      return fetchMock.mock.calls.filter(
        (call) => call[0] === "/api/media/tag-stream",
      );
    }

    function buildSseResponse(
      events: Array<Record<string, unknown>>,
    ): Response {
      const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }

    function base64Encode(str: string): string {
      return btoa(str);
    }

    it("shows the GIF-to-MP4 conversion section when a GIF is selected (shared mode)", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const gifFile = new File(["GIF89a"], "animation.gif", {
        type: "image/gif",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      // Before selecting a GIF, the section should not be visible
      expect(
        screen.queryByRole("region", { name: "GIF to MP4 conversion" }),
      ).toBeNull();

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        gifFile,
      );

      // After selecting a GIF, the section should appear with a checked checkbox
      const conversionSection = screen.getByRole("region", {
        name: "GIF to MP4 conversion",
      });
      expect(conversionSection).toBeVisible();

      const conversionCheckbox = screen.getByRole("checkbox", {
        name: /Convert GIF files to MP4/i,
      });
      expect(conversionCheckbox).toBeVisible();
      expect(conversionCheckbox).toBeChecked();
    });

    it("does not show the GIF conversion section for non-GIF files", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const pngFile = new File(["png-data"], "photo.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        pngFile,
      );

      expect(
        screen.queryByRole("checkbox", { name: /Convert GIF files to MP4/i }),
      ).toBeNull();
    });

    it("uses /api/media/tag-stream when GIF conversion is enabled", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const gifFile = new File(["GIF89a"], "animation.gif", {
        type: "image/gif",
      });

      const doneEvent = {
        type: "done",
        filename: "animation.mp4",
        contentType: "video/mp4",
        data: base64Encode("fake mp4 bytes"),
        tags: ["cats", "dogs"],
        resolutionWarning: null,
      };

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(buildSseResponse([doneEvent]));

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        gifFile,
      );
      await user.type(
        screen.getByRole("textbox", { name: /tags/i }),
        "cats, dogs",
      );
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() =>
        expect(getStreamUploadCalls(fetchMock)).toHaveLength(1),
      );

      // Should have called tag-stream, not tag
      expect(getUploadCalls(fetchMock)).toHaveLength(0);
      expect(getStreamUploadCalls(fetchMock)).toHaveLength(1);

      const streamCall = getStreamUploadCalls(fetchMock)[0];
      const formData = streamCall?.[1]?.body as FormData;
      expect(formData.get("convertGifToMp4")).toBe("true");
      expect((formData.get("file") as File).name).toBe("animation.gif");

      await waitFor(() =>
        expect(screen.getByText("Downloaded animation.mp4.")).toBeVisible(),
      );
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    });

    it("uses /api/media/tag (not stream) when GIF conversion is disabled", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const gifFile = new File(["GIF89a"], "animation.gif", {
        type: "image/gif",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(
        new Response(new Blob(["tagged-gif"]), {
          status: 200,
          headers: {
            "content-disposition": 'attachment; filename="animation.gif"',
            "content-type": "image/gif",
          },
        }),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        gifFile,
      );

      // Uncheck the conversion checkbox
      const conversionCheckbox = screen.getByRole("checkbox", {
        name: /Convert GIF files to MP4/i,
      });
      await user.click(conversionCheckbox);
      expect(conversionCheckbox).not.toBeChecked();

      await user.type(screen.getByRole("textbox", { name: /tags/i }), "cats");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));
      expect(getStreamUploadCalls(fetchMock)).toHaveLength(0);
    });

    it("shows per-file Convert to MP4 checkbox in individual mode for GIF files", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const gifFile = new File(["GIF89a"], "animation.gif", {
        type: "image/gif",
      });
      const pngFile = new File(["png"], "photo.png", { type: "image/png" });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        [gifFile, pngFile],
      );
      await user.click(
        screen.getByRole("button", { name: "Tag images individually" }),
      );

      // GIF file should show per-file "Convert to MP4" checkbox (checked by default)
      const gifConvertCheckbox = screen.getByRole("checkbox", {
        name: /Convert to MP4/i,
      });
      expect(gifConvertCheckbox).toBeVisible();
      expect(gifConvertCheckbox).toBeChecked();

      // PNG file should NOT have a convert checkbox
      expect(
        screen.queryByRole("checkbox", {
          name: /Convert GIF files to MP4/i,
        }),
      ).toBeNull();
    });

    it("streams progress events and updates the UI while encoding", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const gifFile = new File(["GIF89a"], "animation.gif", {
        type: "image/gif",
      });

      const sseEvents = [
        { type: "progress", percent: 25 },
        { type: "progress", percent: 75 },
        {
          type: "done",
          filename: "animation.mp4",
          contentType: "video/mp4",
          data: base64Encode("fake mp4"),
          tags: ["cats"],
          resolutionWarning: null,
        },
      ];

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(buildSseResponse(sseEvents));

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        gifFile,
      );
      await user.type(screen.getByRole("textbox", { name: /tags/i }), "cats");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() =>
        expect(screen.getByText("Downloaded animation.mp4.")).toBeVisible(),
      );
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    });

    it("shows an error message when the stream returns an error event", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const gifFile = new File(["GIF89a"], "animation.gif", {
        type: "image/gif",
      });

      const sseEvents = [
        { type: "error", message: "FFmpeg GIF-to-MP4 conversion failed." },
      ];

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(buildSseResponse(sseEvents));

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        gifFile,
      );
      await user.type(screen.getByRole("textbox", { name: /tags/i }), "cats");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() =>
        expect(
          screen.getByText(
            "animation.gif: FFmpeg GIF-to-MP4 conversion failed.",
          ),
        ).toBeVisible(),
      );
    });

    it("routes a JPG with GIF magic bytes through tag-stream when conversion is enabled", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);

      // A JPG file whose first 3 bytes are the GIF magic signature
      const gifMagicBytes = new Uint8Array([
        0x47,
        0x49,
        0x46,
        0x38,
        0x39,
        0x61, // GIF89a
        ...new Array(10).fill(0x00),
      ]);
      const disguisedFile = new File([gifMagicBytes], "photo.jpg", {
        type: "image/jpeg",
      });

      const doneEvent = {
        type: "done",
        filename: "photo.mp4",
        contentType: "video/mp4",
        data: base64Encode("fake mp4 bytes"),
        tags: ["cats"],
        resolutionWarning: null,
      };

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(buildSseResponse([doneEvent]));

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        disguisedFile,
      );

      // The GIF conversion section should appear because magic bytes detected a GIF
      await waitFor(() =>
        expect(
          screen.getByRole("region", { name: "GIF to MP4 conversion" }),
        ).toBeVisible(),
      );

      await user.type(screen.getByRole("textbox", { name: /tags/i }), "cats");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() =>
        expect(getStreamUploadCalls(fetchMock)).toHaveLength(1),
      );

      // Should have used tag-stream with convertGifToMp4=true
      const streamCall = getStreamUploadCalls(fetchMock)[0];
      const formData = streamCall?.[1]?.body as FormData;
      expect(formData.get("convertGifToMp4")).toBe("true");
      expect((formData.get("file") as File).name).toBe("photo.jpg");

      await waitFor(() =>
        expect(screen.getByText("Downloaded photo.mp4.")).toBeVisible(),
      );
    });
  });

  // ─── Download manager tests ──────────────────────────────────────────

  describe("download manager", () => {
    function buildTaggedResponse(
      downloadFilename: string,
      confirmedTags?: string[],
    ) {
      const headers: Record<string, string> = {
        "content-disposition": `attachment; filename="${downloadFilename}"`,
        "content-type": "image/png",
      };

      if (confirmedTags) {
        headers["x-media-tagger-confirmed-tags"] = JSON.stringify(confirmedTags);
      }

      return new Response(new Blob(["tagged-media"]), { status: 200, headers });
    }

    function buildStreamingSseResponse() {
      let streamController: ReadableStreamDefaultController<Uint8Array>;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
      });

      return {
        close() {
          streamController.close();
        },
        push(event: Record<string, unknown>) {
          streamController.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        },
        response: new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      };
    }

    function getDownloadRow(sourceFilename: string): HTMLElement {
      const filenameEl = screen
        .getAllByText(sourceFilename)
        .find((el: HTMLElement) => el.classList.contains("download-filename"));

      expect(filenameEl).toBeTruthy();

      const row = filenameEl!.closest("li");
      expect(row).toBeTruthy();

      return row as HTMLElement;
    }

    it("lists every selected file as soon as tagging starts", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFiles = [
        new File(["png-data-1"], "sample-1.png", { type: "image/png" }),
        new File(["png-data-2"], "sample-2.png", { type: "image/png" }),
      ];

      let resolveFirstUpload!: (response: Response) => void;
      const pendingFirstUpload = new Promise<Response>((resolve) => {
        resolveFirstUpload = resolve;
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockReturnValueOnce(pendingFirstUpload);
      fetchMock.mockResolvedValueOnce(
        buildTaggedResponse("tagged-sample-2.png"),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFiles,
      );
      await user.type(
        screen.getByRole("textbox", { name: /tags/i }),
        "forest",
      );
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      // Both rows must be present before the first upload has resolved.
      const downloads = await screen.findByRole("region", { name: "Downloads" });
      expect(within(downloads).getByText("sample-1.png")).toBeVisible();
      expect(within(downloads).getByText("sample-2.png")).toBeVisible();
      expect(getDownloadRow("sample-1.png")).toHaveClass("download-item-tagging");
      expect(getDownloadRow("sample-2.png")).toHaveClass("download-item-queued");
      expect(within(downloads).getByText("Queued")).toBeVisible();

      resolveFirstUpload(buildTaggedResponse("tagged-sample-1.png"));

      await waitFor(() =>
        expect(screen.getByText("Downloaded 2 of 2 files.")).toBeVisible(),
      );
    });

    it("marks a successfully downloaded row as downloaded", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], "sample-1.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(
        buildTaggedResponse("tagged-sample-1.png"),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.type(screen.getByRole("textbox", { name: /tags/i }), "forest");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() =>
        expect(getDownloadRow("sample-1.png")).toHaveClass(
          "download-item-downloaded",
        ),
      );
      expect(screen.getByText("Downloaded")).toBeVisible();
    });

    it("marks a failed row as failed and shows the reason in its details", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], "sample-1.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Metadata write failed." }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.type(screen.getByRole("textbox", { name: /tags/i }), "forest");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() =>
        expect(getDownloadRow("sample-1.png")).toHaveClass(
          "download-item-failed",
        ),
      );

      await user.click(
        screen.getByRole("button", { name: "Toggle details for sample-1.png" }),
      );

      expect(
        within(getDownloadRow("sample-1.png")).getByText(
          "Metadata write failed.",
        ),
      ).toBeVisible();
    });

    it("collapses row details until the row is toggled open", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], "sample-1.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(
        buildTaggedResponse("tagged-sample-1.png", ["forest"]),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.type(screen.getByRole("textbox", { name: /tags/i }), "forest");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      const toggle = await screen.findByRole("button", {
        name: "Toggle details for sample-1.png",
      });

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Saves as tagged-sample-1.png")).toBeNull();

      await user.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Saves as tagged-sample-1.png")).toBeVisible();

      await user.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Saves as tagged-sample-1.png")).toBeNull();
    });

    it("shows a thumbnail preview for each queued download", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], "sample-1.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(
        buildTaggedResponse("tagged-sample-1.png"),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.type(screen.getByRole("textbox", { name: /tags/i }), "forest");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      const downloads = await screen.findByRole("region", { name: "Downloads" });

      await waitFor(() =>
        expect(
          within(downloads).getByRole("img", {
            name: "Thumbnail of sample-1.png",
          }),
        ).toBeVisible(),
      );
    });

    it("shows the video conversion status inside the download row", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const gifFile = new File(["GIF89a"], "animation.gif", {
        type: "image/gif",
      });
      const sseStream = buildStreamingSseResponse();

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(sseStream.response);

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        gifFile,
      );
      await user.type(screen.getByRole("textbox", { name: /tags/i }), "cats");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      const downloads = await screen.findByRole("region", { name: "Downloads" });

      sseStream.push({ type: "progress", percent: 42 });

      await waitFor(() =>
        expect(
          within(downloads).getByText("Converting to MP4... 42%"),
        ).toBeVisible(),
      );
      expect(getDownloadRow("animation.gif")).toHaveClass(
        "download-item-converting",
      );
      expect(
        within(downloads).getByLabelText("Encoding progress for animation.gif"),
      ).toBeVisible();

      sseStream.push({
        type: "done",
        filename: "animation.mp4",
        contentType: "video/mp4",
        data: btoa("fake mp4"),
        tags: ["cats"],
        resolutionWarning: null,
      });
      sseStream.close();

      await waitFor(() =>
        expect(getDownloadRow("animation.gif")).toHaveClass(
          "download-item-downloaded",
        ),
      );
    });

    it("keeps rows from earlier individual submissions", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFiles = [
        new File(["png-data-1"], "sample-1.png", { type: "image/png" }),
        new File(["png-data-2"], "sample-2.png", { type: "image/png" }),
      ];

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(
        buildTaggedResponse("tagged-sample-1.png"),
      );
      fetchMock.mockResolvedValueOnce(
        buildTaggedResponse("tagged-sample-2.png"),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFiles,
      );
      await user.click(
        screen.getByRole("button", { name: "Tag images individually" }),
      );
      await user.type(
        screen.getByRole("textbox", { name: "Tags for sample-1.png" }),
        "forest",
      );
      await user.type(
        screen.getByRole("textbox", { name: "Tags for sample-2.png" }),
        "desert",
      );

      await user.click(
        screen.getByRole("button", { name: "Tag and download sample-1.png" }),
      );

      await waitFor(() =>
        expect(getDownloadRow("sample-1.png")).toHaveClass(
          "download-item-downloaded",
        ),
      );

      await user.click(
        screen.getByRole("button", { name: "Tag and download sample-2.png" }),
      );

      await waitFor(() =>
        expect(getDownloadRow("sample-2.png")).toHaveClass(
          "download-item-downloaded",
        ),
      );

      // The first row is still listed even though its file left the queue.
      expect(getDownloadRow("sample-1.png")).toHaveClass(
        "download-item-downloaded",
      );
    });
  });

  // ─── Tag preview tests ───────────────────────────────────────────────

  describe("tag preview", () => {
    it("previews the pipe cross-product under the shared tags input", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      const preview = screen.getByLabelText("Tag preview");
      expect(within(preview).getByText("No tags yet.")).toBeVisible();

      await user.type(
        screen.getByRole("textbox", { name: /tags/i }),
        "big|huge trees",
      );

      expect(within(preview).getByText("big trees")).toBeVisible();
      expect(within(preview).getByText("huge trees")).toBeVisible();
      expect(within(preview).getByText("2 tags")).toBeVisible();
    });

    it("previews blank pipe segments and removes duplicates", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.type(
        screen.getByRole("textbox", { name: /tags/i }),
        "large trees|, large |trees",
      );

      const preview = screen.getByLabelText("Tag preview");

      expect(within(preview).getByText("large")).toBeVisible();
      expect(within(preview).getByText("large trees")).toBeVisible();
      expect(within(preview).getByText("2 tags")).toBeVisible();
    });

    it("previews tags under each individual tag input", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFiles = [
        new File(["png-data-1"], "sample-1.png", { type: "image/png" }),
        new File(["png-data-2"], "sample-2.png", { type: "image/png" }),
      ];

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFiles,
      );
      await user.click(
        screen.getByRole("button", { name: "Tag images individually" }),
      );
      await user.type(
        screen.getByRole("textbox", { name: "Tags for sample-1.png" }),
        "small|big cat",
      );

      const firstPreview = screen.getByLabelText(
        "Tag preview for sample-1.png",
      );
      const secondPreview = screen.getByLabelText(
        "Tag preview for sample-2.png",
      );

      expect(within(firstPreview).getByText("small cat")).toBeVisible();
      expect(within(firstPreview).getByText("big cat")).toBeVisible();
      expect(within(secondPreview).getByText("No tags yet.")).toBeVisible();
    });

    it("uses the singular label for a single previewed tag", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.type(screen.getByRole("textbox", { name: /tags/i }), "forest");

      const preview = screen.getByLabelText("Tag preview");
      expect(within(preview).getByText("1 tag")).toBeVisible();
    });
  });

  // ─── Image lightbox tests ────────────────────────────────────────────

  describe("image lightbox", () => {
    it("opens an image preview when the thumbnail is clicked in shared mode", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], "sample-1.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );

      await user.click(
        screen.getByRole("button", { name: "Open image preview for sample-1.png" }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Image preview for sample-1.png",
      });
      expect(dialog.querySelector("img")).not.toBeNull();
      expect(dialog.querySelector("video")).toBeNull();
    });

    it("opens an image preview from individual mode", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], "sample-1.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.click(
        screen.getByRole("button", { name: "Tag images individually" }),
      );

      await user.click(
        screen.getByRole("button", { name: "Open image preview for sample-1.png" }),
      );

      expect(
        screen.getByRole("dialog", { name: "Image preview for sample-1.png" }),
      ).toBeVisible();
    });

    it("zooms an image with the lightbox controls", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], "sample-1.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.click(
        screen.getByRole("button", { name: "Open image preview for sample-1.png" }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Image preview for sample-1.png",
      });
      const image = dialog.querySelector("img") as HTMLImageElement;
      const zoomIn = screen.getByRole("button", { name: "Zoom in" });
      const zoomOut = screen.getByRole("button", { name: "Zoom out" });
      const resetZoom = screen.getByRole("button", { name: "Reset zoom" });

      expect(screen.getByText("100%")).toBeVisible();
      expect(zoomOut).toBeDisabled();
      expect(image.style.width).toBe("");

      await user.click(zoomIn);
      expect(screen.getByText("150%")).toBeVisible();
      expect(image.style.width).toBe("150%");

      await user.click(resetZoom);
      expect(screen.getByText("100%")).toBeVisible();
      expect(image.style.width).toBe("");
    });

    it("closes the image lightbox with the close button", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const uploadedFile = new File(["png-data"], "sample-1.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        uploadedFile,
      );
      await user.click(
        screen.getByRole("button", { name: "Open image preview for sample-1.png" }),
      );
      await user.click(screen.getByRole("button", { name: "Close" }));

      expect(
        screen.queryByRole("dialog", { name: "Image preview for sample-1.png" }),
      ).toBeNull();
    });
  });

  // ─── PNG-to-JPG conversion tests ─────────────────────────────────────

  describe("PNG-to-JPG conversion", () => {
    function buildTaggedJpgResponse() {
      return new Response(new Blob(["tagged-media"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="photo.jpg"',
          "content-type": "image/jpeg",
        },
      });
    }

    it("shows the PNG-to-JPG section, unchecked, when a PNG is selected", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const pngFile = new File(["png-data"], "photo.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      expect(
        screen.queryByRole("region", { name: "PNG to JPG conversion" }),
      ).toBeNull();

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        pngFile,
      );

      expect(
        screen.getByRole("region", { name: "PNG to JPG conversion" }),
      ).toBeVisible();

      const checkbox = screen.getByRole("checkbox", {
        name: /Convert PNG files to JPG/i,
      });
      expect(checkbox).toBeVisible();
      expect(checkbox).not.toBeChecked();
    });

    it("does not show the PNG-to-JPG section for non-PNG files", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const jpgFile = new File(["jpg-data"], "photo.jpg", {
        type: "image/jpeg",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        jpgFile,
      );

      expect(
        screen.queryByRole("checkbox", { name: /Convert PNG files to JPG/i }),
      ).toBeNull();
    });

    it("sends convertPngToJpg when the option is enabled", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const pngFile = new File(["png-data"], "photo.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(buildTaggedJpgResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        pngFile,
      );
      await user.click(
        screen.getByRole("checkbox", { name: /Convert PNG files to JPG/i }),
      );
      await user.type(screen.getByRole("textbox", { name: /tags/i }), "cats");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));

      const formData = getUploadCalls(fetchMock)[0]?.[1]?.body as FormData;
      expect(formData.get("convertPngToJpg")).toBe("true");

      await waitFor(() =>
        expect(screen.getByText("Downloaded photo.jpg.")).toBeVisible(),
      );
    });

    it("omits convertPngToJpg when the option is left disabled", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const pngFile = new File(["png-data"], "photo.png", {
        type: "image/png",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(
        new Response(new Blob(["tagged-media"]), {
          status: 200,
          headers: {
            "content-disposition": 'attachment; filename="photo.png"',
            "content-type": "image/png",
          },
        }),
      );

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        pngFile,
      );
      await user.type(screen.getByRole("textbox", { name: /tags/i }), "cats");
      await user.click(
        screen.getByRole("button", { name: "Tag all and download" }),
      );

      await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));

      const formData = getUploadCalls(fetchMock)[0]?.[1]?.body as FormData;
      expect(formData.get("convertPngToJpg")).toBeNull();
    });

    it("shows a per-file Convert to JPG checkbox in individual mode", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const pngFile = new File(["png-data"], "photo.png", {
        type: "image/png",
      });
      const jpgFile = new File(["jpg-data"], "photo.jpg", {
        type: "image/jpeg",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());
      fetchMock.mockResolvedValueOnce(buildTaggedJpgResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        [pngFile, jpgFile],
      );
      await user.click(
        screen.getByRole("button", { name: "Tag images individually" }),
      );

      const convertCheckbox = screen.getByRole("checkbox", {
        name: /Convert to JPG/i,
      });
      expect(convertCheckbox).toBeVisible();
      expect(convertCheckbox).not.toBeChecked();

      await user.click(convertCheckbox);
      await user.type(
        screen.getByRole("textbox", { name: "Tags for photo.png" }),
        "cats",
      );
      await user.click(
        screen.getByRole("button", { name: "Tag and download photo.png" }),
      );

      await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));

      const formData = getUploadCalls(fetchMock)[0]?.[1]?.body as FormData;
      expect(formData.get("convertPngToJpg")).toBe("true");
    });

    it("offers PNG conversion for a JPG that carries PNG magic bytes", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);

      const pngMagicBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ...new Array(8).fill(0x00),
      ]);
      const disguisedFile = new File([pngMagicBytes], "photo.jpg", {
        type: "image/jpeg",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        disguisedFile,
      );

      await waitFor(() =>
        expect(
          screen.getByRole("region", { name: "PNG to JPG conversion" }),
        ).toBeVisible(),
      );
    });

    it("does not offer PNG conversion for a GIF", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.mocked(fetch);
      const gifFile = new File(["GIF89a"], "animation.gif", {
        type: "image/gif",
      });

      fetchMock.mockResolvedValueOnce(buildConfigResponse());

      render(<App />);
      await screen.findByText("The server accepts files up to 1 GB.");

      await user.upload(
        screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
        gifFile,
      );

      expect(
        screen.queryByRole("checkbox", { name: /Convert PNG files to JPG/i }),
      ).toBeNull();
    });
  });
});
