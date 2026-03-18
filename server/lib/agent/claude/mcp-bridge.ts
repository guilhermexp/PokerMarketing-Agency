import type { Logger } from "pino";
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { buildStudioToolDefinitions } from './tool-registry.js';
import type { SqlClient } from '../../db.js';

type StudioMcpServerInput = {
  logger: Logger;
  organizationId: string | null;
  sql: SqlClient;
  userId: string;
};

export function createStudioMcpServer({ sql, userId, organizationId, logger }: StudioMcpServerInput) {
  const tools = buildStudioToolDefinitions({ sql, userId, organizationId, logger });

  return createSdkMcpServer({
    name: 'studio',
    version: '1.0.0',
    tools,
  });
}
