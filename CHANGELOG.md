# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses semantic version tags for releases.

## [0.2.4] - Unreleased

### Changed

- chore(deps): bump docker/build-push-action from 7.0.0 to 7.1.0 ([#23](https://github.com/djryanj/media-tagger/pull/23))
- chore(deps): bump @fastify/static from 9.1.0 to 9.1.3 ([#24](https://github.com/djryanj/media-tagger/pull/24))
- chore(deps): bump fastify from 5.8.4 to 5.8.5 ([#25](https://github.com/djryanj/media-tagger/pull/25))
- chore(deps-dev): bump globals from 17.4.0 to 17.5.0 ([#26](https://github.com/djryanj/media-tagger/pull/26))
- chore(deps-dev): bump typescript-eslint from 8.58.1 to 8.59.0 ([#27](https://github.com/djryanj/media-tagger/pull/27))
- chore(deps-dev): bump @types/node from 25.5.2 to 25.6.0 ([#28](https://github.com/djryanj/media-tagger/pull/28))
- chore(deps): bump actions/setup-node from 6.3.0 to 6.4.0 ([#29](https://github.com/djryanj/media-tagger/pull/29))

## [0.2.3] - 2026-04-11

### Fixed

- Production container images now install `ffmpeg` alongside ExifTool, and Docker validation smoke-tests the built image for both binaries so MP4 and MOV remux fallback does not fail at runtime.

## [0.2.2] - 2026-04-10

### Fixed

- MP4 and MOV tagging now retry on a normalized copy of the video container when malformed metadata atoms prevent the first ExifTool write from persisting. The retry lets ExifTool create its preferred QuickTime and XMP comment or description tags, then verifies the payload across the concrete locations ExifTool may choose. [#13](https://github.com/djryanj/media-tagger/issues/13)

## [0.2.1] - 2026-04-10

### Added

- Server build metadata reporting so the running version and git hash are exposed in startup logs, propagated through containerized builds, and shown in the web UI for easier deployment verification. [#11](https://github.com/djryanj/media-tagger/issues/11)

### Fixed

- MP4 and MOV tagging requests no longer fail when ExifTool reports a recoverable `[minor]` QuickTime metadata warning but the metadata write and readback verification still succeed. [#13](https://github.com/djryanj/media-tagger/issues/13)

## [0.2.0] - 2026-04-09

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
- chore(deps): bump pnpm/action-setup from 4 to 5 [#5](https://github.com/djryanj/media-tagger/pull/5)
- chore(deps-dev): bump @eslint/js from 9.39.4 to 10.0.1 [#4](https://github.com/djryanj/media-tagger/pull/4)
- chore(deps-dev): bump eslint from 9.39.4 to 10.2.0 [#3](https://github.com/djryanj/media-tagger/pull/3)

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
