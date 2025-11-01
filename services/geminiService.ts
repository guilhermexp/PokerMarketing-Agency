import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { BrandProfile, ContentInput, MarketingCampaign, ImageFile, ImageModel, VideoModel, GenerationOptions } from './types';

// According to guidelines, API key must come from process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const campaignSchema = {
    type: Type.OBJECT,
    properties: {
        videoClipScripts: {
            type: Type.ARRAY,
            description: "Roteiros para vídeos curtos (Reels/Shorts/TikTok).",
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "Título impactante para o clipe." },
                    hook: { type: Type.STRING, description: "Frase inicial para prender a atenção em 3 segundos." },
                    scenes: {
                        type: Type.ARRAY,
                        description: "Sequência de cenas do vídeo.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                scene: { type: Type.INTEGER, description: "Número da cena." },
                                visual: { type: Type.STRING, description: "Descrição do que deve ser mostrado na tela (ex: 'Close-up do produto', 'Animação de texto')." },
                                narration: { type: Type.STRING, description: "Texto que será narrado ou exibido na tela." },
                                duration_seconds: { type: Type.INTEGER, description: "A duração da cena em segundos (ex: 5)." }
                            },
                            required: ["scene", "visual", "narration", "duration_seconds"]
                        }
                    },
                    image_prompt: { type: Type.STRING, description: "Um prompt detalhado para gerar uma imagem de capa ou fundo para o vídeo, que seja visualmente atraente e represente o conteúdo. Deve ser criativo e descritivo." },
                    audio_script: { type: Type.STRING, description: "Um roteiro completo para a narração de áudio do vídeo inteiro, incluindo indicações de trilha sonora e efeitos sonoros. O tempo deve ser sincronizado com a duração total das cenas. Ex: '[0-5s: Trilha sonora animada] Narração: ... [5-10s: Efeito sonoro de clique] Narração: ...'" }
                },
                required: ["title", "hook", "scenes", "image_prompt", "audio_script"]
            }
        },
        posts: {
            type: Type.ARRAY,
            description: "Posts para diferentes redes sociais.",
            items: {
                type: Type.OBJECT,
                properties: {
                    platform: { type: Type.STRING, description: "A rede social (ex: 'Instagram', 'LinkedIn', 'Twitter', 'Facebook')." },
                    content: { type: Type.STRING, description: "O texto principal do post, adaptado para a plataforma." },
                    hashtags: {
                        type: Type.ARRAY,
                        description: "Uma lista de hashtags relevantes (sem o '#').",
                        items: { type: Type.STRING }
                    },
                    image_prompt: { type: Type.STRING, description: "Um prompt detalhado para gerar uma imagem que acompanhe o post, alinhada com o conteúdo e a identidade da marca." }
                },
                required: ["platform", "content", "hashtags", "image_prompt"]
            }
        },
        adCreatives: {
            type: Type.ARRAY,
            description: "Criativos para anúncios online.",
            items: {
                type: Type.OBJECT,
                properties: {
                    platform: { type: Type.STRING, description: "A plataforma de anúncio (ex: 'Facebook', 'Google')." },
                    headline: { type: Type.STRING, description: "Título principal do anúncio (curto e impactante)." },
                    body: { type: Type.STRING, description: "Texto de corpo do anúncio, explicando a oferta." },
                    cta: { type: Type.STRING, description: "Chamada para ação (Call to Action), ex: 'Saiba Mais', 'Compre Agora'." },
                    image_prompt: { type: Type.STRING, description: "Um prompt detalhado para gerar a imagem do anúncio, focada em conversão e alinhada com a oferta." }
                },
                required: ["platform", "headline", "body", "cta", "image_prompt"]
            }
        }
    },
    required: ["videoClipScripts", "posts", "adCreatives"]
};


export const generateCampaign = async (brandProfile: BrandProfile, input: ContentInput, options: GenerationOptions): Promise<MarketingCampaign> => {
    
    const parts: any[] = [{ text: `
    **PERFIL DA MARCA:**
    - Nome: ${brandProfile.name}
    - Descrição: ${brandProfile.description}
    - Tom de Voz: ${brandProfile.toneOfVoice}
    - Cores: Primária (${brandProfile.primaryColor}), Secundária (${brandProfile.secondaryColor})

    **CONTEÚDO PRINCIPAL (TRANSCRIÇÃO):**
    ${input.transcript}

    **OBJETIVO:**
    Com base no perfil da marca e na transcrição fornecida, gere um conjunto completo de materiais de marketing. 
    Para cada tipo de conteúdo, gere a quantidade exata especificada.

    **REQUISITOS DE GERAÇÃO:**
    - Clipes de Vídeo: ${options.videoClipScripts.count}. Para cada clipe, crie um roteiro visual detalhado (scenes) e, SEPARADAMENTE, um roteiro de áudio completo (audio_script) com narração e sugestões de som. A duração total do clipe deve ser de aproximadamente 15-20 segundos.
    - Posts para Instagram: ${options.posts.instagram.count}
    - Posts para Facebook: ${options.posts.facebook.count}
    - Posts para Twitter: ${options.posts.twitter.count}
    - Posts para LinkedIn: ${options.posts.linkedin.count}
    - Criativos de Anúncio para Facebook: ${options.adCreatives.facebook.count}
    - Criativos de Anúncio para Google: ${options.adCreatives.google.count}

    Certifique-se de que cada peça de conteúdo seja única e adaptada à sua respectiva plataforma. 
    Os prompts de imagem devem ser extremamente criativos, detalhados e específicos, descrevendo uma cena completa para a IA gerar, 
    incorporando o estilo da marca e o tema do conteúdo. Não gere prompts genéricos como 'logo da empresa'.
    ` }];

    if (input.productImages) {
        parts.push({ text: "\n\n**IMAGENS DO PRODUTO (para referência):**" });
        input.productImages.forEach(img => {
            parts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: img.base64,
                },
            });
        });
    }

    if (input.inspirationImages) {
        parts.push({ text: "\n\n**IMAGENS DE INSPIRAÇÃO (para referência de estilo):**" });
        input.inspirationImages.forEach(img => {
            parts.push({
                inlineData: {
                    mimeType: img.mimeType,
                    data: img.base64,
                },
            });
        });
    }
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', 
            contents: { parts },
            config: {
                responseMimeType: 'application/json',
                responseSchema: campaignSchema,
                temperature: 0.7,
            },
        });
        
        const jsonText = response.text.trim();
        const campaignData = JSON.parse(jsonText);
        
        const finalCampaign: MarketingCampaign = {
            videoClipScripts: options.videoClipScripts.generate ? (campaignData.videoClipScripts || []).slice(0, options.videoClipScripts.count) : [],
            posts: (options.posts.instagram.generate || options.posts.facebook.generate || options.posts.twitter.generate || options.posts.linkedin.generate)
                ? (campaignData.posts || []).filter((post: any) => {
                    const platform = post.platform?.toLowerCase();
                    if (!platform) return false;
                    const optionsPosts = options.posts as any;
                    return optionsPosts[platform]?.generate;
                })
                : [],
            adCreatives: (options.adCreatives.facebook.generate || options.adCreatives.google.generate)
                ? (campaignData.adCreatives || []).filter((ad: any) => {
                    const platform = ad.platform?.toLowerCase();
                    if (!platform) return false;
                    const optionsAdCreatives = options.adCreatives as any;
                    return optionsAdCreatives[platform]?.generate;
                })
                : [],
        };
        
        return finalCampaign;

    } catch (error) {
        console.error("Error generating campaign:", error);
        throw new Error("Falha ao gerar a campanha. A resposta da IA pode ser inválida. Tente novamente.");
    }
};

export const generateImage = async (
    prompt: string,
    brandProfile: BrandProfile,
    options: { aspectRatio: string; model: ImageModel; productImages?: ImageFile[] }
): Promise<string> => {
    
    const fullPrompt = `**PROMPT:** ${prompt}\n\n**DIRETRIZES DE ESTILO:**\n- **Marca:** ${brandProfile.name}\n- **Tom de Voz Visual:** ${brandProfile.toneOfVoice}\n- **Paleta de Cores:** Foco em ${brandProfile.primaryColor} (principal) e ${brandProfile.secondaryColor} (secundário).\n- **Estilo Geral:** Moderno, limpo e profissional.`;
    
    try {
        if (options.model === 'imagen-4.0-generate-001') {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: fullPrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: options.aspectRatio as any,
                },
            });
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            return `data:image/png;base64,${base64ImageBytes}`;
        } else {
            const parts: any[] = [{ text: fullPrompt }];
            if (options.productImages) {
                options.productImages.forEach(img => {
                    parts.push({
                        inlineData: {
                            data: img.base64,
                            mimeType: img.mimeType,
                        },
                    });
                });
            }

            const response = await ai.models.generateContent({
                model: options.model,
                contents: { parts },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });

            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
            throw new Error("Nenhuma imagem foi gerada pela IA.");
        }

    } catch (error) {
        console.error("Error generating image:", error);
        throw new Error("Falha ao gerar imagem.");
    }
};

export const generateVideo = async (
    prompt: string,
    aspectRatio: "16:9" | "9:16",
    model: VideoModel,
    image?: ImageFile | null
): Promise<string> => {
    const freshAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        let operation = await freshAi.models.generateVideos({
            model: model,
            prompt: prompt,
            image: image ? { imageBytes: image.base64, mimeType: image.mimeType } : undefined,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: aspectRatio
            }
        });

        // Poll for completion
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await freshAi.operations.getVideosOperation({ operation: operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("A geração do vídeo falhou ou não retornou um link para download.");
        }
        
        const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        if (!videoResponse.ok) {
            throw new Error(`Falha ao baixar o vídeo: ${videoResponse.statusText}`);
        }
        
        const videoBlob = await videoResponse.blob();
        return URL.createObjectURL(videoBlob);

    } catch (error: any) {
        console.error("Error generating video:", error);
        if (error.message && error.message.includes("Requested entity was not found")) {
            throw new Error("Chave de API inválida ou não encontrada. Por favor, selecione uma chave de API válida.");
        }
        throw new Error("Falha ao gerar o vídeo.");
    }
};

export const generateSpeech = async (script: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: script }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("Nenhum dado de áudio foi retornado pela API.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating speech:", error);
        throw new Error("Falha ao gerar o áudio.");
    }
};


export const generateLogo = async (prompt: string): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `Crie um logo moderno e minimalista. Fundo branco. Estilo de design plano (flat design). Prompt: "${prompt}"`,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
                aspectRatio: '1:1',
            },
        });
        const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
        return `data:image/png;base64,${base64ImageBytes}`;
    } catch (error) {
        console.error("Error generating logo:", error);
        throw new Error("Falha ao gerar o logo.");
    }
};


export const editImage = async (
    base64ImageData: string,
    mimeType: string,
    prompt: string,
    mask?: { base64: string, mimeType: string },
    referenceImage?: { base64: string, mimeType: string }
): Promise<string> => {
    
    const parts: any[] = [
        { text: prompt },
        {
            inlineData: {
                data: base64ImageData,
                mimeType: mimeType,
            },
        },
    ];

    if (mask) {
        parts.push({
            inlineData: {
                data: mask.base64,
                mimeType: mask.mimeType,
            }
        });
    }
    
    if (referenceImage) {
        parts.push({ text: "Use a seguinte imagem como referência para o estilo:" });
        parts.push({
            inlineData: {
                data: referenceImage.base64,
                mimeType: referenceImage.mimeType,
            }
        });
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        throw new Error("Nenhuma imagem editada foi retornada.");
    } catch (error) {
        console.error("Error editing image:", error);
        throw new Error("Falha ao editar a imagem.");
    }
};


export const extractColorsFromLogo = async (logo: ImageFile): Promise<{ primaryColor: string, secondaryColor: string }> => {
    const colorSchema = {
        type: Type.OBJECT,
        properties: {
            primaryColor: {
                type: Type.STRING,
                description: 'A cor hexadecimal primária dominante no logo (ex: "#FFFFFF").'
            },
            secondaryColor: {
                type: Type.STRING,
                description: 'A segunda cor hexadecimal mais proeminente no logo (ex: "#000000").'
            }
        },
        required: ["primaryColor", "secondaryColor"]
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { text: "Analise este logo e extraia as duas cores dominantes em formato hexadecimal." },
                    {
                        inlineData: {
                            mimeType: logo.mimeType,
                            data: logo.base64,
                        },
                    },
                ],
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: colorSchema,
            },
        });
        
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error extracting colors:", error);
        return { primaryColor: '#14b8a6', secondaryColor: '#4f46e5' };
    }
};

export const generateFlyer = async (
    prompt: string,
    brandProfile: BrandProfile,
    logo: ImageFile | null,
    referenceImage: ImageFile | null,
    aspectRatio: string,
    model: ImageModel
): Promise<string> => {

    try {
        const parts: any[] = [{ text: prompt }];

        if (logo) {
            parts.push({ text: "\n\nUse este logo da marca no design:" });
            parts.push({
                inlineData: {
                    data: logo.base64,
                    mimeType: logo.mimeType,
                },
            });
        }
        if (referenceImage) {
            parts.push({ text: "\n\nUse esta imagem como referência de estilo visual:" });
            parts.push({
                inlineData: {
                    data: referenceImage.base64,
                    mimeType: referenceImage.mimeType,
                },
            });
        }
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        throw new Error("Nenhum flyer foi gerado pela IA.");

    } catch (error) {
        console.error("Error generating flyer:", error);
        throw new Error("Falha ao gerar o flyer.");
    }
};