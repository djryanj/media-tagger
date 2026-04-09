# Agent Notes

Human and AI contributors should optimize for a clean, reliable core workflow rather than broad feature surface.

## Non-Negotiable Product Contract

- The canonical payload format is `tags:<csv list of tags>` with an optional trailing `;`.
- The app supports a single workflow: upload up to 10 files, tag them once, rewrite metadata, and download each result individually.
- The first UI should remain a single mobile-first screen.

## Architecture Direction

- Use a TypeScript monorepo with pnpm workspaces.
- Prefer React and Vite for the frontend.
- Prefer Fastify for the backend.
- Use exiftool for metadata writing and readback verification.

## Engineering Expectations

- Solve root causes instead of format-specific hacks.
- Centralize tag normalization, payload rendering, and metadata field mapping.
- Verify metadata writes with readback in automated tests.
- Keep parity between the devcontainer, Docker runtime, and CI.
- Do not add product surface outside the upload-to-download workflow before the core path is reliable.

## Current State

- The devcontainer exists and installs pnpm during image build.
- The pnpm workspace contains `apps/web` and `apps/api`.
- A root Makefile exists for install, development, and verification workflows.
- The API and web app implement upload, tag normalization, metadata writing, and browser download.
- GitHub Actions CI validates lint, typecheck, test, build, Playwright coverage, and Docker build flows.
- The runtime Dockerfile, Compose example, and Kubernetes manifests support the single-container deployment path.
- The release process is driven by `make prepare-release`, `make tag-release`, and the tag-triggered GitHub release workflow.
