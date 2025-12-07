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

The server is configured via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `TMDB_API_KEY` | TMDB API key (required for movie/TV lookups) | - |
| `MCP_TRANSPORT` | Transport type: `stdio` or `http` | `stdio` |
| `MCP_HTTP_PORT` | HTTP server port | `3000` |
| `MCP_HTTP_HOST` | HTTP server host | `127.0.0.1` |
| `MCP_HTTP_PATH` | HTTP endpoint path | `/mcp` |
| `MCP_CACHE_ENABLED` | Enable caching | `true` |
| `MCP_CACHE_PATH` | SQLite cache database path | `./cache.db` |
| `MCP_CACHE_TTL_HOURS` | Default cache TTL in hours | `168` |
| `MCP_LOG_LEVEL` | Log level: debug, info, warning, error | `info` |

### Getting API Keys

#### TMDB API Key (Required for Movie/TV)

1. Create a free account at [TMDB](https://www.themoviedb.org/)
2. Go to Settings → API
3. Request an API key (choose "Developer" option)
4. Copy your API Read Access Token

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
│   │   ├── lookup-book.ts
│   │   ├── lookup-movie.ts
│   │   ├── lookup-tv.ts
│   │   ├── batch-lookup.ts
│   │   └── generate-frontmatter.ts
│   ├── sources/
│   │   ├── open-library.ts
│   │   └── tmdb.ts
│   ├── cache/
│   │   └── sqlite-cache.ts
│   ├── transport/
│   │   └── http-transport.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── rate-limiter.ts
│   │   └── http-client.ts
│   └── types/
│       ├── book.ts
│       ├── movie.ts
│       ├── tv.ts
│       └── common.ts
├── config/
│   └── default.json
├── package.json
├── tsconfig.json
└── README.md
```

## Data Sources

| Source | Auth | Used For |
|--------|------|----------|
| Open Library | None | Book metadata, ISBNs, covers |
| TMDB | API Key | Movies, TV shows, cast, watch providers |

## Caching

The server uses SQLite for caching with the following TTLs:

| Data Type | TTL |
|-----------|-----|
| Book metadata | 30 days |
| Movie/TV metadata | 7 days |
| TV episodes (active shows) | 1 day |
| Search results | 1 hour |

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
