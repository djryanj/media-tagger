export const IN_MEMORY_UPLOAD_LIMIT_ENV_VAR =
  "MEDIA_TAGGER_IN_MEMORY_UPLOAD_LIMIT_BYTES";
export const MAX_UPLOAD_BYTES_ENV_VAR = "MEDIA_TAGGER_MAX_UPLOAD_BYTES";
export const DEFAULT_IN_MEMORY_UPLOAD_LIMIT_BYTES = 512 * 1024 * 1024;
export const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

export type ServerRuntimeConfig = {
  inMemoryUploadLimitBytes: number;
  maxUploadBytes: number;
};

export function getServerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerRuntimeConfig {
  const maxUploadBytes = parseUploadBytes(
    env[MAX_UPLOAD_BYTES_ENV_VAR],
    DEFAULT_MAX_UPLOAD_BYTES,
  );

  return {
    inMemoryUploadLimitBytes: Math.min(
      parseUploadBytes(
        env[IN_MEMORY_UPLOAD_LIMIT_ENV_VAR],
        DEFAULT_IN_MEMORY_UPLOAD_LIMIT_BYTES,
      ),
      maxUploadBytes,
    ),
    maxUploadBytes,
  };
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