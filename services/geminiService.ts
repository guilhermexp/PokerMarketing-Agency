
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { BrandProfile, ContentInput, MarketingCampaign, ImageFile, ImageModel, VideoModel, GenerationOptions, ImageSize, Post } from '../types';

// Helper to ensure fresh GoogleGenAI instance with latest API key
const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    const ai = getAi();
    const parts: any[] = [{ text: `
    **PERFIL DA MARCA:**
    - Nome: ${brandProfile.name}
    - Descrição: ${brandProfile.description}
    - Tom de Voz: ${brandProfile.toneOfVoice}
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

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', 
        contents: { parts },
        config: {
            responseMimeType: 'application/json',
            responseSchema: campaignSchema,
            temperature: 0.7,
        },
    });
    
    return JSON.parse(response.text.trim());
};

export const generateQuickPostText = async (brandProfile: BrandProfile, context: string, imageBase64?: string): Promise<Post> => {
    const ai = getAi();
    const parts: any[] = [{ text: `
    Você é Social Media Manager de elite. Crie um post de INSTAGRAM de alta performance para um clube de poker.
    
    **CONTEXTO DO EVENTO:**
    ${context}

    **MARCA:** ${brandProfile.name} | **TOM:** ${brandProfile.toneOfVoice}
    
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

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: { parts },
        config: { responseMimeType: 'application/json', temperature: 0.8 },
    });
    return JSON.parse(response.text.trim());
};

export const generateImage = async (
    prompt: string,
    brandProfile: BrandProfile,
    options: { aspectRatio: string; model: ImageModel; imageSize?: ImageSize; productImages?: ImageFile[] }
): Promise<string> => {
    const ai = getAi();
    const fullPrompt = `PROMPT TÉCNICO: ${prompt}\nESTILO VISUAL: ${brandProfile.toneOfVoice}, Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}. Cinematográfico e Luxuoso.`;
    
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

export const generateVideo = async (prompt: string, aspectRatio: "16:9" | "9:16", model: VideoModel, image?: ImageFile | null): Promise<string> => {
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
    return URL.createObjectURL(videoBlob);
};

export const generateSpeech = async (script: string): Promise<string> => {
    const ai = getAi();
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: script }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
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
    
    const brandingInstruction = `
    **IDENTIDADE VISUAL (ESTRITO):**
    - Marca: ${brandProfile.name} | Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}.
    - Tom de Voz: ${brandProfile.toneOfVoice}.

    **REGRA DE OURO DOS DADOS (CRÍTICO):**
    1. O valor do **GARANTIDO (GTD)** é a informação mais importante do flyer. Você DEVE escrevê-lo em destaque total, com fontes grandes e cores vibrantes.
    2. Insira o Horário e o Nome do Torneio de forma legível.
    3. Use o logotipo fornecido de forma profissional.
    4. Estilo: Poker de elite, cassino, alta fidelidade.
    `;

    const parts: any[] = [
        { text: brandingInstruction },
        { text: `SOLICITAÇÃO ESPECÍFICA: ${prompt}` }
    ];

    if (logo) parts.push({ inlineData: { data: logo.base64, mimeType: logo.mimeType } });
    if (collabLogo) parts.push({ inlineData: { data: collabLogo.base64, mimeType: collabLogo.mimeType } });
    if (referenceImage) parts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });
    if (compositionAssets) {
        compositionAssets.forEach(asset => parts.push({ inlineData: { data: asset.base64, mimeType: asset.mimeType } }));
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
