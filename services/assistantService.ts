
import { GoogleGenAI, Type } from "@google/genai";
import type { BrandProfile, ChatMessage } from '../types';

const assistantTools = {
  functionDeclarations: [
    {
      name: "create_image",
      description: "Gera uma nova imagem de marketing do zero. Use isso quando o usuário pedir para criar um flyer, post ou qualquer asset visual novo, podendo usar referências enviadas no chat como inspiração.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          description: {
            type: Type.STRING,
            description: "Descrição técnica detalhada para a IA de imagem (estilo poker, cinematográfico, iluminação dramática, etc).",
          },
          aspect_ratio: {
            type: Type.STRING,
            enum: ["1:1", "9:16", "16:9"],
            description: "Proporção da imagem.",
          }
        },
        required: ["description"],
      },
    },
    {
      name: "edit_referenced_image",
      description: "Edita a imagem atualmente em foco (selecionada da galeria ou recém-criada). Use para ajustes finos, trocar elementos ou cores até o usuário ficar satisfeito.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: "Descrição exata da alteração (ex: 'mude o fundo para um cassino em Las Vegas').",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "add_collab_logo_to_image",
      description: "Adiciona um logotipo de parceiro (enviado pelo usuário no chat) a uma imagem existente. Use quando o usuário subir um logo e pedir para inseri-lo em uma arte como colab/parceria.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          style_instruction: {
            type: Type.STRING,
            description: "Instrução de posicionamento ou estilo (ex: 'canto inferior direito em marca d'água').",
          },
        },
        required: ["style_instruction"],
      },
    },
    {
      name: "create_brand_logo",
      description: "Cria um novo logo para a marca do zero.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING, description: "Descrição do logo." },
        },
        required: ["prompt"],
      },
    }
  ],
};

export const runAssistantConversationStream = async (
    history: ChatMessage[],
    brandProfile: BrandProfile | null
) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const systemInstruction = `Você é o Diretor de Criação Sênior da DirectorAi. Especialista em Branding e Design para Poker.

SUAS CAPACIDADES CORE:
1. CRIAÇÃO E ITERAÇÃO: Crie imagens do zero e continue editando-as até o usuário aprovar.
2. REFERÊNCIAS: Use imagens de referência enviadas no chat para guiar o estilo das suas criações.
3. BRANDING: Você conhece a marca: ${JSON.stringify(brandProfile)}. Sempre use a paleta de cores e o tom de voz oficial.

NOTA TÉCNICA: Por restrições do sistema, ferramentas de busca externa e ferramentas de design não podem coexistir. Use seu vasto conhecimento interno sobre a indústria do poker (WSOP, BSOP, calendários, estética de cassinos) para responder e criar artes sem depender de busca externa.

Sempre descreva o seu raciocínio criativo antes de executar uma ferramenta.`;

    try {
        return ai.models.generateContentStream({
            model: 'gemini-3-pro-preview',
            contents: history,
            config: {
                systemInstruction,
                tools: [assistantTools],
                temperature: 0.5,
            },
        });
    } catch (error) {
        console.error("Error in assistant stream:", error);
        throw new Error("Erro na rede neural do assistente.");
    }
};
