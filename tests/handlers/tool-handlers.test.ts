import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createToolHandlers } from '../../src/handlers/tool-handlers.js';
import { Logger } from '../../src/utils/logger.js';

function setup() {
  const logger = new Logger('test');
  const execute = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] });
  const handlers = createToolHandlers(
    [
      {
        name: 'example',
        description: 'Example tool',
        inputSchema: z.object({ title: z.string() }),
      },
    ],
    execute,
    logger,
    { name: 'test-server', version: '1.2.3' }
  );
  return { handlers, execute, logger };
}

describe('shared tool handlers', () => {
  it('provides the same tool schemas to direct and HTTP adapters', async () => {
    const { handlers } = setup();
    const direct = handlers.listTools();
    const response = await handlers.handleHttpRequest({
      jsonrpc: '2.0',
      id: 0,
      method: 'tools/list',
    });
    expect(response).toEqual({ jsonrpc: '2.0', id: 0, result: direct });
    expect(direct.tools[0]).toMatchObject({
      name: 'example',
      inputSchema: {
        type: 'object',
        required: ['title'],
        properties: { title: { type: 'string' } },
      },
    });
    expect(direct.tools[0].inputSchema).not.toHaveProperty('$schema');
  });

  it('passes the same explicit arguments and error results through both adapters', async () => {
    const { handlers, execute } = setup();
    const errorResult = { content: [{ type: 'text', text: 'not found' }], isError: true };
    execute.mockResolvedValue(errorResult);
    const args = { title: 'Book' };
    expect(await handlers.callTool('example', args)).toEqual(errorResult);
    expect(
      await handlers.handleHttpRequest({
        jsonrpc: '2.0',
        id: 'call',
        method: 'tools/call',
        params: { name: 'example', arguments: args },
      })
    ).toEqual({ jsonrpc: '2.0', id: 'call', result: errorResult });
    expect(execute.mock.calls).toEqual([
      ['example', args],
      ['example', args],
    ]);
  });

  it('preserves absent-argument behavior in each transport', async () => {
    const { handlers, execute } = setup();
    await handlers.callTool('example', undefined);
    await handlers.handleHttpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'example' },
    });
    expect(execute.mock.calls).toEqual([
      ['example', undefined],
      ['example', undefined],
    ]);
  });

  it('sets the logging level in both adapters and announces both changes', async () => {
    const { handlers, logger } = setup();
    const setLevel = vi.spyOn(logger, 'setLevel');
    const info = vi.spyOn(logger, 'info');
    const emitted: Array<{ action?: unknown; level?: unknown }> = [];
    logger.setEmitter((entry) => {
      emitted.push(entry.data as { action?: unknown; level?: unknown });
    });
    expect(handlers.setLevel('debug', true)).toEqual({});
    expect(
      await handlers.handleHttpRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'logging/setLevel',
        params: { level: 'debug' },
      })
    ).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
    expect(setLevel.mock.calls).toEqual([['debug'], ['debug']]);
    expect(info.mock.calls).toEqual([
      ['main', { action: 'log_level_changed', level: 'debug' }],
      ['main', { action: 'log_level_changed', level: 'debug' }],
    ]);
    expect(emitted.map(({ action, level }) => ({ action, level }))).toEqual([
      { action: 'log_level_changed', level: 'debug' },
      { action: 'log_level_changed', level: 'debug' },
    ]);
  });

  it('preserves HTTP initialization, ping and unknown-method envelopes', async () => {
    const { handlers } = setup();
    expect(
      await handlers.handleHttpRequest({ jsonrpc: '2.0', id: 3, method: 'initialize' })
    ).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: {
        protocolVersion: '2025-11-25',
        capabilities: { tools: {}, logging: {} },
        serverInfo: { name: 'test-server', version: '1.2.3' },
      },
    });
    expect(await handlers.handleHttpRequest({ jsonrpc: '2.0', id: 4, method: 'ping' })).toEqual({
      jsonrpc: '2.0',
      id: 4,
      result: {},
    });
    expect(await handlers.handleHttpRequest({ jsonrpc: '2.0', id: 5, method: 'unknown' })).toEqual({
      jsonrpc: '2.0',
      id: 5,
      error: { code: -32601, message: 'Method not found: unknown' },
    });
  });

  it('leaves thrown exceptions for the transport error boundary', async () => {
    const { handlers, execute } = setup();
    execute.mockRejectedValue(new Error('failed'));
    await expect(handlers.callTool('example', {})).rejects.toThrow('failed');
    await expect(
      handlers.handleHttpRequest({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'example' },
      })
    ).rejects.toThrow('failed');
  });
});
