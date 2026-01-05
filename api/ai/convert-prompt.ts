/**
 * Vercel Serverless Function - Convert Prompt to Structured JSON
 * Converts generic video prompts to structured JSON for video generation
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI } from "@google/genai";
import { setupCors } from "../db/_helpers";

const getVideoPromptSystemPrompt = (duration: number, aspectRatio: string) => {
  return `Você é um especialista em prompt engineering para vídeo de IA.
Converta o prompt genérico fornecido em um JSON estruturado e aninhado otimizado para modelos de geração de vídeo (Veo 3, Sora 2).

O JSON deve incluir detalhes ricos sobre:
- visual_style: estética, paleta de cores, iluminação
- camera: movimentos de câmera cinematográficos, posições inicial e final
- subject: personagem/objeto principal, ação, expressão/estado
- environment: cenário, props relevantes, atmosfera
- scene_sequence: 2-3 beats de ação para criar dinamismo
- technical: duração (${duration} seconds), aspect ratio (${aspectRatio}), tokens de qualidade

**TIPOGRAFIA OBRIGATÓRIA (REGRA CRÍTICA PARA CONSISTÊNCIA VISUAL):**
Se o vídeo contiver QUALQUER texto na tela (títulos, legendas, overlays, valores, CTAs):
- Use EXCLUSIVAMENTE fonte BOLD CONDENSED SANS-SERIF (estilo Bebas Neue, Oswald, Impact)
- TODOS os textos devem usar a MESMA família tipográfica
- Textos em MAIÚSCULAS com peso BLACK ou EXTRA-BOLD
- PROIBIDO: fontes script/cursivas, serifadas, handwriting, ou fontes finas/light

**ÁUDIO E NARRAÇÃO (OBRIGATÓRIO):**
Se o prompt contiver uma NARRAÇÃO ou texto de fala, SEMPRE inclua o campo audio_context no JSON:
- audio_context.voiceover: o texto exato da narração em português brasileiro
- audio_context.language: "pt-BR"
- audio_context.tone: tom da narração (ex: "Exciting, professional, persuasive" ou "Calm, informative, trustworthy")
- audio_context.style: estilo de entrega (ex: "energetic announcer", "conversational", "dramatic narrator")

Exemplo de audio_context:
{
  "audio_context": {
    "voiceover": "Texto da narração aqui",
    "language": "pt-BR",
    "tone": "Exciting, professional, persuasive",
    "style": "energetic announcer"
  }
}

Mantenha a essência do prompt original mas expanda com detalhes visuais cinematográficos.`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, duration = 5, aspectRatio = "16:9" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "prompt is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    console.log(
      `[Convert Prompt API] Converting prompt to JSON, duration: ${duration}s`,
    );

    const ai = new GoogleGenAI({ apiKey });
    const systemPrompt = getVideoPromptSystemPrompt(duration, aspectRatio);

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: systemPrompt + "\n\nPrompt: " + prompt }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    });

    const text = response.text?.trim() || "";

    // Try to parse as JSON
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // If not valid JSON, return as-is
      result = text;
    }

    console.log("[Convert Prompt API] Conversion successful");

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[Convert Prompt API] Error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to convert prompt",
    });
  }
}
