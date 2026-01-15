# Geração de Vídeos com Veo 3.1

Este documento descreve a implementação completa da geração de vídeos de cenas e clips usando o Google Veo 3.1 no projeto PokerMarketing-Agency.

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Fluxo de Geração Padrão](#fluxo-de-geração-padrão)
4. [Modo First & Last Frame (Interpolação)](#modo-first--last-frame-interpolação)
5. [Estrutura de Prompts](#estrutura-de-prompts)
6. [API e Endpoints](#api-e-endpoints)
7. [Configurações e Parâmetros](#configurações-e-parâmetros)
8. [Logs e Debugging](#logs-e-debugging)

---

## Visão Geral

O sistema suporta dois modos de geração de vídeos com Veo 3.1:

| Modo | Descrição | Duração | Uso |
|------|-----------|---------|-----|
| **Padrão** | Gera vídeo a partir de prompt + imagem de referência | 4s, 6s ou 8s | Geração normal de cenas |
| **First & Last Frame** | Interpola entre duas imagens (início e fim) | 8s (fixo) | Transições suaves entre cenas |

### Modelos Disponíveis

```typescript
type VideoModel =
  | "veo-3.1-fast-generate-preview"  // Google Veo 3.1 (recomendado)
  | "fal-ai/sora-2/text-to-video";   // OpenAI Sora 2 (alternativa)
```

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
│  components/tabs/ClipsTab.tsx                                   │
│  ├── ClipSettingsModal (toggle First & Last Frame)              │
│  ├── handleGenerateVideo() - lógica principal                   │
│  └── buildPromptForVeo() - construção de prompts                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SERVICES (Cliente)                           │
│  services/apiClient.ts (compat -> services/api)                                          │
│  ├── generateVideo() - chamada HTTP para /api/ai/video          │
│  ├── queueVideoJob() - enfileira job para background            │
│  └── VideoJobConfig - interface de configuração                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND                                    │
│  server/index.mjs | server/dev-api.mjs                          │
│  ├── POST /api/ai/video - endpoint principal                    │
│  ├── generateVideoWithGoogleVeo() - API Google nativa           │
│  ├── generateVideoWithFal() - FAL.ai fallback                   │
│  └── processVideoGenerationJob() - worker BullMQ                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROVIDERS EXTERNOS                            │
│  ├── Google GenAI SDK (@google/genai)                           │
│  │   └── ai.models.generateVideos() - API nativa                │
│  └── FAL.ai (fallback)                                          │
│      ├── fal-ai/veo3.1/fast                                     │
│      └── fal-ai/veo3.1/fast/image-to-video                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Geração Padrão

### 1. Construção do Prompt

O prompt é construído em duas etapas:

**Etapa 1: Prompt Genérico** (`buildPromptForVeo`)
```typescript
const buildPromptForVeo = (sceneNumber: number): string => {
  const currentScene = scenes.find((s) => s.sceneNumber === sceneNumber);

  return `Cena de vídeo promocional:

VISUAL: ${currentScene.visual}

NARRAÇÃO: "${currentScene.narration}"

CONTEXTO DA MARCA: ${brandProfile.name} - ${brandProfile.description}

Estilo: ${brandProfile.toneOfVoice}, cinematográfico,
cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.

TIPOGRAFIA: fonte BOLD CONDENSED SANS-SERIF, MAIÚSCULAS, impactante.`;
};
```

**Etapa 2: Conversão para JSON** (`convertToJsonPrompt`)
```typescript
const jsonPrompt = await convertToJsonPrompt(
  genericPrompt,
  currentScene.duration,
  "9:16"
);
```

O JSON estruturado inclui:
- `visual_style`: estética, paleta de cores, iluminação
- `camera`: movimentos, posição inicial/final
- `subject`: objeto principal, ação
- `environment`: cenário, atmosfera
- `scene_sequence`: 2-3 beats de ação
- `typography`: regras de fonte
- `audio_context`: narração, tom
- `technical`: duração, aspect ratio, qualidade

### 2. Obtenção da Imagem de Referência

```typescript
// Prioridade: imagem da cena > logo da marca
const sceneImage = sceneImages[sceneNumber];
let imageUrl = sceneImage?.httpUrl;

// Upload para blob se necessário
if (!imageUrl && sceneImage?.dataUrl) {
  imageUrl = await uploadImageToBlob(sceneImage.dataUrl);
}
```

### 3. Chamada da API

**Via Background Job (produção):**
```typescript
const jobConfig: VideoJobConfig = {
  model: "veo-3.1",
  aspectRatio: "9:16",
  imageUrl,
  sceneDuration: currentScene.duration,
};

await queueVideoJob(userId, jsonPrompt, jobConfig, context);
```

**Via Chamada Síncrona (dev):**
```typescript
const videoUrl = await generateServerVideo({
  prompt: jsonPrompt,
  aspectRatio: "9:16",
  model: "veo-3.1",
  imageUrl,
  sceneDuration: currentScene.duration,
});
```

### 4. Processamento no Backend

```javascript
// server/index.mjs - Endpoint /api/ai/video

// Modo padrão: image-to-video ou text-to-video
if (imageUrl) {
  result = await fal.subscribe("fal-ai/veo3.1/fast/image-to-video", {
    input: {
      prompt,
      image_url: imageUrl,
      duration: "5",        // "4s", "6s", ou "8s"
      aspect_ratio: "9:16",
      resolution: "720p",
      generate_audio: true,
    },
  });
} else {
  result = await fal.subscribe("fal-ai/veo3.1/fast", {
    input: {
      prompt,
      duration: "5",
      aspect_ratio: "9:16",
      resolution: "720p",
      generate_audio: true,
      auto_fix: true,
    },
  });
}
```

---

## Modo First & Last Frame (Interpolação)

### Conceito

O modo First & Last Frame usa a funcionalidade de interpolação do Veo 3.1 para criar transições suaves entre cenas. Cada vídeo usa:
- **First Frame**: Imagem da cena atual (capa) **ou** o *último frame real do vídeo anterior* (quando disponível)
- **Last Frame**: Imagem da próxima cena (capa)

O Veo 3.1 gera um vídeo de 8 segundos que interpola visualmente entre as duas imagens. Quando o toggle experimental está ativo, o sistema tenta garantir continuidade perfeita usando o último frame real do vídeo anterior como first frame da cena seguinte.

### Lógica de Interpolação

```
Cena 1: first_frame = capa_1, last_frame = capa_2 → Vídeo 8s
Cena 2: first_frame = ultimo_frame_video_1 (se extraído), last_frame = capa_3 → Vídeo 8s
Cena 3: first_frame = ultimo_frame_video_2 (se extraído), last_frame = capa_4 → Vídeo 8s
Cena 4: first_frame = capa_4, last_frame = null  → Modo padrão (última cena)
```

### Ativação

O modo é ativado via toggle no `ClipSettingsModal`:

```typescript
// Estado no ClipCard
const [useFrameInterpolation, setUseFrameInterpolation] = useState(false);

// Toggle no modal (seção "Experimental")
<button onClick={onToggleFrameInterpolation}>
  {useFrameInterpolation ? "First & Last Frame" : "Modo Padrão"}
</button>
```

### Implementação no Frontend

```typescript
// ClipsTab.tsx - handleGenerateVideo

// 1. Calcular lastFrameUrl
let lastFrameUrl: string | undefined;
const isVeoModel = apiModel === "veo-3.1";

if (useFrameInterpolation && isVeoModel) {
  // Encontrar próxima cena
  const currentIndex = scenes.findIndex(s => s.sceneNumber === sceneNumber);
  const nextScene = scenes[currentIndex + 1];

  if (nextScene) {
    const nextSceneImage = sceneImages[nextScene.sceneNumber];

    if (nextSceneImage?.httpUrl) {
      lastFrameUrl = nextSceneImage.httpUrl;
    } else if (nextSceneImage?.dataUrl) {
      // Upload para blob se necessário
      lastFrameUrl = await uploadImageToBlob(nextSceneImage.dataUrl);
    }
  }
  // Se não há próxima cena (última), lastFrameUrl permanece undefined
}

// 2. Ajustar first frame usando o último frame real do vídeo anterior (quando disponível)
if (useFrameInterpolation && isVeoModel && sceneStartFrameOverrides[sceneNumber]) {
  imageUrl = sceneStartFrameOverrides[sceneNumber];
}

// 3. Configurar job com interpolação
const jobConfig: VideoJobConfig = {
  model: apiModel,
  aspectRatio: "9:16",
  imageUrl,                    // First frame
  lastFrameUrl,                // Last frame (undefined para última cena)
  sceneDuration: useFrameInterpolation && lastFrameUrl ? 8 : currentScene.duration,
  useInterpolation: useFrameInterpolation && !!lastFrameUrl,
};
```

### Extração do Último Frame (Frontend)

Quando o toggle experimental está ativo, após gerar cada vídeo o frontend tenta extrair o último frame e salvar no Blob. Esse frame é usado como first frame da próxima cena:

```
const extracted = await extractLastFrameFromVideo(videoUrl);
const lastFrameUploadUrl = await uploadImageToBlob(
  extracted.base64,
  extracted.mimeType,
);
sceneStartFrameOverrides[nextSceneNumber] = lastFrameUploadUrl;
```

### Observações Importantes

- **O fluxo experimental é sequencial**: a próxima cena só inicia após extrair/upload do último frame da cena anterior.
- **Background jobs são desativados no modo experimental** para garantir a cadeia de frames.
- **Modo padrão permanece inalterado** (sem extração, sem dependência entre cenas).

### Implementação no Backend

```javascript
// server/index.mjs - generateVideoWithGoogleVeo

async function generateVideoWithGoogleVeo(
  prompt,
  aspectRatio,
  imageUrl,
  lastFrameUrl = null
) {
  const ai = getGeminiAi();
  const hasLastFrame = lastFrameUrl && lastFrameUrl.startsWith("http");

  const generateParams = {
    model: "veo-3.1-fast-generate-preview",
    prompt,
    config: {
      numberOfVideos: 1,
      resolution: "720p",
      aspectRatio,
      // Interpolação requer 8 segundos
      ...(hasLastFrame && { durationSeconds: 8 }),
      // Necessário para geração de pessoas
      ...(hasLastFrame && { personGeneration: "allow_adult" }),
    },
  };

  // First frame (imagem inicial)
  if (imageUrl) {
    const imageResponse = await fetch(imageUrl);
    const imageBase64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
    generateParams.image = {
      imageBytes: imageBase64,
      mimeType: imageResponse.headers.get("content-type") || "image/jpeg",
    };
  }

  // Last frame (imagem final) - APENAS para interpolação
  if (hasLastFrame) {
    const lastFrameResponse = await fetch(lastFrameUrl);
    const lastFrameBase64 = Buffer.from(await lastFrameResponse.arrayBuffer()).toString("base64");
    generateParams.lastFrame = {
      imageBytes: lastFrameBase64,
      mimeType: lastFrameResponse.headers.get("content-type") || "image/jpeg",
    };
  }

  // Chamar API do Google
  let operation = await ai.models.generateVideos(generateParams);

  // Polling até completar (máx 5 min)
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  return operation.response.generatedVideos[0].video.uri;
}
```

### Roteamento no Endpoint

```javascript
// server/index.mjs - POST /api/ai/video

const isInterpolationMode = useInterpolation && lastFrameUrl;

if (model === "sora-2") {
  // Sora 2 - não suporta interpolação
  videoUrl = await generateVideoWithFal(...);

} else if (isInterpolationMode) {
  // Veo 3.1 com interpolação via Google API
  try {
    videoUrl = await generateVideoWithGoogleVeo(
      prompt, aspectRatio, imageUrl, lastFrameUrl
    );
  } catch (googleError) {
    // Fallback para FAL.ai sem interpolação
    videoUrl = await generateVideoWithFal(...);
  }

} else {
  // Veo 3.1 padrão via FAL.ai
  videoUrl = await generateVideoWithFal(...);
}
```

---

## Estrutura de Prompts

### Sistema de Conversão

O endpoint `/api/ai/convert-prompt` usa Gemini para converter prompts genéricos em JSON estruturado:

```javascript
// server/index.mjs

const getVideoPromptSystemPrompt = (duration, aspectRatio) => {
  return `Você é um especialista em prompt engineering para vídeo de IA.
Converta o prompt genérico fornecido em um JSON estruturado otimizado
para modelos de geração de vídeo (Veo 3, Sora 2).

O JSON deve incluir:
- visual_style: estética, paleta de cores, iluminação
- camera: movimentos cinematográficos, posições inicial e final
- subject: personagem/objeto principal, ação
- environment: cenário, atmosfera
- scene_sequence: 2-3 beats de ação
- technical: duração (${duration}s), aspect ratio (${aspectRatio})

TIPOGRAFIA OBRIGATÓRIA:
- Fonte BOLD CONDENSED SANS-SERIF (Bebas Neue, Impact)
- MAIÚSCULAS com peso BLACK
- PROIBIDO: fontes script, serifadas, handwriting`;
};
```

### Exemplo de JSON Gerado

```json
{
  "visual_style": {
    "aesthetic": "High-end luxury noir, ultra-photorealistic",
    "color_palette": ["#000000", "#c81d25", "#ffffff"],
    "lighting": "Dramatic chiaroscuro, rim lighting"
  },
  "camera": {
    "movement": "Macro slow-motion tracking",
    "initial_position": "Top-down macro focus",
    "final_position": "Eye-level with the felt"
  },
  "subject": {
    "main_object": "Premium poker chips",
    "action": "Chips falling in slow motion"
  },
  "scene_sequence": [
    {"beat_1": "Chips enter frame in ultra-slow motion"},
    {"beat_2": "Chips hit the felt with realistic physics"},
    {"beat_3": "Camera pushes into single chip"}
  ],
  "technical": {
    "duration": "4 seconds",
    "aspect_ratio": "9:16",
    "quality_tokens": "8k, photorealistic, cinematic"
  }
}
```

---

## API e Endpoints

### POST /api/ai/video

**Request:**
```typescript
interface VideoRequest {
  prompt: string;              // JSON estruturado ou texto
  aspectRatio: "16:9" | "9:16";
  model: "veo-3.1" | "sora-2";
  imageUrl?: string;           // URL da imagem de referência (first frame)
  lastFrameUrl?: string;       // URL do last frame (interpolação)
  sceneDuration?: number;      // Duração em segundos
  generateAudio?: boolean;     // Gerar áudio (default: true)
  useInterpolation?: boolean;  // Usar modo interpolação (default: false)
}
```

**Response:**
```typescript
interface VideoResponse {
  success: boolean;
  url: string;      // URL do vídeo no Vercel Blob
  model: string;    // Modelo usado
}
```

### POST /api/ai/convert-prompt

**Request:**
```typescript
interface ConvertRequest {
  prompt: string;       // Prompt genérico
  duration: number;     // Duração desejada
  aspectRatio: string;  // "16:9" ou "9:16"
}
```

**Response:**
```typescript
interface ConvertResponse {
  success: boolean;
  result: object;  // JSON estruturado
}
```

---

## Configurações e Parâmetros

### VideoJobConfig

```typescript
interface VideoJobConfig {
  model: "veo-3.1" | "sora-2";
  aspectRatio: string;
  imageUrl?: string;           // First frame URL
  lastFrameUrl?: string;       // Last frame URL (interpolação)
  sceneDuration?: number;      // Duração em segundos
  useInterpolation?: boolean;  // Flag de interpolação
}
```

### Parâmetros do Veo 3.1

| Parâmetro | Tipo | Valores | Descrição |
|-----------|------|---------|-----------|
| `prompt` | string | - | Descrição do vídeo |
| `aspect_ratio` | string | `"16:9"`, `"9:16"` | Proporção |
| `duration` | string | `"4s"`, `"6s"`, `"8s"` | Duração |
| `resolution` | string | `"720p"` | Resolução |
| `generate_audio` | boolean | `true/false` | Gerar áudio |
| `auto_fix` | boolean | `true/false` | Corrigir prompt |
| `image` | object | `{imageBytes, mimeType}` | First frame |
| `lastFrame` | object | `{imageBytes, mimeType}` | Last frame |
| `durationSeconds` | number | `8` | Duração para interpolação |
| `personGeneration` | string | `"allow_adult"` | Permitir pessoas |

### Restrições do Modo Interpolação

- **Duração obrigatória**: 8 segundos
- **Aspect ratios**: 16:9 ou 9:16
- **Resolução máxima**: 1080p com 8s
- **Ambas imagens obrigatórias**: `image` + `lastFrame`

---

## Logs e Debugging

### Logs do Frontend (ClipsTab)

```
[ClipsTab] Using reference image for scene 1
[ClipsTab] Generic prompt para cena 1: ...
[ClipsTab] JSON prompt para cena 1: {...}
[ClipsTab] Using next scene image as last frame: https://...
[ClipsTab] Using first/last frame interpolation for scene 1
[ClipsTab] Last scene - no interpolation (no next scene)
```

### Logs do Backend (Server)

```
[Video API] Generating video with veo-3.1, interpolation: true
[Google Veo] Generating video: first-last-frame, 9:16
[Google Veo] Video generated in 45000ms
[Video API] Google Veo interpolation failed: ... (se houver erro)
[Video API] Falling back to FAL.ai image-to-video...
```

### Identificando Problemas

| Log | Causa | Solução |
|-----|-------|---------|
| `Last scene - no interpolation` | Última cena do roteiro | Comportamento esperado |
| `Failed to upload next scene image` | Erro no upload do last frame | Verificar conexão/blob |
| `Google Veo interpolation failed` | Erro na API Google | Verificar API key/quota |
| `Falling back to FAL.ai` | Fallback ativado | Verificar logs do Google |

---

## Arquivos Principais

| Arquivo | Responsabilidade |
|---------|------------------|
| `components/tabs/ClipsTab.tsx` | UI, lógica de geração, toggle de interpolação |
| `services/apiClient.ts (compat -> services/api)` | Cliente HTTP, interface `VideoJobConfig` |
| `services/geminiService.ts` | Wrapper para chamadas de AI |
| `server/index.mjs` | Endpoint produção, `generateVideoWithGoogleVeo` |
| `server/dev-api.mjs` | Endpoint desenvolvimento |
| `types.ts` | Tipos TypeScript (`VideoModel`, etc) |

---

## Referências

- [Google Veo 3.1 Documentation](https://cloud.google.com/vertex-ai/docs/generative-ai/video/overview)
- [FAL.ai Veo 3.1 API](https://fal.ai/models/fal-ai/veo3.1/fast)
- [Google GenAI SDK](https://www.npmjs.com/package/@google/genai)
