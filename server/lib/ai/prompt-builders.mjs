/**
 * AI prompt builders and schemas.
 *
 * Exports: buildImagePrompt, buildVideoPrompt, buildFlyerPrompt, buildQuickPostPrompt,
 *          convertImagePromptToJson, getVideoPromptSystemPrompt, getImagePromptSystemPrompt,
 *          campaignSchema, quickPostSchema, Type,
 *          shouldUseTone, getToneText,
 *          DEFAULT_TEXT_MODEL, DEFAULT_FAST_TEXT_MODEL, DEFAULT_ASSISTANT_MODEL
 */

import { callOpenRouterApi } from "./clients.mjs";
import { withRetry } from "./retry.mjs";
import {
  logAiUsage,
  createTimer,
} from "../../helpers/usage-tracking.mjs";
import logger from "../logger.mjs";

// Model defaults (via OpenRouter)
export const DEFAULT_TEXT_MODEL = "google/gemini-3.1-pro-preview";
export const DEFAULT_FAST_TEXT_MODEL = "google/gemini-3.1-pro-preview";
export const DEFAULT_ASSISTANT_MODEL = "google/gemini-3.1-pro-preview";

// Schema Type constants
export const Type = {
  OBJECT: "OBJECT",
  ARRAY: "ARRAY",
  STRING: "STRING",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  NUMBER: "NUMBER",
};

export const shouldUseTone = (brandProfile, target) => {
  if (!brandProfile) return false;
  const targets = brandProfile.toneTargets || [
    "campaigns",
    "posts",
    "images",
    "flyers",
  ];
  return targets.includes(target);
};

export const getToneText = (brandProfile, target) => {
  if (!brandProfile) return "";
  return shouldUseTone(brandProfile, target)
    ? brandProfile.toneOfVoice || ""
    : "";
};

export const buildImagePrompt = (
  prompt,
  brandProfile,
  hasStyleReference = false,
  hasLogo = false,
  hasPersonReference = false,
  hasProductImages = false,
  jsonPrompt = null,
) => {
  const toneText = getToneText(brandProfile, "images");
  const primaryColor = brandProfile?.primaryColor || "#000000";
  const secondaryColor = brandProfile?.secondaryColor || "#FFFFFF";
  let fullPrompt = `PROMPT TÉCNICO: ${prompt}
ESTILO VISUAL: ${toneText ? `${toneText}, ` : ""}Cores: ${primaryColor}, ${secondaryColor}. Cinematográfico e Luxuoso.`;

  if (jsonPrompt) {
    fullPrompt += `

JSON ESTRUTURADO (REFERÊNCIA):
\`\`\`json
${jsonPrompt}
\`\`\``;
  }

  if (hasPersonReference) {
    fullPrompt += `

**PESSOA/ROSTO DE REFERÊNCIA (PRIORIDADE MÁXIMA):**
- A primeira imagem anexada é uma FOTO DE REFERÊNCIA de uma pessoa
- OBRIGATÓRIO: Use EXATAMENTE o rosto e aparência física desta pessoa na imagem gerada
- Mantenha fielmente: formato do rosto, cor de pele, cabelo, olhos e características faciais
- A pessoa deve ser o protagonista da cena, realizando a ação descrita no prompt
- NÃO altere a identidade da pessoa - preserve sua aparência real`;
  }

  if (hasLogo) {
    fullPrompt += `

**LOGO DA MARCA - PRESERVAÇÃO:**
O logo anexado deve aparecer como uma COLAGEM LITERAL na imagem final.

PRESERVAÇÃO DO LOGO (INVIOLÁVEL):
- COPIE o logo EXATAMENTE como fornecido - pixel por pixel
- NÃO redesenhe, NÃO reinterprete, NÃO estilize o logo
- NÃO altere cores, formas, proporções ou tipografia
- NÃO adicione efeitos (brilho, sombra, gradiente, 3D)
- Mantenha bordas nítidas e definidas
- O logo deve aparecer de forma clara e legível na composição`;
  }

  if (hasProductImages) {
    fullPrompt += `

**IMAGENS DE PRODUTO (OBRIGATÓRIO):**
- As imagens anexadas são referências de produto
- Preserve fielmente o produto (forma, cores e detalhes principais)
- O produto deve aparecer com destaque na composição`;
  }

  if (hasStyleReference || brandProfile) {
    fullPrompt += `

**TIPOGRAFIA OBRIGATÓRIA PARA CENAS (REGRA INVIOLÁVEL):**
- Use EXCLUSIVAMENTE fonte BOLD CONDENSED SANS-SERIF (estilo Bebas Neue, Oswald, Impact, ou similar)
- TODOS os textos devem usar a MESMA família tipográfica - PROIBIDO misturar estilos
- Títulos em MAIÚSCULAS com peso BLACK ou EXTRA-BOLD
- PROIBIDO: fontes script/cursivas, serifadas clássicas, handwriting, ou fontes finas/light`;
  }

  return fullPrompt;
};

export const buildVideoPrompt = (
  prompt,
  brandProfile,
  {
    resolution = "720p",
    aspectRatio = "16:9",
    hasReferenceImage = false,
    isInterpolationMode = false,
    useCampaignGradePrompt = true,
    hasBrandLogoReference = false,
  } = {},
) => {
  const toneText =
    getToneText(brandProfile, "videos") || brandProfile?.toneOfVoice || "";
  const primaryColor = brandProfile?.primaryColor || "#000000";
  const secondaryColor = brandProfile?.secondaryColor || "#FFFFFF";
  const tertiaryColor = brandProfile?.tertiaryColor || "";
  const palette = [primaryColor, secondaryColor, tertiaryColor]
    .filter(Boolean)
    .join(", ");

  if (useCampaignGradePrompt) {
    return `BRIEF CRIATIVO (MODO CAMPAIGN-GRADE):
- Prompt base: ${prompt}
- Formato: ${aspectRatio}
- Qualidade alvo: ${resolution}
- Marca: ${brandProfile?.name || "Não especificado"}
- Descrição da marca: ${brandProfile?.description || "Não especificado"}
- Cores oficiais: ${palette || "Não especificado"}
- Tom de voz: ${toneText || "Profissional"}

REGRAS OBRIGATÓRIAS:
1. Gere um vídeo com padrão de agência premium, cinematográfico e altamente profissional.
2. Preserve a identidade da marca em TODOS os frames (paleta, linguagem visual e tom).
3. Use direção de arte sofisticada, iluminação profissional e composição com hierarquia clara.
4. Evite estética genérica: o resultado deve parecer campanha publicitária de alto nível.
5. Se houver texto em cena, ele deve estar em PORTUGUÊS e com legibilidade alta.
6. Mantenha consistência de continuidade visual entre início, meio e fim.

DIRETRIZES DE EXECUÇÃO:
- Garanta movimento de câmera intencional e fluido, sem jitter.
- Priorize acabamento clean/premium e contraste adequado.
- Evite elementos fora da paleta principal da marca.
- NÃO invente logos novos, variações de símbolo ou tipografias de marca.
${hasReferenceImage ? "- Use a imagem de referência como base de estilo/composição, sem perder identidade da marca." : ""}
${hasBrandLogoReference ? "- A imagem de referência contém o logo oficial da marca: preserve-o fielmente, sem redesenhar." : ""}
${isInterpolationMode ? "- Interpole de forma suave entre quadro inicial e final, preservando continuidade cinematográfica." : ""}`;
  }

  return `PROMPT TÉCNICO: ${prompt}
ESTILO DE VÍDEO: ${toneText ? `${toneText}, ` : ""}Identidade visual da marca (${palette}), composição cinematográfica, iluminação profissional e acabamento premium.
QUALIDADE VISUAL ALVO: ${resolution}.

CONTEXTO DA MARCA:
- Nome: ${brandProfile?.name || "Não especificado"}
- Descrição: ${brandProfile?.description || "Não especificado"}
- Cores oficiais: ${palette}
- Tom de voz: ${toneText || "Não especificado"}

REGRAS DE IDENTIDADE:
- Preserve consistência visual com a marca em todos os frames
- Evite elementos fora da paleta principal da marca
- Priorize estética de marketing premium e legibilidade visual
- Não invente logos novos; use apenas elementos oficiais da marca`;
};

export const convertImagePromptToJson = async (
  prompt,
  aspectRatio,
  organizationId,
  sql,
) => {
  const timer = createTimer();

  try {
    const systemPrompt = getImagePromptSystemPrompt(aspectRatio);

    const data = await withRetry(() =>
      callOpenRouterApi({
        model: DEFAULT_FAST_TEXT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `PROMPT: ${prompt}` },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    );

    const text = data.choices?.[0]?.message?.content?.trim() || "";
    let parsed = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const result = JSON.stringify(
      parsed || {
        subject: "",
        environment: "",
        style: "",
        camera: "",
        text: {
          enabled: false,
          content: "",
          language: "pt-BR",
          placement: "",
          font: "",
        },
        output: {
          aspect_ratio: aspectRatio,
          resolution: "2K",
        },
      },
      null,
      2,
    );

    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/convert-image-prompt",
      operation: "text",
      model: DEFAULT_FAST_TEXT_MODEL,
      inputTokens,
      outputTokens,
      latencyMs: timer(),
      status: "success",
    });

    return result;
  } catch (error) {
    logger.error({ err: error }, "[Image Prompt JSON] Error");
    await logAiUsage(sql, {
      organizationId,
      endpoint: "/api/ai/convert-image-prompt",
      operation: "text",
      model: DEFAULT_FAST_TEXT_MODEL,
      latencyMs: timer(),
      status: "failed",
      error: error.message,
    }).catch(() => {});
    return null;
  }
};

export const buildFlyerPrompt = (brandProfile) => {
  const toneText = getToneText(brandProfile, "flyers");
  const brandName = brandProfile?.name || "a marca";
  const brandDescription = brandProfile?.description || "";
  const primaryColor = brandProfile?.primaryColor || "cores vibrantes";
  const secondaryColor = brandProfile?.secondaryColor || "tons complementares";

  return `
**PERSONA:** Você é Diretor de Arte Sênior de uma agência de publicidade internacional de elite.

**MISSÃO CRÍTICA:**
Crie materiais visuais de alta qualidade que representem fielmente a marca e comuniquem a mensagem de forma impactante.
Se houver valores ou informações importantes no conteúdo, destaque-os visualmente (fonte negrito, cor vibrante ou tamanho maior).

**REGRAS DE CONTEÚDO:**
1. Destaque informações importantes (valores, datas, horários) de forma clara e legível.
2. Use a marca ${brandName}.
3. Siga a identidade visual da marca em todos os elementos.

**IDENTIDADE DA MARCA - ${brandName}:**
${brandDescription ? `- Descrição: ${brandDescription}` : ""}
${toneText ? `- Tom de Comunicação: ${toneText}` : ""}
- Cor Primária (dominante): ${primaryColor}
- Cor de Acento (destaques, CTAs): ${secondaryColor}

**PRINCÍPIOS DE DESIGN PROFISSIONAL:**

1. HARMONIA CROMÁTICA:
   - Use APENAS as cores da marca: ${primaryColor} (primária) e ${secondaryColor} (acento)
   - Crie variações tonais dessas cores para profundidade
   - Evite introduzir cores aleatórias

2. RESPIRAÇÃO VISUAL (Anti-Poluição):
   - Menos é mais: priorize espaços negativos estratégicos
   - Não sobrecarregue com elementos decorativos desnecessários
   - Hierarquia visual clara

3. TIPOGRAFIA CINEMATOGRÁFICA:
   - Máximo 2-3 famílias tipográficas diferentes
   - Contraste forte entre títulos (bold/black) e corpo (regular/medium)

4. ESTÉTICA PREMIUM SEM CLICHÊS:
   - Evite excesso de efeitos (brilhos, sombras, neons chamativos)
   - Prefira elegância sutil a ostentação visual

**ATMOSFERA FINAL:**
- Alta classe, luxo e sofisticação
- Cinematográfico mas não exagerado
- Profissional mas criativo
- Impactante mas elegante`;
};

export const buildQuickPostPrompt = (brandProfile, context) => {
  const toneText = getToneText(brandProfile, "posts");
  const brandName = brandProfile?.name || "a marca";
  const brandDescription = brandProfile?.description || "";

  return `
Você é Social Media Manager de elite. Crie um post de INSTAGRAM de alta performance.

**CONTEXTO:**
${context}

**MARCA:** ${brandName}${brandDescription ? ` - ${brandDescription}` : ""}${toneText ? ` | **TOM:** ${toneText}` : ""}

**REGRAS DE OURO:**
1. GANCHO EXPLOSIVO com emojis relevantes ao tema.
2. DESTAQUE informações importantes (valores, datas, ofertas).
3. CTA FORTE (ex: Link na Bio, Saiba Mais).
4. 5-8 Hashtags estratégicas relevantes à marca e ao conteúdo.

Responda apenas JSON:
{ "platform": "Instagram", "content": "Texto Legenda", "hashtags": ["tag1", "tag2"], "image_prompt": "descrição visual" }`;
};

export const getVideoPromptSystemPrompt = (duration, aspectRatio) => {
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

export const getImagePromptSystemPrompt = (aspectRatio) => {
  return `Você é especialista em prompt engineering para imagens de IA.
Converta o prompt fornecido em um JSON estruturado para geração de imagens.

REGRAS IMPORTANTES:
- NÃO invente detalhes que não existam no prompt original.
- Preserve exatamente o conteúdo e as instruções do prompt.
- Se uma informação não estiver explícita, deixe como string vazia.
- Use linguagem objetiva e direta.

O JSON deve seguir esta estrutura:
{
  "subject": "",
  "environment": "",
  "style": "",
  "camera": "",
  "text": {
    "enabled": false,
    "content": "",
    "language": "pt-BR",
    "placement": "",
    "font": ""
  },
  "output": {
    "aspect_ratio": "${aspectRatio}",
    "resolution": "2K"
  }
}

Se houver texto na imagem, marque text.enabled como true e preencha content/placement/font conforme o prompt.`;
};

// Campaign schema for structured generation
export const campaignSchema = {
  type: Type.OBJECT,
  properties: {
    videoClipScripts: {
      type: Type.ARRAY,
      description: "Roteiros para vídeos curtos (Reels/Shorts/TikTok).",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scene: { type: Type.INTEGER },
                visual: { type: Type.STRING },
                narration: { type: Type.STRING },
                duration_seconds: { type: Type.INTEGER },
              },
              required: ["scene", "visual", "narration", "duration_seconds"],
            },
          },
          image_prompt: { type: Type.STRING },
          audio_script: { type: Type.STRING },
        },
        required: ["title", "hook", "scenes", "image_prompt", "audio_script"],
      },
    },
    posts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          content: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          image_prompt: { type: Type.STRING },
        },
        required: ["platform", "content", "hashtags", "image_prompt"],
      },
    },
    adCreatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          headline: { type: Type.STRING },
          body: { type: Type.STRING },
          cta: { type: Type.STRING },
          image_prompt: { type: Type.STRING },
        },
        required: ["platform", "headline", "body", "cta", "image_prompt"],
      },
    },
    carousels: {
      type: Type.ARRAY,
      description: "Carrosséis para Instagram (4-6 slides cada).",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          cover_prompt: { type: Type.STRING },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                slide: { type: Type.INTEGER },
                visual: { type: Type.STRING },
                text: { type: Type.STRING },
              },
              required: ["slide", "visual", "text"],
            },
          },
        },
        required: ["title", "hook", "cover_prompt", "slides"],
      },
    },
  },
  required: ["videoClipScripts", "posts", "adCreatives", "carousels"],
};

// Quick post schema
export const quickPostSchema = {
  type: Type.OBJECT,
  properties: {
    platform: { type: Type.STRING },
    content: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    image_prompt: { type: Type.STRING },
  },
  required: ["platform", "content", "hashtags", "image_prompt"],
};
