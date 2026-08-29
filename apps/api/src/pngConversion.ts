import { spawn } from "node:child_process";

export class PngConversionError extends Error {}

export const DEFAULT_JPEG_QUALITY = 2;

/**
 * FFmpeg filter graph that composites the source image over an opaque white
 * background. JPEG has no alpha channel, so transparent PNG regions would
 * otherwise be encoded as whatever RGB happens to sit under the alpha mask.
 */
const FLATTEN_ALPHA_FILTER =
  "color=white[bg];[bg][0:v]scale2ref[bg2][img];[bg2][img]overlay=format=auto";

export type PngConversionOptions = {
  inputPath: string;
  outputPath: string;
  quality?: number;
};

/**
 * Convert a PNG file to a JPEG using FFmpeg's mjpeg encoder. Quality maps to
 * FFmpeg's `-q:v` scale where 2 is the highest practical quality.
 */
export async function convertPngToJpg({
  inputPath,
  outputPath,
  quality = DEFAULT_JPEG_QUALITY,
}: PngConversionOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-y",
      "-i",
      inputPath,
      "-filter_complex",
      FLATTEN_ALPHA_FILTER,
      "-frames:v",
      "1",
      "-update",
      "1",
      "-q:v",
      String(quality),
      "-pix_fmt",
      "yuvj420p",
      outputPath,
    ];

    const proc = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrOutput = "";

    proc.stdout.resume();

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrOutput += chunk.toString("utf8");
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new PngConversionError(
          `FFmpeg PNG-to-JPG conversion failed (exit ${code ?? "unknown"}). ${stderrOutput.slice(0, 800)}`,
        ),
      );
    });

    proc.on("error", (err) => {
      reject(new PngConversionError(`FFmpeg process error: ${err.message}`));
    });
  });
}
