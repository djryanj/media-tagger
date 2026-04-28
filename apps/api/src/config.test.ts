import { describe, expect, it } from "vitest";

import {
  DEFAULT_GIT_HASH,
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_IN_MEMORY_UPLOAD_LIMIT_BYTES,
  DEFAULT_VERSION,
  GIT_HASH_ENV_VAR,
  getServerRuntimeConfig,
  IN_MEMORY_UPLOAD_LIMIT_ENV_VAR,
  MAX_UPLOAD_BYTES_ENV_VAR,
  VERSION_ENV_VAR,
} from "./config.js";

describe("server runtime config", () => {
  it("defaults the in-memory upload limit to 512 MiB", () => {
    expect(getServerRuntimeConfig({})).toEqual({
      gitHash: DEFAULT_GIT_HASH,
      inMemoryUploadLimitBytes: DEFAULT_IN_MEMORY_UPLOAD_LIMIT_BYTES,
      maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
      version: DEFAULT_VERSION,
    });
  });

  it("reads the build metadata from the environment", () => {
    expect(
      getServerRuntimeConfig({
        [GIT_HASH_ENV_VAR]: "abc12345",
        [VERSION_ENV_VAR]: "0.3.0",
      }),
    ).toMatchObject({
      gitHash: "abc12345",
      version: "v0.3.0",
    });
  });

  it("reads the in-memory upload limit from the environment", () => {
    expect(
      getServerRuntimeConfig({
        [IN_MEMORY_UPLOAD_LIMIT_ENV_VAR]: "1048576",
      }).inMemoryUploadLimitBytes,
    ).toBe(1048576);
  });

  it("reads the maximum upload size from the environment", () => {
    expect(
      getServerRuntimeConfig({
        [MAX_UPLOAD_BYTES_ENV_VAR]: "2097152",
      }).maxUploadBytes,
    ).toBe(2097152);
  });

  it("falls back to the default when the environment value is invalid", () => {
    expect(getServerRuntimeConfig({
      [IN_MEMORY_UPLOAD_LIMIT_ENV_VAR]: "invalid",
      [MAX_UPLOAD_BYTES_ENV_VAR]: "invalid",
    })).toEqual({
      gitHash: DEFAULT_GIT_HASH,
      inMemoryUploadLimitBytes: DEFAULT_IN_MEMORY_UPLOAD_LIMIT_BYTES,
      maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
      version: DEFAULT_VERSION,
    });
  });

  it("clamps the in-memory threshold to the maximum upload size", () => {
    expect(
      getServerRuntimeConfig({
        [IN_MEMORY_UPLOAD_LIMIT_ENV_VAR]: "10485760",
        [MAX_UPLOAD_BYTES_ENV_VAR]: "1024",
      }).inMemoryUploadLimitBytes,
    ).toBe(1024);
  });
});