import { render, screen, waitFor } from "@testing-library/react";
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
  return fetchMock.mock.calls.filter(([input]) => input === "/api/media/tag");
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

  it("requires a file and tags before submitting", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValueOnce(buildConfigResponse());

    render(<App />);
    await screen.findByText("The server accepts files up to 1 GB.");
    expect(screen.getByText("Version v0.3.0 | Commit abc12345")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Tag and download files" }),
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
      screen.getByRole("button", { name: "Tag and download files" }),
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
    expect(screen.getByText("Processed files")).toBeVisible();
    expect(screen.getByText("Saves as tagged-sample-1.png")).toBeVisible();
    expect(screen.getByText("Saves as tagged-sample-2.png")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Download" })).toHaveLength(2);
    expect(
      screen.getByText(
        "sample-1.png: the reported MIME type image/jpeg did not match detected image/png. Tagged the detected media type without transcoding.",
      ),
    ).toBeVisible();
  });

  it("allows manual re-download of processed files", async () => {
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
      screen.getByRole("button", { name: "Tag and download files" }),
    );

    await waitFor(() => expect(getUploadCalls(fetchMock)).toHaveLength(1));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Download" }));

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
      screen.getByRole("button", { name: "Tag and download files" }),
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
      screen.getByRole("button", { name: "Tag and download files" }),
    );

    expect(screen.getByText("Choose files no larger than 1 KB.")).toBeVisible();
    expect(getUploadCalls(fetchMock)).toHaveLength(0);
  });

  // The chips are now only shown after upload, so this test is obsolete.

  it("shows tag chips only after upload with confirmed tags", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFile = new File(["png-data-1"], "sample-1.png", {
      type: "image/png",
    });
    // Simulate server returning confirmed tags
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
    // Chips should not show before upload
    expect(screen.queryByText("big trees")).toBeNull();
    expect(screen.queryByText("huge trees")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Tag and download files" }),
    );
    // Chips should show after upload
    await waitFor(() => expect(screen.getByText("big trees")).toBeVisible());
    expect(screen.getByText("huge trees")).toBeVisible();
  });
});
