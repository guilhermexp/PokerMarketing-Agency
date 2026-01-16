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

/**
 * Handler principal do endpoint POST /api/chat
 *
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 */
export async function chatHandler(req, res) {
  try {
    // =========================================================================
    // 1. VALIDAÇÃO DO REQUEST
    // =========================================================================

    // DEBUG: Log do body recebido
    console.log('[Chat API] Request body:', JSON.stringify(req.body, null, 2));

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
      // Tool approval: enviar todas as mensagens
      messagesToProcess = messages;
      console.log(`[Chat API] Tool approval flow | messages: ${messages.length}`);
    } else {
      // Nova mensagem: apenas a última
      messagesToProcess = [message];
      console.log('[Chat API] New message flow');
    }

    // =========================================================================
    // 5. EXTRAIR REFERÊNCIA DE IMAGEM DOS PARTS (se houver)
    // =========================================================================
    let chatReferenceImage = req.body.chatReferenceImage || null;

    // Extrair imagem dos parts da última mensagem do usuário (se houver)
    const lastUserMessage = [...messagesToProcess].reverse().find(m => m.role === 'user');
    if (lastUserMessage?.parts) {
      const filePart = lastUserMessage.parts.find(p => p.type === 'file');
      if (filePart) {
        chatReferenceImage = {
          id: filePart.name,
          src: filePart.url
        };
        console.log('[Chat API] Extracted reference image from parts:', chatReferenceImage.id);
      }
    }

    // =========================================================================
    // 6. CONFIGURAR TOOLS E STREAMING
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

    // =========================================================================
    // 6. STREAM DE TEXTO COM VERCEL AI SDK
    // =========================================================================

    // Converter mensagens (é assíncrono no SDK v6)
    const convertedMessages = await convertToModelMessages(messagesToProcess);

    const result = streamText({
      model: openrouter.chat(selectedChatModel),
      system: systemPrompt({ brandProfile, selectedChatModel }),
      messages: convertedMessages,
      tools,
      experimental_activeTools: activeTools,
      experimental_transform: smoothStream({
        chunking: 'word'
      }),
      temperature: 0.7
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
