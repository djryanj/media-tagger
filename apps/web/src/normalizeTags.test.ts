import { describe, expect, it } from "vitest";

import { normalizeTags } from "./normalizeTags";

describe("normalizeTags", () => {
  it("splits on commas and new lines", () => {
    expect(normalizeTags("forest, timelapse\nsunrise")).toEqual([
      "forest",
      "timelapse",
      "sunrise",
    ]);
  });

  it("collapses whitespace and drops empty entries", () => {
    expect(normalizeTags("  big   trees ,,  \n , sunrise ")).toEqual([
      "big trees",
      "sunrise",
    ]);
  });

  it("removes case-insensitive duplicates", () => {
    expect(normalizeTags("Forest, forest, FOREST")).toEqual(["Forest"]);
  });

  it("expands a pipe cross-product", () => {
    expect(normalizeTags("big|huge trees")).toEqual(["big trees", "huge trees"]);
  });

  it("expands multiple pipe groups into every combination", () => {
    expect(normalizeTags("big|huge red|green trees")).toEqual([
      "big red trees",
      "big green trees",
      "huge red trees",
      "huge green trees",
    ]);
  });

  it("treats a blank pipe segment as an omitted word", () => {
    expect(normalizeTags("large trees|")).toEqual(["large", "large trees"]);
    expect(normalizeTags("large |trees")).toEqual(["large", "large trees"]);
  });

  it("returns an empty list for blank input", () => {
    expect(normalizeTags("")).toEqual([]);
    expect(normalizeTags("   \n , ")).toEqual([]);
  });
});
