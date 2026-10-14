import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Logger } from '../utils/logger.js';
import type { LogLevel } from '../types/common.js';
import type { MCPRequest, MCPResponse } from '../transport/http-transport.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
}

type ToolCallResult = { content: { type: string; text: string }[]; isError?: boolean };
type ExecuteToolCall = (name: string, args: unknown) => Promise<ToolCallResult>;

/** Shared application handlers; transport framing and error envelopes stay outside. */
export function createToolHandlers(
  tools: ToolDefinition[],
  execute: ExecuteToolCall,
  logger: Logger,
  serverInfo: { name: string; version: string }
) {
  function listTools() {
    return {
      tools: tools.map((tool) => {
        const schema = zodToJsonSchema(tool.inputSchema, { $refStrategy: 'none' });
        // MCP supplies its own schema dialect; omit the JSON Schema declaration.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { $schema: _, ...inputSchema } = schema as Record<string, unknown>;
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

  async function handleHttpRequest(request: MCPRequest): Promise<MCPResponse> {
    let result: unknown;
    switch (request.method) {
      case 'initialize':
        result = {
          protocolVersion: '2025-11-25',
          capabilities: { tools: {}, logging: {} },
          serverInfo,
        };
        break;
      case 'tools/list':
        result = listTools();
        break;
      case 'tools/call': {
        const params = request.params as { name: string; arguments?: unknown };
        result = await callTool(params.name, params.arguments || {});
        break;
      }
      case 'logging/setLevel': {
        const params = request.params as { level: LogLevel };
        result = setLevel(params.level);
        break;
      }
      case 'ping':
        result = {};
        break;
      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        };
    }
    return { jsonrpc: '2.0', id: request.id, result };
  }

  return { listTools, callTool, setLevel, handleHttpRequest };
}
