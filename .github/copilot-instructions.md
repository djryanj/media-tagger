# Media Tagger Release Instructions

## Current Goal

Build a mobile-first web app with one fast workflow:

1. Upload a still image, GIF, or video.
2. Enter tags.
3. Write a metadata payload in the exact shape `tags:<csv list of tags>` with optional trailing `;`.
4. Download the updated file back in the browser.

The app must run in Docker, use devcontainers for development, include Makefile support, and ship with strong unit, integration, and e2e coverage plus GitHub CI workflows.

## Current Status

- Completed: initial devcontainer setup in `.devcontainer/`.
- Current devcontainer base: `mcr.microsoft.com/devcontainers/javascript-node:24-bookworm`.
- Installed native tooling: `pnpm` via Corepack during image build, `make`, `exiftool`, `ffmpeg`, and Playwright Linux runtime dependencies.
- Completed: initial `pnpm` workspace scaffold with frontend and backend package skeletons.
- Completed: root `Makefile` with install, dev, build, lint, typecheck, test, and CI-style targets.
- Completed: minimal Fastify upload endpoint, metadata write proof of concept, and first single-screen web flow.
- Completed: initial GitHub Actions CI workflow for lint, typecheck, test, and build validation.
- Completed: baseline runtime Dockerfile, Docker Compose example, Kubernetes example manifests, and release workflow scaffold.
- Completed: baseline web unit tests and Playwright coverage for the upload-to-download path.
- Next implementation step inside the container: add fixture-backed API integration tests and broaden browser coverage for failure cases.

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
- Build the payload from normalized tags, joined by commas, with an optional trailing semicolon.
- Write to format-appropriate fields rather than forcing one exact container field for every type.
- Read the metadata back after writing during tests to confirm the payload survives round-trip.
- Keep the mapping logic centralized so supported formats can expand without changing the UI.

## Initial Supported Format Plan

- Still images: JPG, JPEG, WebP, PNG.
- Animated images: GIF.
- Videos: MP4, MOV.

If a format cannot safely store the payload in a writable metadata field, fail clearly instead of producing a misleading download.

## API Shape

- `POST /api/media/tag`
- Multipart form fields:
  - `file`
  - `tags`
  - `terminateWithSemicolon`
- Response:
  - Updated binary stream
  - Preserved or normalized filename
  - Correct content type and attachment headers

## UI Shape

- Single mobile-first screen.
- Controls only for:
  - File picker
  - Tags input
  - Optional semicolon toggle
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

## Open Questions To Resolve Early

- Final supported extension list for v1.
- Exact metadata field mapping per container.
- Default state for the trailing semicolon option.
- Upload size limits for mobile usage.
- Whether the service should preserve all original metadata or only append/update targeted fields.

## Ordered Release Todo

1. Verify the devcontainer boots cleanly and the toolchain is available inside it.
2. Install workspace dependencies and confirm the scaffold runs end to end.
3. Add Docker and Docker Compose support aligned with the devcontainer toolchain.
4. Extend the minimal Fastify upload endpoint with fixture-based metadata verification.
5. Expand coverage around payload generation, media validation, and metadata readback.
6. Broaden Playwright e2e coverage for success and failure paths.
7. Validate release and deployment flows against the runtime image.

## Guidance For The Next Agent Pass

- Prefer root-cause solutions over format-specific hacks.
- Verify every metadata write with a readback in automated tests.
- Keep the UI intentionally simple; do not add extra product surface before the core flow is solid.
- Preserve parity between local dev, devcontainer, Docker, and CI.
