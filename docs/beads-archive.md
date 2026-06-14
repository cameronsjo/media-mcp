# Beads Issue Archive

Archived 2026-06-14 when the beads issue tracker was removed from this repo (its pre-commit hook required a `bd sync` subcommand absent from the installed `bd 1.0.0`, blocking every commit). The 19 **open** issues were migrated to GitHub Issues (linked below); **closed** and **tombstone** entries are preserved here for history.

## Open — migrated to GitHub Issues

| Beads ID | GitHub | Priority | Title |
|---|---|---|---|
| `media-mcp-2` | #10 | P1 | Goodreads scraping is fragile and high-maintenance |
| `media-mcp-3` | #11 | P2 | Add periodic cache cleanup task |
| `media-mcp-4` | #12 | P2 | Add integration tests for lookup tools |
| `media-mcp-5` | #13 | P2 | Standardize error response format across sources |
| `media-mcp-6` | #14 | P3 | Add CHANGELOG.md and semantic versioning |
| `media-mcp-7` | #15 | P3 | Extract magic numbers to configuration constants |
| `media-mcp-9` | #16 | P3 | Add tests for config validation |
| `media-mcp-10` | #17 | P3 | Add tests for Google Books source |
| `media-mcp-12` | #18 | P2 | Duplicate request handling logic between stdio and HTTP transports |
| `media-mcp-16` | #19 | P2 | fuzzy-match.ts has only 6% test coverage |
| `media-mcp-17` | #20 | P3 | telemetry.ts has 0% test coverage |
| `media-mcp-30` | #21 | P3 | Custom YAML serializer in generate-frontmatter.ts instead of using library |
| `media-mcp-35` | #22 | P3 | vitest.config excludes index.ts and transport from coverage |
| `media-mcp-3gj` | #23 | P2 | Rate limiter race condition under concurrent requests |
| `media-mcp-df1` | #24 | P3 | CORS hardcoded to wildcard, not configurable |
| `media-mcp-hn2` | #25 | P2 | No Zod validation on upstream API responses |
| `media-mcp-i7t` | #26 | P4 | Inconsistent error codes across tools and sources |
| `media-mcp-iwn` | #27 | P3 | SSE connections have no idle timeout |
| `media-mcp-vgp` | #28 | P2 | Goodreads selectors fail silently when HTML changes |

## Closed

| Beads ID | Title |
|---|---|
| `media-mcp-1` | Replace manual Zod→JSON Schema converter with library |
| `media-mcp-8` | Add tests for merge-results utility |
| `media-mcp-11` | Version hardcoded in index.ts instead of reading from package.json |
| `media-mcp-13` | Missing author field in package.json |
| `media-mcp-14` | No unhandledRejection handler for promise errors |
| `media-mcp-15` | Typo in goodreads.ts - "hockyromance" should be "hockeyromance" |
| `media-mcp-18` | README doesn't mention Google Books or Goodreads sources |
| `media-mcp-19` | README architecture section is out of date |
| `media-mcp-20` | Add Docker usage instructions to README |
| `media-mcp-21` | User agents in http-client.ts are outdated (Chrome 120) |
| `media-mcp-22` | Duplicate sleep function implementations |
| `media-mcp-23` | Duplicate normalize function in multiple files |
| `media-mcp-24` | batch-lookup hardcodes include_seasons and include_episodes |
| `media-mcp-25` | Environment variable names inconsistent between README and config.ts |
| `media-mcp-26` | BookSource type includes 'hardcover' but no HardcoverSource implementation |
| `media-mcp-27` | validateSourcesForMediaType function is unused |
| `media-mcp-29` | TMDBSource has another duplicate normalize function |
| `media-mcp-31` | generateTVFrontmatter may crash on invalid first_air_date |
| `media-mcp-32` | TMDB buildSeasons makes sequential API calls instead of parallel |
| `media-mcp-33` | OpenLibrarySource has fourth duplicate normalize function |
| `media-mcp-34` | fuzzy-match.ts exports normalize() but sources use private copies |
| `media-mcp-36` | config/default.json is unused - code reads environment variables directly |
| `media-mcp-37` | scripts/enrich-books-queue.ts is incomplete/placeholder |
| `media-mcp-38` | CI workflow runs type check via 'npm run build' instead of 'typecheck' |
| `media-mcp-1so` | HTTP server doesn't drain connections on SIGTERM |
| `media-mcp-7lf` | SQLite corruption crashes server on startup |
| `media-mcp-cue` | TMDB date parsing produces NaN on null/empty dates |
| `media-mcp-jd6` | parseInt accepts NaN from env vars + remove dead cover download config |
| `media-mcp-m48` | Deploy readiness parallel audit and fix pipeline — field report |

## Tombstone

- `media-mcp-0xn` — Test issue
- `media-mcp-1k0` — Acceptance Criteria
- `media-mcp-2vi` — Current Code Location
- `media-mcp-k2f` — Problem
- `media-mcp-ya5` — Solution

## Full records

<details>
<summary><code>media-mcp-1</code> — Replace manual Zod→JSON Schema converter with library (closed)</summary>

Status: closed · Priority: P1 · Type: chore · Labels: `critical`, `tech-debt`, `zod`


## Problem

`src/index.ts` (lines 352-422) contains a hand-written `zodToJsonSchema` function that introspects Zod's internal `_def` structures. This is:

1. **Brittle** - relies on undocumented Zod internals
2. **Incomplete** - doesn't handle all Zod types
3. **Maintenance burden** - may break with Zod updates

## Current Code Location

`src/index.ts:352-422`

## Solution

Replace with the well-maintained `zod-to-json-schema` npm package:

```bash
npm install zod-to-json-schema
```

```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';

// Instead of custom function:
const schema = zodToJsonSchema(zodSchema);
```

## Acceptance Criteria

- [ ] Install `zod-to-json-schema` package
- [ ] Remove custom `zodToJsonSchema` function
- [ ] Update all tool registrations to use library
- [ ] Verify MCP tool schemas still work correctly
- [ ] Add test for schema generation

</details>

<details>
<summary><code>media-mcp-2</code> — Goodreads scraping is fragile and high-maintenance (open)</summary>

Status: open · Priority: P1 · Type: chore · Labels: `critical`, `goodreads`, `scraping`, `tech-debt` · GitHub #10


## Problem

`src/sources/goodreads.ts` relies on HTML scraping with Cheerio instead of an official API:

1. **Hardcoded trope list** - 60+ normalized tropes in `isTrope()` method (lines 390-504)
2. **Multiple CSS selector fallbacks** - suggests frequent DOM breakage (lines 191-198, 205-227)
3. **No official API** - Goodreads API was deprecated, no replacement available
4. **Conservative rate limiting** - 20 req/min with 2-4.5s delays per request

## Risk Assessment

- **HIGH** maintenance burden - Goodreads UI changes will break scraping
- **MEDIUM** legal risk - web scraping may violate ToS
- **LOW** performance - extra delays slow down lookups

## Options

1. **Accept the risk** - Document maintenance burden, add monitoring for scraping failures
2. **Reduce scope** - Only extract stable fields (ratings, basic metadata)
3. **Alternative sources** - Investigate LibraryThing, StoryGraph, or other book APIs
4. **Feature flag** - Make Goodreads optional/off-by-default

## Acceptance Criteria

- [ ] Document Goodreads scraping risks in README
- [ ] Add monitoring/alerting for scraping failure rate
- [ ] Consider making Goodreads source opt-in via config
- [ ] Extract trope list to external config file for easier updates

</details>

<details>
<summary><code>media-mcp-3</code> — Add periodic cache cleanup task (open)</summary>

Status: open · Priority: P2 · Type: feature · Labels: `cache`, `maintenance` · GitHub #11


## Problem

`src/cache/sqlite-cache.ts` only cleans up expired entries on startup. The cache database could grow unbounded during long-running server sessions.

## Current Behavior

- Cleanup runs once at startup via `cleanupExpired()`
- No periodic cleanup during runtime
- Expired entries remain until next restart

## Solution

Add a background interval to clean expired entries:

```typescript
// In sqlite-cache.ts constructor or start method
private startPeriodicCleanup(): void {
  // Clean every hour
  setInterval(() => {
    this.cleanupExpired();
  }, 60 * 60 * 1000);
}
```

## Acceptance Criteria

- [ ] Add periodic cleanup interval (suggested: every 1 hour)
- [ ] Make cleanup interval configurable via environment variable
- [ ] Log cleanup results at debug level
- [ ] Ensure cleanup doesn't block requests (already synchronous SQLite)

</details>

<details>
<summary><code>media-mcp-4</code> — Add integration tests for lookup tools (open)</summary>

Status: open · Priority: P2 · Type: task · Labels: `testing`, `tools` · GitHub #12


## Problem

Core business logic tools have 0% test coverage:

| Tool | Coverage |
|------|----------|
| `lookup-book.ts` | 0% |
| `lookup-movie.ts` | 0% |
| `lookup-tv.ts` | 0% |
| `batch-lookup.ts` | 0% |

These are the primary entry points for the MCP server.

## Approach

Use mocked HTTP responses to test tool behavior:

```typescript
import { vi } from 'vitest';
import { lookupBook } from '../src/tools/lookup-book.js';

vi.mock('../src/utils/http-client.js', () => ({
  httpClient: {
    get: vi.fn().mockResolvedValue({
      // Mock API response
    })
  }
}));
```

## Test Cases Needed

### lookup-book
- [ ] Search by ISBN returns correct result
- [ ] Search by title/author uses fallback sources
- [ ] Merges results from multiple sources correctly
- [ ] Handles source failures gracefully
- [ ] Rate limiting is respected

### lookup-movie
- [ ] Search returns TMDB results
- [ ] Handles no results gracefully
- [ ] Includes cast/crew when requested

### lookup-tv
- [ ] Search returns TV shows
- [ ] Season/episode inclusion works
- [ ] Handles ongoing series

### batch-lookup
- [ ] Concurrent lookups respect limit
- [ ] Partial failures don't break batch

## Acceptance Criteria

- [ ] Add test file for each tool
- [ ] Achieve >80% coverage on tool files
- [ ] Mock all external HTTP calls
- [ ] Test error handling paths

</details>

<details>
<summary><code>media-mcp-5</code> — Standardize error response format across sources (open)</summary>

Status: open · Priority: P2 · Type: chore · Labels: `api`, `errors`, `tech-debt` · GitHub #13


## Problem

Error handling is inconsistent across the codebase:

1. Some errors use `{ code, message }` structure
2. Others use error objects with additional fields
3. `retryable` flag not consistently present
4. Makes client retry logic uncertain

## Current Inconsistencies

```typescript
// Some places throw plain errors
throw new Error('Not found');

// Others include metadata
throw { code: 404, message: 'Not found', retryable: false };

// HTTP transport uses JSON-RPC format
{ error: { code: -32600, message: 'Invalid Request' } }
```

## Solution

Create a standardized error class:

```typescript
// src/utils/errors.ts
export class SourceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly source: string,
    public readonly retryable: boolean = false,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export class NotFoundError extends SourceError {
  constructor(source: string, query: string) {
    super(`No results found for: ${query}`, 'NOT_FOUND', source, false);
  }
}

export class RateLimitError extends SourceError {
  constructor(source: string, retryAfter?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT', source, true, { retryAfter });
  }
}
```

## Acceptance Criteria

- [ ] Create `src/utils/errors.ts` with standardized error classes
- [ ] Update all sources to use standard errors
- [ ] Update tools to handle standard errors consistently
- [ ] Document error codes in README
- [ ] Add error handling tests

</details>

<details>
<summary><code>media-mcp-6</code> — Add CHANGELOG.md and semantic versioning (open)</summary>

Status: open · Priority: P3 · Type: task · Labels: `documentation`, `versioning` · GitHub #14


## Problem

- No CHANGELOG.md to track changes
- Package version hardcoded as "1.0.0"
- No version management strategy

## Solution

1. Add CHANGELOG.md following Keep a Changelog format
2. Use conventional commits for automatic changelog generation
3. Consider tools like `standard-version` or `release-please`

## CHANGELOG Template

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial MCP server implementation
- Book lookup via Open Library, Google Books, Goodreads
- Movie/TV lookup via TMDB
- SQLite caching with TTL
- HTTP and stdio transport support

### Changed

### Fixed

### Removed
```

## Acceptance Criteria

- [ ] Create CHANGELOG.md with initial content
- [ ] Document version strategy in CONTRIBUTING.md
- [ ] Add npm script for version bumping
- [ ] Consider GitHub releases automation

</details>

<details>
<summary><code>media-mcp-7</code> — Extract magic numbers to configuration constants (open)</summary>

Status: open · Priority: P3 · Type: chore · Labels: `code-quality`, `configuration` · GitHub #15


## Problem

Magic numbers are scattered throughout the codebase:

| Location | Value | Purpose |
|----------|-------|---------|
| `goodreads.ts` | `2000` | Base delay between requests |
| `goodreads.ts` | `1.5` | Delay multiplier |
| `sqlite-cache.ts` | `86400000` | Default TTL (24h) |
| `http-transport.ts` | `30000` | SSE ping interval |
| `http-transport.ts` | `300000` | Session cleanup interval (5min) |
| `http-transport.ts` | `1800000` | Session timeout (30min) |
| `rate-limiter.ts` | `60` | Max backoff seconds |

## Solution

Create a centralized constants file:

```typescript
// src/utils/constants.ts
export const TIMING = {
  CACHE_DEFAULT_TTL_MS: 24 * 60 * 60 * 1000,  // 24 hours
  SESSION_TIMEOUT_MS: 30 * 60 * 1000,          // 30 minutes
  SESSION_CLEANUP_INTERVAL_MS: 5 * 60 * 1000,  // 5 minutes
  SSE_PING_INTERVAL_MS: 30 * 1000,             // 30 seconds
  MAX_BACKOFF_SECONDS: 60,
} as const;

export const RATE_LIMITS = {
  GOODREADS_BASE_DELAY_MS: 2000,
  GOODREADS_DELAY_MULTIPLIER: 1.5,
} as const;
```

## Acceptance Criteria

- [ ] Create `src/utils/constants.ts`
- [ ] Move all timing-related magic numbers
- [ ] Move all rate limit values
- [ ] Update imports across codebase
- [ ] Consider making some values configurable via env vars

</details>

<details>
<summary><code>media-mcp-8</code> — Add tests for merge-results utility (closed)</summary>

Status: closed · Priority: P2 · Type: task · Labels: `testing`, `utilities`


## Problem

`src/utils/merge-results.ts` has only 9% test coverage despite being critical business logic:

- Handles multi-source result merging
- Implements source priority weighting
- Calculates confidence scores
- Field-specific source preferences

This is complex logic that should be well-tested.

## Key Functions to Test

1. `mergeBookResults(results: BookResult[]): BookResult`
   - Empty input handling
   - Single source passthrough
   - Multi-source field selection
   - Source priority ordering

2. `calculateConfidence(result: BookResult): number`
   - Field completeness scoring
   - Source quality weighting

3. `selectBestField<T>(sources: SourceResult[], fieldName: string): T`
   - Priority-based selection
   - Fallback behavior

## Test Cases

```typescript
describe('mergeBookResults', () => {
  it('returns empty result for no inputs');
  it('passes through single source unchanged');
  it('prefers Goodreads for ratings');
  it('prefers Open Library for identifiers');
  it('combines subjects from all sources');
  it('handles missing fields gracefully');
});
```

## Acceptance Criteria

- [ ] Add comprehensive test file for merge-results.ts
- [ ] Achieve >90% coverage on this file
- [ ] Test edge cases (empty, null, partial data)
- [ ] Test source priority logic explicitly

</details>

<details>
<summary><code>media-mcp-9</code> — Add tests for config validation (open)</summary>

Status: open · Priority: P3 · Type: task · Labels: `configuration`, `testing` · GitHub #16


## Problem

`src/utils/config.ts` has 0% test coverage despite handling:

- Environment variable parsing
- Zod schema validation
- Source availability checking
- Default value management

## Key Functions to Test

1. `loadConfig(): AppConfig`
   - Default values applied correctly
   - Environment variables override defaults
   - Invalid values throw helpful errors

2. `validateSources(config: AppConfig): void`
   - Missing API keys detected
   - Warns about disabled sources
   - At least one source required

## Test Cases

```typescript
describe('loadConfig', () => {
  beforeEach(() => {
    // Reset env vars
  });

  it('uses default values when no env vars set');
  it('parses MCP_TRANSPORT correctly');
  it('validates port is a number');
  it('rejects invalid log levels');
});

describe('validateSources', () => {
  it('throws when no sources configured');
  it('warns when TMDB_API_KEY missing');
  it('allows operation with only Open Library');
});
```

## Acceptance Criteria

- [ ] Add test file for config.ts
- [ ] Test default value behavior
- [ ] Test environment variable parsing
- [ ] Test validation error messages
- [ ] Achieve >80% coverage

</details>

<details>
<summary><code>media-mcp-10</code> — Add tests for Google Books source (open)</summary>

Status: open · Priority: P3 · Type: task · Labels: `google-books`, `sources`, `testing` · GitHub #17


## Problem

`src/sources/google-books.ts` has 0% test coverage.

## Approach

Mock HTTP responses to test:

1. ISBN search
2. Title/author search
3. Response parsing
4. Error handling
5. Rate limiting behavior

## Example Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleBooksSource } from '../src/sources/google-books.js';

describe('GoogleBooksSource', () => {
  let source: GoogleBooksSource;

  beforeEach(() => {
    source = new GoogleBooksSource({ apiKey: 'test-key' });
  });

  describe('searchByISBN', () => {
    it('returns book when ISBN found');
    it('returns null when ISBN not found');
    it('handles API errors gracefully');
  });

  describe('searchByTitleAuthor', () => {
    it('returns multiple results');
    it('filters by author match');
    it('handles empty results');
  });
});
```

## Acceptance Criteria

- [ ] Add test file for google-books.ts
- [ ] Mock all HTTP requests
- [ ] Test success and error paths
- [ ] Achieve >80% coverage

</details>

<details>
<summary><code>media-mcp-11</code> — Version hardcoded in index.ts instead of reading from package.json (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `configuration`, `tech-debt`


## Problem

`src/index.ts:43` has the version hardcoded:

```typescript
const config = {
  server: {
    name: 'media-metadata-mcp',
    version: '1.0.0',  // Hardcoded!
  },
  // ...
}
```

This means version updates require changing two files (package.json and index.ts).

## Solution

Read version from package.json at runtime:

```typescript
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Or use import assertion (ESM)
import pkg from '../package.json' with { type: 'json' };

const config = {
  server: {
    name: 'media-metadata-mcp',
    version: pkg.version,
  },
}
```

## Acceptance Criteria

- [ ] Read version from package.json dynamically
- [ ] Update tsconfig.json if needed for JSON imports
- [ ] Test that version appears correctly in MCP handshake

</details>

<details>
<summary><code>media-mcp-12</code> — Duplicate request handling logic between stdio and HTTP transports (open)</summary>

Status: open · Priority: P2 · Type: chore · Labels: `architecture`, `dry`, `tech-debt` · GitHub #18


## Problem

`src/index.ts` has duplicated request handling code:

1. **Lines 233-249**: MCP server handlers for stdio transport
   - `ListToolsRequestSchema` handler
   - `SetLevelRequestSchema` handler
   - `CallToolRequestSchema` handler

2. **Lines 442-537**: HTTP transport handlers
   - Same logic for `initialize`, `tools/list`, `tools/call`, `logging/setLevel`, `ping`
   - Duplicates tool listing and execution

This violates DRY and means changes need to be made in two places.

## Solution

Extract shared request handling logic:

```typescript
// src/handlers/tool-handlers.ts
export function createToolListHandler(tools: ToolDefinition[]) {
  return () => ({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema),
    })),
  });
}

export function createToolCallHandler(executeToolCall: ExecuteFn) {
  return async (name: string, args: unknown) => {
    return executeToolCall(name, args);
  };
}
```

Then use in both transports:

```typescript
// For MCP server (stdio)
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: listTools(),
}));

// For HTTP transport
if (request.method === 'tools/list') {
  return { jsonrpc: '2.0', id: request.id, result: { tools: listTools() } };
}
```

## Acceptance Criteria

- [ ] Extract common handlers to shared module
- [ ] Update stdio transport to use shared handlers
- [ ] Update HTTP transport to use shared handlers
- [ ] Ensure behavior is identical in both transports
- [ ] Add tests for handler extraction

</details>

<details>
<summary><code>media-mcp-13</code> — Missing author field in package.json (closed)</summary>

Status: closed · Priority: P3 · Type: task · Labels: `documentation`, `metadata`


## Problem

`package.json:38` has an empty author field:

```json
{
  "author": "",
  "license": "MIT"
}
```

## Solution

Add proper author information:

```json
{
  "author": "Your Name <email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/username/media-metadata-mcp"
  },
  "bugs": {
    "url": "https://github.com/username/media-metadata-mcp/issues"
  },
  "homepage": "https://github.com/username/media-metadata-mcp#readme"
}
```

## Acceptance Criteria

- [ ] Add author field
- [ ] Add repository field
- [ ] Add bugs field
- [ ] Add homepage field

</details>

<details>
<summary><code>media-mcp-14</code> — No unhandledRejection handler for promise errors (closed)</summary>

Status: closed · Priority: P2 · Type: bug · Labels: `bug`, `error-handling`, `reliability`


## Problem

`src/index.ts` handles SIGINT and SIGTERM signals but doesn't handle unhandled promise rejections:

```typescript
// Current handling (lines 564-565):
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

// main() catches errors (line 567):
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

But if a promise rejects elsewhere (e.g., in an async handler that isn't properly awaited), the error is silently lost or crashes the process.

## Solution

Add unhandled rejection handler:

```typescript
process.on('unhandledRejection', (reason, promise) => {
  logger.error('main', {
    action: 'unhandled_rejection',
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Optionally exit or continue based on severity
});

process.on('uncaughtException', (error) => {
  logger.error('main', {
    action: 'uncaught_exception',
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
```

## Acceptance Criteria

- [ ] Add `unhandledRejection` handler with proper logging
- [ ] Add `uncaughtException` handler that logs and exits
- [ ] Ensure shutdown is called on fatal errors
- [ ] Test with intentionally unhandled promise

</details>

<details>
<summary><code>media-mcp-15</code> — Typo in goodreads.ts - "hockyromance" should be "hockeyromance" (closed)</summary>

Status: closed · Priority: P3 · Type: bug · Labels: `bug`, `typo`


## Problem

`src/sources/goodreads.ts:423` has a typo in the trope list:

```typescript
const romanceTropes = [
  // ...
  'hockyromance',  // Should be 'hockeyromance'
  // ...
];
```

## Solution

Fix the typo:

```typescript
'hockeyromance',
```

## Acceptance Criteria

- [ ] Fix typo in trope list
- [ ] Consider adding both spellings for robustness

</details>

<details>
<summary><code>media-mcp-16</code> — fuzzy-match.ts has only 6% test coverage (open)</summary>

Status: open · Priority: P2 · Type: task · Labels: `testing`, `utilities` · GitHub #19


## Problem

`src/utils/fuzzy-match.ts` has only 6.06% test coverage despite containing important matching logic:

- Levenshtein distance calculation
- N-gram similarity
- Book matching scoring
- Series extraction from titles (used in lookup-book.ts)

Most lines are uncovered: `54-199, 205-210`

## Key Functions to Test

1. `levenshteinDistance(a: string, b: string): number`
   - Empty strings
   - Identical strings
   - Single character differences
   - Common typos

2. `ngramSimilarity(a: string, b: string, n: number): number`
   - Short strings
   - Long strings
   - Different n-gram sizes

3. `calculateBookMatchScore(query, candidate): number`
   - Exact title match
   - Partial title match
   - Author matching
   - ISBN matching

4. `extractSeriesFromTitle(title: string): SeriesInfo`
   - "Book Name (Series #1)"
   - "Book Name - Series Book 1"
   - "Book Name, Part 1 of Series"
   - No series information

## Test Cases

```typescript
describe('extractSeriesFromTitle', () => {
  it('extracts series from parenthetical format');
  it('extracts series from dash format');
  it('handles book without series');
  it('handles numeric positions');
  it('cleans title when series is extracted');
});
```

## Acceptance Criteria

- [ ] Add comprehensive tests for all exported functions
- [ ] Achieve >80% coverage
- [ ] Test edge cases (empty strings, special characters)

</details>

<details>
<summary><code>media-mcp-17</code> — telemetry.ts has 0% test coverage (open)</summary>

Status: open · Priority: P3 · Type: task · Labels: `observability`, `testing` · GitHub #20


## Problem

`src/utils/telemetry.ts` (207 lines) has 0% test coverage. While telemetry is optional, it's still production code that should be tested.

## Functions to Test

1. `initTelemetry(config: AppConfig): void`
   - When OTEL_ENABLED=false (noop)
   - When OTEL_ENABLED=true (initializes providers)

2. `shutdownTelemetry(): Promise<void>`
   - When not initialized (noop)
   - When initialized (shuts down providers)

3. `recordToolCall(tool: string, duration: number, success: boolean): void`
   - Records counter correctly
   - Records histogram correctly
   - Records success/failure attribute

4. `recordCacheHit(source: string, hit: boolean): void`
   - Increments counter with correct attributes

## Approach

Mock OpenTelemetry SDK to test without actual OTLP connections:

```typescript
vi.mock('@opentelemetry/sdk-trace-base');
vi.mock('@opentelemetry/sdk-metrics');

describe('telemetry', () => {
  it('does nothing when disabled');
  it('creates trace provider when enabled');
  it('records tool calls with correct attributes');
});
```

## Acceptance Criteria

- [ ] Add test file for telemetry.ts
- [ ] Mock OpenTelemetry SDK
- [ ] Test enabled/disabled behavior
- [ ] Test metric recording
- [ ] Achieve >70% coverage

</details>

<details>
<summary><code>media-mcp-18</code> — README doesn't mention Google Books or Goodreads sources (closed)</summary>

Status: closed · Priority: P3 · Type: task · Labels: `documentation`, `readme`


## Problem

The README data sources table (line 251-257) only mentions Open Library and TMDB:

```markdown
| Source | Auth | Used For |
|--------|------|----------|
| Open Library | None | Book metadata, ISBNs, covers |
| TMDB | API Key | Movies, TV shows, cast, watch providers |
```

But the codebase also supports:
- **Google Books** (optional API key)
- **Goodreads** (scraping, enabled by default)

## Solution

Update the data sources table:

```markdown
| Source | Auth | Used For |
|--------|------|----------|
| Open Library | None | Book metadata, ISBNs, covers |
| Google Books | API Key (optional) | Book descriptions, metadata |
| Goodreads | None (scraping) | Ratings, series info, genres, tropes |
| TMDB | API Key | Movies, TV shows, cast, watch providers |
```

Also add environment variables to the configuration table:

```markdown
| `GOOGLE_BOOKS_API_KEY` | Google Books API key (optional) | - |
| `ENABLE_GOODREADS_SCRAPING` | Enable Goodreads scraping | `true` |
```

## Also Missing

- Architecture diagram doesn't show google-books.ts or goodreads.ts
- No mention of result merging from multiple sources

## Acceptance Criteria

- [ ] Update data sources table
- [ ] Add missing environment variables to config table
- [ ] Update architecture file listing
- [ ] Add section on multi-source merging

</details>

<details>
<summary><code>media-mcp-19</code> — README architecture section is out of date (closed)</summary>

Status: closed · Priority: P3 · Type: task · Labels: `documentation`, `readme`


## Problem

The architecture section in README (lines 216-248) is missing several files that exist in the codebase:

**Missing from sources/:**
- `google-books.ts`
- `goodreads.ts`
- `index.ts`

**Missing from utils/:**
- `config.ts`
- `telemetry.ts`
- `fuzzy-match.ts`
- `merge-results.ts`
- `index.ts`

**Missing from types/:**
- `index.ts`

**config/ directory doesn't exist** (line 244 mentions `config/default.json`)

## Solution

Update the architecture section to match actual codebase:

```
media-metadata-mcp/
├── src/
│   ├── index.ts              # MCP server entry
│   ├── tools/
│   │   ├── index.ts          # Tool exports
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
│   └── ...
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## Acceptance Criteria

- [ ] Update architecture section to match actual file structure
- [ ] Remove mention of non-existent config/ directory
- [ ] Add tests/ directory to structure
- [ ] Add Dockerfile to structure

</details>

<details>
<summary><code>media-mcp-20</code> — Add Docker usage instructions to README (closed)</summary>

Status: closed · Priority: P3 · Type: task · Labels: `docker`, `documentation`


## Problem

The project has a Dockerfile but the README doesn't document Docker usage.

## Solution

Add a Docker section to README:

```markdown
## Docker

### Build

\`\`\`bash
docker build -t media-metadata-mcp .
\`\`\`

### Run

\`\`\`bash
docker run -d \
  --name media-mcp \
  -p 3000:3000 \
  -e TMDB_API_KEY=your-key \
  -v media-mcp-cache:/app/cache \
  media-metadata-mcp
\`\`\`

### Docker Compose

\`\`\`yaml
services:
  media-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - TMDB_API_KEY=your-key
      - GOOGLE_BOOKS_API_KEY=your-key  # optional
    volumes:
      - media-mcp-cache:/app/cache
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  media-mcp-cache:
\`\`\`

### Health Check

The HTTP server exposes a health endpoint at \`/health\`:

\`\`\`bash
curl http://localhost:3000/health
# {"status":"healthy","sessions":0,"timestamp":"..."}
\`\`\`
```

## Acceptance Criteria

- [ ] Add Docker build instructions
- [ ] Add Docker run instructions
- [ ] Add Docker Compose example
- [ ] Document health endpoint
- [ ] Document volume for cache persistence

</details>

<details>
<summary><code>media-mcp-21</code> — User agents in http-client.ts are outdated (Chrome 120) (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `scraping`, `tech-debt`


## Problem

`src/utils/http-client.ts:17-22` has hardcoded user agents that reference old browser versions:

```typescript
const USER_AGENTS = [
  '...Chrome/120.0.0.0 Safari/537.36',  // Chrome 120 is from late 2023
  '...Firefox/121.0...',                 // Firefox 121 is from early 2024
  '...Version/17.2 Safari/605.1.15',     // Safari 17.2 is from late 2023
];
```

Outdated user agents may trigger anti-bot detection on some sites.

## Solution

1. Update to more recent browser versions
2. Consider fetching current browser versions dynamically
3. Or use a library like `user-agents` npm package

## Acceptance Criteria

- [ ] Update user agents to current browser versions
- [ ] Document when these were last updated
- [ ] Consider adding a comment about periodic updates

</details>

<details>
<summary><code>media-mcp-22</code> — Duplicate sleep function implementations (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `code-quality`, `dry`


## Problem

The `sleep` function is implemented identically in two places:

1. `src/utils/http-client.ts:216-218`:
   ```typescript
   private sleep(ms: number): Promise<void> {
     return new Promise(resolve => setTimeout(resolve, ms));
   }
   ```

2. `src/utils/rate-limiter.ts:161-163`:
   ```typescript
   private sleep(ms: number): Promise<void> {
     return new Promise(resolve => setTimeout(resolve, ms));
   }
   ```

There's also a `delay` function in rate-limiter.ts (lines 169-172) that does similar work.

## Solution

1. Export the `delay` function from rate-limiter.ts (already exists)
2. Update HttpClient and RateLimiter to use the shared `delay` function
3. Or create a shared `sleep` utility in a common file

```typescript
// src/utils/timing.ts
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function delay(minMs: number, maxMs?: number): Promise<void> {
  const ms = maxMs ? minMs + Math.random() * (maxMs - minMs) : minMs;
  return sleep(ms);
}
```

## Acceptance Criteria

- [ ] Create shared timing utilities
- [ ] Update HttpClient to use shared function
- [ ] Update RateLimiter to use shared function
- [ ] Export from utils/index.ts

</details>

<details>
<summary><code>media-mcp-23</code> — Duplicate normalize function in multiple files (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `code-quality`, `dry`


## Problem

String normalization logic is duplicated across files:

1. `src/sources/google-books.ts:292-298`:
   ```typescript
   private normalize(str: string): string {
     return str
       .toLowerCase()
       .replace(/[^\w\s]/g, '')
       .replace(/\s+/g, ' ')
       .trim();
   }
   ```

2. `src/utils/fuzzy-match.ts` has similar normalization logic in various functions

3. `src/sources/goodreads.ts:391` normalizes shelf names:
   ```typescript
   const normalized = shelfName.toLowerCase().replace(/[-_\s]/g, '');
   ```

## Solution

Create a shared string utilities module:

```typescript
// src/utils/strings.ts
export function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForShelf(str: string): string {
  return str.toLowerCase().replace(/[-_\s]/g, '');
}
```

## Acceptance Criteria

- [ ] Create shared string utilities
- [ ] Update google-books.ts to use shared function
- [ ] Update fuzzy-match.ts to use shared function
- [ ] Update goodreads.ts to use shared function
- [ ] Add tests for string utilities

</details>

<details>
<summary><code>media-mcp-24</code> — batch-lookup hardcodes include_seasons and include_episodes (closed)</summary>

Status: closed · Priority: P3 · Type: feature · Labels: `enhancement`, `tools`


## Problem

`src/tools/batch-lookup.ts:167-168` hardcodes TV lookup options:

```typescript
result = await this.tvTool.execute({
  title: item.title,
  year: item.year,
  tmdb_id: item.tmdb_id,
  include_seasons: true,   // Hardcoded
  include_episodes: false,  // Hardcoded
});
```

Users cannot configure these options for TV shows in batch lookups.

## Solution

Add optional fields to BatchTVItemSchema:

```typescript
const BatchTVItemSchema = z.object({
  type: z.literal('tv'),
  title: z.string().min(1),
  year: z.number().int().optional(),
  tmdb_id: z.number().int().optional(),
  include_seasons: z.boolean().optional().default(true),
  include_episodes: z.boolean().optional().default(false),
});
```

Then use in lookupItem:

```typescript
result = await this.tvTool.execute({
  title: item.title,
  year: item.year,
  tmdb_id: item.tmdb_id,
  include_seasons: item.include_seasons,
  include_episodes: item.include_episodes,
});
```

## Acceptance Criteria

- [ ] Add include_seasons to BatchTVItemSchema
- [ ] Add include_episodes to BatchTVItemSchema
- [ ] Pass options through to TV tool
- [ ] Update API documentation if any

</details>

<details>
<summary><code>media-mcp-25</code> — Environment variable names inconsistent between README and config.ts (closed)</summary>

Status: closed · Priority: P1 · Type: bug · Labels: `bug`, `configuration`, `documentation`


## Problem

README documents some environment variables that don't match what config.ts actually reads:

| README | config.ts | Notes |
|--------|-----------|-------|
| `MCP_HTTP_PORT` | `HTTP_PORT` | README prefix mismatch |
| `MCP_HTTP_HOST` | `HTTP_HOST` | README prefix mismatch |
| `MCP_CACHE_TTL_HOURS` | `CACHE_TTL_BOOKS` | Different names |
| `MCP_LOG_LEVEL` | `LOG_LEVEL` | README prefix mismatch |
| - | `CACHE_DIR` | Not documented |
| - | `CACHE_TTL_MOVIES` | Not documented |
| - | `CACHE_TTL_TV` | Not documented |
| - | `RATE_LIMIT_RPM` | Not documented |
| - | `RATE_LIMIT_RETRIES` | Not documented |
| - | `ENABLE_COVER_DOWNLOAD` | Not documented |
| - | `COVER_DOWNLOAD_DIR` | Not documented |
| - | `OTEL_SERVICE_NAME` | Not documented |

Also in index.ts:
- Line 60: reads `MCP_CACHE_ENABLED` directly
- Line 61: reads `MCP_CACHE_PATH` directly

These bypass config.ts entirely.

## Solution

1. Decide on consistent naming convention (MCP_ prefix or not)
2. Update config.ts to read the correct variables
3. Update README to document all variables
4. Move direct env var reads from index.ts to config.ts

## Acceptance Criteria

- [ ] Audit all environment variable usage
- [ ] Standardize naming convention (recommend MCP_ prefix)
- [ ] Update config.ts to handle all env vars
- [ ] Update README with complete list
- [ ] Add env var validation with helpful error messages

</details>

<details>
<summary><code>media-mcp-26</code> — BookSource type includes 'hardcover' but no HardcoverSource implementation (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `dead-code`, `tech-debt`


## Problem

`src/types/book.ts:5-10` defines a BookSource enum that includes 'hardcover':

```typescript
export const BookSourceSchema = z.enum([
  'open_library',
  'google_books',
  'goodreads',
  'hardcover',  // No implementation exists
]);
```

But there's no `HardcoverSource` class in the sources directory. This is dead code that suggests planned but unimplemented functionality.

Similarly, `BookIdentifiersSchema` and merge-results.ts reference hardcover.

## Options

1. **Remove it** - If no plans to implement Hardcover integration
2. **Add a TODO** - If planning to implement
3. **Create placeholder issue** - Track as future enhancement

## Current References

- `src/types/book.ts:9` - enum value
- `src/types/book.ts:26` - identifiers
- `src/utils/merge-results.ts:11` - priority
- `src/utils/merge-results.ts:20` - field preference

## Acceptance Criteria

- [ ] Decide: implement Hardcover source or remove references
- [ ] If removing: clean up all hardcover references
- [ ] If keeping: add comment explaining it's planned

</details>

<details>
<summary><code>media-mcp-27</code> — validateSourcesForMediaType function is unused (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `dead-code`, `tech-debt`


## Problem

`src/utils/config.ts:135-164` defines a `validateSourcesForMediaType` function that is exported but never used anywhere in the codebase.

```typescript
export function validateSourcesForMediaType(
  mediaType: 'book' | 'movie' | 'tv',
  sources: SourceStatus[]
): { valid: boolean; warnings: string[] }
```

This appears to be dead code from planned functionality that was never implemented.

## Options

1. **Use it** - Call this during initialization to warn users
2. **Remove it** - If no plans to use it
3. **Add tests** - If keeping for potential future use

## Recommended

Use during initialization:

```typescript
// In index.ts main()
const { valid, warnings } = validateSourcesForMediaType('movie', sourceStatus);
for (const warning of warnings) {
  logger.warning('main', { message: warning });
}
```

## Acceptance Criteria

- [ ] Decide: use or remove the function
- [ ] If using: integrate into startup validation
- [ ] If removing: delete the function
- [ ] Add tests if keeping

</details>

<details>
<summary><code>media-mcp-29</code> — TMDBSource has another duplicate normalize function (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `code-quality`, `dry`


## Problem

`src/sources/tmdb.ts:716-722` has the same normalize function as google-books.ts:

```typescript
private normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

This is now the **third** duplicate of this function:
1. `src/sources/google-books.ts:292-298`
2. `src/sources/tmdb.ts:716-722`
3. `src/utils/fuzzy-match.ts` (similar logic)

## Solution

See media-mcp-23 for shared string utilities proposal.

## Acceptance Criteria

- [ ] Resolve as part of media-mcp-23

</details>

<details>
<summary><code>media-mcp-30</code> — Custom YAML serializer in generate-frontmatter.ts instead of using library (open)</summary>

Status: open · Priority: P3 · Type: chore · Labels: `dependencies`, `tech-debt` · GitHub #21


## Problem

`src/tools/generate-frontmatter.ts:315-360` implements a custom YAML serializer:

```typescript
private toYAML(obj: Record<string, unknown>, indent: number = 0): string {
  // ... 45 lines of custom YAML serialization
}

private formatValue(value: unknown): string {
  // ... 16 lines of value formatting
}
```

This is error-prone and may not handle all YAML edge cases correctly.

## Risks

1. May not properly escape all special YAML characters
2. Doesn't handle multi-line strings (block scalars)
3. No support for anchors/aliases if needed
4. Maintenance burden

## Solution

Use a proper YAML library:

```bash
npm install yaml
```

```typescript
import { stringify } from 'yaml';

private toYAML(obj: Record<string, unknown>): string {
  return stringify(obj, {
    lineWidth: 0,  // Don't wrap lines
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
  });
}
```

## Counterargument

The current implementation is minimal and avoids a dependency. If the output is known to be simple (no edge cases), keeping it may be acceptable.

## Acceptance Criteria

- [ ] Evaluate if edge cases are handled correctly
- [ ] If issues found: replace with yaml library
- [ ] If no issues: add comment explaining why custom is used

</details>

<details>
<summary><code>media-mcp-31</code> — generateTVFrontmatter may crash on invalid first_air_date (closed)</summary>

Status: closed · Priority: P2 · Type: bug · Labels: `bug`, `error-handling`


## Problem

`src/tools/generate-frontmatter.ts:220` parses date without validation:

```typescript
private generateTVFrontmatter(
  tv: TVResult,
  template: string
): Record<string, unknown> {
  const year = new Date(tv.first_air_date).getFullYear();  // May return NaN
```

If `first_air_date` is null, empty, or invalid, this will return `NaN` which propagates into the YAML output.

## Risk

- Invalid YAML output with `year: NaN`
- No graceful fallback

## Solution

Add validation:

```typescript
private generateTVFrontmatter(
  tv: TVResult,
  template: string
): Record<string, unknown> {
  const date = new Date(tv.first_air_date);
  const year = isNaN(date.getTime()) ? undefined : date.getFullYear();
```

## Acceptance Criteria

- [ ] Add date validation
- [ ] Handle null/empty/invalid dates gracefully
- [ ] Add test case for invalid date handling

</details>

<details>
<summary><code>media-mcp-32</code> — TMDB buildSeasons makes sequential API calls instead of parallel (closed)</summary>

Status: closed · Priority: P3 · Type: feature · Labels: `enhancement`, `performance`


## Problem

`src/sources/tmdb.ts:480-516` fetches season details sequentially:

```typescript
private async buildSeasons(...): Promise<Season[]> {
  const seasons: Season[] = [];

  for (const s of basicSeasons) {  // Sequential loop
    if (includeEpisodes) {
      const seasonDetails = await this.getSeasonDetails(tvId, s.season_number);
      // ...
    }
    // ...
  }
  return seasons;
}
```

For a show with 10+ seasons and `includeEpisodes=true`, this is slow.

## Solution

Use `Promise.all` for parallel fetching:

```typescript
private async buildSeasons(...): Promise<Season[]> {
  const seasonPromises = basicSeasons
    .filter(s => s.season_number !== 0)
    .map(async (s) => {
      let episodes: Episode[] | undefined;

      if (includeEpisodes) {
        const details = await this.getSeasonDetails(tvId, s.season_number);
        // ...
      }

      return { ... };
    });

  return Promise.all(seasonPromises);
}
```

Note: Rate limiting should be handled by the HttpClient/RateLimiter.

## Acceptance Criteria

- [ ] Parallelize season fetching
- [ ] Ensure rate limiting still works
- [ ] Add concurrency limit if needed (Promise.allSettled with batching)
- [ ] Measure performance improvement

</details>

<details>
<summary><code>media-mcp-33</code> — OpenLibrarySource has fourth duplicate normalize function (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `code-quality`, `dry`


## Problem

`src/sources/open-library.ts:299-305` has the same normalize function:

```typescript
private normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

This is now the **fourth** duplicate:
1. `src/sources/google-books.ts:292-298`
2. `src/sources/tmdb.ts:716-722`
3. `src/sources/open-library.ts:299-305`
4. `src/utils/fuzzy-match.ts` (similar logic)

## Solution

See media-mcp-23 for shared string utilities proposal.

## Acceptance Criteria

- [ ] Resolve as part of media-mcp-23

</details>

<details>
<summary><code>media-mcp-34</code> — fuzzy-match.ts exports normalize() but sources use private copies (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `code-quality`, `dry`


## Problem

`src/utils/fuzzy-match.ts:56-62` exports a `normalize` function:

```typescript
export function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

But instead of importing this, each source file has its own private copy:
- `src/sources/google-books.ts:292-298`
- `src/sources/tmdb.ts:716-722`
- `src/sources/open-library.ts:299-305`

## Solution

Remove private normalize functions and import from fuzzy-match.ts:

```typescript
import { normalize } from '../utils/fuzzy-match.js';
```

Or create a dedicated string utilities module (see media-mcp-23).

## Acceptance Criteria

- [ ] Remove duplicate normalize functions from sources
- [ ] Import shared normalize from utils
- [ ] Ensure all usages work correctly

</details>

<details>
<summary><code>media-mcp-35</code> — vitest.config excludes index.ts and transport from coverage (open)</summary>

Status: open · Priority: P3 · Type: task · Labels: `configuration`, `testing` · GitHub #22


## Problem

`vitest.config.ts:12` excludes critical files from coverage:

```typescript
coverage: {
  exclude: ['src/index.ts', 'src/transport/**'],
}
```

- `src/index.ts` (571 lines) is the main entry point with significant logic
- `src/transport/http-transport.ts` handles all HTTP transport

These exclusions hide potentially untested code paths.

## Rationale for Exclusion (likely)

1. **index.ts**: Contains startup/bootstrap code that's hard to unit test
2. **transport/**: HTTP handling may require integration testing

## Options

1. **Keep exclusions** but add integration tests for these paths
2. **Refactor index.ts** to extract testable logic into separate modules
3. **Add integration tests** that exercise the full server

## Acceptance Criteria

- [ ] Evaluate if exclusions are still appropriate
- [ ] Either add integration tests OR refactor for testability
- [ ] Document why exclusions exist if kept

</details>

<details>
<summary><code>media-mcp-36</code> — config/default.json is unused - code reads environment variables directly (closed)</summary>

Status: closed · Priority: P2 · Type: chore · Labels: `configuration`, `dead-code`, `tech-debt`


## Problem

`config/default.json` exists with comprehensive configuration but is never loaded by the application. The code in `src/utils/config.ts` and `src/index.ts` reads only from environment variables.

```json
// config/default.json (not used)
{
  "server": { "name": "media-metadata-mcp", "version": "1.0.0" },
  "apis": { "hardcover": { "apiKey": "${HARDCOVER_API_KEY}", "enabled": false } },
  ...
}
```

This also shows "hardcover" API configuration that doesn't exist in the code.

## Issues

1. **Dead code** - config file is never loaded
2. **Misleading** - suggests config file support exists
3. **Hardcover reference** - mentions API that doesn't exist

## Options

1. **Delete it** - Remove unused config file
2. **Use it** - Integrate with config.ts using a library like `config` or `convict`
3. **Document** - If it's a template, rename to `config/example.json`

## Acceptance Criteria

- [ ] Decide: use or remove config/default.json
- [ ] If removing: delete the file
- [ ] If using: integrate with config loading
- [ ] Update README to document config approach

</details>

<details>
<summary><code>media-mcp-37</code> — scripts/enrich-books-queue.ts is incomplete/placeholder (closed)</summary>

Status: closed · Priority: P3 · Type: chore · Labels: `dead-code`, `scripts`, `tech-debt`


## Problem

`scripts/enrich-books-queue.ts` is a placeholder script that doesn't actually work:

1. **Line 99-119**: `enrichBook()` is a mock that just returns input data
2. **Line 102**: Has a TODO comment: "Call the actual lookup_book tool from media-mcp"
3. **Line 188-192**: Console output explains it doesn't work yet

```typescript
// TODO: Call the actual lookup_book tool from media-mcp
// For now, return the existing data
return {
  title: book.title,
  ...
}
```

## Options

1. **Complete it** - Implement actual MCP client integration
2. **Delete it** - Remove if not planning to finish
3. **Document** - Add README explaining it's a WIP

## Acceptance Criteria

- [ ] Decide: complete or remove the script
- [ ] If completing: integrate with MCP client
- [ ] If removing: delete the file
- [ ] Clean up scripts/ directory

</details>

<details>
<summary><code>media-mcp-38</code> — CI workflow runs type check via 'npm run build' instead of 'typecheck' (closed)</summary>

Status: closed · Priority: P3 · Type: feature · Labels: `ci`, `enhancement`


## Problem

`.github/workflows/ci.yml:33-34` runs type checking by building:

```yaml
- name: Type check
  run: npm run build
```

But package.json has a dedicated `typecheck` script:

```json
"typecheck": "tsc --noEmit"
```

Using `build` is slower because it also emits files. Using `typecheck` is faster and more semantically correct.

## Solution

```yaml
- name: Type check
  run: npm run typecheck

- name: Build
  run: npm run build
```

Or combine them if both are needed:

```yaml
- name: Type check and build
  run: npm run typecheck && npm run build
```

## Acceptance Criteria

- [ ] Update CI to use typecheck script
- [ ] Keep build step if release needs artifacts
- [ ] Test CI still passes

</details>

<details>
<summary><code>media-mcp-0xn</code> — Test issue (tombstone)</summary>

Status: tombstone · Priority: P2 · Type: task · Labels: —


Test description

</details>

<details>
<summary><code>media-mcp-1k0</code> — Acceptance Criteria (tombstone)</summary>

Status: tombstone · Priority: P2 · Type: task · Labels: —


- [ ] Install `zod-to-json-schema` package

</details>

<details>
<summary><code>media-mcp-1so</code> — HTTP server doesn't drain connections on SIGTERM (closed)</summary>

Status: closed · Priority: P0 · Type: bug · Labels: —

</details>

<details>
<summary><code>media-mcp-2vi</code> — Current Code Location (tombstone)</summary>

Status: tombstone · Priority: P2 · Type: task · Labels: —


`src/index.ts:352-422`

</details>

<details>
<summary><code>media-mcp-3gj</code> — Rate limiter race condition under concurrent requests (open)</summary>

Status: open · Priority: P2 · Type: bug · Labels: — · GitHub #23


canRequest() check is not atomic — two concurrent requests can both pass the requests < limit check before either records. Use token bucket or mutex.

</details>

<details>
<summary><code>media-mcp-7lf</code> — SQLite corruption crashes server on startup (closed)</summary>

Status: closed · Priority: P1 · Type: bug · Labels: —

</details>

<details>
<summary><code>media-mcp-cue</code> — TMDB date parsing produces NaN on null/empty dates (closed)</summary>

Status: closed · Priority: P1 · Type: bug · Labels: —

</details>

<details>
<summary><code>media-mcp-df1</code> — CORS hardcoded to wildcard, not configurable (open)</summary>

Status: open · Priority: P3 · Type: feature · Labels: — · GitHub #24


http-transport.ts sets Access-Control-Allow-Origin to * with no env var override. Add MCP_CORS_ORIGIN env var, default to * for backwards compat.

</details>

<details>
<summary><code>media-mcp-hn2</code> — No Zod validation on upstream API responses (open)</summary>

Status: open · Priority: P2 · Type: task · Labels: — · GitHub #25


All sources (TMDB, Open Library, Google Books, Goodreads) type-assert API responses without runtime validation. Upstream API changes silently corrupt data. Add Zod schemas for response validation.

</details>

<details>
<summary><code>media-mcp-i7t</code> — Inconsistent error codes across tools and sources (open)</summary>

Status: open · Priority: P4 · Type: task · Labels: — · GitHub #26


Error codes vary between tools (NOT_FOUND, SOURCE_ERROR, UNKNOWN_ERROR) with no central registry. Create an ErrorCode enum and standardize all error throws.

</details>

<details>
<summary><code>media-mcp-iwn</code> — SSE connections have no idle timeout (open)</summary>

Status: open · Priority: P3 · Type: bug · Labels: — · GitHub #27


GET /mcp SSE endpoint keeps connections open indefinitely with no read timeout. Buggy or malicious clients can exhaust file descriptors. Add req.setTimeout().

</details>

<details>
<summary><code>media-mcp-jd6</code> — parseInt accepts NaN from env vars + remove dead cover download config (closed)</summary>

Status: closed · Priority: P1 · Type: bug · Labels: —

</details>

<details>
<summary><code>media-mcp-k2f</code> — Problem (tombstone)</summary>

Status: tombstone · Priority: P2 · Type: task · Labels: —


`src/index.ts` (lines 352-422) contains a hand-written `zodToJsonSchema` function that introspects Zod's internal `_def` structures. This is:

</details>

<details>
<summary><code>media-mcp-m48</code> — Deploy readiness parallel audit and fix pipeline — field report (closed)</summary>

Status: closed · Priority: P4 · Type: task · Labels: —


Field report written to docs/field-reports/deploy-readiness-parallel-audit-and-fix-pipeline.md. Documents the three-phase pipeline (infra, parallel audit, parallel fix) and the subagent file-ownership pattern for safe parallel code changes.

</details>

<details>
<summary><code>media-mcp-vgp</code> — Goodreads selectors fail silently when HTML changes (open)</summary>

Status: open · Priority: P2 · Type: bug · Labels: — · GitHub #28


Cheerio selectors in goodreads.ts return empty arrays with no logging when Goodreads changes their page layout. Add warnings when selectors match nothing.

</details>

<details>
<summary><code>media-mcp-ya5</code> — Solution (tombstone)</summary>

Status: tombstone · Priority: P2 · Type: task · Labels: —


Replace with the well-maintained `zod-to-json-schema` npm package:

</details>

