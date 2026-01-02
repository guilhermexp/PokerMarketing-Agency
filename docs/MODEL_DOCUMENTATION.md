# Documentacao dos Modelos de IA

Este documento serve como guia para desenvolvedores entenderem como os diferentes modelos de IA sao integrados e utilizados na aplicacao DirectorAi.

## Arquitetura: API Endpoints

Todas as chamadas de IA passam por endpoints no Express server. O frontend nao acessa os modelos diretamente.

```
Frontend --> /api/ai/* --> Express Server --> Gemini/Fal.ai APIs
```

### Endpoints Disponiveis

| Endpoint | Metodo | Funcao |
|----------|--------|--------|
| `/api/ai/generate-image` | POST | Gera imagem via Gemini |
| `/api/ai/edit-image` | POST | Edita imagem existente |
| `/api/ai/generate-campaign` | POST | Gera campanha completa (JSON) |
| `/api/ai/generate-tts` | POST | Gera audio TTS |
| `/api/ai/generate-video` | POST | Gera video via Veo |
| `/api/generate/queue` | POST | Adiciona job na fila BullMQ |
| `/api/generate/status` | GET | Consulta status dos jobs |

---

## 1. Modelos de Texto/JSON

### Geracao de Campanhas

| Modelo | ID | Uso |
|--------|----|----|
| **Gemini 2.5 Flash** | `gemini-2.5-flash-preview-05-20` | Geracao de campanhas JSON |

```typescript
// Exemplo de chamada
const response = await fetch('/api/ai/generate-campaign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: transcription,
    brandProfile: brandData,
    referenceImageBase64: imageData
  })
});
```

**Caracteristicas:**
- Retorna JSON estruturado com posts, clips, ads
- Usa responseSchema para garantir formato correto
- Suporta imagem de referencia para contexto

---

## 2. Modelos de Imagem

### Geracao de Imagens (Text-to-Image)

| Modelo | ID | Endpoint | Uso |
|--------|----|---------|----|
| **Gemini 3 Pro Image** | `gemini-3-pro-image-preview` | `/api/ai/generate-image` | Imagens de alta qualidade |

```typescript
const response = await fetch('/api/ai/generate-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: "Flyer de poker com tema neon",
    brandProfile: { name: "Club XYZ", colors: {...} },
    options: { aspectRatio: '16:9' }
  })
});
```

### Edicao de Imagens (Image-to-Image)

| Modelo | ID | Endpoint | Uso |
|--------|----|---------|----|
| **Gemini 2.5 Flash Image** | `gemini-2.5-flash-preview-image` | `/api/ai/edit-image` | Edicao rapida |

```typescript
const response = await fetch('/api/ai/edit-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageBase64: originalImage,
    mimeType: 'image/png',
    prompt: "Altere as cores para tons de azul",
    maskBase64: maskImage  // opcional
  })
});
```

**Capacidades:**
- Edicao com mascara (areas especificas)
- Imagem de referencia para estilo
- Variacao de marca (aplicar identidade visual)

---

## 3. Modelos de Video

### Geracao de Video

| Modelo | ID | Endpoint | Uso |
|--------|----|---------|----|
| **Veo 3.1** | `veo-3.1-fast-generate-preview` | `/api/ai/generate-video` | Video principal |
| **Sora 2** | `fal-ai/sora-2/text-to-video` | Fal.ai API | Fallback |

```typescript
// Via rubeService.ts
const result = await generateVideoFromImage({
  imageUrl: thumbnailUrl,
  prompt: "Camera zoom suave, efeito cinematico",
  duration: 5
});
```

**Fluxo de Geracao:**
1. Envia imagem de referencia (thumbnail)
2. Modelo gera video de 5-10 segundos
3. Resultado salvo no Vercel Blob

**Fallback:** Se Veo falhar, sistema tenta Sora 2 automaticamente.

---

## 4. Modelos de Audio

### Text-to-Speech

| Modelo | ID | Endpoint | Uso |
|--------|----|---------|----|
| **Gemini TTS** | `gemini-2.5-flash-preview-tts` | `/api/ai/generate-tts` | Narracao |

```typescript
const response = await fetch('/api/ai/generate-tts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: "Bem-vindos ao nosso torneio de poker!",
    voice: "Zephyr"  // voz em portugues
  })
});
```

**Vozes Disponiveis:**
- `Zephyr` - Voz masculina natural em PT-BR
- Outras vozes do Gemini TTS

---

## 5. Sistema de Filas (Background Jobs)

Para operacoes demoradas (imagens), usamos fila assincrona:

```typescript
// Frontend enfileira job
const result = await queueGenerationJob(
  userId,
  'clip',           // tipo: flyer, flyer_daily, post, ad, clip
  prompt,
  { aspectRatio: '16:9' },
  'clip-0'          // contexto para identificar no frontend
);

// Worker processa em background
// Frontend faz polling para status
const status = await checkJobStatus(userId);
```

**Tipos de Jobs:**

| Tipo | Descricao | Contexto |
|------|-----------|----------|
| `flyer` | Flyer individual | `flyer-{tournamentId}` |
| `flyer_daily` | Grade diaria | `flyer-period-{period}` |
| `post` | Post social | `post-{index}` |
| `ad` | Criativo anuncio | `ad-{index}` |
| `clip` | Capa de clip | `clip-{index}` |

---

## 6. Tabela Resumo de Modelos

| Funcionalidade | Modelo | Provider |
|----------------|--------|----------|
| Campanhas JSON | `gemini-2.5-flash-preview-05-20` | Google |
| Imagens Pro | `gemini-3-pro-image-preview` | Google |
| Edicao Rapida | `gemini-2.5-flash-preview-image` | Google |
| TTS | `gemini-2.5-flash-preview-tts` | Google |
| Video | `veo-3.1-fast-generate-preview` | Google |
| Video Fallback | `fal-ai/sora-2/text-to-video` | Fal.ai |

---

## 7. Variaveis de Ambiente

| Variavel | Modelo(s) | Obrigatoria |
|----------|-----------|-------------|
| `GEMINI_API_KEY` | Todos os modelos Gemini | Sim |
| `FAL_KEY` | Sora 2 | Nao (fallback) |
| `RUBE_TOKEN` | API Rube (video) | Nao |
| `OPENROUTER_API_KEY` | Modelos alternativos | Nao |

---

## 8. Boas Praticas

### Prompts

Os prompts sao enriquecidos no backend para melhor qualidade:

```javascript
// server/index.mjs
const enrichedPrompt = `
**BRAND CONTEXT:**
- Nome: ${brandProfile.name}
- Cores: ${brandProfile.colors.primary}, ${brandProfile.colors.secondary}
- Tom: ${brandProfile.style.voice}

**PROMPT DO USUARIO:**
${prompt}

**INSTRUCOES:**
Criar imagem de marketing profissional...
`;
```

### Tratamento de Erros

```javascript
try {
  const result = await generateImage(prompt, brandProfile);
  if (!result.success) {
    // Tentar modelo alternativo ou retornar erro amigavel
  }
} catch (error) {
  console.error('AI Error:', error);
  // Log para debugging, mensagem amigavel para usuario
}
```

### Cache e Otimizacao

- Imagens sao salvas no Vercel Blob (nao regenerar)
- Jobs em fila evitam sobrecarga da API
- Concurrency limitada a 2 jobs simultaneos

---

*DirectorAi - Aura Engine v3.0*
