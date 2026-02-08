# 01 - ARQUITETURA E ESTRUTURA

## 📁 Estrutura Completa de Pastas

### 🎯 Rota Principal
```
/image → src/app/[variants]/(main)/image/
```

### 🗂️ Organização de Diretórios

```
src/app/[variants]/(main)/image/
├── index.tsx                           # Entry point (Desktop + Client-only guard)
├── loading.tsx                         # Loading skeleton
├── NotSupportClient.tsx                # Client-only enforcement
│
├── _layout/                            # Layout Components
│   ├── index.tsx                       # Main 3-panel layout with Outlet
│   ├── Header.tsx                      # Top header bar
│   ├── Sidebar.tsx                     # Left sidebar (Config Panel portal)
│   ├── TopicSidebar.tsx                # Right sidebar (Topics list)
│   ├── RegisterHotkeys.tsx             # Keyboard shortcuts (Cmd+K, etc.)
│   ├── style.ts                        # Layout styles
│   │
│   ├── ConfigPanel/                    # Image Generation Config
│   │   ├── index.tsx                   # Main config panel
│   │   ├── ImageConfigSkeleton.tsx     # Loading state
│   │   ├── style.ts
│   │   │
│   │   ├── components/                 # 15+ Config Controls
│   │   │   ├── ModelSelect/            # Provider + Model selector
│   │   │   │   ├── index.tsx
│   │   │   │   ├── ModelItem.tsx
│   │   │   │   └── ProviderItem.tsx
│   │   │   ├── DimensionControlGroup.tsx  # Width + Height + Lock
│   │   │   ├── SizeSelect.tsx          # Preset sizes (512x512, etc.)
│   │   │   ├── AspectRatioSelect/      # Custom aspect ratios
│   │   │   │   ├── index.tsx
│   │   │   │   ├── LockButton.tsx
│   │   │   │   └── PresetButton.tsx
│   │   │   ├── ImageNum.tsx            # Number of images to generate
│   │   │   ├── ImageUrl.tsx            # Single image reference upload
│   │   │   ├── ImageUrlsUpload.tsx     # Multiple image references
│   │   │   ├── ImageUpload.tsx         # Generic image uploader
│   │   │   ├── MultiImagesUpload/      # Multiple images manager
│   │   │   │   ├── index.tsx
│   │   │   │   ├── ImageManageModal.tsx
│   │   │   │   └── UploadButton.tsx
│   │   │   ├── CfgSliderInput.tsx      # CFG scale (classifier-free guidance)
│   │   │   ├── StepsSliderInput.tsx    # Diffusion steps
│   │   │   ├── SeedNumberInput.tsx     # Seed number input
│   │   │   ├── QualitySelect.tsx       # Quality selector
│   │   │   ├── ResolutionSelect.tsx    # Resolution selector
│   │   │   └── InputNumber/            # Generic number input
│   │   │       ├── index.tsx
│   │   │       └── style.ts
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAutoDimensions.ts    # Auto-adjust dimensions
│   │   │   ├── useDragAndDrop.ts       # File drag & drop
│   │   │   └── useUploadFilesValidation.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── dimensionConstraints.ts
│   │   │   └── imageValidation.ts
│   │   │
│   │   └── constants.ts                # Presets, defaults
│   │
│   └── Topics/                         # Topics Sidebar
│       ├── index.tsx                   # Main topics list
│       ├── TopicItem.tsx               # Individual topic card
│       ├── NewTopicButton.tsx          # Create new topic button
│       ├── SkeletonList.tsx            # Loading skeleton
│       └── TopicUrlSync.tsx            # URL ↔ State sync
│
├── features/                           # Feature Components
│   ├── PromptInput/                    # Text Prompt Input
│   │   ├── index.tsx                   # Main input component
│   │   └── Title.tsx                   # "Generate Images" title
│   │
│   ├── GenerationFeed/                 # Image Gallery Feed
│   │   ├── index.tsx                   # Main feed container
│   │   ├── BatchItem.tsx               # Batch container (prompt + images)
│   │   ├── ReferenceImages.tsx         # Display reference images
│   │   │
│   │   └── GenerationItem/             # Individual Image Item
│   │       ├── index.tsx               # Main controller
│   │       ├── SuccessState.tsx        # Generated image display
│   │       ├── LoadingState.tsx        # Generating placeholder
│   │       ├── ErrorState.tsx          # Error display
│   │       ├── ActionButtons.tsx       # Download, Seed, Delete
│   │       ├── ElapsedTime.tsx         # Generation time counter
│   │       ├── types.ts
│   │       ├── styles.ts
│   │       └── utils.ts
│   │
│   └── ImageWorkspace/                 # Main Content Area
│       ├── index.tsx                   # Workspace controller
│       ├── Content.tsx                 # Content container
│       ├── EmptyState.tsx              # No generations yet
│       └── SkeletonList.tsx            # Loading skeleton
│
└── (outros arquivos do projeto)

---

src/store/image/                        # State Management (Zustand)
├── store.ts                            # Root store definition
├── initialState.ts                     # Initial state
├── index.ts                            # Public exports
├── selectors.ts                        # Root selectors
│
└── slices/                             # Store Slices
    ├── generationConfig/               # Generation Settings
    │   ├── action.ts                   # Actions (setters)
    │   ├── initialState.ts
    │   ├── selectors.ts
    │   ├── hooks.ts                    # Custom hooks
    │   └── index.ts
    │
    ├── generationBatch/                # Batches Management
    │   ├── action.ts                   # CRUD + polling
    │   ├── initialState.ts
    │   ├── reducer.ts
    │   └── selectors.ts
    │
    ├── generationTopic/                # Topics Management
    │   ├── action.ts                   # CRUD + AI title gen
    │   ├── initialState.ts
    │   ├── reducer.ts
    │   └── selectors.ts
    │
    └── createImage/                    # Image Creation
        └── action.ts                   # Main createImage action

---

src/server/routers/lambda/              # Backend tRPC Routers
├── image/
│   ├── index.ts                        # imageRouter (createImage)
│   └── utils.ts
├── generation.ts                       # generationRouter (status, delete)
├── generationBatch.ts                  # generationBatchRouter
└── generationTopic.ts                  # generationTopicRouter

---

src/services/                           # Client Services
├── image.ts                            # Image creation service
├── generation.ts                       # Generation operations
├── generationBatch.ts                  # Batch operations
└── generationTopic.ts                  # Topic operations

---

packages/database/src/                  # Database Layer
├── schemas/
│   ├── generationBatch.ts              # Batch schema
│   ├── generation.ts                   # Generation schema
│   ├── imageGenerationTopic.ts         # Topic schema
│   └── asyncTask.ts                    # Async task schema
│
└── models/
    ├── generationBatch.ts              # Batch model (CRUD)
    ├── generation.ts                   # Generation model
    ├── imageGenerationTopic.ts         # Topic model
    └── asyncTask.ts                    # Task model
```

---

## 🏗️ Arquitetura de Camadas

```
┌─────────────────────────────────────────────────┐
│                UI Components                     │
│  (React + @lobehub/ui + Ant Design)             │
│  - ConfigPanel, GenerationFeed, TopicSidebar    │
└──────────────────┬──────────────────────────────┘
                   │ props, callbacks
┌──────────────────▼──────────────────────────────┐
│           State Management (Zustand)             │
│  - generationConfig, generationBatch,            │
│    generationTopic, createImage                  │
└──────────────────┬──────────────────────────────┘
                   │ actions, selectors
┌──────────────────▼──────────────────────────────┐
│            Client Services                       │
│  - imageService, generationService, etc.         │
└──────────────────┬──────────────────────────────┘
                   │ tRPC client calls
┌──────────────────▼──────────────────────────────┐
│               tRPC Routers                       │
│  - imageRouter, generationRouter, etc.           │
└──────────────────┬──────────────────────────────┘
                   │ database queries
┌──────────────────▼──────────────────────────────┐
│            Database Models                       │
│  - GenerationBatchModel, GenerationModel, etc.   │
└──────────────────┬──────────────────────────────┘
                   │ SQL queries
┌──────────────────▼──────────────────────────────┐
│           PostgreSQL Database                    │
│  - Tables: generationBatches, generations,       │
│            imageGenerationTopics, asyncTasks     │
└──────────────────────────────────────────────────┘
```

---

## 🎨 Layout de 3 Painéis

### Desktop Layout

```
┌────────────────────────────────────────────────────────────────┐
│                           Header                                │
│  [Logo] [Nav] ...................... [User Menu]                │
├──────────────┬────────────────────────────┬────────────────────┤
│              │                            │                    │
│   Sidebar    │     ImageWorkspace         │  TopicSidebar      │
│  (Config)    │                            │  (Gallery)         │
│              │                            │                    │
│  250px       │        flex-1              │     280px          │
│              │                            │                    │
│  Portal:     │  ┌──────────────────────┐  │  ┌──────────────┐ │
│  ConfigPanel │  │   PromptInput        │  │  │  Topic List  │ │
│              │  │   [Textarea]         │  │  │              │ │
│              │  │   [Generate Button]  │  │  │  • Topic 1   │ │
│              │  └──────────────────────┘  │  │  • Topic 2   │ │
│              │                            │  │  • Topic 3   │ │
│              │  ┌──────────────────────┐  │  │              │ │
│              │  │  GenerationFeed      │  │  │  [+ New]     │ │
│              │  │                      │  │  └──────────────┘ │
│              │  │  Batch 1:            │  │                    │
│              │  │  [img] [img] [img]   │  │                    │
│              │  │                      │  │                    │
│              │  │  Batch 2:            │  │                    │
│              │  │  [loading...]        │  │                    │
│              │  └──────────────────────┘  │                    │
│              │                            │                    │
└──────────────┴────────────────────────────┴────────────────────┘
```

### Mobile Layout (Collapsed)

```
┌────────────────────────────────┐
│           Header               │
│  [Menu] [Logo] [User]          │
├────────────────────────────────┤
│                                │
│      ImageWorkspace            │
│                                │
│  ┌──────────────────────────┐  │
│  │   PromptInput            │  │
│  │   [Textarea]             │  │
│  │   [Generate Button]      │  │
│  └──────────────────────────┘  │
│                                │
│  ┌──────────────────────────┐  │
│  │  GenerationFeed          │  │
│  │                          │  │
│  │  Batch 1:                │  │
│  │  [img] [img]             │  │
│  │                          │  │
│  │  Batch 2:                │  │
│  │  [loading...]            │  │
│  └──────────────────────────┘  │
│                                │
└────────────────────────────────┘

[Config] e [Topics] acessíveis via drawers
```

---

## 🔄 Hierarquia de Dados

```
Topic (ImageGenerationTopic)
  ├─ id: string
  ├─ title: string
  ├─ coverUrl: string (thumbnail da primeira imagem)
  ├─ createdAt: Date
  └─ updatedAt: Date
        │
        ▼
    Batches (GenerationBatch[])
      ├─ id: string
      ├─ generationTopicId: string
      ├─ provider: string (ex: "google")
      ├─ model: string (ex: "gemini-3-pro-image-preview")
      ├─ prompt: string
      ├─ config: GenerationConfig (todos os params)
      ├─ createdAt: Date
      └─ generations: Generation[]
            │
            ▼
        Generations (Generation[])
          ├─ id: string
          ├─ generationBatchId: string
          ├─ seed: number | null
          ├─ asyncTaskId: string
          ├─ asset: GenerationAsset
          │   ├─ url: string (S3 URL)
          │   ├─ thumbnailUrl: string
          │   ├─ width: number
          │   └─ height: number
          ├─ task: AsyncTask
          │   ├─ id: string
          │   ├─ status: AsyncTaskStatus
          │   └─ error: AsyncTaskError | null
          └─ createdAt: Date
```

---

## 🗄️ Database Schema

### Tabelas Principais

```sql
-- Topics
CREATE TABLE image_generation_topics (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT,
  cover_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Batches
CREATE TABLE generation_batches (
  id UUID PRIMARY KEY,
  generation_topic_id UUID REFERENCES image_generation_topics(id),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  config JSONB NOT NULL,        -- GenerationConfig
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Generations
CREATE TABLE generations (
  id UUID PRIMARY KEY,
  generation_batch_id UUID REFERENCES generation_batches(id),
  user_id UUID NOT NULL,
  seed INTEGER,
  async_task_id UUID,
  asset JSONB,                  -- GenerationAsset
  created_at TIMESTAMP DEFAULT NOW()
);

-- AsyncTasks
CREATE TABLE async_tasks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,           -- ex: "image_generation"
  status TEXT NOT NULL,         -- Pending/Processing/Success/Error
  error JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Relacionamentos

```
image_generation_topics (1) ──< (N) generation_batches
generation_batches (1) ──< (N) generations
generations (1) ──< (1) async_tasks
```

---

## 🌐 Rotas e Navegação

### Rotas da Página

```
/image                              # Landing page (empty state)
/image?topic=xxx                    # Topic específico
/image?topic=xxx&prompt=hello       # Auto-fill prompt
```

### Navegação

- **Criar Topic**: Botão "New Topic" → cria topic vazio → redireciona
- **Trocar Topic**: Click em topic item → atualiza URL → carrega batches
- **Voltar para Home**: Click no logo/header

---

## 🔧 Integração com Sistema Global

### Dependências de Stores Externos

```typescript
// aiInfraStore - Lista de providers/modelos
const aiInfraStore = useAiInfraStore();
const { aiProviders, imageGenModels } = aiInfraStore;

// userStore - Autenticação
const userStore = useUserStore();
const { user, isSignedIn } = userStore;

// globalStore - Preferences
const globalStore = useGlobalStore();
const { lastImageGenProvider, lastImageGenModel } = globalStore;
```

### Serviços Compartilhados

- **fileService**: Upload de imagens de referência
- **tRPC client**: lambdaClient.image, .generation, etc.
- **SWR**: Data fetching e caching

---

## 📊 Padrões Arquiteturais

### 1. **Client-Only Rendering**
```tsx
// NotSupportClient.tsx garante que a página só roda no client
export default function ImagePage() {
  return <DesktopImagePage />;
}
```

### 2. **Portal Pattern**
```tsx
// Sidebar renderiza ConfigPanel em um portal
<Portal target="#config-panel-portal">
  <ConfigPanel />
</Portal>
```

### 3. **Outlet Pattern (React Router)**
```tsx
// Layout com Outlet para nested routes
<Layout>
  <Outlet /> {/* Renderiza conteúdo da rota */}
</Layout>
```

### 4. **Compound Component Pattern**
```tsx
// ModelSelect com sub-components
<ModelSelect>
  <ModelSelect.Provider />
  <ModelSelect.Model />
</ModelSelect>
```

### 5. **Optimistic UI Updates**
```tsx
// Delete generation: UI atualiza antes do backend
removeGeneration(id);  // Optimistic
await generationService.deleteGeneration(id);  // Backend
refreshGenerationBatches();  // Sync
```

---

## 🔐 Segurança e Validação

### Client-Side
- Validação de file types (images only)
- Validação de file size (max 10MB)
- Validação de dimensions (baseado em model constraints)
- Sanitização de prompts

### Server-Side
- Autenticação obrigatória (userId required)
- Validação de permissões (owner only)
- Rate limiting (coins/credits)
- Input sanitization (SQL injection prevention)

---

## 🚀 Performance Otimizations

### Data Fetching
- **SWR**: Cache com revalidation automática
- **Polling**: Exponential backoff (1s → 30s)
- **Lazy Loading**: Imagens carregam on-demand

### Rendering
- **React.memo**: Componentes memoizados
- **useMemo/useCallback**: Evitar re-renders
- **Code Splitting**: Lazy imports de features

### Storage
- **S3 Keys em DB**: Não armazenar URLs completas
- **Presigned URLs**: Geradas on-demand
- **Thumbnails**: Versões reduzidas para lista

---

## 📝 Convenções de Código

### Nomenclatura
```typescript
// Componentes: PascalCase
ConfigPanel, GenerationFeed, TopicSidebar

// Hooks: useCamelCase
useAutoDimensions, useDragAndDrop

// Actions: camelCase
createImage, setParamOnInput

// Selectors: camelCase
currentGenerationBatches, activeGenerationTopicId

// Services: camelCase
imageService, generationService
```

### File Structure
```
ComponentName/
├── index.tsx           # Main component
├── SubComponent.tsx    # Sub-components
├── types.ts            # TypeScript types
├── styles.ts           # Styles (antd-style)
└── utils.ts            # Helper functions
```

---

## 🔗 Links para Outras Documentações

- **[02-COMPONENTES.md](./02-COMPONENTES.md)** - Detalhes de cada componente
- **[03-APIS-ENDPOINTS.md](./03-APIS-ENDPOINTS.md)** - APIs e endpoints
- **[04-STATE-MANAGEMENT.md](./04-STATE-MANAGEMENT.md)** - Zustand stores
- **[05-FLUXO-DADOS.md](./05-FLUXO-DADOS.md)** - Fluxo de dados completo

---

**Próximo**: [02-COMPONENTES.md](./02-COMPONENTES.md) - Documentação completa de componentes
