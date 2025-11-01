import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { BrandProfile, ContentInput, MarketingCampaign, ImageModel, GenerationOptions } from '../types';

// FIX: Initialize the GoogleGenAI client with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const FAL_API_KEY = "82aad018-4197-43cc-8344-43a25e6b1f89:f314660fbfe0c37586c06d2ce573e301";

// Helper to convert aspect ratio to dimensions for Bytedance
const getDimensionsFromAspectRatio = (aspectRatio: string): { width: number; height: number } => {
    switch (aspectRatio) {
        case '16:9': return { width: 3072, height: 1728 };
        case '9:16': return { width: 1728, height: 3072 };
        case '4:3': return { width: 2730, height: 2048 };
        case '3:4': return { width: 2048, height: 2730 };
        case '1:1':
        default:
            return { width: 2048, height: 2048 };
    }
};

// Helper to fetch a URL and convert it to a base64 data URL
async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}


// FIX: Define a strict schema for the expected JSON output from the campaign generation model.
const campaignSchema = {
  type: Type.OBJECT,
  properties: {
    videoClipScripts: {
      type: Type.ARRAY,
      description: "Uma lista de roteiros de clipes de vídeo curtos (ex: para TikTok, Instagram Reels, YouTube Shorts). Cada roteiro deve ter um título, uma duração sugerida em segundos, um roteiro detalhado com cenas e texto de narração, e uma sugestão de thumbnail com um título e um prompt de imagem.",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Título cativante para o clipe de vídeo." },
          duration: { type: Type.INTEGER, description: "Duração sugerida em segundos (ex: 15, 30, 60)." },
          script: { type: Type.STRING, description: "Roteiro detalhado com cenas e texto de narração." },
          thumbnail: {
            type: Type.OBJECT,
            description: "Sugestão de thumbnail para o vídeo, incluindo um título de sobreposição e um prompt para gerar a imagem.",
            properties: {
              title: { type: Type.STRING, description: "Texto curto e impactante para sobrepor na thumbnail (máximo 60 caracteres)." },
              image_prompt: { type: Type.STRING, description: "Um prompt descritivo para um gerador de imagens de IA criar o visual da thumbnail." },
            },
            required: ["title", "image_prompt"],
          },
        },
        required: ["title", "duration", "script", "thumbnail"],
      },
    },
    posts: {
      type: Type.ARRAY,
      description: "Uma lista de posts para redes sociais como LinkedIn, Twitter (X), Instagram e Facebook. Cada post deve ter conteúdo, hashtags relevantes e um prompt para gerar uma imagem de acompanhamento, se aplicável.",
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING, description: "Plataforma de rede social alvo (ex: 'LinkedIn', 'Twitter', 'Instagram', 'Facebook')." },
          content: { type: Type.STRING, description: "O conteúdo principal do post." },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Uma lista de hashtags relevantes, sem o símbolo '#' ." },
          image_prompt: { type: Type.STRING, description: "Um prompt descritivo para um gerador de imagens de IA criar um visual para este post. Pode ser nulo se nenhuma imagem for necessária." },
        },
        required: ["platform", "content", "hashtags", "image_prompt"],
      },
    },
    adCreatives: {
      type: Type.ARRAY,
      description: "Uma lista de criativos de anúncio para plataformas como Facebook Ads ou Google Ads. Cada criativo precisa de um título, corpo de texto, uma chamada para ação (CTA) e um prompt para o visual do anúncio.",
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING, description: "Plataforma de anúncio alvo (ex: 'Facebook Ads', 'Google Ads')." },
          headline: { type: Type.STRING, description: "Um título atraente para o anúncio." },
          body: { type: Type.STRING, description: "O corpo de texto principal do anúncio." },
          cta: { type: Type.STRING, description: "Uma chamada para ação clara (ex: 'Saiba Mais', 'Inscreva-se')." },
          image_prompt: { type: Type.STRING, description: "Um prompt descritivo para um gerador de imagens de IA criar o visual do anúncio." },
        },
        required: ["platform", "headline", "body", "cta", "image_prompt"],
      },
    },
  },
  required: ["videoClipScripts", "posts", "adCreatives"],
};

// FIX: Implement the campaign generation function using the Gemini API ('gemini-2.5-flash').
export const generateCampaign = async (
  brandProfile: BrandProfile,
  input: ContentInput,
  options: GenerationOptions
): Promise<MarketingCampaign> => {
    
    let generationInstructions = `Sua tarefa é criar APENAS os seguintes itens de marketing, com base nas seleções e quantidades do usuário:\n`;
    
    if (options.videoClipScripts.generate && options.videoClipScripts.count > 0) {
        generationInstructions += `- Gerar ${options.videoClipScripts.count} roteiro(s) de clipe(s) de vídeo curto(s) (ex: para TikTok, Instagram Reels, YouTube Shorts).\n`;
    }

    const postPlatforms = Object.entries(options.posts)
        .filter(([, setting]) => setting.generate && setting.count > 0)
        .map(([platform, setting]) => {
            let platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
            if (platform === 'twitter') platformName = 'Twitter (X)';
            return `  - ${setting.count} post(s) para ${platformName}.\n`;
        }).join('');
    
    if (postPlatforms) {
        generationInstructions += `- Gerar posts para redes sociais da seguinte forma:\n${postPlatforms}`;
    }

    const adPlatforms = Object.entries(options.adCreatives)
        .filter(([, setting]) => setting.generate && setting.count > 0)
        .map(([platform, setting]) => {
            let platformName = platform.charAt(0).toUpperCase() + platform.slice(1) + ' Ads';
             if (platform === 'facebook') platformName = 'Facebook Ads';
            return `  - ${setting.count} criativo(s) de anúncio para ${platformName}.\n`;
        }).join('');

    if (adPlatforms) {
        generationInstructions += `- Gerar criativos de anúncio da seguinte forma:\n${adPlatforms}`;
    }

    generationInstructions += `\nPara quaisquer categorias principais não solicitadas (videoClipScripts, posts, adCreatives) ou plataformas específicas dentro delas, retorne um array vazio [] no objeto JSON de saída. Não invente conteúdo para seções que não foram solicitadas.`;

  const systemInstruction = `Você é a IA DirectorAi, uma geradora de campanhas de marketing de classe mundial.
  
  ${generationInstructions}

  **Perfil da Marca:**
  - Nome: ${brandProfile.name}
  - Descrição: ${brandProfile.description}
  - Tom de Voz: ${brandProfile.toneOfVoice}
  - Cor Primária: ${brandProfile.primaryColor}
  - Cor Secundária: ${brandProfile.secondaryColor}

  Sua saída DEVE ser um objeto JSON válido que adere ao esquema fornecido. A campanha deve ser criativa, envolvente e perfeitamente alinhada com a identidade da marca. Analise a transcrição fornecida para extrair mensagens-chave, temas e pontos de discussão para reaproveitar em vários formatos de conteúdo.`;

  const parts: any[] = [];
  let textPrompt = '';

  if (input.productImages && input.productImages.length > 0) {
      textPrompt += `**Instruções de Imagem do Produto:** As primeiras imagens a seguir são do produto principal e/ou do logo da marca. Elas são o foco central da campanha. Os visuais que você gerar devem apresentar ou ser diretamente inspirados por estes produtos. Se um logo for fornecido, incorpore-o de forma adequada nos criativos.`;
      input.productImages.forEach(image => {
          parts.push({ inlineData: { data: image.base64, mimeType: image.mimeType } });
      });
  }

  if (input.inspirationImages && input.inspirationImages.length > 0) {
      textPrompt += `\n\n**Instruções de Imagem de Referência:** As imagens a seguir são referências de estilo e inspiração. Use-as para guiar a estética, o clima e a composição dos visuais da campanha. NÃO copie estas imagens diretamente, mas sim extraia o estilo delas para aplicar aos visuais do produto.`;
       input.inspirationImages.forEach(image => {
          parts.push({ inlineData: { data: image.base64, mimeType: image.mimeType } });
      });
  }
  
  textPrompt += `\n\n**Conteúdo para a Campanha:** Aqui está a transcrição do conteúdo a ser reaproveitado:

  --- INÍCIO DA TRANSCRIÇÃO ---
  ${input.transcript}
  --- FIM DA TRANSCRIÇÃO ---

  Por favor, gere uma campanha de marketing completa com base na transcrição, no perfil da marca e nas instruções de imagem fornecidas.`;

  // Insert the compiled text prompt at the beginning of the parts array.
  parts.unshift({ text: textPrompt });

  const requestContents = { parts };

  try {
    const response = await ai.models.generateContent({
// FIX: Use 'gemini-2.5-flash' for general text tasks as per guidelines.
      model: 'gemini-2.5-flash',
      contents: requestContents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: campaignSchema,
      },
    });

    const jsonText = response.text.trim();
    try {
        const campaignData: MarketingCampaign = JSON.parse(jsonText);
        return campaignData;
    } catch (e) {
        console.error("Failed to parse JSON response:", jsonText);
        throw new Error("A IA retornou uma estrutura de campanha inválida. Por favor, tente novamente.");
    }
  } catch (error) {
    console.error("Error generating campaign with Gemini API:", error);
    throw new Error("Falha ao gerar a campanha de marketing. O serviço de IA pode estar temporariamente indisponível.");
  }
};

export const generateImage = async (
  prompt: string,
  brandProfile: BrandProfile,
  config: {
    aspectRatio: string;
    model: ImageModel;
    productImages?: { base64: string; mimeType: string; }[];
    inspirationImages?: { base64: string; mimeType: string; }[];
  }
): Promise<string> => {
  const { aspectRatio, model, productImages, inspirationImages } = config;
  const hasVisualContext = (productImages && productImages.length > 0) || (inspirationImages && inspirationImages.length > 0);

  // If visual context is provided, we MUST use a multimodal model to understand it.
  // We override the user's model selection to ensure correctness.
  if (hasVisualContext) {
    const parts: any[] = [];
    let instructionPrompt = `Você é um designer de marca profissional criando um visual para a marca '${brandProfile.name}'.

**REGRAS DA MARCA (OBRIGATÓRIO SEGUIR):**
- **Tom de Voz:** O estilo da imagem deve ser ${brandProfile.toneOfVoice}.
- **PALETA DE CORES OBRIGATÓRIA:** A imagem DEVE usar predominantemente as cores da marca: ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (secundária).

**INSTRUÇÕES DE CONTEÚDO:**
- **Prompt Principal:** Crie uma imagem com base na seguinte descrição: "${prompt}".
`;

    if (productImages && productImages.length > 0) {
      instructionPrompt += `- **IMAGEM DO PRODUTO/LOGO (PRIORIDADE MÁXIMA):** As primeiras imagens fornecidas são o produto ou logo. Elas DEVEM ser o foco central da imagem gerada. Incorpore-as de forma proeminente e profissional.\n`;
      productImages.forEach(img => parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } }));
    }

    if (inspirationImages && inspirationImages.length > 0) {
      instructionPrompt += `- **IMAGENS DE INSPIRAÇÃO (APENAS ESTILO):** As imagens a seguir são para inspiração de ESTILO, COMPOSIÇÃO e ATMOSFERA. NÃO copie o conteúdo ou as cores delas. A imagem final DEVE manter as cores da marca e o foco no produto.\n`;
      inspirationImages.forEach(img => parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } }));
    }
    
    instructionPrompt += `\n**SAÍDA:** A imagem gerada deve ser a única saída. Proporção da imagem: ${aspectRatio}.`;

    // The text part must come first for this model.
    parts.unshift({ text: instructionPrompt });
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

        if (imagePart?.inlineData) {
            return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        }
        const textResponse = response.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
        throw new Error(`A IA não retornou uma imagem. Resposta: ${textResponse || 'Nenhuma'}`);
    } catch (error) {
        console.error("Error generating multimodal image with gemini-2.5-flash-image-preview:", error);
        throw new Error(`Falha ao gerar imagem com contexto visual: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  // --- Text-only generation path ---
  // More direct prompt for Gemini models to avoid conversational replies.
  const geminiTextPrompt = `Crie uma imagem de marketing para a marca '${brandProfile.name}'.
**REGRAS OBRIGATÓRIAS:**
- **Paleta de Cores:** Use predominantemente ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (secundária).
- **Estilo:** O tom deve ser ${brandProfile.toneOfVoice}.
- **Proporção:** A imagem final DEVE ter a proporção de ${aspectRatio}.
**CONTEÚDO DA IMAGEM:**
- **Assunto:** ${prompt}
**SAÍDA:** Gere APENAS a imagem. Não forneça nenhuma resposta em texto, explicação ou confirmação. A imagem é a única saída.`;

  // Simpler, keyword-focused prompt for Bytedance
  const bytedancePrompt = `vibrant marketing image for ${brandProfile.name}, ${brandProfile.primaryColor} and ${brandProfile.secondaryColor} colors, ${brandProfile.toneOfVoice} tone, modern clean style. Subject: ${prompt}`;


  if (model === 'bytedance-seedream') {
    try {
        const dimensions = getDimensionsFromAspectRatio(aspectRatio);
        const response = await fetch('https://fal.run/fal-ai/bytedance/seedream/v4/text-to-image', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${FAL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: bytedancePrompt,
                image_size: { width: dimensions.width, height: dimensions.height },
                num_images: 1,
            })
        });
        if (!response.ok) throw new Error(`Bytedance API error: ${response.status} ${await response.text()}`);
        const result = await response.json();
        if (result.images && result.images.length > 0) return await urlToDataUrl(result.images[0].url);
        throw new Error("Bytedance API did not return an image.");
    } catch (error) {
        console.error("Error generating image with Bytedance API:", error);
        throw new Error(`Falha ao gerar imagem com Bytedance: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  if (model === 'gemini-flash-image-preview') {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts: [{ text: geminiTextPrompt }] },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });
        const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
        if (imagePart?.inlineData) return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        const textResponse = response.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
        throw new Error(`A IA não retornou uma imagem. Resposta: ${textResponse || 'Nenhuma'}`);
    } catch (error) {
        console.error("Error generating image with gemini-2.5-flash-image-preview:", error);
        throw new Error(`Falha ao gerar imagem com Flash Preview: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  // Default to Gemini Imagen
  try {
      const response = await ai.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: geminiTextPrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: aspectRatio,
          },
      });
      if (response.generatedImages?.[0]) {
          return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
      }
      throw new Error("Nenhuma imagem foi gerada pela API.");
  } catch (error) {
      console.error("Error generating image with Gemini Imagen API:", error);
      throw new Error(`Falha ao gerar imagem com Imagen: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
};


export const generateLogo = async (prompt: string): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `Design de logo profissional, estilo vetorial limpo, fundo branco. Assunto: ${prompt}`,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: '1:1',
            },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            return `data:image/png;base64,${base64ImageBytes}`;
        } else {
            throw new Error("Nenhum logo foi gerado pela API.");
        }
    } catch (error) {
        console.error("Error generating logo with Gemini API:", error);
        throw new Error("Falha ao gerar logo. Por favor, tente novamente mais tarde.");
    }
};


export const editImage = async (
  base64ImageData: string,
  mimeType: string,
  prompt: string,
  mask?: { base64: string; mimeType: string },
  referenceImage?: { base64: string; mimeType: string }
): Promise<string> => {
  try {
    let instructionPrompt = prompt;
    const parts: any[] = [];
    
    // Create a more descriptive prompt based on the inputs
    if (mask && referenceImage) {
        instructionPrompt = `Tarefa: Inpainting com referência. A primeira imagem é a original, a segunda é a máscara e a terceira é a referência. Preencha a área mascarada da imagem original usando a referência como inspiração e seguindo esta instrução: "${prompt}"`;
    } else if (mask) {
        instructionPrompt = `Tarefa: Inpainting. A primeira imagem é a original, a segunda é a máscara. Preencha a área mascarada da imagem original com o seguinte: "${prompt}"`;
    } else if (referenceImage) {
        instructionPrompt = `Tarefa: Edição com referência. A primeira imagem é a original, a segunda é a referência. Edite a imagem original com base na referência e na seguinte instrução: "${prompt}"`;
    }

    // The text part with instructions must come first
    parts.push({ text: instructionPrompt });
    
    // Then add the main image
    parts.push({ inlineData: { data: base64ImageData, mimeType: mimeType } });

    // Then add the mask, if it exists
    if (mask) {
      parts.push({ inlineData: { data: mask.base64, mimeType: mask.mimeType } });
    }
    
    // Finally, add the reference image, if it exists
    if (referenceImage) {
      parts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: {
        parts: parts,
      },
      config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64ImageBytes: string = part.inlineData.data;
        return `data:${part.inlineData.mimeType};base64,${base64ImageBytes}`;
      }
    }
    
    const textResponse = response.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
    console.error("No image part found in edit response. Text response:", textResponse);
    throw new Error("A IA não retornou uma imagem editada.");

  } catch (error) {
    console.error("Error editing image with Gemini API:", error);
     if (error instanceof Error) {
        throw new Error(`Falha ao editar a imagem: ${error.message}`);
    }
    throw new Error("Falha ao editar a imagem. Por favor, tente novamente mais tarde.");
  }
};

export const createBrandedImageVariant = async (
  referenceImage: { base64: string; mimeType: string },
  brandProfile: BrandProfile,
  contextPrompt: string
): Promise<string> => {
  try {
    const parts: any[] = [];
    let instructionPrompt: string;

    // Add reference image to parts first
    parts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });
    
    if (brandProfile.logo) {
      const [header, base64Data] = brandProfile.logo.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
      // Add logo image to parts
      parts.push({ inlineData: { data: base64Data, mimeType: mimeType } });

      // Create a clear, robust prompt that doesn't rely on image order.
      instructionPrompt = `Você é um designer de marca profissional. Sua tarefa é criar um novo visual para a marca '${brandProfile.name}' usando as duas imagens fornecidas: uma imagem de referência e o logo da marca.

Reimagine a imagem de referência para criar um novo visual que incorpore os seguintes elementos:
- **Identidade da Marca:** O novo visual deve parecer que pertence à marca, integrando o logo de forma sutil e profissional.
- **Cores da Marca:** Utilize a paleta de cores: ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (secundária).
- **Tom de Voz:** O estilo da imagem final deve ser ${brandProfile.toneOfVoice}.
- **Contexto:** A imagem deve ser relevante para o seguinte tópico: "${contextPrompt}".

A saída deve ser uma única imagem que combine a inspiração da imagem de referência com a identidade do logo. Não sobreponha o logo de forma grosseira. A imagem gerada deve ser a única saída.`;
    } else {
      // Create a prompt for when there's no logo
      instructionPrompt = `Você é um designer de marca profissional. Sua tarefa é adaptar a imagem de referência fornecida para alinhá-la com a identidade da marca '${brandProfile.name}'.

Crie uma nova versão da imagem de referência que incorpore os seguintes elementos da marca:
- **Cores da Marca:** Utilize a paleta de cores: ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (secundária).
- **Tom de Voz:** O estilo da imagem final deve ser ${brandProfile.toneOfVoice}.
- **Contexto:** A imagem deve ser relevante para o seguinte tópico: "${contextPrompt}".

O objetivo é reimaginar a imagem de referência para criar um visual coeso e alinhado à marca. A saída deve ser uma única imagem editada. A imagem gerada deve ser a única saída.`;
    }
    
    // Add the instruction prompt at the end of the parts array.
    // The final order will be [referenceImage, logoImage?, text]
    parts.push({ text: instructionPrompt }); 

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts: parts },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });
    
    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
        throw new Error("A IA retornou uma resposta inválida ou vazia.");
    }

    const imagePart = candidate.content.parts.find(part => part.inlineData);

    if (imagePart && imagePart.inlineData) {
      const base64ImageBytes: string = imagePart.inlineData.data;
      return `data:${imagePart.inlineData.mimeType};base64,${base64ImageBytes}`;
    }
    
    // If no image part is found, log any text response for debugging.
    const textResponse = candidate.content.parts.find(p => p.text)?.text;
    console.error("No image part found in response. Text response:", textResponse);
    throw new Error("A IA não retornou uma imagem com a marca. A resposta pode ter sido bloqueada ou o prompt precisa de ajuste.");

  } catch (error) {
    console.error("Error creating branded image variant:", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao criar variante da imagem: ${error.message}`);
    }
    throw new Error("Falha ao criar variante da imagem. Por favor, tente novamente mais tarde.");
  }
};

export type VideoModel = 'veo-2.0-generate-001' | 'veo-3.0-generate-001';

export const generateVideo = async (prompt: string, model: VideoModel): Promise<string> => {
  try {
    let operation = await ai.models.generateVideos({
      model: model,
      prompt: `Crie um vídeo cinematográfico e de alta qualidade com base no seguinte roteiro. Use imagens de arquivo, gráficos em movimento e texto na tela para dar vida ao roteiro. O tom deve corresponder ao roteiro. Roteiro: ${prompt}`,
      config: {
        numberOfVideos: 1
      }
    });

    // Poll for the result every 10 seconds.
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;

    if (downloadLink) {
      // Fetch the video data and create a local blob URL to avoid CORS issues.
      const fetchUrl = `${downloadLink}&key=${process.env.API_KEY}`;
      const response = await fetch(fetchUrl);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to fetch video:", response.status, errorText);
        throw new Error(`Falha ao buscar o vídeo do servidor (status: ${response.status}).`);
      }

      const videoBlob = await response.blob();
      
      if (!videoBlob.type.startsWith('video/')) {
        console.error("Fetched data is not a video. MIME type:", videoBlob.type);
        throw new Error("O arquivo retornado não é um vídeo válido.");
      }
      
      return URL.createObjectURL(videoBlob);
    } else {
      console.error("Video generation finished but no download link found.", operation.response);
      throw new Error("Não foi possível encontrar o link para o vídeo gerado. A resposta da API pode ter sido bloqueada.");
    }
  } catch (error) {
    console.error("Error generating video with Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Falha ao gerar o vídeo: ${error.message}`);
    }
    throw new Error("Falha ao gerar o vídeo. O serviço pode estar temporariamente indisponível.");
  }
};

export const generateFlyer = async (
  basePrompt: string,
  brandProfile: BrandProfile, // Add brandProfile for brand-aware generation
  logo: { base64: string; mimeType: string } | null,
  referenceImage: { base64: string; mimeType: string } | null,
  aspectRatio: string,
  model: ImageModel = 'gemini-imagen'
): Promise<string> => {
    // If no extra images are provided, use the high-quality image generation model,
    // but now it will be brand-aware.
    if (!logo && !referenceImage) {
        return generateImage(basePrompt, brandProfile, { aspectRatio, model });
    }

    // If images are provided, use the multi-modal model for more creative control.
    // This path is already highly specific and brand-aware.
    const parts: any[] = [];
    let instructionPrompt = basePrompt;

    if (referenceImage) {
        parts.push({ inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType } });
    }
    if (logo) {
        parts.push({ inlineData: { data: logo.base64, mimeType: logo.mimeType } });
    }

    let imageHandlingInstructions = "\n\n**Instruções para Manipulação de Imagem:**\n";

    if (referenceImage && logo) {
        imageHandlingInstructions += `- Use a primeira imagem (referência) APENAS como inspiração de estilo. CRIE UM NOVO DESIGN.\n- Integre a segunda imagem (logo) profissionalmente no novo design.\n- O mais importante: o design final DEVE ser criado do zero para se ajustar perfeitamente à proporção de ${aspectRatio} solicitada. NÃO coloque a imagem de referência dentro de um novo fundo.`;
    } else if (referenceImage) {
        imageHandlingInstructions += `- Use a imagem fornecida APENAS como inspiração de estilo. CRIE UM NOVO DESIGN.\n- O mais importante: o design final DEVE ser criado do zero para se ajustar perfeitamente à proporção de ${aspectRatio} solicitada. NÃO coloque a imagem de referência dentro de um novo fundo.`;
    } else if (logo) {
        imageHandlingInstructions += "- Integre a imagem do logo fornecida de forma profissional e harmoniosa no design.";
    }
    
    instructionPrompt += imageHandlingInstructions;
    instructionPrompt += "\n\n**REQUISITO DE SAÍDA:** Gere APENAS a imagem do flyer. Não forneça NENHUMA resposta em texto ou explicação.";

    // The text part needs to be at the end for this specific prompt structure to work well.
    parts.push({ text: instructionPrompt }); 

    try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: { parts: parts },
          config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });
        
        const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

        if (imagePart?.inlineData) {
          return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        }
        
        const textResponse = response.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
        throw new Error(`A IA não retornou uma imagem. Resposta: ${textResponse || 'Nenhuma'}`);

    } catch (error) {
        console.error("Error generating flyer with inputs:", error);
        throw new Error(`Falha ao gerar flyer: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
};


const colorExtractionSchema = {
  type: Type.OBJECT,
  properties: {
    primaryColor: {
      type: Type.STRING,
      description: 'A cor primária dominante do logo como um código hexadecimal (ex: "#RRGGBB").',
    },
    secondaryColor: {
      type: Type.STRING,
      description: 'A segunda cor mais proeminente do logo como um código hexadecimal (ex: "#RRGGBB").',
    },
  },
  required: ["primaryColor", "secondaryColor"],
};

export const extractColorsFromLogo = async (imageData: { base64: string; mimeType: string }): Promise<{ primaryColor: string; secondaryColor: string }> => {
  const prompt = "Você é um especialista em design e branding. Analise este logo e identifique suas cores primária e secundária. Retorne-as como códigos hexadecimais.";
  try {
    const response = await ai.models.generateContent({
// FIX: Use 'gemini-2.5-flash' for general text tasks as per guidelines.
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { data: imageData.base64, mimeType: imageData.mimeType } }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: colorExtractionSchema,
      },
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Error extracting colors from logo:", error);
    throw new Error("Não foi possível analisar as cores do logo. Por favor, selecione-as manually.");
  }
};