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

  it("expands tags with pipes anywhere in the tag", () => {
    expect(normalizeTags("big|huge trees")).toEqual([
      "big trees",
      "huge trees",
    ]);
    expect(normalizeTags("trees big|huge")).toEqual([
      "trees big",
      "trees huge",
    ]);
    expect(normalizeTags("trees big|huge flowers")).toEqual([
      "trees big flowers",
      "trees huge flowers",
    ]);
    expect(normalizeTags("red|blue|green flowers,small|large pots")).toEqual([
      "red flowers",
      "blue flowers",
      "green flowers",
      "small pots",
      "large pots",
    ]);
    expect(normalizeTags("a|b|c d|e")).toEqual([
      "a d",
      "a e",
      "b d",
      "b e",
      "c d",
      "c e",
    ]);
    expect(normalizeTags("big|huge trees, big|huge flowers")).toEqual([
      "big trees",
      "huge trees",
      "big flowers",
      "huge flowers",
    ]);
    expect(normalizeTags("big|huge trees, big trees")).toEqual([
      "big trees",
      "huge trees",
    ]); // dedupes
  });

  it("renders the canonical payload", () => {
    expect(renderPayload(["cats", "dogs"])).toBe("tags:cats,dogs");
  });
});
