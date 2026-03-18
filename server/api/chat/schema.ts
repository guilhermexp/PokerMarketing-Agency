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

const isValidUrl = (value: string): boolean => {
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
 * Tool arguments can be any JSON-serializable value
 */
const toolCallPartSchema = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown())
});

/**
 * Part de tool result (usado internamente pelo SDK)
 * Tool results can be any JSON-serializable value
 */
const toolResultPartSchema = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown()
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
 * Content can be a string or an array of parts (SDK flexibility)
 */
const messageContentSchema = z.union([
  z.string(),
  z.array(messagePartSchema)
]);

/**
 * Mensagem individual
 */
const messageSchema = z.object({
  id: z.string().optional(), // Opcional: nem sempre é UUID no formato do SDK
  role: z.enum(['user', 'assistant']),
  parts: z.array(messagePartSchema).optional(),
  content: messageContentSchema.optional(), // String simples ou array de parts
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

  // Modelo de LLM selecionado (Gemini native)
  selectedChatModel: z.string().default('gemini-3-flash-preview'),

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
 */
export function validateChatRequest(body: unknown) {
  return chatBodySchema.safeParse(body);
}

/**
 * Valida se uma mensagem individual é válida
 */
export function validateMessage(message: unknown) {
  return messageSchema.safeParse(message);
}

/**
 * Valida se o modelo ID é válido (formato básico)
 */
export function isValidModelId(modelId: string): boolean {
  // Formato: "gemini-xxx" or legacy "google/gemini-xxx"
  const pattern = /^(google\/)?gemini-[a-z0-9\-.]+$/i;
  return pattern.test(modelId);
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type ChatRequestBody = z.infer<typeof chatBodySchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessagePart = z.infer<typeof messagePartSchema>;
export type BrandProfile = z.infer<typeof brandProfileSchema>;
