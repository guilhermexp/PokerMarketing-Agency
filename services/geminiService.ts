
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { BrandProfile, ContentInput, MarketingCampaign, ImageFile, ImageModel, VideoModel, GenerationOptions, ImageSize, Post, FalVideoModel, ToneTarget } from '../types';
import { isFalModel } from '../types';
import { generateFalVideo } from './falService';
import { generateCreativeText } from './llmService';

// Helper to ensure fresh GoogleGenAI instance with latest API key
const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// Default targets that use tone (backwards compatible)
const defaultToneTargets: ToneTarget[] = ['campaigns', 'posts', 'images', 'flyers'];

// Check if a specific target should use the tone
const shouldUseTone = (brandProfile: BrandProfile, target: ToneTarget): boolean => {
  const targets = brandProfile.toneTargets || defaultToneTargets;
  return targets.includes(target);
};

// Get tone text for prompts (returns empty string if tone should not be used)
const getToneText = (brandProfile: BrandProfile, target: ToneTarget): string => {
  return shouldUseTone(brandProfile, target) ? brandProfile.toneOfVoice : '';
};

// Mapeia proporções comuns de marketing para formatos aceitos pelo Gemini 3 Pro
const mapAspectRatio = (ratio: string): string => {
    const map: Record<string, string> = {
        '1:1': '1:1',
        '9:16': '9:16',
        '16:9': '16:9',
        '1.91:1': '16:9',
        '4:5': '4:5',
        '3:4': '3:4',
        '4:3': '4:3',
        '2:3': '2:3',
        '3:2': '3:2'
    };
    return map[ratio] || '1:1';
};

const campaignSchema = {
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
                                duration_seconds: { type: Type.INTEGER }
                            },
                            required: ["scene", "visual", "narration", "duration_seconds"]
                        }
                    },
                    image_prompt: { type: Type.STRING },
                    audio_script: { type: Type.STRING }
                },
                required: ["title", "hook", "scenes", "image_prompt", "audio_script"]
            }
        },
        posts: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    platform: { type: Type.STRING },
                    content: { type: Type.STRING },
                    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    image_prompt: { type: Type.STRING }
                },
                required: ["platform", "content", "hashtags", "image_prompt"]
            }
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
                    image_prompt: { type: Type.STRING }
                },
                required: ["platform", "headline", "body", "cta", "image_prompt"]
            }
        }
    },
    required: ["videoClipScripts", "posts", "adCreatives"]
};

export const generateCampaign = async (brandProfile: BrandProfile, input: ContentInput, options: GenerationOptions): Promise<MarketingCampaign> => {
    const toneText = getToneText(brandProfile, 'campaigns');
    const parts: any[] = [{ text: `
    **PERFIL DA MARCA:**
    - Nome: ${brandProfile.name}
    - Descrição: ${brandProfile.description}
    ${toneText ? `- Tom de Voz: ${toneText}` : ''}
    - Cores Oficiais: Primária ${brandProfile.primaryColor}, Secundária ${brandProfile.secondaryColor}

    **CONTEÚDO PARA ESTRUTURAR:**
    ${input.transcript}

    **MISSÃO:** Gere uma campanha completa em JSON. Use prompts cinematográficos para imagens.
    ` }];

    if (input.productImages) {
        input.productImages.forEach(img => {
            parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        });
    }

    // Usa wrapper que escolhe o modelo baseado no brandProfile.creativeModel
    const result = await generateCreativeText(brandProfile, parts, campaignSchema, 0.7);
    return JSON.parse(result);
};

export const generateQuickPostText = async (brandProfile: BrandProfile, context: string, imageBase64?: string): Promise<Post> => {
    const toneText = getToneText(brandProfile, 'posts');
    const parts: any[] = [{ text: `
    Você é Social Media Manager de elite. Crie um post de INSTAGRAM de alta performance para um clube de poker.

    **CONTEXTO DO EVENTO:**
    ${context}

    **MARCA:** ${brandProfile.name}${toneText ? ` | **TOM:** ${toneText}` : ''}

    **REGRAS DE OURO:**
    1. GANCHO EXPLOSIVO com emojis de poker.
    2. DESTAQUE O GARANTIDO (GTD) se houver.
    3. CTA FORTE (ex: Link na Bio).
    4. 5-8 Hashtags estratégicas.

    Responda apenas JSON:
    { "platform": "Instagram", "content": "Texto Legenda", "hashtags": ["tag1", "tag2"], "image_prompt": "descrição visual" }
    ` }];

    if (imageBase64) {
        const [header, data] = imageBase64.split(',');
        parts.push({ inlineData: { mimeType: header.match(/:(.*?);/)?.[1] || 'image/png', data } });
    }

    // Schema para QuickPost
    const quickPostSchema = {
        type: Type.OBJECT,
        properties: {
            platform: { type: Type.STRING },
            content: { type: Type.STRING },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            image_prompt: { type: Type.STRING }
        },
        required: ["platform", "content", "hashtags", "image_prompt"]
    };

    // Usa wrapper que escolhe o modelo baseado no brandProfile.creativeModel
    const result = await generateCreativeText(brandProfile, parts, quickPostSchema, 0.8);
    return JSON.parse(result);
};

export const generateImage = async (
    prompt: string,
    brandProfile: BrandProfile,
    options: {
        aspectRatio: string;
        model: ImageModel;
        imageSize?: ImageSize;
        productImages?: ImageFile[];
        styleReferenceImage?: ImageFile;  // Imagem de referência de estilo para consistência visual
    }
): Promise<string> => {
    const ai = getAi();
    const toneText = getToneText(brandProfile, 'images');

    // Build prompt with style reference instruction if provided
    let fullPrompt = `PROMPT TÉCNICO: ${prompt}\nESTILO VISUAL: ${toneText ? `${toneText}, ` : ''}Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}. Cinematográfico e Luxuoso.`;

    if (options.styleReferenceImage) {
        fullPrompt = `${fullPrompt}

INSTRUÇÕES CRÍTICAS DE CONSISTÊNCIA VISUAL:
A imagem de referência anexada é o GUIA DE ESTILO ABSOLUTO. Você DEVE copiar EXATAMENTE:

1. **TIPOGRAFIA (CRÍTICO)**:
   - Use a MESMA FONTE/FAMÍLIA tipográfica da referência (bold, condensed, serif, sans-serif, etc.)
   - Copie o MESMO PESO da fonte (regular, bold, black, etc.)
   - Mantenha o MESMO ESTILO de texto (maiúsculas, espaçamento, alinhamento)
   - Replique os MESMOS EFEITOS no texto (sombras, brilhos, bordas, gradientes)
   - Se o texto na referência é BOLD com SOMBRA VERMELHA, TODOS os textos devem ser assim

2. **CORES E TRATAMENTO**:
   - Use EXATAMENTE a mesma paleta de cores
   - Mesma intensidade, saturação e brilho
   - Mesmos gradientes e efeitos de luz

3. **COMPOSIÇÃO**:
   - Mesmo estilo de layout e distribuição de elementos
   - Mesma atmosfera e iluminação (fumaça, brilhos, etc.)

REGRA DE OURO: Se a imagem de referência usa fonte BOLD VERMELHA com efeito de BRILHO, TODAS as cenas devem usar EXATAMENTE essa mesma tipografia. NÃO invente novas fontes.`;
    }

    if (options.model === 'imagen-4.0-generate-001') {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: fullPrompt,
            config: { numberOfImages: 1, outputMimeType: 'image/png', aspectRatio: options.aspectRatio as any },
        });
        return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
    } else {
        const modelName = 'gemini-3-pro-image-preview'; // Força Gemini 3 Pro Image
        const parts: any[] = [{ text: fullPrompt }];

        // Add style reference image FIRST for better context
        if (options.styleReferenceImage) {
            parts.push({ inlineData: { data: options.styleReferenceImage.base64, mimeType: options.styleReferenceImage.mimeType } });
        }

        // Then add product images
        if (options.productImages) {
            options.productImages.forEach(img => {
                parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
            });
        }

        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts },
            config: {
                imageConfig: {
                    aspectRatio: mapAspectRatio(options.aspectRatio) as any,
                    imageSize: options.imageSize || "1K"
                }
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
        throw new Error("Falha ao forjar imagem.");
    }
};

export const editImage = async (
    base64ImageData: string,
    mimeType: string,
    prompt: string,
    mask?: { base64: string, mimeType: string },
    referenceImage?: { base64: string, mimeType: string }
): Promise<string> => {
    const ai = getAi();
    const instructionPrompt = `DESIGNER SÊNIOR: Execute alteração profissional: ${prompt}. Texto original e logos são SAGRADOS, não cubra informações de valores (GTD/GARANTIDO).`;

    const parts: any[] = [
        { text: instructionPrompt },
        { inlineData: { data: base64ImageData, mimeType } }
    ];

    if (mask) parts.push({ inlineData: { data: mask.base64, mimeType: mask.mimeType } });
    if (referenceImage) parts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts },
        config: { imageConfig: { imageSize: "1K" } }
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
    throw new Error("Falha na edição Neural.");
};

// Schema para o JSON estruturado de prompt de vídeo
const videoPromptJsonSchema = {
    type: Type.OBJECT,
    properties: {
        video_prompt: {
            type: Type.OBJECT,
            properties: {
                scene_description: { type: Type.STRING },
                visual_style: {
                    type: Type.OBJECT,
                    properties: {
                        aesthetic: { type: Type.STRING },
                        color_palette: { type: Type.ARRAY, items: { type: Type.STRING } },
                        lighting: { type: Type.STRING }
                    },
                    required: ["aesthetic", "color_palette", "lighting"]
                },
                camera: {
                    type: Type.OBJECT,
                    properties: {
                        movement: { type: Type.STRING },
                        start_position: { type: Type.STRING },
                        end_position: { type: Type.STRING }
                    },
                    required: ["movement", "start_position", "end_position"]
                },
                subject: {
                    type: Type.OBJECT,
                    properties: {
                        character: { type: Type.STRING },
                        action: { type: Type.STRING },
                        expression: { type: Type.STRING }
                    },
                    required: ["character", "action", "expression"]
                },
                environment: {
                    type: Type.OBJECT,
                    properties: {
                        setting: { type: Type.STRING },
                        props: { type: Type.ARRAY, items: { type: Type.STRING } },
                        atmosphere: { type: Type.STRING }
                    },
                    required: ["setting", "props", "atmosphere"]
                },
                scene_sequence: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            beat: { type: Type.INTEGER },
                            description: { type: Type.STRING }
                        },
                        required: ["beat", "description"]
                    }
                },
                technical: {
                    type: Type.OBJECT,
                    properties: {
                        duration: { type: Type.STRING },
                        aspect_ratio: { type: Type.STRING },
                        quality_tokens: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["duration", "aspect_ratio", "quality_tokens"]
                }
            },
            required: ["scene_description", "visual_style", "camera", "subject", "environment", "scene_sequence", "technical"]
        }
    },
    required: ["video_prompt"]
};

/**
 * Converte um prompt genérico de vídeo em JSON estruturado para melhor aderência do modelo.
 * Baseado na técnica de Nested JSON do MetricsMule para Veo 3.
 */
export const convertToJsonPrompt = async (genericPrompt: string, duration: number, aspectRatio: "16:9" | "9:16"): Promise<string> => {
    const ai = getAi();

    const systemPrompt = `Você é um especialista em prompt engineering para vídeo de IA.
Converta o prompt genérico fornecido em um JSON estruturado e aninhado otimizado para modelos de geração de vídeo (Veo 3, Sora 2).

O JSON deve incluir detalhes ricos sobre:
- visual_style: estética, paleta de cores, iluminação
- camera: movimentos de câmera cinematográficos, posições inicial e final
- subject: personagem/objeto principal, ação, expressão/estado
- environment: cenário, props relevantes, atmosfera
- scene_sequence: 2-3 beats de ação para criar dinamismo
- technical: duração (${duration} seconds), aspect ratio (${aspectRatio}), tokens de qualidade

Mantenha a essência do prompt original mas expanda com detalhes visuais cinematográficos.
Se o prompt mencionar narração/fala, inclua isso no campo appropriate.`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\nPrompt genérico:\n${genericPrompt}` }] }
        ],
        config: {
            responseMimeType: 'application/json',
            responseSchema: videoPromptJsonSchema,
        },
    });

    const jsonResult = response.text.trim();
    console.log('[convertToJsonPrompt] JSON estruturado gerado:', jsonResult);
    return jsonResult;
};

export interface GenerateVideoResult {
    videoUrl: string;
    usedFallback: boolean;
}

export const generateVideo = async (
    prompt: string,
    aspectRatio: "16:9" | "9:16",
    model: VideoModel,
    image?: ImageFile | null,
    useFallbackDirectly: boolean = false
): Promise<GenerateVideoResult> => {
    // Helper function to use fal.ai
    const useFalAi = async (): Promise<string> => {
        // If there's an image, upload it to fal.ai storage first (needs HTTP URL)
        let imageUrl: string | undefined;
        if (image) {
            const { uploadImageToFal } = await import('./falService');
            imageUrl = await uploadImageToFal(image.base64, image.mimeType);
        }

        // Use fal.ai Veo 3.1 Fast (same model, different API)
        const result = await generateFalVideo(prompt, aspectRatio, 'fal-ai/veo3.1/fast', imageUrl);
        console.log('[fal.ai] Video generated successfully via fal.ai');
        return result;
    };

    // If forced to use fallback directly (e.g., Gemini already failed in batch)
    if (useFallbackDirectly) {
        console.log('[Video] Using fal.ai directly (Gemini skipped due to previous failure)');
        const videoUrl = await useFalAi();
        return { videoUrl, usedFallback: true };
    }

    // Try Gemini first
    try {
        console.log('[Gemini] Attempting video generation with Gemini Veo...');
        const freshAi = getAi();
        let operation = await freshAi.models.generateVideos({
            model, prompt,
            image: image ? { imageBytes: image.base64, mimeType: image.mimeType } : undefined,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 8000));
            operation = await freshAi.operations.getVideosOperation({ operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const videoBlob = await videoResponse.blob();
        console.log('[Gemini] Video generated successfully via Gemini');

        // Upload to Vercel Blob for persistence (blob: URLs are temporary)
        const { uploadVideo } = await import('./apiClient');
        const filename = `gemini-video-${Date.now()}.mp4`;
        const permanentUrl = await uploadVideo(videoBlob, filename);
        console.log('[Gemini] Video uploaded to Vercel Blob:', permanentUrl);

        return { videoUrl: permanentUrl, usedFallback: false };
    } catch (geminiError) {
        // Fallback to fal.ai Veo 3.1 on Gemini failure (429 rate limit, etc.)
        console.warn('[Gemini] Video generation failed, falling back to fal.ai Veo 3.1...', geminiError);

        try {
            const videoUrl = await useFalAi();
            return { videoUrl, usedFallback: true };
        } catch (falError) {
            console.error('[fal.ai] Fallback also failed:', falError);
            // Re-throw the original Gemini error for better debugging
            throw geminiError;
        }
    }
};

export const generateSpeech = async (script: string): Promise<string> => {
    const ai = getAi();
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: script }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } } },
        },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
};

export const generateLogo = async (prompt: string): Promise<string> => {
    const ai = getAi();
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `Logo vetorial moderno e minimalista: ${prompt}`,
        config: { numberOfImages: 1, outputMimeType: 'image/png', aspectRatio: '1:1' },
    });
    return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
};

export const extractColorsFromLogo = async (logo: ImageFile): Promise<{ primaryColor: string, secondaryColor: string }> => {
    const ai = getAi();
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
            parts: [
                { text: "Extraia as duas cores dominantes da marca em formato hexadecimal." },
                { inlineData: { mimeType: logo.mimeType, data: logo.base64 } },
            ],
        },
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    primaryColor: { type: Type.STRING },
                    secondaryColor: { type: Type.STRING }
                },
                required: ["primaryColor", "secondaryColor"]
            },
        },
    });
    return JSON.parse(response.text.trim());
};

export const generateFlyer = async (
    prompt: string,
    brandProfile: BrandProfile,
    logo: { base64: string, mimeType: string } | null,
    referenceImage: { base64: string, mimeType: string } | null,
    aspectRatio: string,
    model: ImageModel,
    collabLogo?: { base64: string, mimeType: string } | null,
    imageSize?: ImageSize,
    compositionAssets?: { base64: string, mimeType: string }[]
): Promise<string> => {
    const ai = getAi();
    const toneText = getToneText(brandProfile, 'flyers');

    const brandingInstruction = `
    **PERSONA:** Você é Diretor de Arte Sênior de uma agência de publicidade internacional de elite especializada em iGaming e Poker.

    **MISSÃO CRÍTICA (NÃO PULE ESTA REGRA):**
    Todo torneio de poker é definido pelo seu VALOR GARANTIDO (GTD).
    Você DEVE escrever o valor do **GARANTIDO (GTD)** em cada item da lista.
    O GTD deve estar em destaque visual (fonte negrito, cor vibrante ou tamanho maior).

    **REGRAS DE CONTEÚDO:**
    1. Se o prompt fornecer um valor de "GTD", ele deve aparecer obrigatoriamente.
    2. O Horário e o Nome do Torneio devem estar perfeitamente legíveis.
    3. Use a marca ${brandProfile.name}.

    **IDENTIDADE DA MARCA - ${brandProfile.name}:**
    ${toneText ? `- Tom de Comunicação: ${toneText}` : ''}
    - Cor Primária (dominante): ${brandProfile.primaryColor}
    - Cor de Acento (destaques, GTD, CTAs): ${brandProfile.secondaryColor}

    **PRINCÍPIOS DE DESIGN PROFISSIONAL:**

    1. HARMONIA CROMÁTICA:
       - Use APENAS as cores da marca: ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (acento)
       - Crie variações tonais dessas cores (mais claras/escuras) para profundidade
       - Evite introduzir cores aleatórias - mantenha a paleta restrita e sofisticada
       - Gradientes sutis entre tons da mesma cor são bem-vindos

    2. RESPIRAÇÃO VISUAL (Anti-Poluição):
       - Menos é mais: priorize espaços negativos estratégicos
       - Não sobrecarregue com elementos decorativos desnecessários
       - Cada elemento deve ter uma função clara
       - Margens e padding generosos para respiração
       - Hierarquia visual clara: 1 elemento principal, 2-3 secundários, demais terciários

    3. TIPOGRAFIA CINEMATOGRÁFICA:
       - Máximo 2-3 famílias tipográficas diferentes
       - Contraste forte entre títulos (bold/black) e corpo (regular/medium)
       - Kerning e tracking profissionais
       - Alinhamento consistente e intencional

    4. COMPOSIÇÃO CINEMATOGRÁFICA:
       - Pense como diretor de fotografia: onde o olho deve pousar primeiro?
       - Use regra dos terços, golden ratio, ou composição centralizada intencional
       - Profundidade através de camadas (foreground, middle, background)
       - Iluminação direcionada - crie foco com luz e sombra

    5. ESTÉTICA PREMIUM SEM CLICHÊS:
       - Evite excesso de efeitos (brilhos, sombras, neons chamativos)
       - Prefira elegância sutil a ostentação visual
       - Qualidade de marca luxury - refinamento, não exagero
       - Se usar elementos de poker (fichas, cartas), que sejam fotorealistas e integrados, não clipart

    6. PERSONALIZAÇÃO DA MARCA:
       - O flyer deve parecer EXCLUSIVAMENTE da marca ${brandProfile.name}
       - Se houver logo, integre-o de forma orgânica (não apenas colado)
       ${toneText ? `- O estilo visual deve refletir o tom: ${toneText}` : ''}
       - Seja consistente: todos os flyers desta marca devem ter DNA visual comum

    **ATMOSFERA FINAL:**
    - Poker de alta classe, luxo e sofisticação
    - Cinematográfico mas não exagerado
    - Profissional mas criativo
    - Impactante mas elegante
    `;

    const parts: any[] = [
        { text: brandingInstruction },
        { text: `DADOS DO FLYER PARA INSERIR NA ARTE:\n${prompt}` }
    ];

    if (logo) parts.push({ inlineData: { data: logo.base64, mimeType: logo.mimeType } });
    if (collabLogo) parts.push({ inlineData: { data: collabLogo.base64, mimeType: collabLogo.mimeType } });
    if (referenceImage) {
        parts.push({ text: "USE ESTA IMAGEM COMO REFERÊNCIA DE LAYOUT E FONTES:" });
        parts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });
    }

    if (compositionAssets) {
        compositionAssets.forEach((asset, i) => {
            parts.push({ text: `Ativo de composição ${i+1}:` });
            parts.push({ inlineData: { data: asset.base64, mimeType: asset.mimeType } });
        });
    }
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts },
        config: {
            imageConfig: { 
                aspectRatio: mapAspectRatio(aspectRatio) as any, 
                imageSize: imageSize || "1K" 
            }
        },
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
    throw new Error("A IA falhou em produzir o Flyer.");
};
