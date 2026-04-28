# Media Tagger Release Instructions

## Product Contract

Build a mobile-first web app with one fast workflow:

1. Upload a still image, GIF, or video.
2. Select up to 20 files for one tagging pass.
3. Choose whether to tag all selected images the same or tag images individually.
4. Enter tags.
5. Write a metadata payload in the exact shape `tags:<csv list of tags>`.
6. Download each updated file back in the browser.

The app must run in Docker, use devcontainers for development, include Makefile support, and ship with strong unit, integration, and e2e coverage plus GitHub CI workflows.

## Current State

- Completed: initial devcontainer setup in `.devcontainer/`.
- Current devcontainer base: `mcr.microsoft.com/devcontainers/javascript-node:24-bookworm`.
- Installed native tooling: `pnpm` via Corepack during image build, `make`, `exiftool`, `ffmpeg`, and Playwright Linux runtime dependencies.
- Completed: `pnpm` workspace with frontend and backend packages.
- Completed: root `Makefile` with install, dev, build, lint, typecheck, test, and CI-style targets.
- Completed: minimal Fastify upload endpoint, metadata write proof of concept, and first single-screen web flow.
- Completed: initial GitHub Actions CI workflow for lint, typecheck, test, and build validation.
- Completed: runtime Dockerfile, Docker Compose example, Kubernetes example manifests, and release workflow.
- Completed: baseline web unit tests and Playwright coverage for the upload-to-download path.
- Remaining engineering work should focus on deeper automated verification rather than expanding product scope.

## Recommended Architecture

- Use a TypeScript monorepo with `pnpm` workspaces.
- Frontend: React + Vite, optimized for a mobile-first single-screen form.
- Backend: Fastify API handling uploads and metadata rewriting.
- Metadata engine: `exiftool` as the primary write/read dependency, invoked through `exiftool-vendored` or direct CLI where needed.
- Testing: Vitest for unit and integration tests, Playwright for e2e, and fixture-based metadata verification with readback assertions.
- Containerization: Docker multi-stage build for production, devcontainer based on the same toolchain to reduce drift.

## Why This Direction

- Browser-only metadata editing is not reliable across JPG, WebP, GIF, and video containers.
- Server-side processing keeps format support realistic and simplifies verification.
- `exiftool` covers the broadest useful metadata surface across image and video formats.
- React + Vite is enough for a speed-focused UI and avoids SSR complexity.
- Fastify keeps uploads and binary responses straightforward and testable.

## Metadata Strategy

- Treat the rendered string as the canonical payload.
- Build the payload from normalized tags, joined by commas.
- If a supported upload's extension or reported MIME type is wrong, detect the actual file type from the uploaded bytes, tag it without transcoding, and rename the download if the extension must change.
- Accept uploads up to `MEDIA_TAGGER_MAX_UPLOAD_BYTES`, defaulting to 1 GiB.
- Buffer smaller uploads in memory and stage larger uploads on disk, with the in-memory threshold controlled by `MEDIA_TAGGER_IN_MEMORY_UPLOAD_LIMIT_BYTES` and defaulting to 512 MiB.
- Write to format-appropriate fields rather than forcing one exact container field for every type.
- Read the metadata back after writing during tests to confirm the payload survives round-trip.
- Keep the mapping logic centralized so supported formats can expand without changing the UI.

## Supported Formats

- Still images: JPG, JPEG, WebP, PNG.
- Animated images: GIF.
- Videos: MP4, MOV.

If a format cannot safely store the payload in a writable metadata field, fail clearly instead of producing a misleading download.

## API Shape

- `POST /api/media/tag`
- Multipart form fields:
  - `file`
  - `fileSize`
  - `tags`
- Response:
  - Updated binary stream
  - Preserved or normalized filename, including extension correction when the detected type differs from the upload name
  - Correct content type and attachment headers

The web app may call this endpoint once per selected file so the browser can download each updated result individually.

## UI Shape

- Single mobile-first screen.
- Controls only for:
  - Multi-file picker with an upper limit of 20 files
  - Shared-tag input or individual per-file inputs with previews and copy/paste controls
  - Submit action
  - Success or failure state
- Prioritize low-latency interaction and minimal copy.

## Testing Expectations

- Unit tests:
  - Tag normalization
  - Payload formatting
  - MIME and extension validation
  - Metadata field selection per format
- Integration tests:
  - Upload endpoint behavior
  - Error handling for unsupported or malformed files
  - Metadata write plus readback against fixture files
- E2E tests:
  - Mobile viewport flow
  - Upload, tag, download, and result validation
  - Failure messaging for unsupported files

## Dev Environment Expectations

- Devcontainer must include Node, `pnpm`, `make`, `exiftool`, and Playwright browser dependencies.
- Docker runtime image must include everything required to execute metadata writes in production.
- Make targets should cover setup, dev, test, lint, typecheck, e2e, docker build, and CI-like verification.
- The initial devcontainer is already defined with a dedicated `.devcontainer/Dockerfile` and `.devcontainer/devcontainer.json`.

## CI Expectations

- GitHub Actions workflows should include:
  - Lint and typecheck
  - Unit and integration tests
  - Playwright e2e
  - Docker build validation

## Release Workflow

Use the Makefile release helpers rather than creating release branches and tags by hand.

1. Run `make prepare-release VERSION=vX.Y.Z` from a clean `main` branch.
2. Open and merge the generated `release/vX.Y.Z` pull request.
3. Pull the updated `main` branch.
4. Run `make tag-release VERSION=vX.Y.Z`.

The pushed tag triggers the GitHub release workflow, which verifies the API and web apps, runs Playwright coverage, publishes the container image, and creates the GitHub Release.

## Guidance For The Next Agent Pass

- Prefer root-cause solutions over format-specific hacks.
- Verify every metadata write with a readback in automated tests.
- Keep the UI intentionally simple; do not add extra product surface before the core flow is solid.
- Preserve parity between local dev, devcontainer, Docker, and CI.
