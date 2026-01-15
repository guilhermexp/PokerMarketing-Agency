# Video Generation - Documentação Técnica

## Visão Geral

O sistema de geração de vídeos usa **Google Veo API** como provedor principal, com **FAL.ai** como fallback.

## Arquitetura

```
Frontend (ClipsTab.tsx)
    ↓
API Client (geminiService.ts / services/api)
    ↓
Server API (server/dev-api.mjs ou api/ai/video.ts)
    ↓
Google Veo API (principal) → FAL.ai (fallback)
    ↓
Vercel Blob (armazenamento permanente)
```

## Arquivos Importantes

| Arquivo | Descrição |
|---------|-----------|
| `server/dev-api.mjs` | API de desenvolvimento (Express) |
| `api/ai/video.ts` | API de produção (Vercel Serverless) |
| `api/ai/convert-prompt.ts` | Converte prompts genéricos em JSON estruturado |
| `components/tabs/ClipsTab.tsx` | UI de geração de vídeos |
| `services/geminiService.ts` | Cliente de serviços AI |
| `services/services/api` | Cliente HTTP para APIs |

## Configuração do Google Veo API

### Modelo
```
veo-3.1-fast-generate-preview
```

### Parâmetros Obrigatórios (SDK @google/genai)
```javascript
const generateParams = {
  model: "veo-3.1-fast-generate-preview",
  prompt: "...",
  config: {
    numberOfVideos: 1,      // OBRIGATÓRIO: sempre 1
    resolution: "720p",     // "720p" ou "1080p"
    aspectRatio: "9:16",    // "16:9" ou "9:16"
  },
};
```

### Parâmetros NÃO suportados pelo Google Veo
- ❌ `durationSeconds` - não existe no SDK
- ❌ `generateAudio` - não existe no SDK
- ❌ `personGeneration` - não existe no SDK

### Image-to-Video
Para gerar vídeo a partir de imagem, adicionar:
```javascript
generateParams.image = {
  imageBytes: base64String,  // imagem em base64 (sem prefixo data:)
  mimeType: "image/jpeg",    // ou "image/png"
};
```

### Polling Assíncrono
O Google Veo é assíncrono. Deve-se fazer polling:
```javascript
let operation = await ai.models.generateVideos(generateParams);

while (!operation.done) {
  await new Promise(resolve => setTimeout(resolve, 10000)); // 10s
  operation = await ai.operations.getVideosOperation({ operation });
}

// Pegar URL do vídeo
const videoUri = operation.response?.generatedVideos[0]?.video?.uri;
const videoUrl = `${videoUri}&key=${apiKey}`; // IMPORTANTE: adicionar API key
```

## Configuração do FAL.ai (Fallback)

### Modelo
```
fal-ai/veo3.1/fast (text-to-video)
fal-ai/veo3.1/fast/image-to-video (image-to-video)
```

### Parâmetros
```javascript
{
  prompt: "...",
  image_url: "https://...",  // URL pública (não base64!)
  aspect_ratio: "9:16",
  duration: "8s",            // "4s", "6s", ou "8s"
  resolution: "720p",
  generate_audio: true,      // controla narração
}
```

### Diferenças entre Google e FAL.ai
| Parâmetro | Google Veo | FAL.ai |
|-----------|------------|--------|
| Imagem | `imageBytes` (base64) | `image_url` (URL) |
| Duração | Não suportado | `duration: "4s/6s/8s"` |
| Áudio | Não suportado | `generate_audio: true/false` |
| Resolução | `resolution: "720p"` | `resolution: "720p"` |

## Lógica de Fallback

```javascript
// Em server/dev-api.mjs e api/ai/video.ts
if (model === "veo-3.1" || model === "veo-3.1-fast-generate-preview") {
  try {
    // Tenta Google primeiro
    videoUrl = await generateVideoWithGoogleVeo(...);
  } catch (googleError) {
    // Se falhar, usa FAL.ai
    console.log(`Google Veo failed: ${googleError.message}`);
    videoUrl = await generateVideoWithFal(...);
  }
}
```

## Mapeamento de Modelos (Frontend → Backend)

O frontend usa nomes internos que são convertidos antes de enviar para a API:

```typescript
// Em ClipsTab.tsx linha ~1532
const apiModel: ApiVideoModel = selectedVideoModel.includes("sora")
  ? "sora-2"
  : "veo-3.1";
```

| Frontend (`selectedVideoModel`) | Backend (`model`) |
|--------------------------------|-------------------|
| `veo-3.1-fast-generate-preview` | `veo-3.1` |
| `sora-2` | `sora-2` |

**IMPORTANTE:** O backend deve aceitar AMBOS os valores:
```javascript
if (model === "veo-3.1" || model === "veo-3.1-fast-generate-preview") {
```

## Troubleshooting

### Erro: "Forbidden" do FAL.ai
**Causa:** FAL_KEY inválida ou sem créditos
**Solução:** Verificar variável `FAL_KEY` no `.env`

### Erro: "Forbidden" do Google
**Causa:** GEMINI_API_KEY sem permissão para Veo
**Solução:** Verificar se a API key tem acesso ao modelo Veo no Google AI Studio

### Vídeo não gera (vai direto pro fallback)
**Causa:** Condição do `if` não reconhece o modelo
**Solução:** Verificar se a condição inclui ambos os nomes:
```javascript
if (model === "veo-3.1" || model === "veo-3.1-fast-generate-preview")
```

### Erro 404 em produção
**Causa:** Endpoint não existe em `api/ai/`
**Solução:** Criar arquivo correspondente em `api/ai/` (ex: `convert-prompt.ts`)

### Erro 500 com parâmetros inválidos
**Causa:** Parâmetros do config não suportados pelo SDK
**Solução:** Usar APENAS os parâmetros documentados:
- `numberOfVideos: 1`
- `resolution: "720p"`
- `aspectRatio: "9:16"`

### Timeout após 5 minutos
**Causa:** Geração demorou demais
**Solução:** Aumentar `maxWaitTime` ou usar modelo mais rápido

## Variáveis de Ambiente Necessárias

```env
# Google AI
GEMINI_API_KEY=your_key_here

# FAL.ai (fallback)
FAL_KEY=your_key_here

# Vercel Blob (armazenamento)
BLOB_READ_WRITE_TOKEN=your_token_here
```

## Logs de Debug

### Servidor (terminal)
```
[Video API] Generating video with veo-3.1, audio: true
[Google Veo] Veo 3.1 image-to-video 720p | 9:16
[Google Veo] ✓ Veo 3.1 image-to-video 45000ms
[Vercel Blob] Upload video veo-3.1 (via google)
```

### Frontend (console)
```
[ClipsTab] Veo prompt genérico para cena 1: ...
[ClipsTab] Veo JSON prompt para cena 1: ...
[ClipCard] Saving video to gallery with source: Video-... model: veo-3.1-fast-generate-preview
[ClipsTab] Video loaded successfully
```

## Histórico de Problemas Resolvidos

### Janeiro 2026 - Parâmetros inválidos do Google Veo
**Problema:** Erro 500 ao chamar Google Veo API
**Causa:** Parâmetros `durationSeconds`, `generateAudio`, `personGeneration` não existem no SDK
**Solução:** Remover parâmetros inválidos, usar apenas `numberOfVideos`, `resolution`, `aspectRatio`

### Janeiro 2026 - Modelo não reconhecido
**Problema:** Pulava direto para FAL.ai sem tentar Google
**Causa:** Condição `if (model === "veo-3.1")` não reconhecia `veo-3.1-fast-generate-preview`
**Solução:** Adicionar ambos os valores na condição

### Janeiro 2026 - Endpoint 404 em produção
**Problema:** `/api/ai/convert-prompt` retornava 404 em produção
**Causa:** Arquivo só existia em `server/dev-api.mjs`, não em `api/ai/`
**Solução:** Criar `api/ai/convert-prompt.ts` para produção
