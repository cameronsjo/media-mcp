import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ListToolsResult } from '@modelcontextprotocol/server';
import { Logger } from '../utils/logger.js';
import type { LogLevel } from '../types/common.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
}

type ToolCallResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
type ExecuteToolCall = (name: string, args: unknown) => Promise<ToolCallResult>;

/** Shared application handlers; transport framing and error envelopes stay outside. */
export function createToolHandlers(
  tools: ToolDefinition[],
  execute: ExecuteToolCall,
  logger: Logger
) {
  function listTools(): ListToolsResult {
    return {
      tools: tools.map((tool) => {
        const schema = zodToJsonSchema(tool.inputSchema, { $refStrategy: 'none' });
        // MCP supplies its own schema dialect; omit the JSON Schema declaration.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { $schema: _, ...schemaWithoutDialect } = schema as Record<string, unknown>;
        const inputSchema = { ...schemaWithoutDialect, type: 'object' as const };
        return { name: tool.name, description: tool.description, inputSchema };
      }),
    };
  }

  function callTool(name: string, args: unknown): Promise<ToolCallResult> {
    return execute(name, args);
  }

  function setLevel(level: LogLevel, announce = false) {
    logger.setLevel(level);
    if (announce) logger.info('main', { action: 'log_level_changed', level });
    return {};
  }

  return { listTools, callTool, setLevel };
}
