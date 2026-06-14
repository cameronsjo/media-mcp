#!/usr/bin/env node
/**
 * Real-key smoke test for the TMDB source.
 *
 * Proves the v3/v4 auth auto-detection works against the *live* TMDB API,
 * without the key ever entering an assistant's context. Reads TMDB_API_KEY
 * from the environment only.
 *
 * Usage (after `npm run build`):
 *   TMDB_API_KEY=<your-key> node scripts/smoke-tmdb.mjs
 *
 * Exit codes: 0 ok · 1 no key · 2 search failed · 3 details failed · 4 threw
 */
import { TMDBSource } from '../dist/sources/tmdb.js';
import { SQLiteCache } from '../dist/cache/sqlite-cache.js';
import { Logger } from '../dist/utils/logger.js';
import { RateLimiter } from '../dist/utils/rate-limiter.js';

const apiKey = process.env.TMDB_API_KEY;
if (!apiKey) {
  console.error('TMDB_API_KEY not set. Run: TMDB_API_KEY=<key> node scripts/smoke-tmdb.mjs');
  process.exit(1);
}

const logger = new Logger('smoke');
logger.setLevel('debug'); // surface the auth_configured log (key is never logged)
const rateLimiter = new RateLimiter(logger);
const cache = new SQLiteCache({ path: ':memory:', defaultTTLHours: 24, enabled: true }, logger);

const source = new TMDBSource(apiKey, cache, logger, rateLimiter);

// Mirror the source's detection so the operator sees which scheme is in play,
// without exposing the key.
const detectedMode = /^[0-9a-f]{32}$/i.test(apiKey) ? 'v3-query-param' : 'v4-bearer';
console.log(`\nDetected auth mode: ${detectedMode} (key length ${apiKey.length})\n`);

try {
  const id = await source.searchMovie('The Matrix', 1999);
  console.log(`searchMovie('The Matrix', 1999) -> tmdbId ${id}`);
  if (id == null) {
    console.error('FAIL: no movie id returned — check the auth warning above');
    cache.close();
    process.exit(2);
  }

  const movie = await source.getMovieDetails(id);
  console.log(`getMovieDetails(${id}) -> "${movie?.title}" (${movie?.year})`);
  if (!movie || movie.title !== 'The Matrix') {
    console.error('FAIL: unexpected movie details');
    cache.close();
    process.exit(3);
  }

  console.log('\nSmoke test passed — TMDB auth works end-to-end.\n');
  cache.close();
  process.exit(0);
} catch (err) {
  console.error('FAIL: threw during smoke test:', err);
  cache.close();
  process.exit(4);
}
