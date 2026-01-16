# Arquitetura de Geração de Imagens
## Análise Completa dos Parâmetros e Prompts

**Versão:** 1.0
**Data:** 2026-01-15
**Status:** Documentação Oficial

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Fluxo de Dados](#fluxo-de-dados)
3. [Parâmetros de Geração](#parâmetros-de-geração)
4. [Estrutura de Prompts](#estrutura-de-prompts)
5. [Modelos de IA](#modelos-de-ia)
6. [Casos de Uso](#casos-de-uso)
7. [Esquemas de Dados](#esquemas-de-dados)
8. [Boas Práticas](#boas-práticas)

---

## 🎯 Visão Geral

O sistema de geração de imagens da PokerMarketing Agency utiliza uma arquitetura híbrida que combina múltiplos modelos de IA para criar conteúdo visual personalizado para campanhas de marketing.

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                        │
│  • CampaignsList.tsx      • PostsTab.tsx                    │
│  • ClipsTab.tsx           • AdCreativesTab.tsx              │
│  • FlyerGenerator.tsx     • PlaygroundView.tsx              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│               SERVICES LAYER (Client-Side)                  │
│  • geminiService.ts       • apiClient.ts                    │
│  • api/aiApi.ts           • api/campaignsApi.ts             │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND API (Express/Node.js)                  │
│  • server/index.mjs                                         │
│  • helpers/campaign-prompts.mjs                             │
│  • helpers/image-helpers.mjs                                │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI MODELS LAYER                          │
│  • Gemini 3 Pro/Flash (Google GenAI SDK)                    │
│  • GPT-5.2 (OpenRouter SDK)                                 │
│  • Grok 4.1 (OpenRouter SDK)                                │
│  • Fal.ai (Video: Sora 2, Veo 3.1)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Fluxo de Dados

### 1. Geração de Campanha Completa

```typescript
// ENTRADA (Frontend)
{
  brandProfile: BrandProfile,
  transcript: string,
  options: GenerationOptions,
  productImages?: ImageFile[]
}
      ↓
// PROCESSAMENTO (Backend)
buildCampaignPrompt() → Gemini/OpenRouter → JSON Structure
      ↓
// ESTRUTURA GERADA
{
  videoClipScripts: [
    {
      title: string,
      scenes: Scene[],
      image_prompt: string  ← PROMPT PARA GERAÇÃO DE IMAGEM
    }
  ],
  posts: [
    {
      platform: string,
      content: string,
      image_prompt: string  ← PROMPT PARA GERAÇÃO DE IMAGEM
    }
  ],
  adCreatives: [...],
  carousels: [...]
}
      ↓
// GERAÇÃO DE IMAGENS (Assíncrona via Job Queue)
Para cada image_prompt → generateGeminiImage() → Blob Storage
```

### 2. Geração de Imagem Individual

```typescript
// PlaygroundView.tsx ou componente similar
generateImage(prompt, brandProfile, options)
      ↓
// geminiService.ts
POST /api/ai/image
{
  prompt: string,
  brandProfile: AiBrandProfile,
  aspectRatio: string,
  model: ImageModel,
  imageSize: '1K' | '2K' | '4K',
  productImages?: ImageFile[],
  styleReferenceImage?: ImageFile
}
      ↓
// server/index.mjs
buildImagePrompt() → generateGeminiImage() → Base64 Image
      ↓
// Vercel Blob Storage
put(base64Buffer) → URL pública
```

---

## ⚙️ Parâmetros de Geração

### 1. BrandProfile (Perfil da Marca)

```typescript
interface AiBrandProfile {
  name: string;                    // Nome da marca
  description: string;             // Descrição do negócio
  logoUrl?: string | null;         // URL do logo (opcional)
  primaryColor: string;            // Cor primária (HEX)
  secondaryColor: string;          // Cor secundária (HEX)
  toneOfVoice: ToneOfVoice;       // Tom de comunicação
  toneTargets?: ToneTarget[];     // Onde aplicar o tom
  creativeModel?: CreativeModel;  // Modelo de IA preferido
}

// Tipos de Tom de Voz
type ToneOfVoice =
  | "Profissional"
  | "Espirituoso"
  | "Casual"
  | "Inspirador"
  | "Técnico";

// Alvos do Tom
type ToneTarget =
  | "campaigns"
  | "posts"
  | "images"
  | "flyers"
  | "videos";
```

**Uso nos Prompts:**
```javascript
// server/index.mjs:402-404
const toneText = getToneText(brandProfile, "images");
let fullPrompt = `PROMPT TÉCNICO: ${prompt}
ESTILO VISUAL: ${toneText}, Cores: ${primaryColor}, ${secondaryColor}`;
```

### 2. Parâmetros de Imagem

```typescript
interface ImageGenerationParams {
  // CORE
  prompt: string;                    // Descrição do que gerar
  aspectRatio: string;               // Formato da imagem

  // QUALIDADE
  imageSize?: '1K' | '2K' | '4K';   // Resolução
  model?: ImageModel;                // Modelo de IA

  // REFERÊNCIAS VISUAIS
  productImages?: ImageFile[];       // Imagens de produto
  styleReferenceImage?: ImageFile;   // Referência de estilo
  personReferenceImage?: ImageFile;  // Referência de pessoa
  compositionAssets?: ImageFile[];   // Assets de composição
}

// Aspect Ratios Suportados
type AspectRatio =
  | "1:1"    // Quadrado (Posts)
  | "9:16"   // Vertical (Stories/Reels)
  | "16:9"   // Horizontal (YouTube)
  | "4:5"    // Instagram Post
  | "3:4"    // Pinterest
  | "4:3"    // Apresentações
  | "2:3"    // Vertical Clássico
  | "3:2"    // Horizontal Clássico
  | "1.91:1" // Facebook Link Preview
```

**Mapeamento de Aspect Ratio (server/index.mjs:213-226):**
```javascript
const mapAspectRatio = (ratio) => {
  const map = {
    "1:1": "1:1",
    "9:16": "9:16",
    "16:9": "16:9",
    "1.91:1": "16:9",  // Facebook converte para 16:9
    "4:5": "4:5",
    "3:4": "3:4",
    "4:3": "4:3",
    "2:3": "2:3",
    "3:2": "3:2",
  };
  return map[ratio] || "1:1";  // Default: quadrado
};
```

### 3. Parâmetros de Flyer

```typescript
interface FlyerGenerationParams {
  prompt: string;
  brandProfile: AiBrandProfile;
  logo?: ImageFile | null;
  referenceImage?: ImageFile | null;
  aspectRatio?: string;
  collabLogo?: ImageFile | null;        // Logo de parceiro
  imageSize?: '1K' | '2K' | '4K';
  compositionAssets?: ImageFile[];      // Assets adicionais
}
```

### 4. Parâmetros de Edição de Imagem

```typescript
interface ImageEditParams {
  image: ImageFile;              // Imagem base
  prompt: string;                // Instrução de edição
  mask?: ImageFile;              // Máscara de região (opcional)
  referenceImage?: ImageFile;    // Referência de estilo (opcional)
  maskRegion?: {                 // Região rectangular
    x: number;
    y: number;
    width: number;
    height: number;
    imageWidth: number;
    imageHeight: number;
  };
}
```

---

## 📝 Estrutura de Prompts

### 1. Prompt de Campanha (buildCampaignPrompt)

**Localização:** `server/helpers/campaign-prompts.mjs:1-51`

```javascript
function buildCampaignPrompt(
  brandProfile,
  transcript,
  quantityInstructions,
  toneText
) {
  return `
**PERFIL DA MARCA:**
- Nome: ${brandProfile.name}
- Descrição: ${brandProfile.description}
${toneText ? `- Tom de Voz: ${toneText}` : ""}
- Cores Oficiais: Primária ${brandProfile.primaryColor},
                  Secundária ${brandProfile.secondaryColor}

**CONTEÚDO PARA ESTRUTURAR:**
${transcript}

**QUANTIDADES EXATAS A GERAR (OBRIGATÓRIO SEGUIR):**
${quantityInstructions}

**REGRAS CRÍTICAS PARA IMAGE_PROMPT (OBRIGATÓRIO):**

1. **IDIOMA (REGRA INVIOLÁVEL):**
   - TODOS os image_prompts DEVEM ser escritos em PORTUGUÊS
   - QUALQUER texto que apareça na imagem DEVE estar em PORTUGUÊS
   - PROIBIDO usar inglês nos textos da imagem

2. **ALINHAMENTO CONTEÚDO-IMAGEM:**
   - O image_prompt DEVE refletir o tema da legenda (content)
   - NUNCA gere prompts genéricos desconectados do conteúdo

3. **ELEMENTOS OBRIGATÓRIOS:**
   - Cores da marca (${primaryColor}, ${secondaryColor})
   - Estilo cinematográfico, luxuoso e premium
   - Textos em fonte bold condensed sans-serif

**REGRAS PARA CARROSSÉIS (carousels):**
1. Cada carrossel deve ter 5 slides
2. O cover_prompt DEVE seguir AS MESMAS REGRAS do image_prompt
3. Cada slide tem: slide, visual, text (CURTO, máx 10 palavras)
4. Slide 1 = título/gancho, slides 2-4 = conteúdo, slide 5 = CTA
5. Tipografia e estilo visual CONSISTENTES em todos os slides
6. Todos os textos em PORTUGUÊS
`;
}
```

**Exemplo de Saída (JSON):**
```json
{
  "videoClipScripts": [
    {
      "title": "Torneio Exclusivo de Poker",
      "hook": "Prepare-se para o maior torneio do ano!",
      "scenes": [
        {
          "scene": 1,
          "visual": "Mesa de poker luxuosa, fichas empilhadas",
          "narration": "O maior torneio de poker está chegando",
          "duration_seconds": 3
        }
      ],
      "image_prompt": "Mesa de poker premium com iluminação cinematográfica, fichas douradas empilhadas, ambiente luxuoso com cores azul royal e dourado, texto em MAIÚSCULAS 'TORNEIO EXCLUSIVO', fonte bold condensed sans-serif estilo Bebas Neue, atmosfera elegante e profissional",
      "audio_script": "O maior torneio de poker está chegando..."
    }
  ],
  "posts": [
    {
      "platform": "Instagram",
      "content": "🃏 TORNEIO EXCLUSIVO DE POKER! ...",
      "hashtags": ["#poker", "#torneio", "#exclusive"],
      "image_prompt": "Design de post Instagram 1:1, tema poker luxuoso, cores azul royal e dourado, texto 'TORNEIO EXCLUSIVO' em destaque com tipografia bold condensed sans-serif, cartas de baralho estilizadas, iluminação dramática, estilo cinematográfico premium"
    }
  ]
}
```

### 2. Prompt de Imagem (buildImagePrompt)

**Localização:** `server/index.mjs:393-444`

```javascript
const buildImagePrompt = (
  prompt,
  brandProfile,
  hasLogo,
  hasProductImages,
  hasStyleReference,
  jsonPrompt = null,
) => {
  const toneText = getToneText(brandProfile, "images");
  let fullPrompt = `PROMPT TÉCNICO: ${prompt}
ESTILO VISUAL: ${toneText}, Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}. Cinematográfico e Luxuoso.`;

  if (jsonPrompt) {
    fullPrompt += `

JSON ESTRUTURADO (REFERÊNCIA):
\`\`\`json
${jsonPrompt}
\`\`\``;
  }

  if (hasLogo) {
    fullPrompt += `

**LOGO DA MARCA (OBRIGATÓRIO):**
- Use o LOGO EXATO fornecido na imagem de referência anexada
- NÃO CRIE UM LOGO DIFERENTE
- O logo deve aparecer de forma clara e legível
- Mantenha as proporções e cores originais do logo`;
  }

  if (hasProductImages) {
    fullPrompt += `

**IMAGENS DE PRODUTO (OBRIGATÓRIO):**
- As imagens anexadas são referências de produto
- Preserve fielmente o produto (forma, cores e detalhes)
- O produto deve aparecer com destaque na composição`;
  }

  if (hasStyleReference) {
    fullPrompt += `

**TIPOGRAFIA OBRIGATÓRIA PARA CENAS (REGRA INVIOLÁVEL):**
- Use EXCLUSIVAMENTE fonte BOLD CONDENSED SANS-SERIF
- Estilo: Bebas Neue, Oswald, Impact, ou similar
- TODOS os textos devem usar a MESMA família tipográfica
- PROIBIDO misturar estilos
- Títulos em MAIÚSCULAS com peso BLACK ou EXTRA-BOLD
- PROIBIDO: fontes script/cursivas, serifadas clássicas,
             handwriting, ou fontes finas/light`;
  }

  return fullPrompt;
};
```

### 3. Prompt de Flyer (buildFlyerPrompt)

**Localização:** `server/index.mjs:531-577`

```javascript
const buildFlyerPrompt = (brandProfile) => {
  const toneText = getToneText(brandProfile, "flyers");

  return `
**PERSONA:** Você é Diretor de Arte Sênior de uma agência
de publicidade internacional de elite.

**MISSÃO CRÍTICA:**
Crie materiais visuais de alta qualidade que representem
fielmente a marca e comuniquem a mensagem de forma impactante.
Se houver valores ou informações importantes no conteúdo,
destaque-os visualmente (fonte negrito, cor vibrante ou
tamanho maior).

**IDENTIDADE DA MARCA - ${brandProfile.name}:**
${brandProfile.description ? `- Descrição: ${brandProfile.description}` : ""}
${toneText ? `- Tom de Comunicação: ${toneText}` : ""}
- Cor Primária (dominante): ${brandProfile.primaryColor}
- Cor de Acento (destaques, CTAs): ${brandProfile.secondaryColor}

**PRINCÍPIOS DE DESIGN PROFISSIONAL:**

1. HARMONIA CROMÁTICA:
   - Use APENAS as cores da marca
   - Crie variações tonais para profundidade
   - Evite cores aleatórias

2. RESPIRAÇÃO VISUAL (Anti-Poluição):
   - Menos é mais: priorize espaços negativos estratégicos
   - Não sobrecarregue com elementos decorativos
   - Hierarquia visual clara

3. TIPOGRAFIA CINEMATOGRÁFICA:
   - Máximo 2-3 famílias tipográficas diferentes
   - Contraste forte entre títulos (bold/black) e corpo
     (regular/medium)

4. ESTÉTICA PREMIUM SEM CLICHÊS:
   - Evite excesso de efeitos (brilhos, sombras, neons)
   - Prefira elegância sutil a ostentação visual

**ATMOSFERA FINAL:**
- Alta classe, luxo e sofisticação
- Cinematográfico mas não exagerado
- Profissional mas criativo
- Impactante mas elegante`;
};
```

### 4. Prompts de Vídeo (Clips/Scenes)

**Localização:** `src/ai-prompts/clipsPrompts.ts`

#### Sora Scene Prompt
```typescript
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

Estilo: ${brandProfile.toneOfVoice}, cinematográfico,
cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.
Movimento de câmera suave, iluminação dramática profissional.
Criar visual que combine com o contexto da narração e
identidade da marca.

TIPOGRAFIA (se houver texto na tela): fonte BOLD CONDENSED
SANS-SERIF, MAIÚSCULAS, impactante.`;
};
```

#### Veo Scene Prompt
```typescript
export const buildVeoScenePrompt = ({
  sceneVisual,
  narration,
  brandProfile,
  includeNarration,
}: ScenePromptParams): string => {
  const narrationBlock = includeNarration
    ? `\n\nNARRAÇÃO (falar em português brasileiro, voz impactante, empolgante e profissional): "${narration}"`
    : "";

  return `Cena de vídeo promocional:

VISUAL: ${sceneVisual}
${narrationBlock}
${brandContext}

Estilo: ${brandProfile.toneOfVoice}, cinematográfico,
cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.
Movimento de câmera suave, iluminação dramática profissional.

TIPOGRAFIA (se houver texto na tela): fonte BOLD CONDENSED
SANS-SERIF, MAIÚSCULAS, impactante.`;
};
```

#### Clip Scene Image Prompt
```typescript
export const buildClipSceneImagePrompt = ({
  sceneNumber,
  visual,
  narration,
  extraInstructions,
}: SceneImagePromptParams): string => {
  let prompt = `FORMATO OBRIGATÓRIO: 9:16 VERTICAL (REELS/STORIES)

CENA ${sceneNumber} DE UM VÍDEO - DEVE USAR A MESMA TIPOGRAFIA
DA IMAGEM DE REFERÊNCIA

Descrição visual: ${visual}
Texto/Narração para incluir: ${narration}

IMPORTANTE: Esta cena faz parte de uma sequência. A tipografia
(fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de
referência anexada. NÃO use fontes diferentes.`;

  if (extraInstructions && extraInstructions.trim()) {
    prompt += `\n\nInstruções extras: ${extraInstructions.trim()}`;
  }

  return prompt;
};
```

#### Thumbnail Prompt
```typescript
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
```

### 5. Prompt de Quick Post

**Localização:** `server/index.mjs:579-598`

```javascript
const buildQuickPostPrompt = (brandProfile, context) => {
  const toneText = getToneText(brandProfile, "posts");

  return `
Você é Social Media Manager de elite. Crie um post de
INSTAGRAM de alta performance.

**CONTEXTO:**
${context}

**MARCA:** ${brandProfile.name}
${brandProfile.description ? ` - ${brandProfile.description}` : ""}
${toneText ? ` | **TOM:** ${toneText}` : ""}

**REGRAS DE OURO:**
1. GANCHO EXPLOSIVO com emojis relevantes ao tema.
2. DESTAQUE informações importantes (valores, datas, ofertas).
3. CTA FORTE (ex: Link na Bio, Saiba Mais).
4. 5-8 Hashtags estratégicas relevantes à marca e ao conteúdo.

Responda apenas JSON:
{
  "platform": "Instagram",
  "content": "Texto Legenda",
  "hashtags": ["tag1", "tag2"],
  "image_prompt": "descrição visual"
}`;
};
```

---

## 🤖 Modelos de IA

### 1. Modelos Criativos (Texto)

**Localização:** `src/config/ai-models.ts`

```typescript
export const CREATIVE_MODELS = [
  // GOOGLE GEMINI (Native)
  {
    id: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro',
    provider: 'Google',
    type: 'native',
    capabilities: { text: true, image: true, vision: true },
    costTier: 'medium',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    provider: 'Google',
    type: 'native',
    capabilities: { text: true, image: true, vision: true },
    costTier: 'low',
  },

  // OPENAI (via OpenRouter)
  {
    id: 'openai/gpt-5.2',
    label: 'GPT-5.2',
    provider: 'OpenAI',
    type: 'openrouter',
    capabilities: { text: true, image: false, vision: true },
    costTier: 'high',
  },

  // xAI (via OpenRouter)
  {
    id: 'x-ai/grok-4.1-fast',
    label: 'Grok 4.1 Fast',
    provider: 'xAI',
    type: 'openrouter',
    capabilities: { text: true, image: false, vision: true },
    costTier: 'medium',
  },
];
```

**Defaults (server/index.mjs:180-183):**
```javascript
const DEFAULT_TEXT_MODEL = "gemini-3-flash-preview";
const DEFAULT_FAST_TEXT_MODEL = "gemini-3-flash-preview";
const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview";
const DEFAULT_ASSISTANT_MODEL = "gemini-3-flash-preview";
```

### 2. Modelos de Imagem

```typescript
// src/types.ts:157
export type ImageModel = "gemini-3-pro-image-preview";

// src/config/ai-models.ts:179-182
export const IMAGE_GENERATION_MODELS = {
  PRIMARY: 'gemini-3-pro-image-preview',
} as const;
```

**Configuração de Geração (server/index.mjs:257-268):**
```javascript
const response = await ai.models.generateContent({
  model: 'gemini-3-pro-image-preview',
  contents: { parts },
  config: {
    imageConfig: {
      aspectRatio: mapAspectRatio(aspectRatio),
      imageSize,  // '1K' | '2K' | '4K'
    },
  },
});
```

### 3. Modelos de Vídeo

```typescript
// src/types.ts:161-166
export type VeoVideoModel = "veo-3.1-fast-generate-preview";
export type FalVideoModel =
  | "fal-ai/sora-2/text-to-video"        // OpenAI Sora 2
  | "fal-ai/veo3.1/fast";                // Google Veo 3.1

export type VideoModel = VeoVideoModel | FalVideoModel;

// Helper
export const isFalModel = (model: VideoModel): model is FalVideoModel =>
  model.startsWith("fal-ai/");
```

**Configuração Fal.ai:**
```javascript
// server/index.mjs
fal.config({ credentials: process.env.FAL_KEY });

// Sora 2
const result = await fal.subscribe("fal-ai/sora-2/text-to-video", {
  input: {
    prompt,
    aspect_ratio: aspectRatio,
    ...
  }
});

// Veo 3.1
const result = await fal.subscribe("fal-ai/veo3.1/fast", {
  input: {
    prompt,
    aspect_ratio: aspectRatio,
    ...
  }
});
```

---

## 🎬 Casos de Uso

### Caso 1: Geração de Campanha Completa

```typescript
// 1. USUÁRIO ENVIA TRANSCRIÇÃO
const campaign = await generateCampaign(
  brandProfile,
  {
    transcript: "Novo torneio de poker com prêmios de R$ 100.000",
    productImages: [logoFile, photoFile],
  },
  {
    videoClipScripts: { generate: true, count: 3 },
    posts: {
      instagram: { generate: true, count: 5 },
      facebook: { generate: true, count: 3 },
    },
    adCreatives: {
      facebook: { generate: true, count: 2 },
    },
  }
);

// 2. BACKEND GERA ESTRUTURA
// POST /api/ai/campaign
// → buildCampaignPrompt()
// → Gemini/OpenRouter gera JSON
// → Retorna campaign object

// 3. BACKEND PROCESSA IMAGENS (Async)
campaign.posts.forEach(async (post) => {
  // Adiciona job à fila
  await addJob({
    type: 'generate_image',
    data: {
      prompt: post.image_prompt,
      brandProfile,
      aspectRatio: '1:1',
      model: 'gemini-3-pro-image-preview',
      imageSize: '2K',
    },
    metadata: {
      post_id: post.id,
      campaign_id: campaign.id,
    }
  });
});

// 4. WORKER PROCESSA JOBS
// generateGeminiImage() → Blob Storage → Atualiza DB
```

### Caso 2: Geração de Imagem no Playground

```typescript
// PlaygroundView.tsx
const handleGenerate = async () => {
  const imageUrl = await generateImage(
    userPrompt,
    brandProfile,
    {
      aspectRatio: '9:16',
      model: 'gemini-3-pro-image-preview',
      imageSize: '4K',
      productImages: uploadedImages,
    }
  );

  // Salva na galeria
  await saveToGallery({
    src: imageUrl,
    prompt: userPrompt,
    source: 'playground',
    model: 'gemini-3-pro-image-preview',
    aspectRatio: '9:16',
  });
};
```

### Caso 3: Edição de Imagem com Máscara

```typescript
// ImagePreviewModal.tsx
const handleEdit = async () => {
  const editedUrl = await editImage(
    originalImage.base64,
    originalImage.mimeType,
    editPrompt,
    maskData ? {
      base64: maskData.base64,
      mimeType: 'image/png',
    } : undefined,
    referenceImage
  );

  // Compara lado a lado
  setCompareImages({
    before: originalUrl,
    after: editedUrl,
  });
};
```

### Caso 4: Geração de Flyer com Logo

```typescript
// FlyerGenerator.tsx
const handleGenerateFlyer = async () => {
  const flyerUrl = await generateFlyer(
    userPrompt,
    brandProfile,
    logoFile ? {
      base64: logoFile.base64,
      mimeType: logoFile.mimeType,
    } : null,
    referenceImage,
    aspectRatio,
    'gemini-3-pro-image-preview',
    collabLogo,
    '4K'
  );

  setGeneratedFlyer(flyerUrl);
};
```

### Caso 5: Geração de Vídeo (Clip Scene)

```typescript
// ClipCard.tsx
const handleGenerateVideo = async (scene) => {
  // Gera imagem da cena primeiro
  const sceneImageUrl = await generateImage(
    buildClipSceneImagePrompt({
      sceneNumber: scene.scene,
      visual: scene.visual,
      narration: scene.narration,
    }),
    brandProfile,
    {
      aspectRatio: '9:16',
      model: 'gemini-3-pro-image-preview',
      imageSize: '2K',
    }
  );

  // Gera vídeo a partir da imagem
  const videoUrl = await generateVideo(
    buildVeoScenePrompt({
      sceneVisual: scene.visual,
      narration: scene.narration,
      brandProfile,
      includeNarration: true,
    }),
    '9:16',
    'fal-ai/veo3.1/fast',
    { base64: sceneImageUrl, mimeType: 'image/png' },
    false,
    true  // generateAudio
  );

  return videoUrl;
};
```

---

## 📊 Esquemas de Dados

### Campaign Schema (JSON)

**Localização:** `server/index.mjs:658-750`

```typescript
const campaignSchema = {
  type: Type.OBJECT,
  properties: {
    videoClipScripts: {
      type: Type.ARRAY,
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
                duration_seconds: { type: Type.INTEGER },
              },
              required: ["scene", "visual", "narration", "duration_seconds"],
            },
          },
          image_prompt: { type: Type.STRING },  // ← PROMPT
          audio_script: { type: Type.STRING },
        },
        required: ["title", "hook", "scenes", "image_prompt", "audio_script"],
      },
    },
    posts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          content: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          image_prompt: { type: Type.STRING },  // ← PROMPT
        },
        required: ["platform", "content", "hashtags", "image_prompt"],
      },
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
          image_prompt: { type: Type.STRING },  // ← PROMPT
        },
        required: ["platform", "headline", "body", "cta", "image_prompt"],
      },
    },
    carousels: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          cover_prompt: { type: Type.STRING },  // ← PROMPT (capa)
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                slide: { type: Type.INTEGER },
                visual: { type: Type.STRING },  // ← DESCRIÇÃO VISUAL
                text: { type: Type.STRING },
              },
              required: ["slide", "visual", "text"],
            },
          },
        },
        required: ["title", "hook", "cover_prompt", "slides"],
      },
    },
  },
  required: ["videoClipScripts", "posts", "adCreatives", "carousels"],
};
```

### Image Prompt JSON Schema

**Localização:** `server/index.mjs:625-655`

```typescript
{
  "subject": string,          // Sujeito principal
  "environment": string,      // Ambiente/cenário
  "style": string,            // Estilo visual
  "camera": string,           // Ângulo de câmera
  "text": {
    "enabled": boolean,       // Texto na imagem?
    "content": string,        // Conteúdo do texto
    "language": "pt-BR",      // Idioma
    "placement": string,      // Posição
    "font": string            // Fonte
  },
  "output": {
    "aspect_ratio": string,   // Ex: "9:16"
    "resolution": "2K"        // "1K" | "2K" | "4K"
  }
}
```

### Video Prompt JSON Schema

**Localização:** `server/index.mjs:603-623`

```typescript
{
  "visual_style": {
    "aesthetic": string,
    "color_palette": string,
    "lighting": string
  },
  "camera": {
    "movement": string,
    "start_position": string,
    "end_position": string
  },
  "subject": {
    "character": string,
    "action": string,
    "expression": string
  },
  "environment": {
    "setting": string,
    "props": string[],
    "atmosphere": string
  },
  "scene_sequence": [
    { "beat": 1, "action": string },
    { "beat": 2, "action": string }
  ],
  "technical": {
    "duration_seconds": number,
    "aspect_ratio": "16:9" | "9:16",
    "quality_tokens": string[]
  }
}
```

---

## ✅ Boas Práticas

### 1. Construção de Prompts

#### ✅ DO (Faça)
```typescript
// Prompts específicos e contextualizados
const prompt = buildImagePrompt(
  "Mesa de poker luxuosa com fichas douradas",
  brandProfile,
  hasLogo,
  hasProductImages,
  hasStyleReference
);

// Incluir cores da marca
`Cores: ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}`

// Especificar tipografia
`Fonte BOLD CONDENSED SANS-SERIF, estilo Bebas Neue`

// Idioma explícito
`TODOS os textos em PORTUGUÊS`
```

#### ❌ DON'T (Não faça)
```typescript
// Prompts genéricos
const prompt = "Criar imagem de poker";

// Ignorar identidade da marca
// (sem cores, sem tom de voz)

// Misturar idiomas
"Create poker tournament image with texto em português"

// Prompts ambíguos
"Fazer algo legal com fichas"
```

### 2. Gerenciamento de Aspect Ratio

```typescript
// ✅ Usar constantes
const ASPECT_RATIOS = {
  SQUARE: '1:1',
  VERTICAL: '9:16',
  HORIZONTAL: '16:9',
  INSTAGRAM_POST: '4:5',
};

// ✅ Validar antes de enviar
const validRatio = mapAspectRatio(userInput);

// ❌ Hardcoded strings
const ratio = "9:16"; // Sem validação
```

### 3. Tratamento de Erros

```typescript
// ✅ Retry com backoff exponencial
const withRetry = async (fn, maxRetries = 3, delayMs = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 503 && attempt < maxRetries) {
        await new Promise(resolve =>
          setTimeout(resolve, delayMs * attempt)
        );
        continue;
      }
      throw error;
    }
  }
};

// ✅ Logging de falhas
await logAiUsage(sql, {
  organizationId,
  endpoint: '/api/ai/image',
  operation: 'image',
  model,
  latencyMs: timer(),
  status: 'failed',
  error: error.message,
});
```

### 4. Otimização de Performance

```typescript
// ✅ Processamento assíncrono via job queue
await addJob({
  type: 'generate_image',
  data: { prompt, brandProfile, ... },
  priority: 'normal',
});

// ✅ Cache de resultados
const cachedUserId = getCachedUserId(clerkId);
if (cachedUserId) return cachedUserId;

// ✅ Limitar tamanho de payloads
app.use(express.json({ limit: "50mb" }));

// ❌ Processamento síncrono bloqueante
for (const post of posts) {
  await generateImage(post.image_prompt); // BLOQUEIA
}
```

### 5. Segurança

```typescript
// ✅ Validar entrada do usuário
if (!prompt || prompt.trim().length === 0) {
  throw new Error('Prompt inválido');
}

// ✅ Sanitizar file uploads
const sanitizedBase64 = base64.replace(/^data:image\/\w+;base64,/, '');

// ✅ Rate limiting (via Clerk)
const orgContext = createOrgContext(auth);
if (!orgContext.hasPermission(PERMISSIONS.CREATE_CAMPAIGN)) {
  throw new PermissionDeniedError();
}

// ❌ Confiar cegamente em input
const image = await generateImage(req.body.prompt); // PERIGOSO
```

### 6. Testes

```typescript
// ✅ Testes unitários de prompt builders
describe('buildCampaignPrompt', () => {
  it('deve incluir cores da marca', () => {
    const prompt = buildCampaignPrompt(mockBrandProfile, ...);
    expect(prompt).toContain(mockBrandProfile.primaryColor);
  });

  it('deve aplicar tom de voz', () => {
    const prompt = buildCampaignPrompt({
      ...mockBrandProfile,
      toneOfVoice: 'Espirituoso',
    }, ...);
    expect(prompt).toContain('Espirituoso');
  });
});

// ✅ Testes de integração
describe('POST /api/ai/image', () => {
  it('deve gerar imagem com sucesso', async () => {
    const response = await request(app)
      .post('/api/ai/image')
      .send(mockImageRequest)
      .expect(200);

    expect(response.body.imageUrl).toBeDefined();
  });
});
```

---

## 🔗 Referências

### Arquivos Principais

- **Configuração de Modelos:** `src/config/ai-models.ts`
- **Tipos TypeScript:** `src/types.ts`
- **Serviço de IA (Client):** `src/services/geminiService.ts`
- **API Client:** `src/services/api/aiApi.ts`
- **Backend Principal:** `server/index.mjs`
- **Prompts de Campanha:** `server/helpers/campaign-prompts.mjs`
- **Prompts de Clips:** `src/ai-prompts/clipsPrompts.ts`
- **Prompts de Logo:** `src/ai-prompts/logoPrompts.ts`

### Documentação Externa

- **Google GenAI SDK:** https://ai.google.dev/
- **OpenRouter API:** https://openrouter.ai/docs
- **Fal.ai (Sora/Veo):** https://fal.ai/models
- **Vercel Blob Storage:** https://vercel.com/docs/storage/vercel-blob

### Endpoints da API

```
POST /api/ai/image              - Gerar imagem
POST /api/ai/flyer              - Gerar flyer
POST /api/ai/edit-image         - Editar imagem
POST /api/ai/text               - Gerar texto
POST /api/ai/speech             - Gerar áudio TTS
POST /api/ai/campaign           - Gerar campanha completa
POST /api/ai/video              - Gerar vídeo
POST /api/ai/convert-prompt     - Converter prompt para JSON
POST /api/ai/enhance-prompt     - Melhorar prompt
POST /api/ai/extract-colors     - Extrair cores de logo
```

---

## 📝 Changelog

**v1.0 (2026-01-15)**
- Documentação inicial completa
- Análise de todos os prompts e parâmetros
- Exemplos de código e casos de uso
- Boas práticas e padrões arquiteturais

---

**Autor:** Claude Code (Senior Architect)
**Última Atualização:** 2026-01-15
**Status:** Documentação de Produção
