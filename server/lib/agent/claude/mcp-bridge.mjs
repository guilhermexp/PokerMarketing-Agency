import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { buildStudioToolDefinitions } from './tool-registry.mjs';

export function createStudioMcpServer({ sql, userId, organizationId, logger }) {
  const tools = buildStudioToolDefinitions({ sql, userId, organizationId, logger });

  return createSdkMcpServer({
    name: 'studio',
    version: '1.0.0',
    tools,
  });
}
