import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";

import { UnsupportedMediaError } from "./media.js";
import { MetadataWriteError, writeTaggedMedia } from "./metadata.js";
import {
  normalizeTags,
  parseTerminateWithSemicolon,
  renderPayload,
} from "./tags.js";

const SERVER_HOST = "0.0.0.0";
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WEB_DIST_DIRECTORY = resolve(MODULE_DIRECTORY, "../../web/dist");

export function buildServer() {
  const app = Fastify({
    logger: true,
  });
  const webDistDirectory =
    process.env.WEB_DIST_DIR ?? DEFAULT_WEB_DIST_DIRECTORY;
  const hasBuiltWebClient = existsSync(join(webDistDirectory, "index.html"));

  void app.register(cors, {
    origin: true,
  });

  void app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 250 * 1024 * 1024,
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

  app.post(
    "/api/media/tag",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parts = request.parts();
      let fileBuffer: Buffer | null = null;
      let filename = "tagged-media";
      let mimetype = "application/octet-stream";
      let rawTags = "";
      let terminateWithSemicolon = false;

      for await (const part of parts) {
        if (part.type === "file") {
          if (part.fieldname !== "file") {
            await part.toBuffer();
            continue;
          }

          fileBuffer = await part.toBuffer();
          filename = part.filename ?? filename;
          mimetype = part.mimetype;
          continue;
        }

        if (part.fieldname === "tags") {
          rawTags = String(part.value ?? "");
        }

        if (part.fieldname === "terminateWithSemicolon") {
          terminateWithSemicolon = parseTerminateWithSemicolon(
            String(part.value ?? ""),
          );
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.code(400).send({ error: "A media file is required." });
      }

      const tags = normalizeTags(rawTags);

      if (tags.length === 0) {
        return reply.code(400).send({ error: "At least one tag is required." });
      }

      const payload = renderPayload(tags, terminateWithSemicolon);

      try {
        const taggedMedia = await writeTaggedMedia({
          buffer: fileBuffer,
          filename,
          mimetype,
          payload,
        });

        reply.header(
          "content-disposition",
          `attachment; filename="${taggedMedia.filename}"`,
        );
        reply.type(taggedMedia.contentType);

        return reply.send(taggedMedia.buffer);
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
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);

  try {
    await app.listen({ port, host: SERVER_HOST });
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
