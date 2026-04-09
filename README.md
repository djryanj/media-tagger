# Media Tagger

Media Tagger is a mobile-first web app for writing a single canonical metadata payload into still images, GIFs, and videos.

One set of tags can be applied to up to 10 selected files in one submission.

The core workflow is intentionally narrow:

1. Upload up to 10 supported media files.
2. Enter tags.
3. Render the payload in the exact shape `tags:<csv list of tags>` with an optional trailing `;`.
4. Download each updated file individually in the browser.

## Supported Formats

The current supported set for metadata writing is JPG, JPEG, PNG, WebP, GIF, MP4, and MOV.

## Stack

- TypeScript monorepo managed with pnpm workspaces
- React and Vite for the mobile-first frontend
- Fastify for the upload and metadata API
- exiftool for metadata write and readback verification
- Vitest for unit and integration testing
- Playwright for end-to-end testing

## Repository Layout

- `.devcontainer/` contains the development container definition.
- `.github/copilot-instructions.md` captures the repository constraints and engineering guidance.
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
2. Install dependencies with `make install`.
3. Verify the installed toolchain with `make doctor`.
4. Start the package dev servers with `make dev`, `make dev-api`, or `make dev-web`.

The API and Vite servers bind to `0.0.0.0` so forwarded ports work correctly from the devcontainer.

## Common Commands

- `make help` prints the available workflow targets.
- `make ci` runs the local CI-style checks: lint, typecheck, test, and build.
- `make ci-api` and `make ci-web` run the same validation flow for just one app.
- `make test-api`, `make test-web`, `make typecheck-api`, and `make typecheck-web` replace direct `pnpm --filter ...` validation commands.
- `make test-e2e-web` runs the Playwright mobile browser flow against the production-style server.
- `make docker-build` builds the production image locally as `media-tagger:local`.
- `make prepare-release VERSION=vX.Y.Z` creates a release branch, bumps workspace package versions, and stamps the changelog date.
- `make tag-release VERSION=vX.Y.Z` creates and pushes the annotated release tag that triggers the GitHub release workflow.
- `make clean` removes generated build and test output.

## Release Process

Releases are tag-driven through GitHub Actions.

1. Run `make prepare-release VERSION=vX.Y.Z` from a clean local `main` branch.
2. Open and merge the generated `release/vX.Y.Z` pull request.
3. Run `git checkout main && git pull --ff-only origin main`.
4. Run `make tag-release VERSION=vX.Y.Z`.

Pushing the `vX.Y.Z` tag triggers [release.yml](.github/workflows/release.yml), which:

1. runs API verification with `make ci-api`
2. runs web verification with `make ci-web`
3. runs Playwright end-to-end coverage with `make test-e2e-web`
4. publishes the production container image to GHCR via [docker-build.yml](.github/workflows/docker-build.yml)
5. creates the GitHub Release and includes the published image digest and tags

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

## License

MIT. See `LICENSE`.
