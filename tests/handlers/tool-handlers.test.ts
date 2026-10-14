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
    logger
  );
  return { handlers, execute, logger };
}

describe('shared tool handlers', () => {
  it('provides the tool schema used by both SDK transport factories', () => {
    const { handlers } = setup();
    const listed = handlers.listTools();
    expect(listed).toEqual({
      tools: [
        {
          name: 'example',
          description: 'Example tool',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['title'],
            properties: { title: { type: 'string' } },
          },
        },
      ],
    });
    expect(listed.tools[0].inputSchema).not.toHaveProperty('$schema');
  });

  it('passes explicit arguments and error results through the shared call path', async () => {
    const { handlers, execute } = setup();
    const errorResult = { content: [{ type: 'text', text: 'not found' }], isError: true };
    execute.mockResolvedValue(errorResult);
    const args = { title: 'Book' };

    await expect(handlers.callTool('example', args)).resolves.toEqual(errorResult);
    expect(execute).toHaveBeenCalledExactlyOnceWith('example', args);
  });

  it('forwards absent tool arguments unchanged through the shared call path', async () => {
    const { handlers, execute } = setup();
    await handlers.callTool('example', undefined);
    await handlers.callTool('example', undefined);
    expect(execute.mock.calls).toEqual([
      ['example', undefined],
      ['example', undefined],
    ]);
  });

  it('announces each logging-level change through the shared emitter', () => {
    const { handlers, logger } = setup();
    const setLevel = vi.spyOn(logger, 'setLevel');
    const info = vi.spyOn(logger, 'info');
    const emitted: Array<{ action?: unknown; level?: unknown }> = [];
    logger.setEmitter((entry) => {
      emitted.push(entry.data as { action?: unknown; level?: unknown });
    });
    expect(handlers.setLevel('debug', true)).toEqual({});
    expect(handlers.setLevel('debug', true)).toEqual({});
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

  it('leaves thrown exceptions for the SDK transport error boundary', async () => {
    const { handlers, execute } = setup();
    execute.mockRejectedValue(new Error('failed'));
    await expect(handlers.callTool('example', {})).rejects.toThrow('failed');
  });
});
