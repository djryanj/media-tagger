# Media Tagger

Media Tagger is a mobile-first web app for writing a single canonical metadata payload into still images, GIFs, and videos.

The core workflow is intentionally narrow:

1. Upload a supported media file.
2. Enter tags.
3. Render the payload in the exact shape `tags:<csv list of tags>` with an optional trailing `;`.
4. Download the updated file in the browser.

## Status

This repository is preparing for its first release. The development container, pnpm workspace, upload flow, metadata write path, Makefile targets, runtime Docker image, deployment examples, and baseline GitHub Actions workflows are in place. Fixture-backed API integration coverage and broader browser coverage are still pending.

The current supported set for metadata writing is JPG, JPEG, PNG, WebP, GIF, MP4, and MOV.

## Planned Stack

- TypeScript monorepo managed with pnpm workspaces
- React and Vite for the mobile-first frontend
- Fastify for the upload and metadata API
- exiftool for metadata write and readback verification
- Vitest for unit and integration testing
- Playwright for end-to-end testing

## Repository Layout

- `.devcontainer/` contains the development container definition.
- `.github/copilot-instructions.md` captures the current implementation plan and constraints.
- `Makefile` exposes common install, development, and verification workflows.
- `apps/api/` contains the Fastify backend workspace package.
- `apps/web/` contains the React and Vite frontend workspace package.

## Development Principles

- Treat the rendered payload string as the canonical metadata value.
- Keep format-specific field mapping centralized in backend code.
- Verify every metadata write by reading the result back in automated tests.
- Preserve parity across local development, the devcontainer, Docker, and CI.
- Keep the initial UI to a single, fast mobile-first screen.

## Getting Started

1. Open the repository in the devcontainer.
2. Verify the installed toolchain with `make doctor`.
3. Install dependencies with `make install`.
4. Start the package dev servers with `make dev`, `make dev-api`, or `make dev-web`.

The API and Vite servers bind to `0.0.0.0` so forwarded ports work correctly from the devcontainer.

## Common Commands

- `make help` prints the available workflow targets.
- `make ci` runs the local CI-style checks: lint, typecheck, test, and build.
- `make ci-api` and `make ci-web` run the same validation flow for just one app.
- `make test-api`, `make test-web`, `make typecheck-api`, and `make typecheck-web` replace direct `pnpm --filter ...` validation commands.
- `make test-e2e-web` runs the Playwright mobile browser flow against the production-style server.
- `make docker-build` builds the production image locally as `media-tagger:local`.
- `make clean` removes generated build and test output.

## Deployment

### Docker image

Build the image locally:

```bash
docker build -t media-tagger:local .
```

Run it with a read-only filesystem, a writable tmpfs for metadata processing, and dropped Linux capabilities:

```bash
docker run --rm \
	--publish 3000:3000 \
	--read-only \
	--tmpfs /tmp:rw,noexec,nosuid,size=256m \
	--cap-drop ALL \
	--security-opt no-new-privileges:true \
	media-tagger:local
```

The container serves both the React frontend and the Fastify API on port `3000`.

### Docker Compose

The repository includes [compose.yml](compose.yml). Start the app with:

```bash
docker-compose up --build
```

Then open `http://127.0.0.1:3000`.

### Kubernetes

Example manifests live in [deploy/kubernetes](deploy/kubernetes):

- [deploy/kubernetes/namespace.yaml](deploy/kubernetes/namespace.yaml)
- [deploy/kubernetes/deployment.yaml](deploy/kubernetes/deployment.yaml)
- [deploy/kubernetes/service.yaml](deploy/kubernetes/service.yaml)
- [deploy/kubernetes/ingress.yaml](deploy/kubernetes/ingress.yaml)
- [deploy/kubernetes/kustomization.yaml](deploy/kubernetes/kustomization.yaml)

Apply them with:

```bash
kubectl apply -k deploy/kubernetes
```

Update the placeholder image reference and host name before applying in a real cluster. The Traefik ingress example expects the `traefik` ingress class and a TLS secret named `media-tagger-tls`.

## Next Milestones

1. Prove metadata round-tripping with fixture-backed API integration tests.
2. Expand Playwright coverage beyond the single happy path.
3. Validate the Docker and Kubernetes examples end to end.
4. Add failure-path browser coverage for unsupported files and malformed uploads.

## Open Questions

- Final supported extension list for v1
- Exact metadata field mapping per container
- Default state for the trailing semicolon option
- Upload size limits for mobile use
- Whether to preserve all existing metadata or only update the targeted fields

## License

MIT. See `LICENSE`.
