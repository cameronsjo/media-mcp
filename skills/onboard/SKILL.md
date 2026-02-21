---
name: media-mcp
description: "Get started with media-metadata-mcp -- what it is, how to set it up, and how to use it"
---


Guide the user through getting started with **media-metadata-mcp**.

## About

An MCP server that enriches book, movie, and TV show metadata for Obsidian vaults. It queries Open Library, Google Books, Goodreads, and TMDB, merges and normalizes the data, and returns Obsidian-ready YAML frontmatter. Supports both stdio and Streamable HTTP transports.

## Prerequisites

Check that the user has the following installed/configured:

- Node.js 20+ (`node --version`)
- A [TMDB API key](https://www.themoviedb.org/) (required for movie/TV lookups -- free account, Settings > API > Developer)
- Optionally: a Google Books API key for enhanced book metadata

## Setup

Walk the user through initial setup:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the TypeScript:

   ```bash
   npm run build
   ```

3. Configure the MCP server in Claude Code or Claude Desktop. Add to your MCP config:

   ```json
   {
     "mcpServers": {
       "media-metadata": {
         "command": "node",
         "args": ["/Users/cameron/Projects/media-mcp/dist/index.js"],
         "env": {
           "TMDB_API_KEY": "your-tmdb-api-key"
         }
       }
     }
   }
   ```

   Book lookups work without any API keys (Open Library + Goodreads scraping). Movie/TV lookups require `TMDB_API_KEY`.

## First Use

Guide the user through their first interaction with the product:

1. Start the server in HTTP mode for quick testing:

   ```bash
   TMDB_API_KEY=your-key npm run dev:http
   ```

   The server starts at http://127.0.0.1:3000/mcp.

2. Or connect via Claude Code with the MCP config above and ask:

   > "Look up the book Project Hail Mary by Andy Weir"

   Claude will call `lookup_book` and return metadata including title, author, ISBN, genres, page count, ratings, and cover URL.

3. Follow up with:

   > "Generate Obsidian frontmatter for that"

   Claude will call `generate_frontmatter` and return ready-to-paste YAML.

## Key Files

Point the user to the most important files for understanding the project:

- `src/index.ts` -- MCP server entry point, transport selection
- `src/tools/` -- Tool implementations: `lookup-book.ts`, `lookup-movie.ts`, `lookup-tv.ts`, `generate-frontmatter.ts`, `batch-lookup.ts`
- `src/sources/` -- Data source clients: `open-library.ts`, `google-books.ts`, `goodreads.ts`, `tmdb.ts`
- `src/utils/config.ts` -- Environment variable configuration
- `src/cache/sqlite-cache.ts` -- SQLite caching layer
- `package.json` -- Scripts, dependencies, engine requirements
- `Dockerfile` -- Container build for HTTP transport deployment

## Common Tasks

- **Development mode (stdio)**: `npm run dev`
- **Development mode (HTTP)**: `npm run dev:http`
- **Build**: `npm run build`
- **Run tests**: `npm test`
- **Lint**: `npm run lint`
- **Type check**: `npm run typecheck`
- **Run with Docker**: `docker build -t media-metadata-mcp . && docker run -e TMDB_API_KEY=your-key -p 3000:3000 media-metadata-mcp`
