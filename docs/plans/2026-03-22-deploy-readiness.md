# Deploy Readiness Plan

## Context

media-metadata-mcp has working code (dual transport, graceful shutdown, health check, OTel) but is missing production infrastructure: OCI labels, container signing, docker-compose, Makefile, LICENSE, and has redundant CI workflows. This plan closes those gaps.

**Deferred**: npm-to-pnpm migration, ESLint/Prettier-to-Biome migration.

## Steps

### 1. Create foundational project files

| File | Content |
|------|---------|
| `LICENSE` | MIT, Copyright 2024 Cameron Sjo |
| `CHANGELOG.md` | Keep a Changelog format, `[Unreleased]` + `[1.0.0]` section |
| `CONTRIBUTING.md` | Prerequisites, setup, dev workflow, testing, commit conventions |

Commit: `docs: add LICENSE, CHANGELOG, and CONTRIBUTING`

### 2. Create `.env.example`

All env vars from `src/utils/config.ts` with defaults as comments, grouped by section. API key values left blank so `cp .env.example .env` is valid.

Commit: `docs: add .env.example with all config vars`

### 3. Create `Makefile`

Targets: `help` (default), `dev`, `dev-http`, `build`, `clean`, `lint`, `typecheck`, `test`, `docker-build`, `docker-run`, `docker-compose-up`, `docker-compose-down`. All delegate to npm scripts. Self-documenting help via grep pattern.

Commit: `chore: add Makefile with dev/build/test/docker targets`

### 4. Create `docker-compose.yml`

Single service `media-mcp`: builds from `.`, named volume for SQLite cache, `TMDB_API_KEY` required (fail-fast `?` syntax), OTEL vars passed through, `restart: unless-stopped`.

Commit: `feat: add docker-compose for local and homelab deployment`

### 5. Add OCI labels to `Dockerfile` + update `.dockerignore`

Add static LABEL block to production stage: `source`, `description`, `licenses`. Dynamic labels (`version`, `revision`, `created`) handled by `docker/metadata-action` in CI.

Add `docker-compose*` and `Makefile` to `.dockerignore`.

Commit: `chore(docker): add OCI labels and update dockerignore`

### 6. Upgrade `.github/workflows/docker.yml`

- Add permissions: `id-token: write`, `attestations: write`
- Add QEMU setup for ARM64
- Conditional platforms: `linux/amd64` on PRs, `linux/amd64,linux/arm64` on push/tag
- Add Cosign installer + keyless signing step
- Add `actions/attest-build-provenance@v2` step
- Both signing/attestation gated on `github.event_name != 'pull_request'`

Commit: `ci(docker): add Cosign signing, SLSA provenance, ARM64`

### 7. Consolidate CI workflows

- Delete `.github/workflows/test.yml`
- Upgrade `.github/workflows/ci.yml`:
  - Remove `master` from branch list
  - Split into jobs: `lint-and-typecheck`, `test` (matrix 20/22 with coverage), `integration-tests` (main-only, needs TMDB_API_KEY), `release`
  - Add codecov upload with `continue-on-error: true`

Commit: `ci: consolidate workflows and add coverage upload`

## Files touched

| Action | File |
|--------|------|
| Create | `LICENSE` |
| Create | `CHANGELOG.md` |
| Create | `CONTRIBUTING.md` |
| Create | `.env.example` |
| Create | `Makefile` |
| Create | `docker-compose.yml` |
| Modify | `Dockerfile` |
| Modify | `.dockerignore` |
| Modify | `.github/workflows/docker.yml` |
| Delete | `.github/workflows/test.yml` |
| Modify | `.github/workflows/ci.yml` |

## Watch items

- **ARM64 + better-sqlite3**: QEMU builds are slow but work since build tools are already in the builder stage
- **Codecov token**: `codecov-action@v4` may need `CODECOV_TOKEN` secret; using `continue-on-error: true`
- **Integration test secrets**: `TMDB_API_KEY` must exist in repo secrets (already does per test.yml)

## Verification

1. `make help` — all targets listed
2. `make build && make test` — build and tests pass
3. `docker build -t media-metadata-mcp .` — builds with OCI labels
4. `docker inspect media-metadata-mcp | jq '.[0].Config.Labels'` — labels present
5. `cp .env.example .env` + fill TMDB key → `make docker-compose-up` → `curl localhost:3000/health` returns healthy
6. Push to branch → CI runs lint, typecheck, test with coverage
7. Push tag → Docker workflow builds amd64+arm64, signs, attests
