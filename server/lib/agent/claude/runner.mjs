import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createStudioMcpServer } from './mcp-bridge.mjs';
import { buildClaudeRuntimeEnv, getKimiProfilePath } from './kimi-profile.mjs';
import { translateSdkMessage } from './message-translator.mjs';
import {
  appendThreadMessage,
  updateThreadSessionId,
} from './session-store.mjs';

const BLOCKED_NATIVE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'NotebookEdit',
  'ToolSearch',
  'TodoRead',
  'TodoWrite',
  'ListMcpResources',
  'ReadMcpResource',
];

const LOOP_GUARD_WINDOW_SECONDS = 45;
const LOOP_GUARD_MAX_REPEATS = 8;

const pendingInteractionsByThread = new Map();

function toSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function getSessionDir(threadId) {
  return path.join('/tmp', 'claude-sessions', 'studio-agent', String(threadId));
}

function renderRuntimeInstructions() {
  return [
    'Você está no modo agente do Studio (Image/Video).',
    'Use somente tools MCP prefixadas com mcp__studio__* para operações do Studio.',
    'Nunca use tools nativas bloqueadas para arquivos/shell/web.',
    'Antes de gerar mídia, confirme claramente os requisitos do usuário.',
    'Após confirmação, execute diretamente a geração apropriada.',
    'Ferramentas interativas AskUserQuestion, EnterPlanMode e ExitPlanMode podem ser usadas quando necessário.',
  ].join('\n');
}

function getOrCreateThreadInteractionMap(threadId) {
  if (!pendingInteractionsByThread.has(threadId)) {
    pendingInteractionsByThread.set(threadId, new Map());
  }
  return pendingInteractionsByThread.get(threadId);
}

export function getPendingInteraction(threadId, interactionId) {
  return pendingInteractionsByThread.get(threadId)?.get(interactionId) || null;
}

function savePendingInteraction(threadId, event) {
  if (!event?.interactionId) return;
  const map = getOrCreateThreadInteractionMap(threadId);
  map.set(event.interactionId, event);
}

function clearPendingInteraction(threadId, interactionId) {
  if (!interactionId) return;
  pendingInteractionsByThread.get(threadId)?.delete(interactionId);
}

function buildCanUseTool() {
  const recentSignatures = new Map();

  return async (toolName, input) => {
    if (BLOCKED_NATIVE_TOOLS.includes(toolName)) {
      return {
        behavior: 'deny',
        message: `Built-in '${toolName}' está desabilitada. Use as tools MCP do Studio.`,
      };
    }

    let inputSignature = '';
    try {
      inputSignature = JSON.stringify(input || {}, Object.keys(input || {}).sort());
    } catch {
      inputSignature = String(input || '');
    }

    const signature = `${toolName}:${inputSignature}`;
    const now = Date.now();
    const bucket = recentSignatures.get(signature);

    if (!bucket || now - bucket.lastTs > LOOP_GUARD_WINDOW_SECONDS * 1000) {
      recentSignatures.set(signature, { count: 1, lastTs: now });
      return { behavior: 'allow' };
    }

    bucket.count += 1;
    bucket.lastTs = now;

    if (bucket.count > LOOP_GUARD_MAX_REPEATS) {
      return {
        behavior: 'deny',
        message:
          'Loop guard: chamada repetida detectada. Mude a estratégia ou resuma o que falta para continuar.',
      };
    }

    return { behavior: 'allow' };
  };
}

function mapMessageRole(messageType) {
  if (messageType === 'assistant') return 'assistant';
  if (messageType === 'user') return 'user';
  return 'system';
}

export async function runStudioAgentStream({
  res,
  sql,
  logger,
  userId,
  organizationId,
  thread,
  message,
  attachments = [],
  mentions = [],
  signal,
}) {
  const sessionDir = getSessionDir(thread.id);
  await fs.mkdir(sessionDir, { recursive: true });

  const mcpServer = createStudioMcpServer({
    sql,
    userId,
    organizationId,
    logger,
  });

  const env = await buildClaudeRuntimeEnv({
    profilePath: getKimiProfilePath(),
    sessionDir,
  });

  const canUseTool = buildCanUseTool();

  const safeMessage = typeof message === 'string' ? message.trim() : '';
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const safeMentions = Array.isArray(mentions) ? mentions : [];

  await appendThreadMessage({
    threadId: thread.id,
    role: 'user',
    payload: {
      type: 'user_input',
      text: safeMessage,
      attachments: safeAttachments,
      mentions: safeMentions,
    },
  });

  let latestSessionId = thread.claude_session_id || null;

  const promptSections = [];
  if (safeMessage) {
    promptSections.push(safeMessage);
  } else {
    promptSections.push('O usuário enviou anexos sem texto adicional.');
  }
  if (safeAttachments.length > 0) {
    const attachmentLines = safeAttachments.map((item, index) => {
      const type = item?.type || 'file';
      const name = item?.name ? ` (${item.name})` : '';
      return `${index + 1}. ${type}${name}: ${item?.url || ''}`;
    });
    promptSections.push(`Anexos enviados pelo usuário:\n${attachmentLines.join('\n')}`);
  }
  if (safeMentions.length > 0) {
    const mentionLines = safeMentions.map((item, index) => `${index + 1}. ${item?.path || ''}`);
    promptSections.push(`Arquivos mencionados pelo usuário:\n${mentionLines.join('\n')}`);
  }
  const composedPrompt = promptSections.join('\n\n');

  const q = query({
    prompt: composedPrompt,
    options: {
      cwd: process.cwd(),
      env,
      mcpServers: { studio: mcpServer },
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: renderRuntimeInstructions(),
      },
      disallowedTools: BLOCKED_NATIVE_TOOLS,
      canUseTool,
      permissionMode: 'acceptEdits',
      includePartialMessages: true,
      maxTurns: 100,
      resume: thread.claude_session_id || undefined,
      settingSources: ['project', 'user'],
      model: env.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'kimi-k2.5-coding',
      stderr: (line) => logger.warn({ line }, '[StudioAgent] SDK stderr'),
    },
  });

  try {
    for await (const sdkMessage of q) {
      if (signal?.aborted) {
        logger.info({ threadId: thread.id }, '[StudioAgent] client disconnected, aborting stream');
        break;
      }

      if (sdkMessage?.session_id) {
        latestSessionId = sdkMessage.session_id;
      }

      if (sdkMessage?.type !== 'stream_event') {
        await appendThreadMessage({
          threadId: thread.id,
          role: mapMessageRole(sdkMessage?.type),
          payload: sdkMessage,
        });
      }

      const translated = translateSdkMessage(sdkMessage);
      for (const event of translated) {
        if (event.type === 'ask_user' && event.interactionId) {
          savePendingInteraction(thread.id, event);
        }

        if (event.type === 'tool_completed' || event.type === 'tool_failed') {
          clearPendingInteraction(thread.id, event.tool_call_id);
        }

        toSse(res, event);
      }
    }

    if (!signal?.aborted) {
      toSse(res, { type: 'done' });
    }
  } catch (error) {
    if (signal?.aborted) {
      logger.info({ threadId: thread.id }, '[StudioAgent] stream aborted by client disconnect');
    } else {
      logger.error({ err: error, threadId: thread.id }, '[StudioAgent] stream execution failed');
      toSse(res, {
        type: 'error',
        error: error instanceof Error ? error.message : 'Falha ao executar o agente.',
      });
    }
  } finally {
    if (latestSessionId && latestSessionId !== thread.claude_session_id) {
      await updateThreadSessionId({ threadId: thread.id, sessionId: latestSessionId });
    }
    q.close();
  }
}
