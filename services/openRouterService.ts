
import { OpenRouter } from "@openrouter/sdk";
import type { CreativeModel } from '../types';

// Helper para criar instância fresh do OpenRouter
const getOpenRouter = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY não configurada. Configure no arquivo .env para usar modelos GPT e Grok.');
  }
  return new OpenRouter({ apiKey });
};

/**
 * Gera texto criativo usando OpenRouter (GPT-5.2, Grok 4.1, etc.)
 * @param model - ID do modelo OpenRouter (ex: 'openai/gpt-5.2')
 * @param systemPrompt - Contexto/instruções do sistema
 * @param userPrompt - Prompt do usuário
 * @param temperature - Temperatura para criatividade (0-2)
 * @returns JSON string do resultado
 */
export const generateTextWithOpenRouter = async (
  model: CreativeModel,
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7
): Promise<string> => {
  const openrouter = getOpenRouter();

  const response = await openrouter.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    temperature,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`OpenRouter (${model}) não retornou conteúdo`);
  }

  return content;
};

/**
 * Gera texto com imagens de referência usando OpenRouter
 * Nota: Converte imagens inline para descrições textuais se o modelo não suportar visão
 */
export const generateTextWithOpenRouterVision = async (
  model: CreativeModel,
  textParts: string[],
  imageParts: { base64: string; mimeType: string }[],
  temperature: number = 0.7
): Promise<string> => {
  const openrouter = getOpenRouter();

  // Monta conteúdo multimodal se houver imagens
  const content: any[] = textParts.map(text => ({ type: "text", text }));

  // Adiciona imagens no formato OpenRouter/OpenAI
  for (const img of imageParts) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`
      }
    });
  }

  const response = await openrouter.chat.completions.create({
    model,
    messages: [
      { role: "user", content }
    ],
    response_format: { type: "json_object" },
    temperature,
  });

  const result = response.choices[0]?.message?.content;
  if (!result) {
    throw new Error(`OpenRouter (${model}) não retornou conteúdo`);
  }

  return result;
};
