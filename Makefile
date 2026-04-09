SHELL := /bin/bash

PNPM ?= pnpm
DEFAULT_GOAL := help
API_FILTER := @media-tagger/api
WEB_FILTER := @media-tagger/web
PLAYWRIGHT_BROWSERS ?= chromium firefox
PLAYWRIGHT_PROJECT ?=
VERSION ?=
VERSION_TAG := $(if $(filter v%,$(VERSION)),$(VERSION),v$(VERSION))
VERSION_NUM := $(patsubst v%,%,$(VERSION_TAG))
RELEASE_PACKAGE_FILES := package.json apps/api/package.json apps/web/package.json
PACKAGE_VERSION := $(shell sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*$$/\1/p' package.json | head -n 1)
BUILD_VERSION ?= v$(PACKAGE_VERSION)
BUILD_COMMIT ?= $(shell git rev-parse --short=8 HEAD 2>/dev/null || printf 'unknown')

.DEFAULT_GOAL := $(DEFAULT_GOAL)

.PHONY: help doctor doctor-tools install install-playwright setup reset-deps dev dev-api dev-web build build-api build-web docker-build lint lint-api lint-web typecheck typecheck-api typecheck-web test test-api test-web test-e2e-web show-report-e2e-web preview-web start-api ci ci-api ci-web _check-version prepare-release-check prepare-release tag-release clean

help:
	@printf "Targets:\n"
	@printf "  make doctor       Verify required local tooling\n"
	@printf "  make install      Install workspace dependencies\n"
	@printf "                   Default Playwright browsers: $(PLAYWRIGHT_BROWSERS)\n"
	@printf "  make setup        Alias for install\n"
	@printf "  make reset-deps   Remove workspace dependencies and reinstall from lockfile\n"
	@printf "  make dev          Start API and web dev servers\n"
	@printf "  make dev-api      Start only the API dev server\n"
	@printf "  make dev-web      Start only the web dev server\n"
	@printf "  make build        Build all workspace packages\n"
	@printf "  make build-api    Build only the API package\n"
	@printf "  make build-web    Build only the web package\n"
	@printf "  make docker-build Build the production container image\n"
	@printf "  make lint         Run lint checks across the workspace\n"
	@printf "  make lint-api     Run lint checks for the API package\n"
	@printf "  make lint-web     Run lint checks for the web package\n"
	@printf "  make typecheck    Run TypeScript checks across the workspace\n"
	@printf "  make typecheck-api Run TypeScript checks for the API package\n"
	@printf "  make typecheck-web Run TypeScript checks for the web package\n"
	@printf "  make test         Run workspace tests\n"
	@printf "  make test-api     Run tests for the API package\n"
	@printf "  make test-web     Run tests for the web package\n"
	@printf "  make test-e2e-web Run the web Playwright end-to-end tests\n"
	@printf "                   Optional: PLAYWRIGHT_PROJECT=mobile-firefox\n"
	@printf "  make show-report-e2e-web Serve the Playwright HTML report on 0.0.0.0\n"
	@printf "  make preview-web  Preview the built web app\n"
	@printf "  make start-api    Start the built API server\n"
	@printf "  make ci           Run the local CI-style verification set\n"
	@printf "  make ci-api       Run lint, typecheck, test, and build for the API package\n"
	@printf "  make ci-web       Run lint, typecheck, test, and build for the web package\n"
	@printf "  make prepare-release-check VERSION=vX.Y.Z Dry-run the release bash commands against temp copies of the current files\n"
	@printf "  make prepare-release VERSION=vX.Y.Z Create a release branch, bump versions, and stamp the changelog\n"
	@printf "  make tag-release VERSION=vX.Y.Z     Create and push the annotated release tag from main\n"
	@printf "  make clean        Remove generated build and test output\n"

doctor-tools:
	@command -v node >/dev/null || { echo "node is required"; exit 1; }
	@command -v $(PNPM) >/dev/null || { echo "pnpm is required"; exit 1; }
	@command -v exiftool >/dev/null || { echo "exiftool is required"; exit 1; }
	@command -v make >/dev/null || { echo "make is required"; exit 1; }
	@echo "node: $$(node --version)"
	@echo "pnpm: $$($(PNPM) --version)"
	@echo "exiftool: $$(exiftool -ver)"
	@echo "make: $$(make --version | head -n 1)"

doctor: doctor-tools
	@if [ -d node_modules ]; then \
		playwright_version="$$($(PNPM) --filter $(WEB_FILTER) exec playwright --version)" || { echo "playwright: package is not installed; run make install"; exit 1; }; \
		echo "playwright: $${playwright_version}"; \
		test -d "$$HOME/.cache/ms-playwright" || { echo "playwright browsers are not installed; run make install"; exit 1; }; \
		echo "playwright browsers: installed"; \
	else \
		echo "playwright: workspace dependencies not installed yet; run make install"; \
	fi

install: doctor-tools
	$(PNPM) install
	$(MAKE) install-playwright

install-playwright:
	$(PNPM) --filter $(WEB_FILTER) exec playwright install $(PLAYWRIGHT_BROWSERS)

setup: install

reset-deps: doctor
	rm -rf node_modules apps/api/node_modules apps/web/node_modules
	$(MAKE) install

dev:
	MEDIA_TAGGER_VERSION=$(BUILD_VERSION) MEDIA_TAGGER_GIT_HASH=$(BUILD_COMMIT) $(PNPM) dev

dev-api:
	MEDIA_TAGGER_VERSION=$(BUILD_VERSION) MEDIA_TAGGER_GIT_HASH=$(BUILD_COMMIT) $(PNPM) dev:api

dev-web:
	$(PNPM) dev:web

build:
	$(PNPM) build

build-api:
	$(PNPM) --filter $(API_FILTER) build

build-web:
	$(PNPM) --filter $(WEB_FILTER) build

docker-build:
	docker build --build-arg VERSION=$(BUILD_VERSION) --build-arg COMMIT=$(BUILD_COMMIT) -t media-tagger:local .

lint:
	$(PNPM) lint

lint-api:
	$(PNPM) --filter $(API_FILTER) lint

lint-web:
	$(PNPM) --filter $(WEB_FILTER) lint

typecheck:
	$(PNPM) typecheck

typecheck-api:
	$(PNPM) --filter $(API_FILTER) typecheck

typecheck-web:
	$(PNPM) --filter $(WEB_FILTER) typecheck

test:
	$(PNPM) test

test-api:
	$(PNPM) --filter $(API_FILTER) test

test-web:
	$(PNPM) --filter $(WEB_FILTER) test

test-e2e-web:
	$(PNPM) --filter $(WEB_FILTER) exec playwright test $(if $(PLAYWRIGHT_PROJECT),--project $(PLAYWRIGHT_PROJECT),)

show-report-e2e-web:
	$(PNPM) --filter $(WEB_FILTER) exec playwright show-report --host 0.0.0.0 --port 9323

preview-web:
	$(PNPM) --filter $(WEB_FILTER) preview

start-api:
	MEDIA_TAGGER_VERSION=$(BUILD_VERSION) MEDIA_TAGGER_GIT_HASH=$(BUILD_COMMIT) $(PNPM) --filter $(API_FILTER) start

ci: lint typecheck test build

ci-api: lint-api typecheck-api test-api build-api

ci-web: lint-web typecheck-web test-web build-web

_check-version:
	@[ -n "$(VERSION)" ] || { \
		echo "Error: VERSION is required. Example: make $(MAKECMDGOALS) VERSION=v0.1.0"; \
		exit 1; \
	}
	@echo "$(VERSION_TAG)" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9][A-Za-z0-9.-]*)?$$' || { \
		echo "Error: VERSION must be in vX.Y.Z or vX.Y.Z-pre format (for example: v0.1.0 or v0.1.0-rc.1)."; \
		exit 1; \
	}

prepare-release: _check-version
	@echo "--- Checking working tree is clean --------------------------------"
	@git diff --quiet && git diff --cached --quiet || { \
		echo "Error: Working tree has uncommitted changes. Commit or stash them first."; \
		exit 1; \
	}
	@echo "--- Ensuring current branch is main -------------------------------"
	@[ "$$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { \
		echo "Error: prepare-release must be run from the main branch."; \
		exit 1; \
	}
	@echo "--- Updating local main -------------------------------------------"
	@git pull --ff-only origin main
	@echo "--- Ensuring release branch does not already exist ---------------"
	@if git show-ref --verify --quiet refs/heads/release/$(VERSION_TAG); then \
		echo "Error: release/$(VERSION_TAG) already exists locally."; \
		exit 1; \
	fi
	@if git ls-remote --exit-code --heads origin release/$(VERSION_TAG) >/dev/null 2>&1; then \
		echo "Error: release/$(VERSION_TAG) already exists on origin."; \
		exit 1; \
	fi
	@echo "--- Validating release files -------------------------------------"
	@escaped_version=$$(printf '%s' '$(VERSION_NUM)' | sed 's/\./\\./g'); \
	grep -Eq "^## \[$$escaped_version\] - Unreleased$$" CHANGELOG.md || { \
		echo "Error: CHANGELOG.md does not contain \"## [$(VERSION_NUM)] - Unreleased\"."; \
		exit 1; \
	}
	@echo "--- Creating branch release/$(VERSION_TAG) ------------------------"
	@git checkout -b release/$(VERSION_TAG)
	@echo "--- Bumping workspace package versions to $(VERSION_NUM) ---------"
	@for file in $(RELEASE_PACKAGE_FILES); do \
		current_version=$$(sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*$$/\1/p' "$$file" | head -n 1); \
		[ -n "$$current_version" ] || { \
			echo "Error: $$file does not contain a version field."; \
			exit 1; \
		}; \
		sed -i -E "0,/^([[:space:]]*\"version\":[[:space:]]*\")[^\"]+(\"[[:space:]]*,?[[:space:]]*)$$/s//\1$(VERSION_NUM)\2/" "$$file"; \
	done
	@echo "--- Stamping CHANGELOG.md -----------------------------------------"
	@escaped_version=$$(printf '%s' '$(VERSION_NUM)' | sed 's/\./\\./g'); \
	today=$$(date -u '+%Y-%m-%d'); \
	sed -i "s/^## \[$$escaped_version\] - Unreleased$$/## [$(VERSION_NUM)] - $$today/" CHANGELOG.md; \
	grep -Eq "^## \[$$escaped_version\] - $$today$$" CHANGELOG.md || { \
		echo "Error: Failed to stamp CHANGELOG.md for $(VERSION_NUM)."; \
		exit 1; \
	}
	@echo "--- Committing release preparation --------------------------------"
	@git add $(RELEASE_PACKAGE_FILES) CHANGELOG.md
	@git commit -m "chore(release): prepare $(VERSION_TAG)"
	@echo "--- Pushing release branch ----------------------------------------"
	@git push -u origin release/$(VERSION_TAG)
	@echo ""
	@echo "Release branch ready. Next steps:"
	@echo "  1. Open a PR: release/$(VERSION_TAG) -> main"
	@echo "  2. Merge the PR"
	@echo "  3. git checkout main && git pull --ff-only origin main"
	@echo "  4. make tag-release VERSION=$(VERSION_TAG)"

prepare-release-check: _check-version
	@echo "--- Ensuring current branch is main -------------------------------"
	@[ "$$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { \
		echo "Error: prepare-release-check must be run from the main branch."; \
		exit 1; \
	}
	@echo "--- Fetching remote main metadata ---------------------------------"
	@git fetch origin main --quiet
	@echo "--- Ensuring release branch does not already exist ---------------"
	@if git show-ref --verify --quiet refs/heads/release/$(VERSION_TAG); then \
		echo "Error: release/$(VERSION_TAG) already exists locally."; \
		exit 1; \
	fi
	@if git ls-remote --exit-code --heads origin release/$(VERSION_TAG) >/dev/null 2>&1; then \
		echo "Error: release/$(VERSION_TAG) already exists on origin."; \
		exit 1; \
	fi
	@echo "--- Exercising release bash commands on temp file copies ---------"
	@set -e; \
	temp_dir="$$(mktemp -d)"; \
	trap 'rm -rf "$$temp_dir"' EXIT; \
	mkdir -p "$$temp_dir/apps/api" "$$temp_dir/apps/web"; \
	cp package.json "$$temp_dir/package.json"; \
	cp apps/api/package.json "$$temp_dir/apps/api/package.json"; \
	cp apps/web/package.json "$$temp_dir/apps/web/package.json"; \
	cp CHANGELOG.md "$$temp_dir/CHANGELOG.md"; \
	for file in \
		"$$temp_dir/package.json" \
		"$$temp_dir/apps/api/package.json" \
		"$$temp_dir/apps/web/package.json"; do \
		current_version=$$(sed -nE 's/^[[:space:]]*"version":[[:space:]]*"([^"]+)".*$$/\1/p' "$$file" | head -n 1); \
		[ -n "$$current_version" ] || { \
			echo "Error: $$file does not contain a version field."; \
			exit 1; \
		}; \
		sed -i -E "0,/^([[:space:]]*\"version\":[[:space:]]*\")[^\"]+(\"[[:space:]]*,?[[:space:]]*)$$/s//\1$(VERSION_NUM)\2/" "$$file"; \
	done; \
	escaped_version=$$(printf '%s' '$(VERSION_NUM)' | sed 's/\./\\./g'); \
	today=$$(date -u '+%Y-%m-%d'); \
	grep -Eq "^## \[$$escaped_version\] - Unreleased$$" "$$temp_dir/CHANGELOG.md" || { \
		echo "Error: $$temp_dir/CHANGELOG.md does not contain the unreleased entry for $(VERSION_NUM)."; \
		exit 1; \
	}; \
	sed -i "s/^## \[$$escaped_version\] - Unreleased$$/## [$(VERSION_NUM)] - $$today/" "$$temp_dir/CHANGELOG.md"; \
	echo "Verified package version:"; \
	grep -m1 '"version"' "$$temp_dir/package.json"; \
	echo "Verified changelog header:"; \
	grep -m1 '^## \[' "$$temp_dir/CHANGELOG.md"

tag-release: _check-version
	@echo "--- Ensuring current branch is main -------------------------------"
	@[ "$$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { \
		echo "Error: tag-release must be run from the main branch."; \
		exit 1; \
	}
	@echo "--- Checking working tree is clean --------------------------------"
	@git diff --quiet && git diff --cached --quiet || { \
		echo "Error: Working tree has uncommitted changes. Commit or stash them first."; \
		exit 1; \
	}
	@echo "--- Updating local main -------------------------------------------"
	@git pull --ff-only origin main
	@echo "--- Verifying CHANGELOG has a dated entry for [$(VERSION_NUM)] ----"
	@grep -Eq '^## \[$(VERSION_NUM)\] - [0-9]{4}-[0-9]{2}-[0-9]{2}$$' CHANGELOG.md || { \
		echo "Error: CHANGELOG.md has no dated entry for [$(VERSION_NUM)]."; \
		echo "Did you merge the release branch and pull main?"; \
		exit 1; \
	}
	@echo "--- Ensuring tag does not already exist ---------------------------"
	@if git rev-parse -q --verify refs/tags/$(VERSION_TAG) >/dev/null; then \
		echo "Error: tag $(VERSION_TAG) already exists locally."; \
		exit 1; \
	fi
	@if git ls-remote --exit-code --tags origin refs/tags/$(VERSION_TAG) >/dev/null 2>&1; then \
		echo "Error: tag $(VERSION_TAG) already exists on origin."; \
		exit 1; \
	fi
	@echo "--- Creating annotated tag $(VERSION_TAG) -------------------------"
	@git tag -a $(VERSION_TAG) -m "Release $(VERSION_TAG)"
	@echo "--- Pushing tag ---------------------------------------------------"
	@git push origin $(VERSION_TAG)
	@echo ""
	@echo "Tag $(VERSION_TAG) pushed. The GitHub release workflow is now running."

clean:
	rm -rf apps/api/dist apps/web/dist coverage playwright-report test-results apps/web/playwright-report apps/web/test-results
