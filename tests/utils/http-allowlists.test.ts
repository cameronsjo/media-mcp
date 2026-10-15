import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigSchema, loadConfig } from '../../src/utils/config.js';

afterEach(() => vi.unstubAllEnvs());

describe('HTTP hostname allowlist configuration', () => {
  it('keeps optional allowlists absent unless explicitly configured', () => {
    vi.stubEnv('MCP_ALLOWED_HOSTS', undefined);
    vi.stubEnv('MCP_ALLOWED_ORIGINS', undefined);
    vi.stubEnv('MCP_HTTP_HOST', '0.0.0.0');
    const { config } = loadConfig();
    expect(config.httpHost).toBe('0.0.0.0');
    expect(config.httpAllowedHosts).toBeUndefined();
    expect(config.httpAllowedOrigins).toBeUndefined();
  });

  it('loads comma-separated names and canonicalizes case and IPv6', () => {
    vi.stubEnv('MCP_ALLOWED_HOSTS', ' MEDIA.Internal, [0:0:0:0:0:0:0:1] ');
    vi.stubEnv('MCP_ALLOWED_ORIGINS', ' ui.internal, dashboard.lan ');
    const { config } = loadConfig();
    expect(config.httpAllowedHosts).toEqual(['media.internal', '[::1]']);
    expect(config.httpAllowedOrigins).toEqual(['ui.internal', 'dashboard.lan']);
  });

  it.each([
    '',
    ' ',
    '*',
    'https://*',
    'http://media.internal',
    'media.internal:3000',
    'media.internal/path',
    'user@media.internal',
    ',media.internal',
  ])('rejects invalid allowlist entry %j instead of opening access', (value) => {
    const parsed = ConfigSchema.safeParse({ httpAllowedHosts: [value] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['httpAllowedHosts', 0],
            message: 'Expected a hostname without scheme, port, path or wildcard',
          }),
        ])
      );
    }
  });

  it('fails startup configuration for empty environment lists', () => {
    vi.stubEnv('MCP_ALLOWED_ORIGINS', '');
    expect(() => loadConfig()).toThrow(
      'Expected a hostname without scheme, port, path or wildcard'
    );
  });
});
