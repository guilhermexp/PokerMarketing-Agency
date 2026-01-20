/**
 * Validation Schema - Vercel AI SDK Chat API
 *
 * Define schemas Zod para validação de requisições
 */

import { z } from 'zod';

// ============================================================================
// MESSAGE PARTS SCHEMAS
// ============================================================================

/**
 * Part de texto
 */
const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(5000)
});

const isValidUrl = (value) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * Part de arquivo (imagem)
 */
const filePartSchema = z.object({
  type: z.literal('file'),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  name: z.string().optional(),
  filename: z.string().optional(),
  url: z.string().refine(
    (value) => value.startsWith('data:') || isValidUrl(value),
    { message: 'url must be a valid URL or data URL' }
  )
}).refine((data) => data.name || data.filename, {
  message: 'name or filename is required',
  path: ['name']
});

/**
 * Part de tool call (usado internamente pelo SDK)
 */
const toolCallPartSchema = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.any())
});

/**
 * Part de tool result (usado internamente pelo SDK)
 */
const toolResultPartSchema = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.any()
});

/**
 * Step start (usado pelo SDK para indicar início de step)
 */
const stepStartPartSchema = z.object({
  type: z.literal('step-start')
}).passthrough();

/**
 * Step finish (usado pelo SDK para indicar fim de step)
 */
const stepFinishPartSchema = z.object({
  type: z.literal('step-finish')
}).passthrough();

/**
 * Part genérico para outros tipos do SDK
 */
const genericPartSchema = z.object({
  type: z.string()
}).passthrough();

/**
 * Union de todos os tipos de parts
 */
const messagePartSchema = z.union([
  textPartSchema,
  filePartSchema,
  toolCallPartSchema,
  toolResultPartSchema,
  stepStartPartSchema,
  stepFinishPartSchema,
  genericPartSchema // Fallback para qualquer outro tipo
]);

// ============================================================================
// MESSAGE SCHEMA
// ============================================================================

/**
 * Mensagem individual
 */
const messageSchema = z.object({
  id: z.string().optional(), // Opcional: nem sempre é UUID no formato do SDK
  role: z.enum(['user', 'assistant']),
  parts: z.array(messagePartSchema).optional(),
  content: z.union([z.string(), z.any()]).optional(), // String simples ou qualquer outro formato
}).passthrough(); // Permite campos extras do SDK

// ============================================================================
// BRAND PROFILE SCHEMA
// ============================================================================

/**
 * Brand profile (opcional)
 */
const brandProfileSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  tone: z.string().optional(),
  targetAudience: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  colors: z.array(z.string()).optional(),
  values: z.array(z.string()).optional(),
  preferredAIModel: z.string().optional()
}).optional();

// ============================================================================
// CHAT BODY SCHEMA (PRINCIPAL)
// ============================================================================

/**
 * Schema principal para requisições POST /api/chat
 *
 * Suporta dois modos:
 * 1. Nova mensagem: { id, message, selectedChatModel }
 * 2. Tool approval flow: { id, messages, selectedChatModel }
 */
export const chatBodySchema = z.object({
  // ID do chat (qualquer string)
  id: z.string(),

  // Mensagem única (modo: nova mensagem do usuário)
  message: messageSchema.optional(),

  // Array de mensagens (modo: tool approval ou histórico completo)
  messages: z.array(messageSchema).optional(),

  // Modelo de LLM selecionado (apenas OpenRouter)
  selectedChatModel: z.string().default('x-ai/grok-4.1-fast'),

  // Brand profile (contexto da marca)
  brandProfile: brandProfileSchema,

  // Tipo de visibilidade (para persistência futura)
  selectedVisibilityType: z.enum(['public', 'private']).optional().default('private')
})
.passthrough() // Permite campos extras do SDK
.refine(
  (data) => data.message || data.messages,
  {
    message: 'Deve fornecer "message" ou "messages"',
    path: ['message']
  }
);

// ============================================================================
// UTILITY VALIDATORS
// ============================================================================

/**
 * Valida se o request body é válido
 *
 * @param {any} body - Corpo da requisição
 * @returns {{ success: boolean, data?: object, error?: object }}
 */
export function validateChatRequest(body) {
  return chatBodySchema.safeParse(body);
}

/**
 * Valida se uma mensagem individual é válida
 *
 * @param {any} message
 * @returns {{ success: boolean, data?: object, error?: object }}
 */
export function validateMessage(message) {
  return messageSchema.safeParse(message);
}

/**
 * Valida se o modelo ID é válido (formato básico)
 *
 * @param {string} modelId
 * @returns {boolean}
 */
export function isValidModelId(modelId) {
  // Formato: "provider/model-name"
  const pattern = /^[a-z\-]+\/[a-z0-9\-\.]+$/i;
  return pattern.test(modelId);
}

// ============================================================================
// EXPORT TYPES (para TypeScript/JSDoc)
// ============================================================================

/**
 * @typedef {z.infer<typeof chatBodySchema>} ChatRequestBody
 * @typedef {z.infer<typeof messageSchema>} Message
 * @typedef {z.infer<typeof messagePartSchema>} MessagePart
 * @typedef {z.infer<typeof brandProfileSchema>} BrandProfile
 */
