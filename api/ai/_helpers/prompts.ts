/**
 * Prompt Templates for AI Generation
 * Centralized prompts for consistent output across all AI services
 */

import type { BrandProfile, ToneTarget } from './types';

// Default targets that use tone (backwards compatible)
const defaultToneTargets: ToneTarget[] = ['campaigns', 'posts', 'images', 'flyers'];

/**
 * Check if a specific target should use the tone
 */
export const shouldUseTone = (brandProfile: BrandProfile, target: ToneTarget): boolean => {
  const targets = brandProfile.toneTargets || defaultToneTargets;
  return targets.includes(target);
};

/**
 * Get tone text for prompts (returns empty string if tone should not be used)
 */
export const getToneText = (brandProfile: BrandProfile, target: ToneTarget): string => {
  return shouldUseTone(brandProfile, target) ? brandProfile.toneOfVoice : '';
};

/**
 * Build image prompt with brand context
 */
export const buildImagePrompt = (
  prompt: string,
  brandProfile: BrandProfile,
  hasStyleReference: boolean = false
): string => {
  const toneText = getToneText(brandProfile, 'images');

  let fullPrompt = `PROMPT TÉCNICO: ${prompt}
ESTILO VISUAL: ${toneText ? `${toneText}, ` : ''}Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}. Cinematográfico e Luxuoso.`;

  // Typography rules ONLY for scene images (when style reference is provided)
  if (hasStyleReference) {
    fullPrompt = `${fullPrompt}

**TIPOGRAFIA OBRIGATÓRIA PARA CENAS (REGRA INVIOLÁVEL):**
- Use EXCLUSIVAMENTE fonte BOLD CONDENSED SANS-SERIF (estilo Bebas Neue, Oswald, Impact, ou similar)
- TODOS os textos devem usar a MESMA família tipográfica - PROIBIDO misturar estilos
- Títulos em MAIÚSCULAS com peso BLACK ou EXTRA-BOLD
- Estilo agressivo e impactante, típico de marketing esportivo/gaming de elite
- PROIBIDO: fontes script/cursivas, serifadas clássicas, handwriting, ou fontes finas/light
- A tipografia deve transmitir FORÇA, PODER e SOFISTICAÇÃO

INSTRUÇÕES CRÍTICAS DE CONSISTÊNCIA VISUAL:
A imagem de referência anexada é o GUIA DE ESTILO ABSOLUTO. Você DEVE copiar EXATAMENTE:

1. **TIPOGRAFIA (CRÍTICO)**:
   - Use a MESMA FONTE/FAMÍLIA tipográfica da referência
   - Copie o MESMO PESO da fonte
   - Mantenha o MESMO ESTILO de texto

2. **CORES E TRATAMENTO**:
   - Use EXATAMENTE a mesma paleta de cores
   - Mesma intensidade, saturação e brilho

3. **COMPOSIÇÃO**:
   - Mesmo estilo de layout e distribuição de elementos`;
  }

  return fullPrompt;
};

/**
 * Build flyer prompt with brand guidelines
 */
export const buildFlyerPrompt = (brandProfile: BrandProfile): string => {
  const toneText = getToneText(brandProfile, 'flyers');

  return `
**PERSONA:** Você é Diretor de Arte Sênior de uma agência de publicidade internacional de elite.

**MISSÃO CRÍTICA:**
Crie materiais visuais de alta qualidade que representem fielmente a marca e comuniquem a mensagem de forma impactante.
Se houver valores ou informações importantes no conteúdo, destaque-os visualmente (fonte negrito, cor vibrante ou tamanho maior).

**REGRAS DE CONTEÚDO:**
1. Destaque informações importantes (valores, datas, horários) de forma clara e legível.
2. Use a marca ${brandProfile.name}.
3. Siga a identidade visual da marca em todos os elementos.

**IDENTIDADE DA MARCA - ${brandProfile.name}:**
${brandProfile.description ? `- Descrição: ${brandProfile.description}` : ''}
${toneText ? `- Tom de Comunicação: ${toneText}` : ''}
- Cor Primária (dominante): ${brandProfile.primaryColor}
- Cor de Acento (destaques, CTAs): ${brandProfile.secondaryColor}

**PRINCÍPIOS DE DESIGN PROFISSIONAL:**

1. HARMONIA CROMÁTICA:
   - Use APENAS as cores da marca: ${brandProfile.primaryColor} (primária) e ${brandProfile.secondaryColor} (acento)
   - Crie variações tonais dessas cores para profundidade
   - Evite introduzir cores aleatórias

2. RESPIRAÇÃO VISUAL (Anti-Poluição):
   - Menos é mais: priorize espaços negativos estratégicos
   - Não sobrecarregue com elementos decorativos desnecessários
   - Hierarquia visual clara

3. TIPOGRAFIA CINEMATOGRÁFICA:
   - Máximo 2-3 famílias tipográficas diferentes
   - Contraste forte entre títulos (bold/black) e corpo (regular/medium)

4. COMPOSIÇÃO CINEMATOGRÁFICA:
   - Pense como diretor de fotografia: onde o olho deve pousar primeiro?
   - Profundidade através de camadas

5. ESTÉTICA PREMIUM SEM CLICHÊS:
   - Evite excesso de efeitos (brilhos, sombras, neons chamativos)
   - Prefira elegância sutil a ostentação visual

**ATMOSFERA FINAL:**
- Alta classe, luxo e sofisticação
- Cinematográfico mas não exagerado
- Profissional mas criativo
- Impactante mas elegante`;
};

/**
 * Build edit image prompt
 */
export const buildEditImagePrompt = (editInstruction: string): string => {
  return `DESIGNER SÊNIOR: Execute alteração profissional: ${editInstruction}. Texto original e logos são SAGRADOS, não cubra informações importantes (valores, datas, contatos).`;
};

/**
 * Build quick post prompt
 */
export const buildQuickPostPrompt = (brandProfile: BrandProfile, context: string): string => {
  const toneText = getToneText(brandProfile, 'posts');

  return `
Você é Social Media Manager de elite. Crie um post de INSTAGRAM de alta performance.

**CONTEXTO:**
${context}

**MARCA:** ${brandProfile.name}${brandProfile.description ? ` - ${brandProfile.description}` : ''}${toneText ? ` | **TOM:** ${toneText}` : ''}

**REGRAS DE OURO:**
1. GANCHO EXPLOSIVO com emojis relevantes ao tema.
2. DESTAQUE informações importantes (valores, datas, ofertas).
3. CTA FORTE (ex: Link na Bio, Saiba Mais).
4. 5-8 Hashtags estratégicas relevantes à marca e ao conteúdo.

Responda apenas JSON:
{ "platform": "Instagram", "content": "Texto Legenda", "hashtags": ["tag1", "tag2"], "image_prompt": "descrição visual" }`;
};

/**
 * Build campaign prompt with options
 */
export const buildCampaignPrompt = (
  brandProfile: BrandProfile,
  transcript: string,
  quantityInstructions: string
): string => {
  const toneText = getToneText(brandProfile, 'campaigns');

  return `
**PERFIL DA MARCA:**
- Nome: ${brandProfile.name}
- Descrição: ${brandProfile.description}
${toneText ? `- Tom de Voz: ${toneText}` : ''}
- Cores Oficiais: Primária ${brandProfile.primaryColor}, Secundária ${brandProfile.secondaryColor}

**CONTEÚDO PARA ESTRUTURAR:**
${transcript}

**QUANTIDADES EXATAS A GERAR (OBRIGATÓRIO SEGUIR):**
${quantityInstructions}

**MISSÃO:** Gere uma campanha completa em JSON com as QUANTIDADES EXATAS especificadas acima. Use prompts cinematográficos para imagens.`;
};

/**
 * Video prompt JSON conversion system prompt
 */
export const getVideoPromptSystemPrompt = (duration: number, aspectRatio: string): string => {
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

Mantenha a essência do prompt original mas expanda com detalhes visuais cinematográficos.`;
};
