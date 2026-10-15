# Media Metadata MCP Server

An MCP (Model Context Protocol) server that enriches book, movie, and TV show metadata for Obsidian vaults. Queries multiple sources, normalizes data, and returns Obsidian-ready frontmatter.

## Features

- **Book Lookup**: Search by title, author, or ISBN via Open Library
- **Movie Lookup**: Comprehensive movie data from TMDB including cast, directors, collections, and watch providers
- **TV Show Lookup**: Full TV show metadata including seasons, episodes, and networks
- **Frontmatter Generation**: Convert lookup results to Obsidian YAML frontmatter
- **Batch Processing**: Look up multiple items in a single request
- **Caching**: SQLite-based caching with configurable TTLs
- **Multiple Transports**: Support for both stdio and Streamable HTTP transports

## Installation

```bash
npm install
npm run build
```

## Configuration

The server is configured via environment variables. App-specific variables use the `MCP_` prefix; standard API/telemetry variables use their conventional names.

### API Keys

| Variable | Description | Default |
|----------|-------------|---------|
| `TMDB_API_KEY` | TMDB credential for movie/TV lookups — accepts **either** a v3 API Key (32-hex) **or** a v4 Read Access Token; the server auto-detects the scheme | - |
| `GOOGLE_BOOKS_API_KEY` | Google Books API key (optional, for enhanced book data) | - |

### Transport

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_TRANSPORT` | Transport type: `stdio` or `http` | `stdio` |
| `MCP_HTTP_PORT` | HTTP server port | `3000` |
| `MCP_HTTP_HOST` | HTTP server host | `127.0.0.1` |
| `MCP_HTTP_PATH` | HTTP endpoint path | `/mcp` |

### Cache

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_CACHE_ENABLED` | Enable caching | `true` |
| `MCP_CACHE_PATH` | SQLite cache database path | `./cache.db` |
| `MCP_CACHE_TTL_BOOKS` | Book cache TTL in seconds | `604800` (7 days) |
| `MCP_CACHE_TTL_MOVIES` | Movie cache TTL in seconds | `86400` (1 day) |
| `MCP_CACHE_TTL_TV` | TV cache TTL in seconds | `86400` (1 day) |
| `MCP_CACHE_CLEANUP_INTERVAL_MS` | Expired-entry cleanup interval in milliseconds | `3600000` (1 hour) |

### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_RATE_LIMIT_RPM` | Requests per minute | `30` |
| `MCP_RATE_LIMIT_RETRIES` | Retry attempts | `3` |

### Features

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_ENABLE_GOODREADS_SCRAPING` | Enable Goodreads scraping | `true` |
| `MCP_ENABLE_COVER_DOWNLOAD` | Enable cover image download | `false` |
| `MCP_COVER_DOWNLOAD_DIR` | Cover download directory | `./covers` |

### Logging

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_LOG_LEVEL` | Log level: `debug`, `info`, `warn`, `error` | `info` |

### OpenTelemetry

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_ENABLED` | Enable OpenTelemetry | `false` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry endpoint URL | - |
| `OTEL_SERVICE_NAME` | Service name | `media-metadata-mcp` |

### Getting API Keys

#### TMDB API Key (Required for Movie/TV)

1. Create a free account at [TMDB](https://www.themoviedb.org/)
2. Go to Settings → API and request a key (choose the "Developer" option)
3. That page exposes **two** credentials — either one works:
   - **API Key (v3 auth)** — a 32-character hex string, sent as the `api_key` query parameter
   - **API Read Access Token (v4 auth)** — a longer JWT, sent as an `Authorization: Bearer` header
4. Copy **either one** into `TMDB_API_KEY`. The server auto-detects the scheme from the value's shape — do **not** prepend `Bearer `.

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "media-metadata": {
      "command": "node",
      "args": ["/path/to/media-metadata-mcp/dist/index.js"],
      "env": {
        "TMDB_API_KEY": "your-tmdb-api-key"
      }
    }
  }
}
```

### With Claude Code

```json
{
  "mcpServers": {
    "media-metadata": {
      "command": "node",
      "args": ["/path/to/media-metadata-mcp/dist/index.js"],
      "env": {
        "TMDB_API_KEY": "your-tmdb-api-key"
      }
    }
  }
}
```

### HTTP Transport

Start the server with HTTP transport:

```bash
TMDB_API_KEY=your-key MCP_TRANSPORT=http npm start
```

Or:

```bash
TMDB_API_KEY=your-key node dist/index.js --transport http
```

Connect your MCP client to `http://127.0.0.1:3000/mcp`

HTTP requests validate Host and Origin before parsing or dispatch to mitigate
DNS rebinding and cross-origin browser calls. These checks are not authentication
or a remote-access boundary: non-browser clients can set Host and omit Origin.
Use loopback binding, a firewall, or an authenticated proxy to restrict access.
By default, only `localhost`, `127.0.0.1`, and `[::1]` are allowed; native clients may omit
Origin. For LAN/Docker access, set `MCP_ALLOWED_HOSTS=media.internal` and, for
browser clients, `MCP_ALLOWED_ORIGINS=ui.internal`. These comma-separated
hostname lists extend localhost access; use hostnames only, without schemes,
ports, paths, or wildcards. Invalid or empty configured lists fail startup.
Binding `MCP_HTTP_HOST=0.0.0.0` exposes the listener on all interfaces; the header
checks do not prevent remote clients from connecting with an allowed Host.
CORS reflects only a validated Origin, and foreign-origin preflights are rejected.
Malformed JSON returns a JSON-RPC parse error, without an HTML stack trace.
`GET` and `DELETE /mcp` return HTTP 405; stateless requests use `POST`.
This is a breaking migration: existing LAN clients must set `MCP_ALLOWED_HOSTS`
to their connection hostname (and browser clients must set `MCP_ALLOWED_ORIGINS`).
The same Host/Origin guards cover `/health` and `/api/widget`; monitoring clients
must use localhost or an explicitly allowed hostname too. Docker Compose publishes
only on host loopback by default. To expose it deliberately, change the published
address to a specific LAN address and apply appropriate network/authentication controls.

HTTP serving uses the MCP v2 stateless SDK: modern clients send each request
with its protocol envelope and do not need an `initialize` handshake or
`Mcp-Session-Id`. The same endpoint keeps the SDK's stateless legacy
compatibility path for 2025-era clients, and stdio serves both protocol eras.
The SDK's legacy `logging/setLevel` compatibility remains available for now;
migrating to stderr/OpenTelemetry is a follow-up.

## Tools

### lookup_book

Look up book metadata by title, author, or ISBN.

**Input:**
```json
{
  "title": "The Name of the Wind",
  "author": "Patrick Rothfuss",
  "isbn": "978-0756404741"
}
```

**Output:** Book metadata including title, authors, ISBN, genres, page count, description, cover URL, series information, and ratings.

Responses are **compact by default** — `description` is nulled and the noisy `shelves`/`subjects` arrays dropped (the bulk of the payload), keeping genres, tropes, series, ratings, cover, and identifiers. This keeps batch lookups within inline token limits. Pass `compact: false` to get the full description back.

When a source supplies structured series metadata, it owns the series fields while established title suffix cleaning still applies to each source title. The title fallback keeps the established parenthesized, hash, and `Book N` forms. New dash and `Part N of ...` formats remain deferred because their labels are ambiguous with subtitles and format counts; future #48 work should use structured source series metadata rather than adding heuristic patterns.

### lookup_movie

Look up movie metadata by title and optional year.

**Input:**
```json
{
  "title": "Inception",
  "year": 2010
}
```

**Output:** Movie metadata including title, year, runtime, genres, description, cast, director, collection info, ratings, and watch providers.

By default `watch_providers` returns the **`US` region only** — the full map spans ~100 regions and would otherwise dominate the payload. Pass `watch_provider_regions: ["GB", "US"]` to choose regions, `watch_provider_regions: []` for all ~100, or `include_watch_providers: false` to omit the map entirely.

### lookup_tv

Look up TV show metadata by title.

**Input:**
```json
{
  "title": "Breaking Bad",
  "include_seasons": true,
  "include_episodes": false
}
```

**Output:** TV show metadata including title, status, genres, seasons, episodes, networks, and ratings.

### generate_frontmatter

Convert a lookup result to Obsidian YAML frontmatter.

**Input:**
```json
{
  "lookup_result": { /* result from any lookup tool */ },
  "template": "default"
}
```

**Templates:**
- `minimal`: Just title and basic info
- `default`: Standard Obsidian metadata
- `full`: All available fields

**Output:**
```yaml
---
title: "The Name of the Wind"
author: "Patrick Rothfuss"
series: "The Kingkiller Chronicle"
series_position: 1
genres:
  - Fantasy
  - Epic Fantasy
page_count: 662
rating: 4.52
cover: "https://..."
goodreads: "https://www.goodreads.com/book/show/186074"
isbn: "978-0756404741"
status: unread
date_added: 2024-12-07
---
```

### batch_lookup

Batch look up multiple items in a single request.

**Input:**
```json
{
  "items": [
    { "type": "book", "title": "Dune", "author": "Frank Herbert" },
    { "type": "movie", "title": "Blade Runner", "year": 1982 },
    { "type": "tv", "title": "The Wire" }
  ],
  "concurrency": 3
}
```

## Example Session

```
User: Add metadata to my book note for "Project Hail Mary by Andy Weir"

Claude: [calls lookup_book with title="Project Hail Mary", author="Andy Weir"]

Claude: I found the book! Here's the metadata:
- Title: Project Hail Mary
- Author: Andy Weir
- ISBN: 978-0593135204
- Pages: 496
- Genres: Science Fiction, Space Opera
- Rating: 4.52/5

Would you like me to generate the frontmatter for your Obsidian note?
```

## Architecture

```
media-metadata-mcp/
├── src/
│   ├── index.ts              # MCP server entry
│   ├── tools/
│   │   ├── index.ts
│   │   ├── lookup-book.ts
│   │   ├── lookup-movie.ts
│   │   ├── lookup-tv.ts
│   │   ├── batch-lookup.ts
│   │   └── generate-frontmatter.ts
│   ├── sources/
│   │   ├── index.ts
│   │   ├── open-library.ts
│   │   ├── google-books.ts
│   │   ├── goodreads.ts
│   │   └── tmdb.ts
│   ├── cache/
│   │   └── sqlite-cache.ts
│   ├── transport/
│   │   └── http-transport.ts
│   ├── utils/
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── logger.ts
│   │   ├── rate-limiter.ts
│   │   ├── http-client.ts
│   │   ├── fuzzy-match.ts
│   │   ├── merge-results.ts
│   │   └── telemetry.ts
│   └── types/
│       ├── index.ts
│       ├── book.ts
│       ├── movie.ts
│       ├── tv.ts
│       └── common.ts
├── tests/
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## Data Sources

| Source | Auth | Used For |
|--------|------|----------|
| Open Library | None | Book metadata, ISBNs, covers |
| Google Books | API Key (optional) | Book descriptions, metadata enrichment |
| Goodreads | None (scraping) | Ratings, series info, genres, tropes |
| TMDB | API Key | Movies, TV shows, cast, watch providers |

Book lookups merge results from all available sources to provide the most complete metadata.

## Caching

The server uses SQLite for caching with the following TTLs:

| Data Type | TTL |
|-----------|-----|
| Book metadata | 30 days |
| Movie/TV metadata | 7 days |
| TV episodes (active shows) | 1 day |
| Search results | 1 hour |

## Docker

To expose deliberately, replace the loopback publish address with a specific LAN address and enforce network/proxy controls; media-mcp has no authentication ([cameronsjo/media-mcp#47](https://github.com/cameronsjo/media-mcp/issues/47)).

### Build

```bash
docker build -t media-metadata-mcp .
```

### Run

```bash
docker run -d \
  --name media-mcp \
  -p 127.0.0.1:3000:3000 \
  -e TMDB_API_KEY=your-key \
  -v media-mcp-cache:/app/cache \
  media-metadata-mcp
```

### Docker Compose

```yaml
services:
  media-mcp:
    build: .
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - TMDB_API_KEY=${TMDB_API_KEY}
      - GOOGLE_BOOKS_API_KEY=${GOOGLE_BOOKS_API_KEY}  # optional
    volumes:
      - media-mcp-cache:/app/cache
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  media-mcp-cache:
```

### Health Check

The HTTP server exposes a health endpoint at `/health`:

```bash
curl http://localhost:3000/health
# {"status":"healthy","sessions":0,"timestamp":"..."}
```

## Development

```bash
# Run in development mode
npm run dev

# Run with HTTP transport
npm run dev:http

# Build
npm run build

# Run tests
npm test
```

## Protocol Version

This server implements MCP specification version 2025-11-25 with support for:
- Stdio transport
- Streamable HTTP transport
- Structured logging via notifications
- Tool capabilities

## License

MIT

## Application errors

Tool failures return `isError: true` and text containing `{ "error": { "code", "message", "retryable", "source"?, "retry_after_seconds"? } }`. Failed batch items use the same error fields. `source` identifies a known upstream provider; `retry_after_seconds` is included only when available. Protocol-level JSON-RPC errors remain SDK-owned.

- `NOT_FOUND`: no matching result; not retryable.
- `VALIDATION_ERROR`: invalid tool arguments or malformed data; not retryable.
- `AUTH_ERROR`: missing or invalid provider credentials; not retryable.
- `RATE_LIMITED`: provider quota/backoff; retryable, optionally with a delay.
- `TIMEOUT`: provider request timeout; retryable.
- `SOURCE_ERROR`: other provider or unexpected execution failures; retryable only when explicitly classified as transient. Unclassified exceptions default to `retryable: false`.

Book sources and optional enrichments retain their existing `null`/empty-result fallbacks so a failed optional provider does not discard usable metadata from another source. Caught source exceptions include the common code, message, source, and retryability fields in diagnostics. Plain exceptions and unrecognized error codes normalize to `SOURCE_ERROR`; arbitrary thrown values cannot break error reporting.

TMDB movie/TV primary lookup failures retain typed timeout, authentication, rate-limit, and provider errors instead of reporting a non-retryable no-match result. A detail HTTP 404, including an explicit `tmdb_id`, becomes non-retryable `NOT_FOUND`; an empty search or search HTTP 404 retains the no-result fallback.
