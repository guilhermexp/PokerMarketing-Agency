# Configuração de Modelos de IA

## Arquivo Principal: `ai-models.ts`

Este arquivo centraliza toda a configuração de modelos de IA do sistema.

## Como Adicionar um Novo Modelo

### 1. Abra `config/ai-models.ts`

### 2. Adicione o modelo ao array `CREATIVE_MODELS`:

```typescript
{
  id: 'provider/model-name',        // Ex: 'anthropic/claude-4-opus'
  label: 'Nome para UI',            // Ex: 'Claude 4 Opus'
  provider: 'Provider Name',        // Ex: 'Anthropic'
  type: 'openrouter' as const,      // 'native' para Gemini, 'openrouter' para outros
  capabilities: {
    text: true,                     // Pode gerar texto (campanhas, posts)
    image: false,                   // Pode gerar imagens
    vision: true                    // Pode analisar imagens
  },
  description: 'Descrição opcional',
  costTier: 'high' as const,        // 'free' | 'low' | 'medium' | 'high'
},
```

### 3. Pronto!

O modelo aparecerá automaticamente nas configurações da marca.

---

## Tipos de Modelos

### Native (Google Gemini)
- Chamados diretamente via `@google/genai`
- IDs começam com "gemini"
- Exemplo: `gemini-3-pro-preview`

### OpenRouter (Terceiros)
- Chamados via OpenRouter SDK
- IDs contêm "/" (provider/model)
- Exemplos: `openai/gpt-5.2`, `x-ai/grok-4.1-fast`, `anthropic/claude-4`

---

## Arquivos Relacionados

| Arquivo | Descrição |
|---------|-----------|
| `config/ai-models.ts` | Configuração central de modelos |
| `types.ts` | Export do tipo `CreativeModel` |
| `components/settings/SettingsModal.tsx` | UI de seleção de modelo |
| `server/dev-api.mjs` | API de desenvolvimento |
| `server/index.mjs` | API de produção |

---

## Modelos de Imagem (Não configuráveis pelo usuário)

Definidos em `IMAGE_GENERATION_MODELS`:
- `gemini-3-pro-image-preview` - Geração de imagens
- `imagen-4.0-generate-001` - Google Imagen (alternativo)

## Modelos de Vídeo

Definidos em `VIDEO_GENERATION_MODELS`:
- `veo-3.0-generate-preview` - Google Veo 3

---

## Chaves de API Necessárias

| Provider | Variável de Ambiente |
|----------|---------------------|
| Google (Gemini) | `GEMINI_API_KEY` |
| OpenRouter (todos outros) | `OPENROUTER_API_KEY` |
