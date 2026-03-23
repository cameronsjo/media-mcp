.DEFAULT_GOAL := help

IMAGE_NAME := media-metadata-mcp
COMPOSE_FILE := docker-compose.yml

## ── Help ──────────────────────────────────────────────

.PHONY: help
help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

## ── Development ───────────────────────────────────────

.PHONY: dev
dev: ## Start development server (stdio transport)
	npm run dev

.PHONY: dev-http
dev-http: ## Start development server (HTTP transport)
	npm run dev:http

.PHONY: build
build: ## Build TypeScript to dist/
	npm run build

.PHONY: clean
clean: ## Remove dist/ and coverage/
	npm run clean

## ── Quality ───────────────────────────────────────────

.PHONY: lint
lint: ## Run ESLint
	npm run lint

.PHONY: typecheck
typecheck: ## Run TypeScript type checker
	npm run typecheck

.PHONY: test
test: ## Run tests
	npm test

## ── Docker ────────────────────────────────────────────

.PHONY: docker-build
docker-build: ## Build Docker image
	docker build -t $(IMAGE_NAME) .

.PHONY: docker-run
docker-run: ## Run Docker container (requires .env file)
	docker run --rm -p 3000:3000 --env-file .env -v media-mcp-cache:/app/cache $(IMAGE_NAME)

.PHONY: docker-compose-up
docker-compose-up: ## Start services with docker compose
	docker compose -f $(COMPOSE_FILE) up -d

.PHONY: docker-compose-down
docker-compose-down: ## Stop services with docker compose
	docker compose -f $(COMPOSE_FILE) down
