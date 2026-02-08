interface CarouselSlidePromptParams {
  sceneVisual: string;
  narration: string;
}

export const buildCarouselSlide4x5Prompt = ({
  sceneVisual,
  narration,
}: CarouselSlidePromptParams): string => `RECRIE ESTA IMAGEM NO FORMATO 4:5 PARA FEED DO INSTAGRAM

Descrição visual: ${sceneVisual}
Texto/Narração para incluir: ${narration}

IMPORTANTE:
- Use a imagem anexada como referência EXATA de estilo, cores, tipografia e composição
- Adapte o layout para o formato 4:5 (vertical para feed)
- Mantenha TODOS os elementos visuais e textos visíveis dentro do enquadramento
- A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência`;

export const buildCarouselCoverPrompt = (coverPrompt: string): string => `CAPA DE CARROSSEL INSTAGRAM - SLIDE PRINCIPAL

${coverPrompt}

Esta imagem define o estilo visual (tipografia, cores, composição) para todos os slides do carrossel.`;

interface CampaignSlidePromptParams {
  slideNumber: number;
  visual: string;
  text: string;
}

export const buildCarouselCampaignSlidePrompt = ({
  slideNumber,
  visual,
  text,
}: CampaignSlidePromptParams): string => `SLIDE ${slideNumber} DE UM CARROSSEL - DEVE USAR A MESMA TIPOGRAFIA DA IMAGEM DE REFERÊNCIA

Descrição visual: ${visual}
Texto para incluir: ${text}

IMPORTANTE: Este slide faz parte de uma sequência. A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência anexada. NÃO use fontes diferentes.`;
