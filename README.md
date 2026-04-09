# Media Tagger

Media Tagger is a mobile-first web app for writing a single specific metadata payload into still images, GIFs, and videos for the purpose of pre-seeding the image with tags that its sister application, [Media Viewer](https://github.com/djryanj/media-viewer) can consume. One set of tags can be applied to up to 10 selected files in one submission.

The reason you might want this is because [Media Viewer](https://github.com/djryanj/media-viewer) does not have (and will not have) the ability to upload media to it. So if your workflow sometimes looks like this:

`Download Media On Mobile Device -> Sync to Media Viewer` (where the `->` might even have multiple intermediate steps and be largely asynchonous and even take hours depending on sync cycles), you might want to pre-seed the downloaded media with tags that could easily be forgotten before they show up in Media Viewer. This simple app allows you to make sure those tags are applied right away.

## Workflow

The core workflow is intentionally narrow:

1. Upload up to 10 supported media files.
2. Enter tags.
3. Render the payload in the exact shape `tags:<csv list of tags>`.
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

## Getting Started

1. Open the repository in the devcontainer.
2. Install dependencies with `make install`.
3. Verify the installed toolchain with `make doctor`.
4. Start the package dev servers with `make dev`, `make dev-api`, or `make dev-web`.

The API and Vite servers bind to `0.0.0.0` so forwarded ports work correctly from the devcontainer.

## Upload Memory Use

The API chooses between two upload paths per file:

- Files above `MEDIA_TAGGER_MAX_UPLOAD_BYTES` are rejected before processing.
- Files at or below `MEDIA_TAGGER_IN_MEMORY_UPLOAD_LIMIT_BYTES` are buffered in RAM before the metadata write.
- Larger files are streamed to `/tmp` and tagged from disk.

The default upload cap is `1073741824` bytes, which is 1 GiB. The default in-memory threshold is `536870912` bytes, which is 512 MiB. The web UI reads both values from `GET /api/config` and sends each file's declared size with the upload so the server can choose a fast path early. The server still treats the observed stream size as authoritative and will spill to disk if a file grows past the configured memory threshold.

The same config payload also exposes the running build version and git hash so the server startup log and the UI show exactly which build is serving requests.

Operationally, that means:

- Lowering the threshold reduces per-request RAM pressure.
- Raising the threshold can improve throughput for mid-sized files, but increases worst-case memory use.
- Raising the upload cap requires corresponding increases to HTTP body limits, `/tmp` sizing, and any ingress or proxy upload limits.
- `/tmp` must be large enough for staged uploads and rewritten outputs.
- Kubernetes memory limits and ephemeral storage sizing should both be set with this behavior in mind.

## Common Commands

- `make help` prints the available workflow targets.
- `make ci` runs the local CI-style checks: lint, typecheck, test, and build.
- `make ci-api` and `make ci-web` run the same validation flow for just one app.
- `make test-api`, `make test-web`, `make typecheck-api`, and `make typecheck-web` replace direct `pnpm --filter ...` validation commands.
- `make test-e2e-web` runs the Playwright mobile browser flow against the production-style server in both mobile Chromium and mobile Firefox configurations.
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
docker build \
	--build-arg VERSION=v0.2.0 \
	--build-arg COMMIT=$(git rev-parse --short=8 HEAD) \
	-t media-tagger:local .
```

Run it with a read-only filesystem, a writable tmpfs for metadata processing, and dropped Linux capabilities:

```bash
docker run --rm \
	--publish 3000:3000 \
	--env MEDIA_TAGGER_VERSION=v0.2.0 \
	--env MEDIA_TAGGER_GIT_HASH=$(git rev-parse --short=8 HEAD) \
	--env MEDIA_TAGGER_MAX_UPLOAD_BYTES=1073741824 \
	--env MEDIA_TAGGER_IN_MEMORY_UPLOAD_LIMIT_BYTES=536870912 \
	--read-only \
	--tmpfs /tmp:rw,noexec,nosuid,size=2g \
	--cap-drop ALL \
	--security-opt no-new-privileges:true \
	media-tagger:local
```

The container serves both the React frontend and the Fastify API on port `3000`. Size `/tmp` for the largest uploads you expect to stage on disk, plus rewritten output files.

### Docker Compose

The repository includes [compose.yml](compose.yml). Start the app with:

```bash
MEDIA_TAGGER_VERSION=v0.2.0 MEDIA_TAGGER_GIT_HASH=$(git rev-parse --short=8 HEAD) docker-compose up --build
```

Then open `http://127.0.0.1:3000`.

Set `MEDIA_TAGGER_VERSION`, `MEDIA_TAGGER_GIT_HASH`, `MEDIA_TAGGER_MAX_UPLOAD_BYTES`, and `MEDIA_TAGGER_IN_MEMORY_UPLOAD_LIMIT_BYTES` in Compose when you want different build metadata, upload-cap, or RAM-threshold behavior than the defaults.

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

When setting Kubernetes `resources`, account for both:

- the in-memory threshold for buffered uploads
- the maximum upload size accepted by Fastify and any upstream ingress
- the `/tmp` space needed for staged uploads and rewritten outputs

If you reduce the pod memory limit, reduce `MEDIA_TAGGER_IN_MEMORY_UPLOAD_LIMIT_BYTES` as well.

## License

MIT. See `LICENSE`.
