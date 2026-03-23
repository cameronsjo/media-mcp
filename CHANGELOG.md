# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Docker Compose for local and homelab deployment
- Makefile with dev/build/test/docker targets
- OCI labels on container image
- Cosign image signing and SLSA provenance attestation
- ARM64 container image support
- `.env.example` for onboarding
- CONTRIBUTING guide and LICENSE file

### Changed

- Consolidated CI workflows (merged test.yml into ci.yml)

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
