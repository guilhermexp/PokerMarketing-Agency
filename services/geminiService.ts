import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { BrandProfile, ContentInput, MarketingCampaign } from '../types';

// FIX: Initialize the GoogleGenAI client with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// FIX: Define a strict schema for the expected JSON output from the campaign generation model.
const campaignSchema = {
  type: Type.OBJECT,
  properties: {
    videoClipScripts: {
      type: Type.ARRAY,
      description: "Gerar 2-3 roteiros de clipes de vídeo curtos (ex: para TikTok, Instagram Reels, YouTube Shorts). Cada roteiro deve ter um título, uma duração sugerida em segundos, um roteiro detalhado com cenas e texto de narração, e uma sugestão de thumbnail com um título e um prompt de imagem.",
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
      description: "Gerar 3-4 posts para redes sociais como LinkedIn, Twitter (X) e Instagram. Cada post deve ter conteúdo, hashtags relevantes e um prompt para gerar uma imagem de acompanhamento, se aplicável.",
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING, description: "Plataforma de rede social alvo (ex: 'LinkedIn', 'Twitter', 'Instagram')." },
          content: { type: Type.STRING, description: "O conteúdo principal do post." },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Uma lista de hashtags relevantes, sem o símbolo '#' ." },
          image_prompt: { type: Type.STRING, description: "Um prompt descritivo para um gerador de imagens de IA criar um visual para este post. Pode ser nulo se nenhuma imagem for necessária." },
        },
        required: ["platform", "content", "hashtags", "image_prompt"],
      },
    },
    adCreatives: {
      type: Type.ARRAY,
      description: "Gerar 2-3 criativos de anúncio para plataformas como Facebook Ads ou Google Ads. Cada criativo precisa de um título, corpo de texto, uma chamada para ação (CTA) e um prompt para o visual do anúncio.",
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
  input: ContentInput
): Promise<MarketingCampaign> => {
  const systemInstruction = `Você é a IA DirectorAi, uma geradora de campanhas de marketing de classe mundial. Sua tarefa é criar uma campanha de marketing abrangente com base em uma transcrição de conteúdo e perfil de marca fornecidos pelo usuário.

  **Perfil da Marca:**
  - Nome: ${brandProfile.name}
  - Descrição: ${brandProfile.description}
  - Tom de Voz: ${brandProfile.toneOfVoice}
  - Cor Primária: ${brandProfile.primaryColor}
  - Cor Secundária: ${brandProfile.secondaryColor}

  Sua saída DEVE ser um objeto JSON válido que adere ao esquema fornecido. A campanha deve ser criativa, envolvente e perfeitamente alinhada com a identidade da marca. Analise a transcrição fornecida para extrair mensagens-chave, temas e pontos de discussão para reaproveitar em vários formatos de conteúdo.`;

  const userPrompt = `Aqui está a transcrição do conteúdo a ser reaproveitado:

  --- INÍCIO DA TRANSCRIÇÃO ---
  ${input.transcript}
  --- FIM DA TRANSCRIÇÃO ---

  Por favor, gere uma campanha de marketing completa com base nesta transcrição e no perfil da marca.`;
  
  const requestContents: any = input.image
    ? {
        parts: [
          { text: `Aqui está uma imagem de referência e a transcrição do conteúdo a ser reaproveitado. Use a imagem como inspiração visual, se necessário.\n\n${userPrompt}` },
          { inlineData: { data: input.image.base64, mimeType: input.image.mimeType } }
        ]
      }
    : userPrompt;

  try {
    const response = await ai.models.generateContent({
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

// FIX: Implement the image generation function using the Gemini API ('imagen-4.0-generate-001').
export const generateImage = async (prompt: string, aspectRatio: string = '1:1'): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `Imagem de marketing vibrante e de alta qualidade para um post de rede social. O estilo deve ser moderno e limpo. Assunto: ${prompt}`,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: aspectRatio,
            },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            return `data:image/png;base64,${base64ImageBytes}`;
        } else {
            throw new Error("Nenhuma imagem foi gerada pela API.");
        }
    } catch (error) {
        console.error("Error generating image with Gemini API:", error);
        throw new Error("Falha ao gerar imagem. Por favor, tente novamente mais tarde.");
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
        instructionPrompt = `Usando a imagem de referência fornecida (a última imagem), incorpore-a ou use-a como inspiração para a área mascarada da imagem principal (a primeira imagem). A instrução é: "${prompt}"`;
    } else if (mask) {
        instructionPrompt = `Aplique a seguinte alteração apenas na área mascarada da imagem: "${prompt}"`;
    } else if (referenceImage) {
        instructionPrompt = `Usando a imagem de referência fornecida (a última imagem), edite a imagem principal com a seguinte instrução: "${prompt}"`;
    }

    parts.push({ text: instructionPrompt });
    parts.push({ inlineData: { data: base64ImageData, mimeType: mimeType } });

    if (mask) {
      // The model expects the mask right after the image to be edited.
      parts.push({ inlineData: { data: mask.base64, mimeType: mask.mimeType } });
    }
    
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

export const generateFlyer = async (
  basePrompt: string,
  logo: { base64: string; mimeType: string } | null,
  referenceImage: { base64: string; mimeType: string } | null,
  aspectRatio: string
): Promise<string> => {
    // If no extra images are provided, use the high-quality image generation model.
    if (!logo && !referenceImage) {
        return generateImage(basePrompt, aspectRatio);
    }

    // If images are provided, use the multi-modal model for more creative control.
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

    parts.push({ text: instructionPrompt }); // Add the full text prompt at the end.

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
