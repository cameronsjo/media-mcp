# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Goodreads scraping now emits warning diagnostics when search or detail selectors produce no usable data.

### Added

- Docker Compose for local and homelab deployment
- Makefile with dev/build/test/docker targets
- OCI labels on container image
- Cosign image signing and SLSA provenance attestation
- ARM64 container image support
- `.env.example` for onboarding
- CONTRIBUTING guide and LICENSE file
- Runtime validation for upstream media source responses

### Changed

- Consolidated CI workflows (merged test.yml into ci.yml)
- Added periodic cleanup for expired cache entries
- Reserve rate-limit slots before dispatching outbound requests.
- Migrated MCP serving to the v2 stateless SDK while retaining stdio and legacy HTTP clients
- Stateless `GET` and `DELETE /mcp` now return HTTP 405; use `POST`.
- Validate HTTP Host/Origin against localhost and explicit LAN allowlists; reject foreign preflights and return JSON parse errors for malformed bodies.
- Breaking HTTP migration: LAN clients must configure `MCP_ALLOWED_HOSTS`; `/health` and `/api/widget` also apply Host/Origin guards. These guards are not authentication. Docker Compose now publishes on loopback by default.
- Return sanitized JSON errors for HTTP handler exceptions and body-parser failures.
- Retain body-parser 4xx statuses and log structured HTTP error messages/stacks server-side without exposing them in client responses.

## [1.0.0] - 2024-12-01

### Added

- MCP server with stdio and HTTP transports
- `lookup_book` tool with Open Library, Google Books, and Goodreads sources
- `lookup_movie` and `lookup_tv` tools via TMDB
- `generate_frontmatter` tool for Obsidian YAML output
- `batch_lookup` tool for concurrent multi-item lookups
- SQLite response cache with configurable TTL
- OpenTelemetry tracing and metrics
- Homepage dashboard widget endpoint (`/api/widget`)
- Health check endpoint (`/health`)
- Graceful shutdown with SIGTERM/SIGINT handling
