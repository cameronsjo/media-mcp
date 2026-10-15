# Contributing

## Prerequisites

- Node.js >= 20.18.1 (matches the production dependencies' minimum)
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

## Versioning and changelog

`package.json` is the source of the package and MCP server version. Keep the root versions in `package.json` and `package-lock.json` synchronized with npm's version command. The current `1.0.0` stays unchanged until a release is explicitly authorized.

Use Semantic Versioning:

- Patch: a backwards-compatible bug fix.
- Minor: backwards-compatible functionality.
- Major: a breaking change to tools, responses, transport behavior, or configuration requirements.

Record consumer-visible changes under `CHANGELOG.md` → `Unreleased` in the implementation PR, using Added, Changed, Fixed, or Removed. Conventional Commit subjects describe individual changes; they do not automatically choose a release version. Before a release, review the complete Unreleased section: any breaking change requires a major version, including the current stateless HTTP/LAN configuration migration.

When Cameron authorizes preparation of a release, work on a feature branch and run exactly one appropriate command:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

Each command updates both package manifests, prints the new version, and creates no commit or Git tag. Choose one command; running all three would perform three separate bumps. Move the Unreleased entries into a dated section named for the chosen version, leave a new Unreleased heading, and run `npm run build`, `npm run lint`, `npm run typecheck`, and `npm test`. Commit both manifests and the changelog together and open a PR.

These commands do not publish a package, create a GitHub release, push a tag, or deploy the server. Those delivery actions require separate authorization. Release automation is optional future work, not part of this manual workflow.
