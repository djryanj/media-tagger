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

    await user.click(screen.getByRole("button", { name: "Tag and download" }));

    expect(screen.getByText("Choose a file before submitting.")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("submits the selected file and downloads the tagged result", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const uploadedFile = new File(["png-data"], "sample.png", {
      type: "image/png",
    });

    fetchMock.mockResolvedValue(
      new Response(new Blob(["tagged-media"]), {
        status: 200,
        headers: {
          "content-disposition": 'attachment; filename="tagged-sample.png"',
          "content-type": "image/png",
        },
      }),
    );

    render(<App />);

    await user.upload(
      screen.getByLabelText(/file/i, { selector: 'input[type="file"]' }),
      uploadedFile,
    );
    await user.type(
      screen.getByRole("textbox", { name: /tags/i }),
      "forest, timelapse",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /terminate with semicolon/i }),
    );
    await user.click(screen.getByRole("button", { name: "Tag and download" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const formData = requestInit?.body;

    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get("tags")).toBe("forest, timelapse");
    expect((formData as FormData).get("terminateWithSemicolon")).toBe("true");
    expect(screen.getByText("Downloaded tagged-sample.png.")).toBeVisible();
  });
});
