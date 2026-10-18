# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Series parsing now recognizes `Name - Series Name Series Book N` (also `Series, Book N`) and `Name: Part N of the Series Name Series`. Both require the literal word "Series" to close the series name, so subtitles, `Part 1 of 2` counts, and "the Series" are left alone. Each rule is pinned by a corpus of real Open Library and Goodreads titles (#48).

### Fixed

- Series names from `(Name, #N)` and `(Name, Book N)` no longer keep a trailing comma, and a parenthetical series name can no longer swallow an earlier parenthetical, so `Fourth Wing (Part 1 of 2) [Dramatized Adaptation] (The Empyrean, #1)` yields series `The Empyrean` (#48).
- Added an attributed exact-record-title corpus and regression matrix for series parsing. The new dash and `Part N of ...` heuristics were removed after review showed they could damage subtitles and format labels; #48 remains open for a structured metadata approach.
- Structured series metadata from a book source now takes precedence over title parsing from another source.
- Preserve non-retryable TMDB not-found errors for explicit movie/TV IDs and default unclassified exceptions to non-retryable.

- Standardized tool and batch application errors on the shared error-code schema, including source and retryability metadata; preserved source fallbacks and SDK protocol errors.

- Removed an unreachable series-extraction pattern and added a regression test pinning existing colon-subtitle behavior (for example, `Dune: Messiah (Book 2)`).
- Goodreads scraping now emits warning diagnostics when search or detail selectors produce no usable data.
- Fixed non-ASCII fuzzy similarity by preserving Unicode letters and combining marks, with NFC normalization for equivalent spellings.

### Added

- Documented manual Semantic Versioning and changelog updates, with npm version-bump scripts that do not create commits or tags.

- Docker Compose for local and homelab deployment
- Makefile with dev/build/test/docker targets
- OCI labels on container image
- Cosign image signing and SLSA provenance attestation
- ARM64 container image support
- `.env.example` for onboarding
- CONTRIBUTING guide and LICENSE file
- Runtime validation for upstream media source responses

### Changed

- Replaced the custom frontmatter YAML serializer with the maintained `yaml` library, including round-trip coverage for escaped, multiline, nested, and ambiguous values.
- Consolidated CI workflows (merged test.yml into ci.yml)
- HTTP `logging/setLevel` now announces `log_level_changed`, matching stdio; omitted `tools/call` arguments now reach `executeToolCall` as `undefined` instead of `{}`.
- Added periodic cleanup for expired cache entries
- Reserve rate-limit slots before dispatching outbound requests.
- Migrated MCP serving to the v2 stateless SDK while retaining stdio and legacy HTTP clients
- Stateless `GET` and `DELETE /mcp` now return HTTP 405; use `POST`.
- Validate HTTP Host/Origin against localhost and explicit LAN allowlists; reject foreign preflights and return JSON parse errors for malformed bodies.
- Breaking HTTP migration: LAN clients must configure `MCP_ALLOWED_HOSTS`; `/health` and `/api/widget` also apply Host/Origin guards. These guards are not authentication. Docker Compose now publishes on loopback by default.
- Return sanitized JSON errors for HTTP handler exceptions and body-parser failures.
- Retain body-parser 4xx statuses and log structured HTTP error messages/stacks server-side without exposing them in client responses.
- Updated grouped dependency security fixes and migrated telemetry initialization to OpenTelemetry 2 APIs
- Aligned the declared Node minimum with the production dependency requirement of 20.18.1

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
