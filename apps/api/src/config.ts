export const IN_MEMORY_UPLOAD_LIMIT_ENV_VAR =
  "MEDIA_TAGGER_IN_MEMORY_UPLOAD_LIMIT_BYTES";
export const MAX_UPLOAD_BYTES_ENV_VAR = "MEDIA_TAGGER_MAX_UPLOAD_BYTES";
export const VERSION_ENV_VAR = "MEDIA_TAGGER_VERSION";
export const GIT_HASH_ENV_VAR = "MEDIA_TAGGER_GIT_HASH";
export const DEFAULT_IN_MEMORY_UPLOAD_LIMIT_BYTES = 512 * 1024 * 1024;
export const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_VERSION = "v0.0.0-dev";
export const DEFAULT_GIT_HASH = "unknown";

export type ServerRuntimeConfig = {
  gitHash: string;
  inMemoryUploadLimitBytes: number;
  maxUploadBytes: number;
  version: string;
};

export function getServerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerRuntimeConfig {
  const maxUploadBytes = parseUploadBytes(
    env[MAX_UPLOAD_BYTES_ENV_VAR],
    DEFAULT_MAX_UPLOAD_BYTES,
  );

  return {
    gitHash: parseBuildValue(
      env[GIT_HASH_ENV_VAR] ?? env.GIT_HASH ?? env.COMMIT,
      DEFAULT_GIT_HASH,
    ),
    inMemoryUploadLimitBytes: Math.min(
      parseUploadBytes(
        env[IN_MEMORY_UPLOAD_LIMIT_ENV_VAR],
        DEFAULT_IN_MEMORY_UPLOAD_LIMIT_BYTES,
      ),
      maxUploadBytes,
    ),
    maxUploadBytes,
    version: parseVersion(
      env[VERSION_ENV_VAR] ?? env.npm_package_version,
      DEFAULT_VERSION,
    ),
  };
}

function parseBuildValue(
  value: string | undefined,
  fallbackValue: string,
): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return fallbackValue;
  }

  return normalizedValue;
}

function parseVersion(
  value: string | undefined,
  fallbackValue: string,
): string {
  const normalizedValue = parseBuildValue(value, fallbackValue);

  if (normalizedValue.startsWith("v")) {
    return normalizedValue;
  }

  return `v${normalizedValue}`;
}

function parseUploadBytes(
  value: string | undefined,
  fallbackValue: number,
): number {
  if (!value) {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return fallbackValue;
  }

  return parsedValue;
}