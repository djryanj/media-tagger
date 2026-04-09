import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

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

    render(<App />);

    await user.click(
      screen.getByRole("button", { name: "Tag and download files" }),
    );

    expect(
      screen.getByText("Choose at least one file before submitting."),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
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

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFiles,
    );
    await user.type(
      screen.getByRole("textbox", { name: /tags/i }),
      "forest, timelapse",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /terminate with semicolon/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Tag and download files" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const firstRequest = fetchMock.mock.calls[0]?.[1];
    const secondRequest = fetchMock.mock.calls[1]?.[1];
    const firstFormData = firstRequest?.body as FormData;
    const secondFormData = secondRequest?.body as FormData;

    expect(firstFormData).toBeInstanceOf(FormData);
    expect(firstFormData.get("tags")).toBe("forest, timelapse");
    expect(firstFormData.get("terminateWithSemicolon")).toBe("true");
    expect((firstFormData.get("file") as File).name).toBe("sample-1.png");
    expect((secondFormData.get("file") as File).name).toBe("sample-2.png");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Downloaded 2 of 2 files.")).toBeVisible();
  });

  it("rejects selecting more than 10 files", async () => {
    const user = userEvent.setup();
    const uploadedFiles = Array.from(
      { length: 11 },
      (_, index) =>
        new File([`png-data-${index}`], `sample-${index + 1}.png`, {
          type: "image/png",
        }),
    );

    render(<App />);

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFiles,
    );

    expect(
      screen.getByText("Choose no more than 10 files at once."),
    ).toBeVisible();
    expect(screen.getByText("No files selected")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
});
