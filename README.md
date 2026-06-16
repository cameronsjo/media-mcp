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

Optional `compact: true` trims the response — nulls `description` and drops the noisy `shelves`/`subjects` arrays (the bulk of the payload), keeping genres, tropes, series, ratings, cover, and identifiers. Useful for batch lookups that would otherwise exceed inline token limits.

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

By default the large ~100-region `watch_providers` map is **omitted** to keep responses compact. To include it, pass `include_watch_providers: true`, or restrict it to specific regions with `watch_provider_regions: ["US"]` (which implies inclusion).

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

### Build

```bash
docker build -t media-metadata-mcp .
```

### Run

```bash
docker run -d \
  --name media-mcp \
  -p 3000:3000 \
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
      - "3000:3000"
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
