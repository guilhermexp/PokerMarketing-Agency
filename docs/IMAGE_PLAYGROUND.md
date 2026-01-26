# Image Playground — Documentação Completa

## Visão Geral

O **Image Playground** é uma funcionalidade de geração de imagens com IA, inspirada no design do LobeChat. Permite aos usuários gerar, organizar e gerenciar imagens geradas por IA em uma interface de 3 painéis.

**Características principais:**
- Geração de imagens via Gemini 3 Pro Image Preview
- Suporte a imagens de referência (image-to-image)
- Múltiplas resoluções (1K, 2K, 4K)
- 10 proporções de aspecto (aspect ratios)
- Organização por tópicos/conversas
- Integração com galeria principal do app
- Preview de imagens no AI Studio padrão

---

## Arquitetura

### Layout de 3 Painéis

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────┐  ┌─────────────────────────┐  ┌──────────┐  │
│  │          │  │                         │  │          │  │
│  │  Config  │  │       Workspace         │  │  Topics  │  │
│  │  Panel   │  │    (Feed + Prompt)      │  │  Sidebar │  │
│  │  (left)  │  │       (center)          │  │  (right) │  │
│  │  320px   │  │        flex-1           │  │   80px   │  │
│  │          │  │                         │  │          │  │
│  └──────────┘  └─────────────────────────┘  └──────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Componentes

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| `ImagePlaygroundPage` | `src/components/image-playground/ImagePlaygroundPage.tsx` | Container principal, layout de 3 painéis |
| `ConfigPanel` | `src/components/image-playground/ConfigPanel.tsx` | Painel esquerdo: modelo, resolução, proporção, referência |
| `Workspace` | `src/components/image-playground/Workspace.tsx` | Área central: feed de gerações + input de prompt |
| `TopicsSidebar` | `src/components/image-playground/TopicsSidebar.tsx` | Barra lateral direita: lista de tópicos/projetos |
| `GenerationFeed` | `src/components/image-playground/GenerationFeed.tsx` | Lista de batches de geração |
| `BatchItem` | `src/components/image-playground/BatchItem.tsx` | Um batch (grupo de imagens do mesmo prompt) |
| `GenerationItem` | `src/components/image-playground/GenerationItem.tsx` | Uma imagem individual gerada |
| `PromptInput` | `src/components/image-playground/PromptInput.tsx` | Input de prompt com botão de gerar |

---

## Database Schema

### Tabelas

```sql
-- Tópicos: Container para sessões de geração
CREATE TABLE image_generation_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT,  -- Clerk organization ID
  title TEXT,
  cover_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Batches: Grupo de gerações de uma única requisição
CREATE TABLE image_generation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES image_generation_topics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT,
  provider TEXT NOT NULL,      -- 'google'
  model TEXT NOT NULL,         -- 'gemini-3-pro-image-preview'
  prompt TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gerações: Imagens individuais em um batch
CREATE TABLE image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES image_generation_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  async_task_id UUID,
  seed INTEGER,
  asset JSONB,  -- {url, thumbnailUrl, width, height}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks assíncronas: Rastreamento de processamento
CREATE TABLE image_async_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'image_generation',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, success, error
  metadata JSONB NOT NULL DEFAULT '{}',
  error JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Índices

```sql
CREATE INDEX idx_img_topics_user ON image_generation_topics(user_id, organization_id);
CREATE INDEX idx_img_topics_updated ON image_generation_topics(updated_at DESC);
CREATE INDEX idx_img_batches_topic ON image_generation_batches(topic_id);
CREATE INDEX idx_img_batches_created ON image_generation_batches(created_at DESC);
CREATE INDEX idx_img_generations_batch ON image_generations(batch_id);
CREATE INDEX idx_img_tasks_user_status ON image_async_tasks(user_id, status);
```

### Migração

Arquivo: `db/migrations/020_image_playground.sql`

---

## API Endpoints

### Topics

| Method | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/image-playground/topics` | Lista todos os tópicos do usuário |
| `POST` | `/api/image-playground/topics` | Cria um novo tópico |
| `PATCH` | `/api/image-playground/topics/:id` | Atualiza título/cover de um tópico |
| `DELETE` | `/api/image-playground/topics/:id` | Exclui um tópico (cascade) |

### Batches

| Method | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/image-playground/batches?topicId=xxx` | Lista batches de um tópico |
| `DELETE` | `/api/image-playground/batches/:id` | Exclui um batch |

### Generations

| Method | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/image-playground/generate` | Cria uma nova geração de imagens |
| `GET` | `/api/image-playground/status/:id` | Status de uma geração (polling) |
| `DELETE` | `/api/image-playground/generations/:id` | Exclui uma geração |

### Utility

| Method | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/image-playground/generate-title` | Gera título do tópico via IA |

---

## Zustand Store

### Arquivo: `src/stores/imagePlaygroundStore.ts`

### State Slices

```typescript
// Config State
interface GenerationConfigState {
  model: string;                    // 'gemini-3-pro-image-preview'
  provider: string;                 // 'google'
  parameters: RuntimeImageGenParams;
  imageNum: number;                 // 1-16
  isAspectRatioLocked: boolean;
  activeAspectRatio: string | null; // '1:1', '16:9', etc.
  activeImageSize: '1K' | '2K' | '4K';
}

// Topic State
interface GenerationTopicState {
  topics: ImageGenerationTopic[];
  activeTopicId: string | null;
  loadingTopicIds: string[];
}

// Batch State
interface GenerationBatchState {
  batchesMap: Record<string, GenerationBatch[]>;
  loadedTopicIds: string[];
}

// Create State
interface CreateImageState {
  isCreating: boolean;
  isCreatingWithNewTopic: boolean;
}
```

### Parâmetros de Geração

```typescript
interface RuntimeImageGenParams {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  quality?: string;
  aspectRatio?: string;   // '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'
  imageSize?: '1K' | '2K' | '4K';
  imageUrl?: string;      // URL da imagem de referência
}
```

### Persistência

O store persiste apenas configurações no localStorage:
- `model`, `provider`, `parameters`, `imageNum`
- `isAspectRatioLocked`, `activeAspectRatio`, `activeImageSize`

Tópicos e batches vêm sempre do servidor.

---

## Hooks

### Arquivo: `src/hooks/useImagePlayground.ts`

| Hook | Descrição |
|------|-----------|
| `useImagePlaygroundTopics()` | CRUD de tópicos com SWR |
| `useImagePlaygroundBatches(topicId)` | Lista batches de um tópico |
| `useGenerationPolling(generationId, asyncTaskId)` | Polling de status de geração |
| `useCreateImage()` | Ação de criar nova geração |
| `useImagePlayground()` | Hook combinado com tudo |

---

## API Client

### Arquivo: `src/services/api/imagePlayground.ts`

```typescript
// Topics
getTopics(): Promise<ImageGenerationTopic[]>
createTopic(title?: string): Promise<CreateTopicResponse>
updateTopic(topicId, updates): Promise<ImageGenerationTopic>
deleteTopic(topicId): Promise<void>

// Batches
getBatches(topicId): Promise<GenerationBatch[]>
deleteBatch(batchId): Promise<void>

// Generations
createImage(input): Promise<CreateImageResponse>
getGenerationStatus(generationId, asyncTaskId): Promise<GenerationStatusResponse>
deleteGeneration(generationId): Promise<void>

// Utility
generateTopicTitle(prompts): Promise<string>
```

---

## Backend Helper

### Arquivo: `server/helpers/image-playground.mjs`

### Funções Principais

| Função | Descrição |
|--------|-----------|
| `getTopics(sql, userId, orgId)` | Lista tópicos |
| `createTopic(sql, userId, orgId, title)` | Cria tópico |
| `updateTopic(sql, topicId, userId, updates)` | Atualiza tópico |
| `deleteTopic(sql, topicId, userId)` | Exclui tópico |
| `getBatches(sql, topicId, userId)` | Lista batches com gerações |
| `deleteBatch(sql, batchId, userId)` | Exclui batch |
| `deleteGeneration(sql, generationId, userId)` | Exclui geração |
| `createImageBatch(sql, input, userId, orgId, genai)` | Cria batch e inicia gerações |
| `generateTopicTitle(genai, prompts)` | Gera título via IA |

### Processo de Geração

```javascript
async function processImageGeneration(sql, taskId, generationId, params, genai) {
  // 1. Atualiza status para 'processing'
  // 2. Monta request para Gemini API
  // 3. Inclui imagem de referência se houver
  // 4. Chama API com imageConfig (aspectRatio, imageSize)
  // 5. Upload para Vercel Blob
  // 6. Salva na gallery_images (integração com galeria)
  // 7. Atualiza generation com asset
  // 8. Atualiza cover do tópico se primeiro sucesso
}
```

### Chamada da API Gemini

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts,  // texto + imagem de referência opcional
      }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: params.aspectRatio || '1:1',
          imageSize: params.imageSize || '1K',
        },
      },
    }),
  }
);
```

---

## Funcionalidades

### 1. Geração de Imagens

- **Prompt**: Texto descritivo para geração
- **Imagem de Referência**: Upload ou drag-and-drop
- **Resolução**: 1K, 2K ou 4K
- **Proporção**: 10 opções (1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9)
- **Quantidade**: 1-16 imagens por requisição
- **Seed**: Opcional, para referência (não garante reprodução exata)

### 2. Organização por Tópicos

- Cada sessão de geração pertence a um tópico
- Tópicos têm título (gerado por IA) e cover (primeira imagem)
- Sidebar direita mostra thumbnails dos tópicos
- Clique para alternar entre tópicos

### 3. Ações em Imagens Geradas

| Ícone | Ação | Descrição |
|-------|------|-----------|
| 🖼️ ImagePlus | Usar como Referência | Define a imagem como referência para próxima geração |
| ⬇️ Download | Download | Baixa a imagem para o computador |
| #️⃣ Hash | Reusar Seed | Copia a seed para o campo de configuração |
| 🗑️ Trash | Excluir | Remove a imagem |
| 🔍 ZoomIn | Ver Preview | Abre no ImagePreviewModal (AI Studio) |

### 4. Integração com Galeria

Imagens geradas são automaticamente salvas na `gallery_images` com:
- `source: 'playground'`
- Aparecem na seção "Assets" da galeria principal

---

## Configuração do Vite Proxy

```typescript
// vite.config.ts
proxy: {
  "/api/image-playground": {
    target: "http://localhost:3002",
    changeOrigin: true,
  },
}
```

---

## Fluxo de Dados

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Express   │────▶│   Neon DB   │
│   (React)   │     │   API       │     │  (Postgres) │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Gemini    │
                    │   API       │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Vercel    │
                    │   Blob      │
                    └─────────────┘
```

1. **Usuário** digita prompt e configurações
2. **Frontend** envia para `/api/image-playground/generate`
3. **Backend** cria batch e generations no DB
4. **Backend** chama Gemini API para cada imagem
5. **Gemini** retorna imagem em base64
6. **Backend** faz upload para Vercel Blob
7. **Backend** salva URL no DB (generations + gallery_images)
8. **Frontend** recebe batch e atualiza UI

---

## Arquivos Criados/Modificados

### Novos Arquivos

```
src/components/image-playground/
├── ImagePlaygroundPage.tsx
├── ConfigPanel.tsx
├── Workspace.tsx
├── TopicsSidebar.tsx
├── GenerationFeed.tsx
├── BatchItem.tsx
├── GenerationItem.tsx
└── PromptInput.tsx

src/stores/
└── imagePlaygroundStore.ts

src/hooks/
└── useImagePlayground.ts

src/services/api/
└── imagePlayground.ts

server/helpers/
└── image-playground.mjs

db/migrations/
└── 020_image_playground.sql
```

### Arquivos Modificados

```
vite.config.ts          # Adicionado proxy /api/image-playground
server/dev-api.mjs      # Adicionadas rotas e imports
src/components/dashboard/Dashboard.tsx  # Adicionada navegação
```

---

## Referência de Design

O design foi baseado no **LobeChat Image Playground**:
- Layout de 3 painéis
- Painel de configuração à esquerda
- Área de trabalho central com feed
- Sidebar de tópicos à direita
- Estilo dark com glassmorphism

---

## Troubleshooting

### Erro: "Maximum update depth exceeded"

**Causa**: Selector retornando nova referência de array a cada render.

**Solução**: Usar referência estável para arrays vazios:
```typescript
const EMPTY_BATCHES: GenerationBatch[] = [];

currentBatches: (state) => {
  return batchesMap[activeTopicId] || EMPTY_BATCHES;
}
```

### Erro: "relation does not exist"

**Causa**: Migração não foi executada.

**Solução**: Executar migração manualmente ou via script.

### Imagens não aparecem na galeria

**Causa**: INSERT na gallery_images estava faltando.

**Solução**: Adicionado INSERT após upload bem-sucedido.

### imageSize sempre '1K'

**Causa**: Backend sobrescrevia o valor do frontend.

**Solução**: Usar `params.imageSize || getImageSizeFromWidth(width)`.
