SHELL := /bin/bash

PNPM ?= pnpm
DEFAULT_GOAL := help
API_FILTER := @media-tagger/api
WEB_FILTER := @media-tagger/web
PLAYWRIGHT_BROWSER ?= chromium

.DEFAULT_GOAL := $(DEFAULT_GOAL)

.PHONY: help doctor doctor-tools install install-playwright setup reset-deps dev dev-api dev-web build build-api build-web docker-build lint lint-api lint-web typecheck typecheck-api typecheck-web test test-api test-web test-e2e-web show-report-e2e-web preview-web start-api ci ci-api ci-web clean

help:
	@printf "Targets:\n"
	@printf "  make doctor       Verify required local tooling\n"
	@printf "  make install      Install workspace dependencies\n"
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
	@printf "  make show-report-e2e-web Serve the Playwright HTML report on 0.0.0.0\n"
	@printf "  make preview-web  Preview the built web app\n"
	@printf "  make start-api    Start the built API server\n"
	@printf "  make ci           Run the local CI-style verification set\n"
	@printf "  make ci-api       Run lint, typecheck, test, and build for the API package\n"
	@printf "  make ci-web       Run lint, typecheck, test, and build for the web package\n"
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
	$(PNPM) --filter $(WEB_FILTER) exec playwright install $(PLAYWRIGHT_BROWSER)

setup: install

reset-deps: doctor
	rm -rf node_modules apps/api/node_modules apps/web/node_modules
	$(MAKE) install

dev:
	$(PNPM) dev

dev-api:
	$(PNPM) dev:api

dev-web:
	$(PNPM) dev:web

build:
	$(PNPM) build

build-api:
	$(PNPM) --filter $(API_FILTER) build

build-web:
	$(PNPM) --filter $(WEB_FILTER) build

docker-build:
	docker build -t media-tagger:local .

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
	$(PNPM) test:e2e:web

show-report-e2e-web:
	$(PNPM) --filter $(WEB_FILTER) exec playwright show-report --host 0.0.0.0 --port 9323

preview-web:
	$(PNPM) --filter $(WEB_FILTER) preview

start-api:
	$(PNPM) --filter $(API_FILTER) start

ci: lint typecheck test build

ci-api: lint-api typecheck-api test-api build-api

ci-web: lint-web typecheck-web test-web build-web

clean:
	rm -rf apps/api/dist apps/web/dist coverage playwright-report test-results apps/web/playwright-report apps/web/test-results
