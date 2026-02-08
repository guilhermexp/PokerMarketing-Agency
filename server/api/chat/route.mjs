/**
 * Chat API Route - Vercel AI SDK
 *
 * Endpoint principal para chat com agente usando Vercel AI SDK
 */

import { createUIMessageStream, streamText, smoothStream, convertToModelMessages } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { systemPrompt } from '../../lib/ai/prompts.mjs';
import { createImageTool, editImageTool, createLogoTool } from '../../lib/ai/tools/index.mjs';
import { validateChatRequest } from './schema.mjs';
import { getAuth } from '@clerk/express';

// Chat usa APENAS OpenRouter (não usar providers.mjs do resto do app)
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});

// Nota: convertToModelMessages agora vem do SDK oficial (import acima)

// Constantes para controle de contexto
const MAX_MESSAGES = 20; // Máximo de mensagens a enviar
const MAX_MESSAGE_CONTENT_LENGTH = 10000; // Máximo de chars por conteúdo de mensagem

/**
 * Trunca mensagens para evitar exceder limite de tokens
 * Mantém as mensagens mais recentes e remove dados pesados de imagens antigas
 *
 * @param {Array} messages - Array de mensagens
 * @returns {Array} - Mensagens truncadas
 */
function truncateMessages(messages) {
  if (!messages || messages.length <= MAX_MESSAGES) {
    return messages;
  }

  console.log(`[Chat API] Truncating messages: ${messages.length} -> ${MAX_MESSAGES}`);

  // Manter as últimas MAX_MESSAGES mensagens
  const truncated = messages.slice(-MAX_MESSAGES);

  // Para mensagens antigas, remover dados base64 de imagens (muito pesados)
  return truncated.map((msg, index) => {
    // Manter as últimas 5 mensagens intactas (para contexto recente)
    if (index >= truncated.length - 5) {
      return msg;
    }

    // Para mensagens mais antigas, limpar dados pesados
    if (!msg.parts) return msg;

    const lightParts = msg.parts.map(part => {
      // Remover dados base64 de imagens antigas (manter apenas URL)
      if (part.type === 'file' && part.url?.startsWith('data:')) {
        return {
          ...part,
          url: '[imagem removida para economia de tokens]'
        };
      }

      // Truncar textos muito longos
      if (part.type === 'text' && part.text?.length > MAX_MESSAGE_CONTENT_LENGTH) {
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
 * Handler principal do endpoint POST /api/chat
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
export async function chatHandler(req, res) {
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    // =========================================================================
    // 1. VALIDAÇÃO DO REQUEST
    // =========================================================================

    // DEBUG: Log do body recebido
    if (isDev) {
      console.log('[Chat API] Request keys:', Object.keys(req.body || {}));
    }

    const validation = validateChatRequest(req.body);
    if (!validation.success) {
      console.error('[Chat API] Validation error:', validation.error.errors);
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.errors
      });
    }

    const { id, message, messages, brandProfile } = validation.data;
    let { selectedChatModel } = validation.data;

    // CHAT USA APENAS OPENROUTER: Forçar modelos válidos
    const validModels = ['openai/gpt-5.2', 'x-ai/grok-4.1-fast'];
    if (!validModels.includes(selectedChatModel)) {
      console.log(`[Chat API] Modelo inválido "${selectedChatModel}", forçando x-ai/grok-4.1-fast`);
      selectedChatModel = 'x-ai/grok-4.1-fast';
    }

    // =========================================================================
    // 2. AUTENTICAÇÃO
    // =========================================================================
    const auth = getAuth(req);
    const { userId, orgId } = auth || {};

    if (!userId) {
      console.error('[Chat API] Unauthorized: no userId');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[Chat API] Request | chatId: ${id} | userId: ${userId} | model: ${selectedChatModel}`);

    // =========================================================================
    // 3. RATE LIMITING
    // =========================================================================
    // Nota: Rate limiting já é feito pelo middleware requireAuthWithAiRateLimit
    // mas podemos adicionar lógica adicional aqui se necessário

    // =========================================================================
    // 4. DETECTAR FLUXO (Tool Approval vs Nova Mensagem)
    // =========================================================================
    const isToolApprovalFlow = Boolean(messages);

    // Mensagens para processar
    let messagesToProcess = [];
    if (isToolApprovalFlow) {
      // Tool approval: truncar mensagens para evitar exceder limite de tokens
      messagesToProcess = truncateMessages(messages);
      console.log(`[Chat API] Tool approval flow | messages: ${messages.length} (truncated: ${messagesToProcess.length})`);
    } else {
      // Nova mensagem: apenas a última
      messagesToProcess = [message];
      console.log('[Chat API] New message flow');
    }

    // =========================================================================
    // 5. SANITIZAR MENSAGENS E EXTRAIR REFERÊNCIA DE IMAGEM (se houver)
    // =========================================================================
    const sanitizeMessage = (msg) => {
      if (!msg?.parts) return msg;
      const cleanedParts = msg.parts.filter((part) => part?.type !== 'tool-result');
      return cleanedParts.length === msg.parts.length ? msg : { ...msg, parts: cleanedParts };
    };

    const sanitizedMessages = messagesToProcess.map(sanitizeMessage);

    let chatReferenceImage = req.body.chatReferenceImage || null;

    // PROCURAR IMAGEM EM TODAS AS MENSAGENS (da mais recente para a mais antiga)
    if (!chatReferenceImage) {
      const allMessages = [...sanitizedMessages].reverse(); // Mais recente primeiro
      for (const msg of allMessages) {
        if (msg.role === 'user' && msg.parts) {
          const filePart = msg.parts.find(p => p.type === 'file');
          if (filePart) {
            chatReferenceImage = {
              id: filePart.filename || filePart.name,
              src: filePart.url
            };
            console.log('[Chat API] Found reference image in message history:', chatReferenceImage.id);
            break; // Usar a imagem mais recente
          }
        }
      }
    }

    // =========================================================================
    // 6. VALIDAR BRANDPROFILE ANTES DE CONFIGURAR TOOLS
    // =========================================================================
    console.log(`[Chat API] Validando brandProfile...`);
    console.log(`[Chat API] brandProfile recebido:`, brandProfile ? {
      hasName: !!brandProfile.name,
      hasLogo: !!brandProfile.logo,
      hasColors: !!brandProfile.colors,
      hasDescription: !!brandProfile.description,
      hasPrimaryColor: !!brandProfile.colors?.primary,
      keys: Object.keys(brandProfile)
    } : 'null/undefined');

    // Validar que brandProfile tem os campos mínimos necessários
    if (!brandProfile || !brandProfile.name) {
      console.warn(`[Chat API] ⚠️ brandProfile inválido ou incompleto!`);
      console.warn(`[Chat API] brandProfile:`, JSON.stringify(brandProfile, null, 2));
    }

    // =========================================================================
    // 7. CONFIGURAR TOOLS E STREAMING
    // =========================================================================

    // Nota: Para Express, não podemos usar dataStream.write() diretamente
    // Os tools vão funcionar mas sem eventos customizados por enquanto
    const tools = {
      createImage: createImageTool({
        userId,
        orgId,
        dataStream: null, // Express não suporta dataStream customizado facilmente
        brandProfile
      }),
      editImage: editImageTool({
        userId,
        orgId,
        dataStream: null,
        referenceImage: chatReferenceImage
      }),
      createLogo: createLogoTool({
        userId,
        orgId,
        dataStream: null,
        brandProfile
      })
    };

    const isReasoningModel = selectedChatModel.includes('reasoning') ||
                             selectedChatModel.includes('thinking');

    const activeTools = isReasoningModel ? [] : ['createImage', 'editImage', 'createLogo'];

    console.log(`[Chat API] Starting streamText | activeTools: ${activeTools.length}`);
    console.log(`[Chat API] Usando OpenRouter para modelo: ${selectedChatModel}`);
    console.log(`[Chat API] Reference image:`, chatReferenceImage ? `id=${chatReferenceImage.id}` : 'none');

    const systemMessage = systemPrompt({ brandProfile, selectedChatModel });
    console.log(`[Chat API] System prompt length: ${systemMessage.length} chars`);

    // =========================================================================
    // 8. STREAM DE TEXTO COM VERCEL AI SDK
    // =========================================================================

    // Converter mensagens (é assíncrono no SDK v6)
    const convertedMessages = await convertToModelMessages(sanitizedMessages);

    const result = streamText({
      model: openrouter.chat(selectedChatModel),
      system: systemMessage,
      messages: convertedMessages,
      tools,
      experimental_activeTools: activeTools,
      experimental_transform: smoothStream({
        chunking: 'word'
      }),
      temperature: 0.7,
      maxSteps: 5, // Permitir até 5 steps de tool calling
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

            // Log dos argumentos da tool
            if (tc.args) {
              try {
                const argsStr = JSON.stringify(tc.args, null, 2).split('\n').map(l => `[Chat API]         ${l}`).join('\n');
                console.log(`[Chat API]      args:`);
                console.log(argsStr);
              } catch (e) {
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

            // Log do resultado da tool
            try {
              let resultLog = '';
              if (typeof tr.result === 'string') {
                resultLog = tr.result.substring(0, 300);
              } else if (tr.result) {
                const resultStr = JSON.stringify(tr.result, null, 2);
                resultLog = resultStr.substring(0, 500);
                if (resultStr.length > 500) resultLog += '... (truncated)';
              } else {
                resultLog = 'undefined';
              }
              console.log(`[Chat API]      result: ${resultLog}`);
            } catch (e) {
              console.log(`[Chat API]      result: <error serializing: ${e.message}>`);
            }

            // Log de erros se houver
            if (tr.error) {
              console.error(`[Chat API]      ❌ ERROR: ${tr.error}`);
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
    console.error('[Chat API] Error:', error);

    // Se headers já foram enviados, não podemos enviar erro
    if (res.headersSent) {
      console.error('[Chat API] Headers already sent, closing connection');
      res.end();
      return;
    }

    return res.status(500).json({
      error: error.message || 'Failed to process chat request'
    });
  }
}
