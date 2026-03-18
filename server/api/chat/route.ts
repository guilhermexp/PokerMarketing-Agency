/**
 * Chat API Route - Vercel AI SDK
 *
 * Endpoint principal para chat com agente usando Vercel AI SDK
 */

import type { Request, Response } from 'express';
import type { UIMessage, ModelMessage } from 'ai';
import { streamText, smoothStream, convertToModelMessages, stepCountIs } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { systemPrompt } from '../../lib/ai/prompts.js';
import { createImageTool, type BrandProfile as ToolBrandProfile } from '../../lib/ai/tools/create-image.js';
import { editImageTool } from '../../lib/ai/tools/edit-image.js';
import { createLogoTool } from '../../lib/ai/tools/create-logo.js';
import { validateChatRequest, type ChatRequestBody } from './schema.js';
import { getRequestAuthContext } from '../../lib/auth.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Reference image structure for chat context
 */
interface ChatReferenceImage {
  id?: string;
  src: string;
}

/**
 * Text part for message content
 */
interface TextPart {
  type: 'text';
  text: string;
}

/**
 * File part for message content (images)
 */
interface FilePart {
  type: 'file';
  url: string;
  name?: string;
  filename?: string;
  mediaType?: string;
}

/**
 * Tool call part
 */
interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Tool result part
 */
interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
}

/**
 * Step start part
 */
interface StepStartPart {
  type: 'step-start';
}

/**
 * Step finish part
 */
interface StepFinishPart {
  type: 'step-finish';
}

/**
 * Generic part for other SDK types
 */
interface GenericPart {
  type: string;
  [key: string]: unknown;
}

/**
 * Union type for all message part types
 */
type MessagePart =
  | TextPart
  | FilePart
  | ToolCallPart
  | ToolResultPart
  | StepStartPart
  | StepFinishPart
  | GenericPart;

/**
 * Chat message structure (compatible with UI messages)
 */
interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  parts?: MessagePart[];
  content?: string | unknown;
}

/**
 * Extended request body with reference image
 */
interface ExtendedChatRequestBody extends ChatRequestBody {
  chatReferenceImage?: ChatReferenceImage;
}

// ============================================================================
// PROVIDER SETUP
// ============================================================================

// Chat usa Gemini nativo via @ai-sdk/google
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY
});

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_MESSAGES = 20; // Maximo de mensagens a enviar
const MAX_MESSAGE_CONTENT_LENGTH = 10000; // Maximo de chars por conteudo de mensagem

// Valid model IDs
const VALID_MODELS = ['gemini-3-flash-preview', 'gemini-3-pro-preview'] as const;
type ValidModel = typeof VALID_MODELS[number];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Type guard for file parts
 */
function isFilePart(part: MessagePart): part is FilePart {
  return part.type === 'file' && 'url' in part;
}

/**
 * Type guard for text parts
 */
function isTextPart(part: MessagePart): part is TextPart {
  return part.type === 'text' && 'text' in part;
}

/**
 * Type guard for tool result parts
 */
function isToolResultPart(part: MessagePart): part is ToolResultPart {
  return part.type === 'tool-result';
}

/**
 * Trunca mensagens para evitar exceder limite de tokens
 * Mantem as mensagens mais recentes e remove dados pesados de imagens antigas
 */
function truncateMessages(messages: ChatMessage[]): ChatMessage[] {
  if (!messages || messages.length <= MAX_MESSAGES) {
    return messages;
  }

  console.log(`[Chat API] Truncating messages: ${messages.length} -> ${MAX_MESSAGES}`);

  // Manter as ultimas MAX_MESSAGES mensagens
  const truncated = messages.slice(-MAX_MESSAGES);

  // Para mensagens antigas, remover dados base64 de imagens (muito pesados)
  return truncated.map((msg, index) => {
    // Manter as ultimas 5 mensagens intactas (para contexto recente)
    if (index >= truncated.length - 5) {
      return msg;
    }

    // Para mensagens mais antigas, limpar dados pesados
    if (!msg.parts) return msg;

    const lightParts = msg.parts.map(part => {
      // Remover dados base64 de imagens antigas (manter apenas URL)
      if (isFilePart(part) && part.url?.startsWith('data:')) {
        return {
          ...part,
          url: '[imagem removida para economia de tokens]'
        };
      }

      // Truncar textos muito longos
      if (isTextPart(part) && part.text?.length > MAX_MESSAGE_CONTENT_LENGTH) {
        return {
          ...part,
          text: part.text.substring(0, MAX_MESSAGE_CONTENT_LENGTH) + '... [truncado]'
        };
      }

      return part;
    });

    return { ...msg, parts: lightParts };
  });
}

/**
 * Normaliza o ID do modelo removendo prefixo e validando
 */
function normalizeModelId(modelId: string): ValidModel {
  const normalized = modelId.replace(/^google\//, "");

  if ((VALID_MODELS as readonly string[]).includes(normalized)) {
    return normalized as ValidModel;
  }

  console.log(`[Chat API] Modelo invalido "${normalized}", forcando gemini-3-flash-preview`);
  return 'gemini-3-flash-preview';
}

/**
 * Sanitiza mensagem removendo tool-result parts
 */
function sanitizeMessage(msg: ChatMessage): ChatMessage {
  if (!msg?.parts) return msg;
  const cleanedParts = msg.parts.filter((part) => !isToolResultPart(part));
  return cleanedParts.length === msg.parts.length ? msg : { ...msg, parts: cleanedParts };
}

/**
 * Extrai imagem de referencia das mensagens
 */
function extractReferenceImage(
  messages: ChatMessage[],
  bodyReferenceImage: ChatReferenceImage | null | undefined
): ChatReferenceImage | null {
  if (bodyReferenceImage) {
    return bodyReferenceImage;
  }

  // Procurar imagem em todas as mensagens (da mais recente para a mais antiga)
  const reversedMessages = [...messages].reverse();

  for (const msg of reversedMessages) {
    if (msg.role === 'user' && msg.parts) {
      const filePart = msg.parts.find(isFilePart);
      if (filePart) {
        const referenceImage: ChatReferenceImage = {
          id: filePart.filename || filePart.name,
          src: filePart.url
        };
        console.log('[Chat API] Found reference image in message history:', referenceImage.id);
        return referenceImage;
      }
    }
  }

  return null;
}

// ============================================================================
// HANDLER
// ============================================================================

/**
 * Handler principal do endpoint POST /api/chat
 */
export async function chatHandler(req: Request, res: Response): Promise<void> {
  try {
    const isDev = process.env.NODE_ENV !== 'production';

    // =========================================================================
    // 1. VALIDACAO DO REQUEST
    // =========================================================================

    // DEBUG: Log do body recebido
    if (isDev) {
      console.log('[Chat API] Request keys:', Object.keys(req.body || {}));
    }

    const validation = validateChatRequest(req.body);
    if (!validation.success) {
      console.error('[Chat API] Validation error:', validation.error.issues);
      res.status(400).json({
        error: 'Invalid request',
        details: validation.error.issues
      });
      return;
    }

    const { id, message, messages, brandProfile } = validation.data;
    let selectedChatModel = normalizeModelId(validation.data.selectedChatModel);

    // =========================================================================
    // 2. AUTENTICACAO
    // =========================================================================
    const authCtx = getRequestAuthContext(req);
    const userId = authCtx?.userId;
    const orgId = authCtx?.orgId;

    if (!userId) {
      console.error('[Chat API] Unauthorized: no userId');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log(`[Chat API] Request | chatId: ${id} | userId: ${userId} | model: ${selectedChatModel}`);

    // =========================================================================
    // 3. RATE LIMITING
    // =========================================================================
    // Nota: Rate limiting ja e feito pelo middleware requireAuthWithAiRateLimit
    // mas podemos adicionar logica adicional aqui se necessario

    // =========================================================================
    // 4. DETECTAR FLUXO (Tool Approval vs Nova Mensagem)
    // =========================================================================
    const isToolApprovalFlow = Boolean(messages);

    // Mensagens para processar
    let messagesToProcess: ChatMessage[];
    if (isToolApprovalFlow && messages) {
      // Tool approval: truncar mensagens para evitar exceder limite de tokens
      messagesToProcess = truncateMessages(messages as ChatMessage[]);
      console.log(`[Chat API] Tool approval flow | messages: ${messages.length} (truncated: ${messagesToProcess.length})`);
    } else if (message) {
      // Nova mensagem: apenas a ultima
      messagesToProcess = [message as ChatMessage];
      console.log('[Chat API] New message flow');
    } else {
      // Should not happen due to validation, but handle gracefully
      res.status(400).json({ error: 'No message or messages provided' });
      return;
    }

    // =========================================================================
    // 5. SANITIZAR MENSAGENS E EXTRAIR REFERENCIA DE IMAGEM (se houver)
    // =========================================================================
    const sanitizedMessages = messagesToProcess.map(sanitizeMessage);

    const extendedBody = req.body as ExtendedChatRequestBody;
    const chatReferenceImage = extractReferenceImage(
      sanitizedMessages,
      extendedBody.chatReferenceImage
    );

    // =========================================================================
    // 6. VALIDAR BRANDPROFILE ANTES DE CONFIGURAR TOOLS
    // =========================================================================
    console.log(`[Chat API] Validando brandProfile...`);
    console.log(`[Chat API] brandProfile recebido:`, brandProfile ? {
      hasName: !!brandProfile.name,
      hasColors: !!brandProfile.colors,
      hasDescription: !!brandProfile.description,
      hasPrimaryColor: !!brandProfile.primaryColor,
      keys: Object.keys(brandProfile)
    } : 'null/undefined');

    // Validar que brandProfile tem os campos minimos necessarios
    if (!brandProfile || !brandProfile.name) {
      console.warn(`[Chat API] brandProfile invalido ou incompleto!`);
      console.warn(`[Chat API] brandProfile:`, JSON.stringify(brandProfile, null, 2));
    }

    // =========================================================================
    // 7. CONFIGURAR TOOLS E STREAMING
    // =========================================================================

    // Converter brandProfile para o formato esperado pelas tools
    // Note: ToolBrandProfile has an index signature [key: string]: unknown
    const toolBrandProfile: ToolBrandProfile | undefined = brandProfile ? {
      name: brandProfile.name,
      description: brandProfile.description,
      primaryColor: brandProfile.primaryColor,
      secondaryColor: brandProfile.secondaryColor
    } : undefined;

    // Nota: Para Express, nao podemos usar dataStream.write() diretamente
    // Os tools vao funcionar mas sem eventos customizados por enquanto
    const tools = {
      createImage: createImageTool({
        userId,
        orgId: orgId ?? undefined,
        dataStream: undefined, // Express nao suporta dataStream customizado facilmente
        brandProfile: toolBrandProfile
      }),
      editImage: editImageTool({
        userId,
        orgId: orgId ?? undefined,
        dataStream: undefined,
        referenceImage: chatReferenceImage ?? undefined
      }),
      createLogo: createLogoTool({
        userId,
        orgId: orgId ?? undefined,
        dataStream: undefined,
        brandProfile: toolBrandProfile
      })
    };

    const isReasoningModel = selectedChatModel.includes('reasoning') ||
                             selectedChatModel.includes('thinking');

    // Define active tools - use type assertion for SDK compatibility
    type ToolName = 'createImage' | 'editImage' | 'createLogo';
    const activeTools: ToolName[] = isReasoningModel ? [] : ['createImage', 'editImage', 'createLogo'];

    console.log(`[Chat API] Starting streamText | activeTools: ${activeTools.length}`);
    console.log(`[Chat API] Usando Gemini nativo para modelo: ${selectedChatModel}`);
    console.log(`[Chat API] Reference image:`, chatReferenceImage ? `id=${chatReferenceImage.id}` : 'none');

    // Create system prompt options
    const systemPromptBrandProfile = brandProfile ? {
      name: brandProfile.name,
      description: brandProfile.description,
      tone: brandProfile.tone,
      targetAudience: brandProfile.targetAudience,
      primaryColor: brandProfile.primaryColor,
      secondaryColor: brandProfile.secondaryColor,
      values: brandProfile.values
    } : undefined;

    const systemMessage = systemPrompt({ brandProfile: systemPromptBrandProfile, selectedChatModel });
    console.log(`[Chat API] System prompt length: ${systemMessage.length} chars`);

    // =========================================================================
    // 8. STREAM DE TEXTO COM VERCEL AI SDK
    // =========================================================================

    // Converter mensagens (e assincrono no SDK v6)
    // Cast to UIMessage[] for convertToModelMessages compatibility
    const convertedMessages = await convertToModelMessages(sanitizedMessages as UIMessage[]);

    const result = streamText({
      model: google(selectedChatModel),
      system: systemMessage,
      messages: convertedMessages as ModelMessage[],
      tools,
      experimental_activeTools: activeTools,
      experimental_transform: smoothStream({
        chunking: 'word'
      }),
      temperature: 0.7,
      stopWhen: stepCountIs(5), // Permitir ate 5 steps de tool calling
      onStepFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
        console.log('[Chat API] ================================================');
        console.log('[Chat API] STEP FINISHED');
        console.log('[Chat API] finishReason:', finishReason);
        console.log('[Chat API] usage:', usage);

        if (text) {
          console.log('[Chat API] text preview:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
        }

        // Log detalhado de tool calls
        if (toolCalls && toolCalls.length > 0) {
          console.log(`[Chat API] Tool Calls (${toolCalls.length}):`);
          toolCalls.forEach((tc, idx) => {
            console.log(`[Chat API]   ${idx + 1}. ${tc.toolName} (${tc.type})`);
            console.log(`[Chat API]      toolCallId: ${tc.toolCallId}`);

            // Log dos argumentos da tool - access via type narrowing
            if ('args' in tc && tc.args) {
              try {
                const argsStr = JSON.stringify(tc.args, null, 2).split('\n').map(l => `[Chat API]         ${l}`).join('\n');
                console.log(`[Chat API]      args:`);
                console.log(argsStr);
              } catch {
                console.log(`[Chat API]      args: <error serializing>`);
              }
            }
          });
        }

        // Log detalhado de tool results
        if (toolResults && toolResults.length > 0) {
          console.log(`[Chat API] Tool Results (${toolResults.length}):`);
          toolResults.forEach((tr, idx) => {
            console.log(`[Chat API]   ${idx + 1}. ${tr.toolName}`);
            console.log(`[Chat API]      toolCallId: ${tr.toolCallId}`);

            // Log do resultado da tool - access via type narrowing
            try {
              let resultLog = '';
              const trResult = 'result' in tr ? tr.result : undefined;
              if (typeof trResult === 'string') {
                resultLog = trResult.substring(0, 300);
              } else if (trResult) {
                const resultStr = JSON.stringify(trResult, null, 2);
                resultLog = resultStr.substring(0, 500);
                if (resultStr.length > 500) resultLog += '... (truncated)';
              } else {
                resultLog = 'undefined';
              }
              console.log(`[Chat API]      result: ${resultLog}`);
            } catch (e) {
              const error = e as Error;
              console.log(`[Chat API]      result: <error serializing: ${error.message}>`);
            }

            // Log de erros se houver
            if ('error' in tr && tr.error) {
              console.error(`[Chat API]      ERROR: ${tr.error}`);
            }
          });
        }

        console.log('[Chat API] ================================================');
      }
    });

    console.log('[Chat API] Streaming started');

    // Para Express + useChat, usar pipeUIMessageStreamToResponse
    result.pipeUIMessageStreamToResponse(res);
  } catch (error) {
    const err = error as Error;
    console.error('[Chat API] Error:', err);

    // Se headers ja foram enviados, nao podemos enviar erro
    if (res.headersSent) {
      console.error('[Chat API] Headers already sent, closing connection');
      res.end();
      return;
    }

    res.status(500).json({
      error: err.message || 'Failed to process chat request'
    });
  }
}
