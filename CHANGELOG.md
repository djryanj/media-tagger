# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses semantic version tags for releases.

## [0.1.0] - Unreleased

### Added

- Initial pnpm workspace with `apps/api` and `apps/web` packages.
- Fastify upload API that normalizes tags, writes canonical metadata payloads, and returns the updated media file.
- React and Vite single-screen web flow for upload, tagging, semicolon control, and browser download.
- exiftool-backed metadata verification for supported formats: JPG, JPEG, PNG, WebP, GIF, MP4, and MOV.
- Root Makefile workflows for install, development, verification, and targeted app commands.
- Runtime Docker image, Docker Compose example, and Kubernetes manifests including a Traefik ingress example.
- GitHub Actions CI and release workflow scaffolding for lint, typecheck, test, Playwright, Docker validation, and image publishing.
- Initial web unit tests with Vitest and end-to-end coverage with Playwright.
