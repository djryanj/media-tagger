# Contributing

Thanks for contributing.

## Current Phase

This project is preparing for its first release. Favor small, focused changes that move the core upload-to-download workflow forward.

## Before You Start

1. Read the project overview in `README.md`.
2. Review the implementation constraints in `.github/copilot-instructions.md`.
3. Check `AGENTS.md` for repository-specific guidance.
4. Install workspace dependencies with `pnpm install` inside the devcontainer.

## Development Expectations

- Keep the payload contract exact: `tags:<csv list of tags>` with an optional trailing `;`.
- Prefer root-cause fixes over one-off exceptions.
- Add or update tests whenever behavior changes.
- Keep documentation aligned with code and tooling changes.
- Avoid widening the product scope before the core workflow is complete.

## Pull Requests

- Keep changes narrowly scoped.
- Explain the user-visible effect and the technical rationale.
- Note any follow-up work or known limitations.

## Security

Do not disclose security issues in public issues. Follow the private reporting guidance in `.github/SECURITY.md`.
