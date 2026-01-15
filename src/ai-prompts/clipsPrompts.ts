import type { BrandProfile } from "@/types";

interface ScenePromptParams {
  sceneVisual: string;
  narration: string;
  brandProfile: BrandProfile;
  includeNarration: boolean;
}

export const buildSoraScenePrompt = ({
  sceneVisual,
  narration,
  brandProfile,
  includeNarration,
}: ScenePromptParams): string => {
  const narrationBlock = includeNarration
    ? `\n\nCONTEXTO DA NARRAÇÃO: "${narration}"`
    : "";

  const brandContext = brandProfile.description
    ? `\n\nCONTEXTO DA MARCA: ${brandProfile.name} - ${brandProfile.description}`
    : `\n\nMARCA: ${brandProfile.name}`;

  return `Cena de vídeo promocional:

VISUAL: ${sceneVisual}
${narrationBlock}
${brandContext}

Estilo: ${brandProfile.toneOfVoice}, cinematográfico, cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.
Movimento de câmera suave, iluminação dramática profissional. Criar visual que combine com o contexto da narração e identidade da marca.

TIPOGRAFIA (se houver texto na tela): fonte BOLD CONDENSED SANS-SERIF, MAIÚSCULAS, impactante.`;
};

export const buildVeoScenePrompt = ({
  sceneVisual,
  narration,
  brandProfile,
  includeNarration,
}: ScenePromptParams): string => {
  const narrationBlock = includeNarration
    ? `\n\nNARRAÇÃO (falar em português brasileiro, voz empolgante e profissional): "${narration}"`
    : "";

  const brandContext = brandProfile.description
    ? `\n\nCONTEXTO DA MARCA: ${brandProfile.name} - ${brandProfile.description}`
    : `\n\nMARCA: ${brandProfile.name}`;

  return `Cena de vídeo promocional:

VISUAL: ${sceneVisual}
${narrationBlock}
${brandContext}

Estilo: ${brandProfile.toneOfVoice}, cinematográfico, cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.
Movimento de câmera suave, iluminação dramática profissional.

TIPOGRAFIA (se houver texto na tela): fonte BOLD CONDENSED SANS-SERIF, MAIÚSCULAS, impactante.`;
};

interface SceneImagePromptParams {
  sceneNumber: number;
  visual: string;
  narration: string;
  extraInstructions?: string;
}

export const buildClipSceneImagePrompt = ({
  sceneNumber,
  visual,
  narration,
  extraInstructions,
}: SceneImagePromptParams): string => {
  let prompt = `FORMATO OBRIGATÓRIO: 9:16 VERTICAL (REELS/STORIES)

CENA ${sceneNumber} DE UM VÍDEO - DEVE USAR A MESMA TIPOGRAFIA DA IMAGEM DE REFERÊNCIA

Descrição visual: ${visual}
Texto/Narração para incluir: ${narration}

IMPORTANTE: Esta cena faz parte de uma sequência. A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência anexada. NÃO use fontes diferentes.`;

  if (extraInstructions && extraInstructions.trim()) {
    prompt += `\n\nInstruções extras: ${extraInstructions.trim()}`;
  }

  return prompt;
};

export const buildThumbnailPrompt = (
  basePrompt: string,
  extraInstruction?: string,
): string => {
  const formatBlock = "\n\nFORMATO OBRIGATÓRIO: 9:16 VERTICAL (REELS/STORIES)";
  const noTextBlock =
    "\n\nSEM TEXTO DE NARRACAO NA IMAGEM: não gerar tipografia, títulos ou legendas na capa";
  const extra = extraInstruction?.trim();
  if (!extra) return `${basePrompt}${formatBlock}${noTextBlock}`;
  return `${basePrompt}${formatBlock}${noTextBlock}\n\nInstrucoes extras: ${extra}`;
};
