import { describe, expect, it } from "vitest";

import {
  normalizeTags,
  parseTerminateWithSemicolon,
  renderPayload,
} from "./tags.js";

describe("tag payload helpers", () => {
  it("normalizes whitespace and removes duplicates", () => {
    expect(normalizeTags(" cats, dogs ,Cats\nsmall   birds ")).toEqual([
      "cats",
      "dogs",
      "small birds",
    ]);
  });

  it("renders the canonical payload", () => {
    expect(renderPayload(["cats", "dogs"], false)).toBe("tags:cats,dogs");
    expect(renderPayload(["cats", "dogs"], true)).toBe("tags:cats,dogs;");
  });

  it("parses truthy semicolon toggle values", () => {
    expect(parseTerminateWithSemicolon("true")).toBe(true);
    expect(parseTerminateWithSemicolon("on")).toBe(true);
    expect(parseTerminateWithSemicolon("false")).toBe(false);
    expect(parseTerminateWithSemicolon(undefined)).toBe(false);
  });
});
