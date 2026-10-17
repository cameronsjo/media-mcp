import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

const BEARER_PREFIX = /^Bearer /i;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Compare an Authorization header against the configured token in constant time.
 *
 * Both sides are hashed first so the comparison always runs over two 32-byte
 * digests: timing reveals neither the token's length nor the matched prefix.
 * A malformed header still runs the comparison against an empty candidate.
 */
export function bearerTokenMatches(header: string | undefined, expected: string): boolean {
  const candidate = header !== undefined && BEARER_PREFIX.test(header) ? header.slice(7) : '';
  const equal = timingSafeEqual(sha256(candidate), sha256(expected));
  return equal && candidate.length > 0;
}

/**
 * True only for listen addresses that cannot be reached from another host.
 * Anything else, including wildcards and hostnames other than `localhost`,
 * counts as reachable so the auth policy fails closed.
 */
export function isLoopbackHost(host: string): boolean {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (bare.toLowerCase() === 'localhost') return true;
  const family = isIP(bare);
  if (family === 4) return bare.startsWith('127.');
  if (family === 6) return bare === '::1';
  return false;
}

export interface HttpAuthPolicy {
  host: string;
  authToken?: string | undefined;
  allowUnauthenticated?: boolean | undefined;
}

/** Refuse to serve unauthenticated beyond loopback unless explicitly allowed. */
export function assertHttpAuthPolicy(policy: HttpAuthPolicy): void {
  if (policy.authToken || policy.allowUnauthenticated || isLoopbackHost(policy.host)) return;
  throw new Error(
    `Refusing to listen on non-loopback host "${policy.host}" without authentication. ` +
      'Set MCP_AUTH_TOKEN, bind MCP_HTTP_HOST to 127.0.0.1, or set ' +
      'MCP_ALLOW_UNAUTHENTICATED=1 if another layer authenticates clients.'
  );
}

/** Express middleware rejecting requests without the configured bearer token. */
export function requireBearerToken(token: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (bearerTokenMatches(req.headers.authorization, token)) {
      next();
      return;
    }
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer')
      .json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } });
  };
}
