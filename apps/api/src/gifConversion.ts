import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GifConversionError extends Error {}

export type GifConversionOptions = {
  inputPath: string;
  outputPath: string;
  onProgress?: (percent: number) => void;
};

/**
 * Convert a GIF file to an MP4 using libx264 at CRF 15 (visually indistinguishable quality).
 * Calls `onProgress` with 0–100 as FFmpeg processes frames, if total frame count is available.
 */
export async function convertGifToMp4({
  inputPath,
  outputPath,
  onProgress,
}: GifConversionOptions): Promise<void> {
  const totalFrames = await getGifFrameCount(inputPath);
  await runFfmpegGifConversion({ inputPath, outputPath, totalFrames, onProgress });
}

export async function getGifFrameCount(inputPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "exiftool",
      ["-s3", "-FrameCount", inputPath],
      { encoding: "utf8", maxBuffer: 1 * 1024 * 1024 },
    );
    const count = parseInt(stdout.trim(), 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

type FfmpegConversionInternalOptions = {
  inputPath: string;
  outputPath: string;
  totalFrames: number;
  onProgress?: (percent: number) => void;
};

async function runFfmpegGifConversion({
  inputPath,
  outputPath,
  totalFrames,
  onProgress,
}: FfmpegConversionInternalOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const useProgress = typeof onProgress === "function" && totalFrames > 0;

    const ffmpegArgs = [
      "-y",
      ...(useProgress ? ["-progress", "pipe:1"] : []),
      "-i",
      inputPath,
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "23",
      "-c:v",
      "libx264",
      "-an",
      outputPath,
    ];

    const proc = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "pipe"] });

    let stderrOutput = "";

    if (useProgress) {
      let progressBuffer = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        progressBuffer += chunk.toString("utf8");
        const lines = progressBuffer.split("\n");
        progressBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const match = /^frame=(\d+)$/.exec(line.trim());

          if (match) {
            const frame = parseInt(match[1]!, 10);
            const percent = Math.min(99, Math.round((frame / totalFrames) * 100));
            onProgress!(percent);
          }
        }
      });
    } else {
      proc.stdout.resume();
    }

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrOutput += chunk.toString("utf8");
    });

    proc.on("close", (code) => {
      if (code === 0) {
        onProgress?.(100);
        resolve();
      } else {
        reject(
          new GifConversionError(
            `FFmpeg GIF-to-MP4 conversion failed (exit ${code ?? "unknown"}). ${stderrOutput.slice(0, 800)}`,
          ),
        );
      }
    });

    proc.on("error", (err) => {
      reject(new GifConversionError(`FFmpeg process error: ${err.message}`));
    });
  });
}
