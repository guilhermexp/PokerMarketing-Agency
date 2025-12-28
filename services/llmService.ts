
import { GoogleGenAI } from "@google/genai";
import type { CreativeModel, BrandProfile } from '../types';
import { generateTextWithOpenRouter, generateTextWithOpenRouterVision } from './openRouterService';
import { getEnv } from "../utils/env";

// Helper para criar instância fresh do Gemini
const getGeminiAi = () =>
  new GoogleGenAI({ apiKey: getEnv("VITE_API_KEY") || getEnv("API_KEY") });

/**
 * Interface para partes do prompt (compatível com formato Gemini)
 */
export interface PromptPart {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
}

/**
 * Gera texto criativo usando o modelo selecionado pelo usuário
 * Abstração que mantém os prompts inalterados e apenas troca o provider
 *
 * @param brandProfile - Perfil da marca (contém o modelo selecionado)
 * @param parts - Partes do prompt no formato Gemini (texto + imagens)
 * @param schema - Schema JSON esperado (usado apenas no Gemini)
 * @param temperature - Temperatura para criatividade
 * @returns JSON string do resultado
 */
// Map de modelos criativos para nomes de modelos do Google
const geminiModelMap: Record<string, string> = {
  'gemini-3-pro': 'gemini-3-pro-preview',
  'gemini-3-flash': 'gemini-3-flash-preview',
};

export const generateCreativeText = async (
  brandProfile: BrandProfile,
  parts: PromptPart[],
  schema: any,
  temperature: number = 0.7
): Promise<string> => {
  const model = brandProfile.creativeModel || 'gemini-3-pro';

  // Verifica se é modelo Google (usa SDK direto)
  const isGoogleModel = model === 'gemini-3-pro' || model === 'gemini-3-flash';

  if (isGoogleModel) {
    // Usa Gemini SDK diretamente
    const ai = getGeminiAi();
    const googleModelName = geminiModelMap[model] || 'gemini-3-pro-preview';
    const response = await ai.models.generateContent({
      model: googleModelName,
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature
      }
    });
    return response.text.trim();
  } else {
    // Usa OpenRouter (GPT-5.2, Grok 4.1, etc.)
    // Separa textos de imagens
    const textParts = parts
      .filter(p => p.text)
      .map(p => p.text!);

    const imageParts = parts
      .filter(p => p.inlineData)
      .map(p => ({
        base64: p.inlineData!.data,
        mimeType: p.inlineData!.mimeType
      }));

    // Adiciona instrução de formato JSON ao prompt
    const jsonInstruction = `\n\nRESPONDA APENAS EM JSON VÁLIDO seguindo este schema:\n${JSON.stringify(schema, null, 2)}`;
    const lastTextIndex = textParts.length - 1;
    if (lastTextIndex >= 0) {
      textParts[lastTextIndex] += jsonInstruction;
    }

    if (imageParts.length > 0) {
      // Usa versão com visão se houver imagens
      return await generateTextWithOpenRouterVision(model, textParts, imageParts, temperature);
    } else {
      // Usa versão texto puro
      const systemPrompt = "Você é um assistente de marketing criativo especializado em poker e iGaming. Sempre responda em JSON válido.";
      const userPrompt = textParts.join('\n\n');
      return await generateTextWithOpenRouter(model, systemPrompt, userPrompt, temperature);
    }
  }
};

/**
 * Helper para verificar se o modelo atual é OpenRouter
 */
export const isOpenRouterModel = (model: CreativeModel): boolean => {
  return model !== 'gemini-3-pro' && model !== 'gemini-3-flash';
};

/**
 * Labels para exibição na UI
 */
export const creativeModelLabels: Record<CreativeModel, { label: string; provider: string }> = {
  'gemini-3-pro': { label: 'Gemini 3 Pro', provider: 'Google' },
  'gemini-3-flash': { label: 'Gemini 3 Flash', provider: 'Google' },
  'openai/gpt-5.2': { label: 'GPT-5.2', provider: 'OpenAI' },
  'x-ai/grok-4.1-fast': { label: 'Grok 4.1 Fast', provider: 'xAI' }
};
