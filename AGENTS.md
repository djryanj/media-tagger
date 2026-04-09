# Agent Notes

This repository is preparing for its first release. Human and AI contributors should optimize for a clean, reliable core workflow rather than broad feature surface.

## Non-Negotiable Product Contract

- The canonical payload format is `tags:<csv list of tags>` with an optional trailing `;`.
- The app supports a single workflow: upload, tag, rewrite metadata, download.
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
- The pnpm workspace exists with `apps/web` and `apps/api` package skeletons.
- A root Makefile exists for install, development, and verification workflows.
- The first API and web app slice exists for upload, tag normalization, metadata writing, and browser download.
- A baseline GitHub Actions CI workflow exists for lint, typecheck, test, and build validation.
- A runtime Dockerfile, Compose example, and Kubernetes example manifests now exist for the single-container deployment path.
- Web coverage now includes Vitest unit tests and a Playwright flow that verifies upload-to-download round-trip behavior.
- There is still no fixture-backed API integration suite, and browser coverage is still narrow.
