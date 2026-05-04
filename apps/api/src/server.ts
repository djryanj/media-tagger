import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";

import { getServerRuntimeConfig } from "./config.js";
import { GifConversionError, convertGifToMp4 } from "./gifConversion.js";
import { UnsupportedMediaError, sanitizeFilename } from "./media.js";
import {
  MetadataWriteError,
  writeTaggedMedia,
  writeTaggedMediaFromBuffer,
} from "./metadata.js";
import { normalizeTags, renderPayload } from "./tags.js";
import {
  consumeUploadedFile,
  parseDeclaredFileSize,
} from "./upload.js";

const SERVER_HOST = "0.0.0.0";
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WEB_DIST_DIRECTORY = resolve(MODULE_DIRECTORY, "../../web/dist");

export function buildServer(
  runtimeConfig = getServerRuntimeConfig(),
) {
  const app = Fastify({
    bodyLimit: runtimeConfig.maxUploadBytes,
    logger: true,
  });
  const webDistDirectory =
    process.env.WEB_DIST_DIR ?? DEFAULT_WEB_DIST_DIRECTORY;
  const hasBuiltWebClient = existsSync(join(webDistDirectory, "index.html"));

  void app.register(cors, {
    origin: true,
    exposedHeaders: [
      "content-disposition",
      "x-media-tagger-file-resolution",
    ],
  });

  void app.register(multipart, {
    limits: {
      files: 1,
      fileSize: runtimeConfig.maxUploadBytes,
    },
  });

  if (hasBuiltWebClient) {
    void app.register(fastifyStatic, {
      root: webDistDirectory,
      prefix: "/",
    });
  }

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/config", async () => runtimeConfig);

  /**
   * POST /api/media/tag-stream
   * Same multipart fields as /api/media/tag plus `convertGifToMp4=true`.
   * Returns a text/event-stream response with progress events and a final
   * `done` event carrying the tagged file as a base64 payload.
   */
  app.post(
    "/api/media/tag-stream",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parts = request.parts();
      let filename = "tagged-media";
      let declaredFileSize: number | null = null;
      let mimetype = "application/octet-stream";
      let rawTags = "";
      let convertGif = false;
      let upload:
        | Awaited<ReturnType<typeof consumeUploadedFile>>
        | null = null;

      try {
        for await (const part of parts) {
          if (part.type === "file") {
            if (part.fieldname !== "file") {
              await pipeline(part.file, createWriteStream("/dev/null"));
              continue;
            }

            filename = part.filename ?? filename;
            mimetype = part.mimetype;
            upload = await consumeUploadedFile({
              declaredFileSize,
              filename,
              fileStream: part.file,
              inMemoryUploadLimitBytes: runtimeConfig.inMemoryUploadLimitBytes,
            });
            continue;
          }

          if (part.fieldname === "tags") {
            rawTags = String(part.value ?? "");
          }
          if (part.fieldname === "fileSize") {
            declaredFileSize = parseDeclaredFileSize(String(part.value ?? ""));
          }
          if (part.fieldname === "convertGifToMp4") {
            convertGif = String(part.value) === "true";
          }
        }
      } catch (error) {
        if (upload?.inputPath) {
          await rm(dirname(upload.inputPath), { force: true, recursive: true });
        }

        throw error;
      }

      if (!upload || (!upload.inputPath && !upload.buffer)) {
        return reply.code(400).send({ error: "A media file is required." });
      }

      const tags = normalizeTags(rawTags);

      if (tags.length === 0) {
        if (upload.inputPath) {
          await rm(dirname(upload.inputPath), { force: true, recursive: true });
        }
        return reply.code(400).send({ error: "At least one tag is required." });
      }

      const payload = renderPayload(tags);

      // Hijack the response so we can stream SSE events directly.
      reply.hijack();
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("Access-Control-Allow-Origin", "*");
      reply.raw.setHeader("Access-Control-Expose-Headers", "Content-Type");
      reply.raw.flushHeaders();

      const sendEvent = (data: unknown) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let extraWorkingDir: string | null = null;

      try {
        // If the upload was buffered in memory, write it to disk so FFmpeg can read it.
        let workingInputPath: string;

        if (upload.processingMode === "memory") {
          extraWorkingDir = await mkdtemp(join(tmpdir(), "media-tagger-stream-"));
          workingInputPath = join(extraWorkingDir, sanitizeFilename(filename));
          await writeFile(workingInputPath, upload.buffer as Buffer);
        } else {
          workingInputPath = upload.inputPath as string;
        }

        let tagInputPath = workingInputPath;
        let tagFilename = filename;
        let tagMimetype = mimetype;

        if (convertGif) {
          const safeBase = sanitizeFilename(filename);
          const currentExt = extname(safeBase);
          const mp4Filename = currentExt
            ? `${safeBase.slice(0, -currentExt.length)}.mp4`
            : `${safeBase}.mp4`;
          const mp4Path = join(dirname(workingInputPath), mp4Filename);

          request.log.info({ filename, mp4Filename }, "Converting GIF to MP4.");

          await convertGifToMp4({
            inputPath: workingInputPath,
            outputPath: mp4Path,
            onProgress: (percent) => sendEvent({ type: "progress", percent }),
          });

          tagInputPath = mp4Path;
          tagFilename = mp4Filename;
          tagMimetype = "video/mp4";
        }

        const taggedMedia = await writeTaggedMedia({
          filename: tagFilename,
          inputPath: tagInputPath,
          mimetype: tagMimetype,
          payload,
        });

        const fileBuffer = await readFile(taggedMedia.outputPath);

        request.log.info(
          {
            convertGif,
            filename,
            outputFilename: taggedMedia.filename,
            tagCount: tags.length,
          },
          "Streamed tagged media successfully.",
        );

        sendEvent({
          type: "done",
          filename: taggedMedia.filename,
          contentType: taggedMedia.contentType,
          data: fileBuffer.toString("base64"),
          tags,
          resolutionWarning: taggedMedia.resolution.warning ?? null,
        });
      } catch (error) {
        request.log.error(error);

        const message =
          error instanceof GifConversionError
            ? error.message
            : error instanceof UnsupportedMediaError
              ? error.message
              : error instanceof MetadataWriteError
                ? error.message
                : "Unexpected server failure.";

        sendEvent({ type: "error", message });
      } finally {
        reply.raw.end();

        if (extraWorkingDir) {
          await rm(extraWorkingDir, { force: true, recursive: true });
        }

        if (upload?.inputPath) {
          await rm(dirname(upload.inputPath), { force: true, recursive: true });
        }
      }
    },
  );

  app.post(
    "/api/media/tag",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parts = request.parts();
      let filename = "tagged-media";
      let declaredFileSize: number | null = null;
      let mimetype = "application/octet-stream";
      let rawTags = "";
      let upload:
        | Awaited<ReturnType<typeof consumeUploadedFile>>
        | null = null;

      try {
        for await (const part of parts) {
          if (part.type === "file") {
            if (part.fieldname !== "file") {
              await pipeline(part.file, createWriteStream("/dev/null"));
              continue;
            }

            filename = part.filename ?? filename;
            mimetype = part.mimetype;
            upload = await consumeUploadedFile({
              declaredFileSize,
              filename,
              fileStream: part.file,
              inMemoryUploadLimitBytes: runtimeConfig.inMemoryUploadLimitBytes,
            });
            continue;
          }

          if (part.fieldname === "tags") {
            rawTags = String(part.value ?? "");
          }

          if (part.fieldname === "fileSize") {
            declaredFileSize = parseDeclaredFileSize(String(part.value ?? ""));
          }
        }
      } catch (error) {
        if (upload?.inputPath) {
          await rm(dirname(upload.inputPath), { force: true, recursive: true });
        }

        throw error;
      }

      if (!upload || (!upload.inputPath && !upload.buffer)) {
        return reply.code(400).send({ error: "A media file is required." });
      }


      const tags = normalizeTags(rawTags);

      if (tags.length === 0) {
        return reply.code(400).send({ error: "At least one tag is required." });
      }

      const payload = renderPayload(tags);
      // Add confirmed tags as a response header (JSON-encoded)
      reply.header("x-media-tagger-confirmed-tags", JSON.stringify(tags));

      request.log.info(
        {
          actualFileSize: upload.actualFileSize,
          declaredFileSize: upload.declaredFileSize,
          declaredMimeType: mimetype,
          filename,
          inMemoryUploadLimitBytes: runtimeConfig.inMemoryUploadLimitBytes,
          processingMode: upload.processingMode,
          tagCount: tags.length,
        },
        "Received media tagging request.",
      );

      try {
        if (upload.processingMode === "memory") {
          const taggedMedia = await writeTaggedMediaFromBuffer({
            buffer: upload.buffer as Buffer,
            filename,
            mimetype,
            payload,
          });

          if (taggedMedia.resolution.warning) {
            request.log.warn(
              {
                ...taggedMedia.resolution,
                outputContentType: taggedMedia.contentType,
              },
              "Resolved uploaded media type mismatch before writing metadata.",
            );
            reply.header(
              "x-media-tagger-file-resolution",
              taggedMedia.resolution.warning,
            );
          }

          request.log.info(
            {
              declaredMimeType: mimetype,
              detectedContentType: taggedMedia.resolution.detectedContentType,
              detectedExtension: taggedMedia.resolution.detectedExtension,
              filename,
              outputFilename: taggedMedia.filename,
            },
            "Tagged media successfully.",
          );

          reply.header(
            "content-disposition",
            `attachment; filename="${taggedMedia.filename}"`,
          );
          reply.type(taggedMedia.contentType);

          return reply.send(taggedMedia.buffer);
        }

        const taggedMedia = await writeTaggedMedia({
          filename,
          inputPath: upload.inputPath as string,
          mimetype,
          payload,
        });

        if (taggedMedia.resolution.warning) {
          request.log.warn(
            {
              ...taggedMedia.resolution,
              outputContentType: taggedMedia.contentType,
            },
            "Resolved uploaded media type mismatch before writing metadata.",
          );
          reply.header(
            "x-media-tagger-file-resolution",
            taggedMedia.resolution.warning,
          );
        }

        request.log.info(
          {
            declaredMimeType: mimetype,
            detectedContentType: taggedMedia.resolution.detectedContentType,
            detectedExtension: taggedMedia.resolution.detectedExtension,
            filename,
            outputFilename: taggedMedia.filename,
          },
          "Tagged media successfully.",
        );

        reply.header(
          "content-disposition",
          `attachment; filename="${taggedMedia.filename}"`,
        );
        reply.type(taggedMedia.contentType);

        const cleanupTaggedMedia = async () => {
          await rm(dirname(taggedMedia.outputPath), {
            force: true,
            recursive: true,
          });
        };

        reply.raw.once("close", () => {
          void cleanupTaggedMedia();
        });
        reply.raw.once("finish", () => {
          void cleanupTaggedMedia();
        });

        return reply.send(createReadStream(taggedMedia.outputPath));
      } catch (error) {
        if (error instanceof UnsupportedMediaError) {
          return reply.code(415).send({ error: error.message });
        }

        if (error instanceof MetadataWriteError) {
          request.log.error(error);
          return reply.code(422).send({ error: error.message });
        }

        request.log.error(error);
        return reply.code(500).send({ error: "Unexpected server failure." });
      }
    },
  );

  if (hasBuiltWebClient) {
    app.setNotFoundHandler(async (request, reply) => {
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        !request.url.startsWith("/api")
      ) {
        return reply.sendFile("index.html");
      }

      return reply.code(404).send({ error: "Not found." });
    });
  }

  return app;
}

async function start() {
  const runtimeConfig = getServerRuntimeConfig();
  const app = buildServer(runtimeConfig);
  const port = Number(process.env.PORT ?? 3000);

  try {
    const address = await app.listen({ port, host: SERVER_HOST });

    app.log.info(
      {
        address,
        gitHash: runtimeConfig.gitHash,
        version: runtimeConfig.version,
      },
      "Media Tagger server started.",
    );
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  void start();
}
