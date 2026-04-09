# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses semantic version tags for releases.

## [0.2.0] - Unreleased

### Added

- Frontend overwrite warning plus a persistent processed-files list with manual download buttons for each tagged result.
- Runtime upload configuration through `MEDIA_TAGGER_MAX_UPLOAD_BYTES` and `MEDIA_TAGGER_IN_MEMORY_UPLOAD_LIMIT_BYTES`, exposed to the web app via `GET /api/config`.
- Hybrid upload handling that buffers smaller files in memory, stages larger files on disk, and uses the client-reported `fileSize` as an early routing hint.
- Expanded automated coverage for media type resolution, runtime config parsing, upload buffering decisions, updated web behavior, and mobile Firefox Playwright runs.
- A `mobile-firefox` Playwright project and Makefile support for installing Chromium and Firefox browsers together or targeting a specific Playwright project.

### Changed

- Simplified the canonical metadata payload to `tags:<csv list of tags>` by removing the semicolon toggle from the UI, API contract, tests, and documentation.
- Hardened media type resolution to prefer detected file bytes over incorrect filename extensions or reported MIME types, while preserving the original media data and renaming downloads when needed.
- Improved upload and deployment guidance across the UI, README, Compose, Kubernetes, and contributor instructions so RAM, `/tmp`, and upload-cap behavior stay aligned.
- chore(deps-dev): bump vite from 8.0.7 to 8.0.8 [#8](https://github.com/djryanj/media-tagger/pull/8)
- chore(deps-dev): bump vitest from 4.1.3 to 4.1.4 [#7](https://github.com/djryanj/media-tagger/pull/7)

### Fixed

- False-positive type mismatch handling for common aliases including MOV and QuickTime, JPEG variants, legacy PNG MIME values, and MP4 MIME aliases.
- Mobile multi-file download recovery by keeping processed files available for manual re-download when automatic browser downloads are delayed or blocked.
- Small-file byte formatting in the web upload limit copy so KB and byte-sized limits display accurately.
- Monorepo ESLint parser and VS Code working-directory issues that caused noisy editor warnings in the API and web packages.

## [0.1.0] - 2026-04-09

### Added

- Initial pnpm workspace with `apps/api` and `apps/web` packages.
- Fastify upload API that normalizes tags, writes canonical metadata payloads, and returns the updated media file.
- React and Vite single-screen web flow for upload, tagging, semicolon control, and browser download.
- Multi-file web flow for applying one tag set to up to 10 files and downloading each result individually.
- exiftool-backed metadata verification for supported formats: JPG, JPEG, PNG, WebP, GIF, MP4, and MOV.
- Root Makefile workflows for install, development, verification, and targeted app commands.
- Runtime Docker image, Docker Compose example, and Kubernetes manifests including a Traefik ingress example.
- GitHub Actions CI and release workflows for lint, typecheck, test, Playwright, Docker validation, and image publishing.
- Initial web unit tests with Vitest and end-to-end coverage with Playwright.
