
import { GoogleGenAI, Type } from "@google/genai";
import type { BrandProfile, ChatMessage } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const assistantTools = {
  functionDeclarations: [
    {
      name: "create_brand_logo",
      description: "Cria um novo logo do zero com base em uma descrição textual. Use isso quando o usuário não tiver um logo e pedir para você criar um.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: "Uma descrição detalhada do logo a ser criado (ex: 'um leão minimalista em estilo de linha').",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "edit_brand_logo",
      description: "Edita o logo da marca atual com base em um prompt do usuário. Use isso para melhorar a qualidade, alterar cores ou fazer outras modificações no logo.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: "Uma descrição detalhada das alterações desejadas para o logo.",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "edit_referenced_image",
      description: "Edita a imagem que o usuário anexou à sua mensagem de chat. Use esta ferramenta quando o usuário fornecer uma imagem e solicitar modificações nela.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: "Uma descrição detalhada das alterações a serem feitas na imagem referenciada.",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "get_tournament_events",
      description: "Recupera uma lista de eventos de torneio da planilha carregada. Pode ser filtrado por dia da semana ou por um termo de pesquisa no nome do evento.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          day_of_week: {
            type: Type.STRING,
            description: "O dia da semana para filtrar os eventos (por exemplo, 'MONDAY', 'TUESDAY'). Use maiúsculas.",
          },
          name_contains: {
            type: Type.STRING,
            description: "Um termo de pesquisa para encontrar nos nomes dos torneios.",
          },
        },
      },
    },
  ],
};


export const runAssistantConversationStream = async (
    history: ChatMessage[],
    brandProfile: BrandProfile | null
) => {
    const systemInstruction = `Você é o Assistente DirectorAi, uma IA especialista integrada na aplicação DirectorAi. Seu objetivo é ajudar os usuários a gerenciar suas campanhas de marketing e ativos de marca. Você pode executar ações dentro do aplicativo em nome do usuário.
- O perfil de marca atual do usuário é: ${JSON.stringify(brandProfile, null, 2)}
- Quando um usuário pedir para criar um logo do zero, use a ferramenta 'create_brand_logo'.
- Quando um usuário pedir para você modificar um logo existente, use a ferramenta 'edit_brand_logo'. Se o usuário não tiver um logo, você deve sugerir criá-lo primeiro.
- Quando um usuário enviar uma imagem no chat e pedir para modificá-la, use a ferramenta 'edit_referenced_image'.
- Você também pode consultar a lista de eventos de torneio carregados usando a ferramenta 'get_tournament_events'. Isso é útil para responder a perguntas do usuário sobre a programação, como 'Quais eventos acontecem na segunda-feira?' ou 'Fale-me sobre o torneio Deepstack'.
- Seja prestativo, conciso e proativo. Ao concluir uma ação, confirme-a com o usuário.
- Se não puder atender a uma solicitação, explique o motivo e sugira o que você pode fazer.
- Formate suas respostas usando Markdown para melhor legibilidade (listas, negrito, etc.).`;

    try {
        return ai.models.generateContentStream({
            // FIX: Use 'gemini-2.5-flash' for general text tasks as per guidelines.
            model: 'gemini-2.5-flash',
            contents: history,
            config: {
                systemInstruction,
                tools: [assistantTools],
            },
        });
    } catch (error) {
        console.error("Error running assistant conversation stream:", error);
        throw new Error("Falha na comunicação com o assistente de IA.");
    }
};
