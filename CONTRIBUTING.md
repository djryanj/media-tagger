# Contributing

Thanks for contributing.

## Scope

Favor small, focused changes that keep the upload-to-download workflow reliable.

## Before You Start

1. Read the project overview in `README.md`.
2. Review the implementation constraints in `.github/copilot-instructions.md`.
3. Check `AGENTS.md` for repository-specific guidance.
4. Install workspace dependencies with `make install` inside the devcontainer.

## Development Expectations

- Keep the payload contract exact: `tags:<csv list of tags>` unless the user types extra literal characters into the tags input.
- Prefer root-cause fixes over one-off exceptions.
- Add or update tests whenever behavior changes.
- Keep documentation aligned with code and tooling changes.
- When upload buffering behavior changes, update the RAM and `/tmp` sizing guidance as well as the server/UI config flow.
- Avoid widening the product scope before the core workflow is complete.

## Release Workflow

Use the Makefile targets instead of creating release branches and tags by hand.

1. Run `make prepare-release VERSION=vX.Y.Z` from a clean `main` branch.
2. Open and merge the generated `release/vX.Y.Z` pull request.
3. Pull the updated `main` branch.
4. Run `make tag-release VERSION=vX.Y.Z` to push the annotated release tag.

The pushed tag triggers the GitHub release workflow, which verifies the API and web packages, runs Playwright coverage, publishes the container image, and creates the GitHub Release entry.

## Pull Requests

- Keep changes narrowly scoped.
- Explain the user-visible effect and the technical rationale.
- Note any follow-up work or known limitations.

## Security

Do not disclose security issues in public issues. Follow the private reporting guidance in `.github/SECURITY.md`.
