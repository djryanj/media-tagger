import { describe, expect, it } from "vitest";

import { normalizeTags, renderPayload } from "./tags.js";

describe("tag payload helpers", () => {
  it("normalizes whitespace and removes duplicates", () => {
    expect(normalizeTags(" cats, dogs ,Cats\nsmall   birds ")).toEqual([
      "cats",
      "dogs",
      "small birds",
    ]);
  });

  it("renders the canonical payload", () => {
    expect(renderPayload(["cats", "dogs"])).toBe("tags:cats,dogs");
  });
});
