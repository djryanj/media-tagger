import { describe, expect, it } from "vitest";

import {
  parseDeclaredFileSize,
  shouldBufferUploadInMemory,
} from "./upload.js";

describe("upload helpers", () => {
  it("parses a declared file size from the request", () => {
    expect(parseDeclaredFileSize("1234")).toBe(1234);
  });

  it("rejects missing or invalid declared file sizes", () => {
    expect(parseDeclaredFileSize(undefined)).toBeNull();
    expect(parseDeclaredFileSize("-1")).toBeNull();
    expect(parseDeclaredFileSize("not-a-number")).toBeNull();
  });

  it("only chooses the in-memory path when the declared size is within the limit", () => {
    expect(shouldBufferUploadInMemory(1024, 2048)).toBe(true);
    expect(shouldBufferUploadInMemory(4096, 2048)).toBe(false);
    expect(shouldBufferUploadInMemory(null, 2048)).toBe(false);
  });
});