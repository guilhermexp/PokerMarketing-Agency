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
const ASK_USER_TIMEOUT_MS = 60_000;

const pendingInteractionsByThread = new Map();

function toSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function getSessionDir(threadId) {
  return path.join('/tmp', 'claude-sessions', 'studio-agent', String(threadId));
}

function renderRuntimeInstructions() {
  return [
    'Você é o assistente criativo do Studio (Image/Video).',
    'Use somente tools MCP prefixadas com mcp__studio__* para operações do Studio.',
    'Nunca use tools nativas bloqueadas para arquivos/shell/web.',
    '',
    'CAPACIDADES:',
    '- GERAR imagens (studio_image_generate), vídeos (studio_video_generate), flyers (studio_flyer_generate), textos (studio_text_generate) e campanhas completas (studio_campaign_generate)',
    '- BUSCAR conteúdo existente: galeria (studio_gallery_search/get), campanhas (studio_campaigns_list/campaign_get), posts (studio_posts_list), clips (studio_clips_list), carrosséis (studio_carousels_list), posts agendados (studio_scheduled_posts_list)',
    '- EDITAR imagens existentes com prompts (studio_image_edit)',
    '- ACESSAR brand profile — cores, logo, tom de voz (studio_brand_profile_get)',
    '- SALVAR imagens geradas na galeria (studio_gallery_save)',
    '',
    'FLUXO RECOMENDADO:',
    '1. Se o usuário mencionar conteúdo existente, busque primeiro com as tools de listagem/busca.',
    '2. Use brand profile quando relevante para manter identidade visual (useBrandProfile: true).',
    '3. Após gerar imagem/flyer, ofereça salvar na galeria.',
    '4. Para campanhas, confirme os requisitos antes de gerar.',
    '5. Antes de gerar mídia, confirme claramente os requisitos do usuário.',
    '6. Após confirmação, execute diretamente a geração apropriada.',
    '',
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
  const map = pendingInteractionsByThread.get(threadId);
  const pending = map?.get(interactionId);
  if (pending?.timeoutId) {
    clearTimeout(pending.timeoutId);
  }
  map?.delete(interactionId);
}

export function resolvePendingInteraction(threadId, interactionId, response = {}) {
  const map = pendingInteractionsByThread.get(threadId);
  const pending = map?.get(interactionId);
  if (!pending?.resolve) return false;

  clearPendingInteraction(threadId, interactionId);
  pending.resolve({
    approved: Boolean(response?.approved),
    message: typeof response?.message === 'string' ? response.message : undefined,
    updatedInput: response?.updatedInput,
  });
  return true;
}

function normalizeAskUserQuestions(input = {}) {
  if (Array.isArray(input.questions) && input.questions.length > 0) {
    return input.questions.map((question, idx) => {
      const fallbackLabel = `Opção ${idx + 1}`;
      const options = Array.isArray(question?.options)
        ? question.options.map((option, optIdx) => ({
            id: String(option?.id || `opt_${optIdx + 1}`),
            label: String(option?.label || option?.title || `Opção ${optIdx + 1}`),
            description: option?.description ? String(option.description) : '',
          }))
        : [];

      return {
        id: String(question?.id || `q_${idx + 1}`),
        header: String(question?.header || 'Pergunta'),
        question: String(question?.question || question?.prompt || 'Preciso da sua confirmação.'),
        options:
          options.length > 0
            ? options
            : [{ id: 'opt_1', label: fallbackLabel, description: '' }],
        multiSelect: Boolean(question?.multiSelect),
      };
    });
  }

  const options = Array.isArray(input.options)
    ? input.options.map((option, idx) => ({
        id: String(option?.id || `opt_${idx + 1}`),
        label: String(option?.label || option?.title || `Opção ${idx + 1}`),
        description: option?.description ? String(option.description) : '',
      }))
    : [];

  return [{
    id: 'q_1',
    header: String(input.header || 'Pergunta'),
    question: String(input.question || input.prompt || 'Preciso da sua confirmação.'),
    options: options.length > 0 ? options : [{ id: 'opt_1', label: 'Confirmar', description: '' }],
    multiSelect: false,
  }];
}

function buildCanUseTool({ threadId, emitEvent }) {
  const recentSignatures = new Map();

  return async (toolName, input, options = {}) => {
    if (BLOCKED_NATIVE_TOOLS.includes(toolName)) {
      return {
        behavior: 'deny',
        message: `Built-in '${toolName}' está desabilitada. Use as tools MCP do Studio.`,
      };
    }

    // Handle interactive tools before the loop guard — these must always
    // suspend execution and wait for user input regardless of call count.
    if (toolName === 'AskUserQuestion') {
      const interactionId = typeof options?.toolUseID === 'string'
        ? options.toolUseID
        : `ask_user_${Date.now()}`;
      const questions = normalizeAskUserQuestions(input || {});
      const pendingPayload = {
        interactionId,
        header: questions[0]?.header || 'Pergunta',
        question: questions[0]?.question || 'Preciso da sua confirmação.',
        options: questions[0]?.options || [],
        questions,
      };

      emitEvent({
        type: 'ask_user',
        ...pendingPayload,
      });

      const decision = await new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          clearPendingInteraction(threadId, interactionId);
          emitEvent({
            type: 'ask_user_timeout',
            interactionId,
          });
          resolve({
            approved: false,
            message: 'Timed out',
          });
        }, ASK_USER_TIMEOUT_MS);

        const map = getOrCreateThreadInteractionMap(threadId);
        map.set(interactionId, {
          ...pendingPayload,
          timeoutId,
          resolve,
        });
      });

      if (!decision?.approved) {
        emitEvent({
          type: 'ask_user_result',
          interactionId,
          result: {
            approved: false,
            message: decision?.message || 'User skipped questions - proceed with defaults',
          },
        });
        return {
          behavior: 'deny',
          message: decision?.message || 'User skipped questions - proceed with defaults',
        };
      }

      emitEvent({
        type: 'ask_user_result',
        interactionId,
        result: {
          approved: true,
          answers: decision?.updatedInput?.answers || null,
        },
      });
      return {
        behavior: 'allow',
        updatedInput: decision?.updatedInput || input,
      };
    }

    // Loop guard for non-interactive tools
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

    return { behavior: 'allow', updatedInput: input };
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

  const canUseTool = buildCanUseTool({
    threadId: thread.id,
    emitEvent: (payload) => toSse(res, payload),
  });

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
    const pending = pendingInteractionsByThread.get(thread.id);
    if (pending) {
      for (const [interactionId, interaction] of pending.entries()) {
        if (typeof interaction?.resolve === 'function') {
          interaction.resolve({
            approved: false,
            message: 'Session cancelled.',
          });
        }
        clearPendingInteraction(thread.id, interactionId);
      }
      pendingInteractionsByThread.delete(thread.id);
    }
    if (latestSessionId && latestSessionId !== thread.claude_session_id) {
      await updateThreadSessionId({ threadId: thread.id, sessionId: latestSessionId });
    }
    q.close();
  }
}
