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

  it('preserves absent-argument behavior for the SDK request handler', async () => {
    const { handlers, execute } = setup();
    await handlers.callTool('example', undefined);
    expect(execute).toHaveBeenCalledExactlyOnceWith('example', undefined);
  });

  it('sets the logging level and preserves the stdio announcement', () => {
    const { handlers, logger } = setup();
    const setLevel = vi.spyOn(logger, 'setLevel');
    const info = vi.spyOn(logger, 'info');

    expect(handlers.setLevel('debug', true)).toEqual({});
    expect(setLevel).toHaveBeenCalledExactlyOnceWith('debug');
    expect(info).toHaveBeenCalledExactlyOnceWith('main', {
      action: 'log_level_changed',
      level: 'debug',
    });
  });

  it('leaves thrown exceptions for the SDK transport error boundary', async () => {
    const { handlers, execute } = setup();
    execute.mockRejectedValue(new Error('failed'));
    await expect(handlers.callTool('example', {})).rejects.toThrow('failed');
  });
});
