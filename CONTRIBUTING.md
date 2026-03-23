# Contributing

## Prerequisites

- Node.js >= 20
- npm
- Docker (optional, for container builds)

## Setup

```bash
# Clone and install
git clone https://github.com/cameronsjo/media-mcp.git
cd media-mcp
npm ci

# Configure environment
cp .env.example .env
# Edit .env and add your API keys (TMDB_API_KEY required for movie/TV)
```

## Development

```bash
# Start dev server (stdio transport)
make dev

# Start dev server (HTTP transport)
make dev-http

# Build TypeScript
make build
```

## Testing

```bash
# Run unit tests
make test

# Integration tests require TMDB_API_KEY in .env
npm run test:integration
```

## Code Style

- ESLint + Prettier for linting and formatting
- Run `make lint` before committing

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(tools): add batch lookup support
fix(cache): handle expired entries correctly
docs: update README with new env vars
```

## Pull Requests

- Target `main` branch
- Ensure CI passes (lint, typecheck, tests)
- Use closing keywords: `Closes #123` or `Fixes #123`
