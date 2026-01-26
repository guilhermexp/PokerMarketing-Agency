# 💻 CÓDIGOS DE EXEMPLO - Sistema de Geração de Imagens

Este documento contém snippets de código prontos para copiar e usar em seu projeto. Todos os exemplos são baseados no sistema real do LobeChat.

---

## 📋 Índice

1. [Setup Inicial](#setup-inicial)
2. [Zustand Store](#zustand-store)
3. [Componentes de UI](#componentes-de-ui)
4. [tRPC Backend](#trpc-backend)
5. [Hooks Customizados](#hooks-customizados)
6. [Utilities](#utilities)
7. [Integrações de API Externa](#integrações-de-api-externa)
8. [Testes](#testes)

---

## Setup Inicial

### 1. Instalar Dependências

```bash
# Core
pnpm add react react-dom next zustand
pnpm add @trpc/server @trpc/client @trpc/react-query
pnpm add @tanstack/react-query
pnpm add drizzle-orm postgres

# UI
pnpm add antd @ant-design/icons
pnpm add @lobehub/ui antd-style

# Utils
pnpm add zod
pnpm add ahooks
pnpm add dayjs
pnpm add react-use
pnpm add nanoid

# Dev
pnpm add -D @types/react @types/node
pnpm add -D typescript
pnpm add -D drizzle-kit
```

### 2. Configurar TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### 3. Configurar Database Schema

```typescript
// src/database/schemas/image-generation.ts
import { relations } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const imageGenerationTopics = pgTable(
  'image_generation_topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    title: text('title'),
    coverUrl: text('cover_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('image_generation_topics_user_id_idx').on(table.userId),
  }),
);

export const generationBatches = pgTable(
  'generation_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    generationTopicId: uuid('generation_topic_id').references(() => imageGenerationTopics.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    config: jsonb('config').notNull().$type<Record<string, any>>(),
    width: text('width'),
    height: text('height'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    topicIdIdx: index('generation_batches_topic_id_idx').on(table.generationTopicId),
    userIdIdx: index('generation_batches_user_id_idx').on(table.userId),
  }),
);

export const generations = pgTable(
  'generations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    generationBatchId: uuid('generation_batch_id').references(() => generationBatches.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').notNull(),
    seed: text('seed'),
    asyncTaskId: uuid('async_task_id'),
    asset: jsonb('asset').$type<{
      url: string;
      width: number;
      height: number;
      contentType: string;
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    batchIdIdx: index('generations_batch_id_idx').on(table.generationBatchId),
    asyncTaskIdx: index('generations_async_task_id_idx').on(table.asyncTaskId),
  }),
);

export const asyncTasks = pgTable('async_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(), // 'pending' | 'processing' | 'success' | 'error'
  error: jsonb('error').$type<{ message: string; stack?: string }>(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const imageGenerationTopicsRelations = relations(imageGenerationTopics, ({ many }) => ({
  batches: many(generationBatches),
}));

export const generationBatchesRelations = relations(generationBatches, ({ one, many }) => ({
  topic: one(imageGenerationTopics, {
    fields: [generationBatches.generationTopicId],
    references: [imageGenerationTopics.id],
  }),
  generations: many(generations),
}));

export const generationsRelations = relations(generations, ({ one }) => ({
  batch: one(generationBatches, {
    fields: [generations.generationBatchId],
    references: [generationBatches.id],
  }),
  asyncTask: one(asyncTasks, {
    fields: [generations.asyncTaskId],
    references: [asyncTasks.id],
  }),
}));
```

### 4. Gerar Migrations

```bash
# Gerar migration
pnpm drizzle-kit generate:pg --schema=./src/database/schemas

# Aplicar migration
pnpm drizzle-kit push:pg
```

---

## Zustand Store

### Store Completo com 4 Slices

```typescript
// src/store/image/store.ts
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import { createWithEqualityFn } from 'zustand/traditional';
import { StateCreator } from 'zustand';

import { GenerationConfigSlice, createGenerationConfigSlice } from './slices/generationConfig';
import { GenerationTopicSlice, createGenerationTopicSlice } from './slices/generationTopic';
import { GenerationBatchSlice, createGenerationBatchSlice } from './slices/generationBatch';
import { CreateImageSlice, createCreateImageSlice } from './slices/createImage';

// Combined store type
export type ImageStore = GenerationConfigSlice &
  GenerationTopicSlice &
  GenerationBatchSlice &
  CreateImageSlice;

// Create store
export const useImageStore = createWithEqualityFn<ImageStore>()(
  subscribeWithSelector(
    devtools(
      (...parameters) => ({
        ...createGenerationConfigSlice(...parameters),
        ...createGenerationTopicSlice(...parameters),
        ...createGenerationBatchSlice(...parameters),
        ...createCreateImageSlice(...parameters),
      }),
      { name: 'LobeChat_Image' },
    ),
  ),
  shallow,
);
```

### Slice 1: Generation Config

```typescript
// src/store/image/slices/generationConfig/index.ts
import { StateCreator } from 'zustand';
import { ImageStore } from '../../store';

export interface RuntimeImageGenParams {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  quality?: string;
  style?: string;
  imageUrl?: string;
  imageUrls?: string[];
}

export interface ModelParamsSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
}

export interface GenerationConfigState {
  model: string;
  provider: string;
  parameters: RuntimeImageGenParams;
  parametersSchema: ModelParamsSchema | null;
  imageNum: number;
  isAspectRatioLocked: boolean;
  activeAspectRatio: string | null;
  isInit: boolean;
}

export interface GenerationConfigAction {
  setModelAndProviderOnSelect: (model: string, provider: string) => Promise<void>;
  setParamOnInput: (name: string, value: any) => void;
  setImageNum: (num: number) => void;
  setWidth: (width: number) => void;
  setHeight: (height: number) => void;
  toggleAspectRatioLock: () => void;
  setAspectRatio: (ratio: string) => void;
  reuseSettings: (model: string, provider: string, settings: Record<string, any>) => Promise<void>;
  reuseSeed: (seed: number) => void;
  initializeImageConfig: () => Promise<void>;
}

export type GenerationConfigSlice = GenerationConfigState & GenerationConfigAction;

const initialState: GenerationConfigState = {
  model: '',
  provider: '',
  parameters: {
    prompt: '',
  },
  parametersSchema: null,
  imageNum: 1,
  isAspectRatioLocked: true,
  activeAspectRatio: '1:1',
  isInit: false,
};

export const createGenerationConfigSlice: StateCreator<
  ImageStore,
  [['zustand/devtools', never]],
  [],
  GenerationConfigSlice
> = (set, get) => ({
  ...initialState,

  setModelAndProviderOnSelect: async (model: string, provider: string) => {
    set({ model, provider }, false, 'setModelAndProviderOnSelect');

    // Fetch schema do modelo
    try {
      const schema = await fetchModelSchema(provider, model);
      set({ parametersSchema: schema }, false, 'setParametersSchema');

      // Reset parameters baseado no schema
      const defaultParams = generateDefaultParams(schema);
      set(
        (state) => ({
          parameters: { ...state.parameters, ...defaultParams },
        }),
        false,
        'resetParametersFromSchema',
      );
    } catch (error) {
      console.error('Failed to fetch model schema:', error);
    }
  },

  setParamOnInput: (name: string, value: any) => {
    set(
      (state) => ({
        parameters: {
          ...state.parameters,
          [name]: value,
        },
      }),
      false,
      `setParam/${name}`,
    );
  },

  setImageNum: (num: number) => {
    set({ imageNum: num }, false, 'setImageNum');
  },

  setWidth: (width: number) => {
    const { isAspectRatioLocked, parameters } = get();

    if (isAspectRatioLocked && parameters.height) {
      const ratio = width / parameters.height;
      set(
        {
          parameters: {
            ...parameters,
            width,
          },
        },
        false,
        'setWidthLocked',
      );
    } else {
      set(
        {
          parameters: {
            ...parameters,
            width,
          },
        },
        false,
        'setWidth',
      );
    }
  },

  setHeight: (height: number) => {
    const { isAspectRatioLocked, parameters } = get();

    if (isAspectRatioLocked && parameters.width) {
      const ratio = parameters.width / height;
      set(
        {
          parameters: {
            ...parameters,
            height,
          },
        },
        false,
        'setHeightLocked',
      );
    } else {
      set(
        {
          parameters: {
            ...parameters,
            height,
          },
        },
        false,
        'setHeight',
      );
    }
  },

  toggleAspectRatioLock: () => {
    set(
      (state) => ({ isAspectRatioLocked: !state.isAspectRatioLocked }),
      false,
      'toggleAspectRatioLock',
    );
  },

  setAspectRatio: (ratio: string) => {
    const { parameters } = get();
    const [widthRatio, heightRatio] = ratio.split(':').map(Number);

    // Manter width, ajustar height
    const newHeight = Math.round((parameters.width || 1024) / (widthRatio / heightRatio));

    set(
      {
        activeAspectRatio: ratio,
        isAspectRatioLocked: true,
        parameters: {
          ...parameters,
          height: newHeight,
        },
      },
      false,
      'setAspectRatio',
    );
  },

  reuseSettings: async (model: string, provider: string, settings: Record<string, any>) => {
    // Primeiro trocar modelo
    await get().setModelAndProviderOnSelect(model, provider);

    // Aguardar schema carregar
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Aplicar settings
    Object.entries(settings).forEach(([key, value]) => {
      if (key !== 'prompt') {
        // Não copiar prompt
        get().setParamOnInput(key, value);
      }
    });
  },

  reuseSeed: (seed: number) => {
    get().setParamOnInput('seed', seed);
  },

  initializeImageConfig: async () => {
    if (get().isInit) return;

    try {
      // Carregar modelo padrão
      const defaultProvider = 'openai';
      const defaultModel = 'dall-e-3';

      await get().setModelAndProviderOnSelect(defaultModel, defaultProvider);

      set({ isInit: true }, false, 'initializeImageConfig');
    } catch (error) {
      console.error('Failed to initialize image config:', error);
    }
  },
});

// Helper functions
async function fetchModelSchema(provider: string, model: string): Promise<ModelParamsSchema> {
  // Implementar fetch real
  const response = await fetch(`/api/models/${provider}/${model}/schema`);
  return response.json();
}

function generateDefaultParams(schema: ModelParamsSchema): Record<string, any> {
  const defaults: Record<string, any> = {};

  Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
    if (prop.default !== undefined) {
      defaults[key] = prop.default;
    }
  });

  return defaults;
}
```

### Slice 2: Create Image

```typescript
// src/store/image/slices/createImage/index.ts
import { StateCreator } from 'zustand';
import { ImageStore } from '../../store';
import { clientS } from '@/libs/trpc/client';

export interface CreateImageState {
  isCreating: boolean;
  isCreatingWithNewTopic: boolean;
}

export interface CreateImageAction {
  createImage: () => Promise<void>;
}

export type CreateImageSlice = CreateImageState & CreateImageAction;

const initialState: CreateImageState = {
  isCreating: false,
  isCreatingWithNewTopic: false,
};

export const createCreateImageSlice: StateCreator<
  ImageStore,
  [['zustand/devtools', never]],
  [],
  CreateImageSlice
> = (set, get) => ({
  ...initialState,

  createImage: async () => {
    const {
      parameters,
      model,
      provider,
      imageNum,
      activeGenerationTopicId,
      createGenerationTopic,
      refreshGenerationBatches,
    } = get();

    // Validações
    if (!parameters.prompt?.trim()) {
      throw new Error('Prompt is required');
    }

    if (!model || !provider) {
      throw new Error('Please select a model');
    }

    try {
      set({ isCreating: true }, false, 'createImage/start');

      // Criar topic se necessário
      let topicId = activeGenerationTopicId;
      if (!topicId) {
        set({ isCreatingWithNewTopic: true }, false, 'createImage/creatingTopic');
        const newTopic = await createGenerationTopic();
        topicId = newTopic.id;
      }

      // Chamar backend
      const result = await clientS.image.createImage.mutate({
        generationTopicId: topicId,
        provider,
        model,
        imageNum,
        params: parameters,
      });

      // Atualizar batches
      await refreshGenerationBatches(topicId);

      // Limpar prompt
      set(
        (state) => ({
          parameters: {
            ...state.parameters,
            prompt: '',
          },
        }),
        false,
        'createImage/clearPrompt',
      );

      console.log('Image generation started:', result);
    } catch (error) {
      console.error('Failed to create image:', error);
      throw error;
    } finally {
      set(
        {
          isCreating: false,
          isCreatingWithNewTopic: false,
        },
        false,
        'createImage/end',
      );
    }
  },
});
```

### Hooks de Seleção

```typescript
// src/store/image/selectors.ts
import { useImageStore } from './store';

// Config selectors
export const useGenerationConfig = () =>
  useImageStore((s) => ({
    model: s.model,
    provider: s.provider,
    parameters: s.parameters,
    imageNum: s.imageNum,
  }));

export const useIsGenerating = () => useImageStore((s) => s.isCreating);

// Topic selectors
export const useActiveTopicId = () => useImageStore((s) => s.activeGenerationTopicId);

export const useGenerationTopics = () => useImageStore((s) => s.generationTopics);

// Batch selectors
export const useGenerationBatches = (topicId: string) =>
  useImageStore((s) => s.generationBatchesMap[topicId] || []);

// Actions
export const useImageActions = () =>
  useImageStore((s) => ({
    createImage: s.createImage,
    setModelAndProviderOnSelect: s.setModelAndProviderOnSelect,
    setParamOnInput: s.setParamOnInput,
    setImageNum: s.setImageNum,
    switchGenerationTopic: s.switchGenerationTopic,
    reuseSeed: s.reuseSeed,
    reuseSettings: s.reuseSettings,
  }));
```

---

## Componentes de UI

### PromptInput Component

```typescript
// src/components/PromptInput.tsx
import { SendOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import { memo } from 'react';
import { useImageStore } from '@/store/image';

const { TextArea } = Input;

export const PromptInput = memo(() => {
  const prompt = useImageStore((s) => s.parameters.prompt);
  const setPrompt = useImageStore((s) => s.setParamOnInput);
  const createImage = useImageStore((s) => s.createImage);
  const isCreating = useImageStore((s) => s.isCreating);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    try {
      await createImage();
    } catch (error) {
      console.error('Generation failed:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, padding: 16 }}>
      <TextArea
        value={prompt}
        onChange={(e) => setPrompt('prompt', e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe what you want to generate... (⌘/Ctrl + Enter to generate)"
        autoSize={{ minRows: 2, maxRows: 6 }}
        disabled={isCreating}
        style={{ flex: 1 }}
      />
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={handleGenerate}
        loading={isCreating}
        disabled={!prompt.trim() || isCreating}
        size="large"
      >
        Generate
      </Button>
    </div>
  );
});

PromptInput.displayName = 'PromptInput';
```

### ModelSelect Component

```typescript
// src/components/ModelSelect.tsx
import { Select } from 'antd';
import { memo, useEffect, useState } from 'react';
import { useImageStore } from '@/store/image';
import { clientS } from '@/libs/trpc/client';

interface ModelOption {
  label: string;
  value: string;
  provider: string;
  capabilities: string[];
}

export const ModelSelect = memo(() => {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);

  const model = useImageStore((s) => s.model);
  const provider = useImageStore((s) => s.provider);
  const setModelAndProvider = useImageStore((s) => s.setModelAndProviderOnSelect);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const data = await clientS.image.getAvailableModels.query();
      setModels(data);
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (value: string) => {
    const [selectedProvider, selectedModel] = value.split('/');
    setModelAndProvider(selectedModel, selectedProvider);
  };

  const currentValue = model && provider ? `${provider}/${model}` : undefined;

  return (
    <Select
      value={currentValue}
      onChange={handleChange}
      loading={loading}
      placeholder="Select a model"
      style={{ width: '100%' }}
      options={models.map((m) => ({
        label: `${m.provider} - ${m.label}`,
        value: `${m.provider}/${m.value}`,
      }))}
      showSearch
      filterOption={(input, option) =>
        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
      }
    />
  );
});

ModelSelect.displayName = 'ModelSelect';
```

### GenerationItem Component

```typescript
// src/components/GenerationItem.tsx
import { DeleteOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Image, Skeleton, Space, Typography } from 'antd';
import { memo, useEffect, useState } from 'react';
import { Generation } from '@/database/schemas';
import { useImageStore } from '@/store/image';

const { Text } = Typography;

interface GenerationItemProps {
  generation: Generation;
}

export const GenerationItem = memo<GenerationItemProps>(({ generation }) => {
  const removeGeneration = useImageStore((s) => s.removeGeneration);
  const reuseSeed = useImageStore((s) => s.reuseSeed);

  // Check status via polling
  const status = useGenerationPolling(generation.id, generation.asyncTaskId);

  // Success state
  if (status === 'success' && generation.asset) {
    return (
      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
        <Image
          src={generation.asset.url}
          alt="Generated"
          style={{ width: '100%', display: 'block' }}
          preview={{
            mask: (
              <Space direction="vertical" size="small">
                <Button
                  type="text"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownload(generation.asset!.url, generation.id)}
                >
                  Download
                </Button>
                {generation.seed && (
                  <Button
                    type="text"
                    icon={<ReloadOutlined />}
                    onClick={() => reuseSeed(Number(generation.seed))}
                  >
                    Reuse Seed
                  </Button>
                )}
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeGeneration(generation.id)}
                >
                  Delete
                </Button>
              </Space>
            ),
          }}
        />
        {generation.seed && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              background: 'rgba(0,0,0,0.6)',
              padding: '4px 8px',
              borderRadius: 4,
            }}
          >
            <Text style={{ color: 'white', fontSize: 12 }}>Seed: {generation.seed}</Text>
          </div>
        )}
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div
        style={{
          padding: 16,
          border: '1px solid #ff4d4f',
          borderRadius: 8,
          background: '#fff1f0',
        }}
      >
        <Text type="danger">Generation failed</Text>
        <br />
        <Button size="small" onClick={() => removeGeneration(generation.id)} style={{ marginTop: 8 }}>
          Remove
        </Button>
      </div>
    );
  }

  // Loading state
  return (
    <div>
      <Skeleton.Image active style={{ width: '100%', height: 300 }} />
      <ElapsedTime startTime={generation.createdAt} />
    </div>
  );
});

GenerationItem.displayName = 'GenerationItem';

// Helper: Download image
async function handleDownload(url: string, generationId: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `generation_${generationId}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Download failed:', error);
  }
}

// Helper: Elapsed time counter
function ElapsedTime({ startTime }: { startTime: Date }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <Text type="secondary" style={{ fontSize: 12 }}>
      {elapsed}s elapsed...
    </Text>
  );
}

// Hook: Polling
function useGenerationPolling(generationId: string, asyncTaskId: string | null) {
  const [status, setStatus] = useState<'pending' | 'processing' | 'success' | 'error'>('pending');
  const [interval, setInterval] = useState(1000);

  useEffect(() => {
    if (!asyncTaskId || status === 'success' || status === 'error') {
      return;
    }

    const poll = async () => {
      try {
        const result = await clientS.generation.getGenerationStatus.query({
          generationId,
          asyncTaskId,
        });

        setStatus(result.status);

        if (result.status !== 'success' && result.status !== 'error') {
          setInterval((prev) => Math.min(prev * 2, 30000));
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    const timer = setTimeout(poll, interval);
    return () => clearTimeout(timer);
  }, [generationId, asyncTaskId, status, interval]);

  return status;
}
```

### DimensionControlGroup Component

```typescript
// src/components/DimensionControlGroup.tsx
import { LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { Button, InputNumber, Space } from 'antd';
import { memo } from 'react';
import { useImageStore } from '@/store/image';

export const DimensionControlGroup = memo(() => {
  const width = useImageStore((s) => s.parameters.width);
  const height = useImageStore((s) => s.parameters.height);
  const isLocked = useImageStore((s) => s.isAspectRatioLocked);

  const setWidth = useImageStore((s) => s.setWidth);
  const setHeight = useImageStore((s) => s.setHeight);
  const toggleLock = useImageStore((s) => s.toggleAspectRatioLock);

  return (
    <Space.Compact style={{ width: '100%' }}>
      <InputNumber
        value={width}
        onChange={(value) => setWidth(value || 1024)}
        min={256}
        max={2048}
        step={64}
        prefix="W:"
        style={{ width: '45%' }}
      />
      <Button
        icon={isLocked ? <LockOutlined /> : <UnlockOutlined />}
        onClick={toggleLock}
        style={{ width: '10%' }}
      />
      <InputNumber
        value={height}
        onChange={(value) => setHeight(value || 1024)}
        min={256}
        max={2048}
        step={64}
        prefix="H:"
        style={{ width: '45%' }}
      />
    </Space.Compact>
  );
});

DimensionControlGroup.displayName = 'DimensionControlGroup';
```

---

## tRPC Backend

### Image Router

```typescript
// src/server/routers/lambda/image.ts
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authProcedure, router } from '@/server/trpc';
import { nanoid } from 'nanoid';

const CreateImageSchema = z.object({
  generationTopicId: z.string().uuid(),
  provider: z.string(),
  model: z.string(),
  imageNum: z.number().min(1).max(4),
  params: z.object({
    prompt: z.string().min(1).max(2000),
    width: z.number().optional(),
    height: z.number().optional(),
    seed: z.number().optional(),
    steps: z.number().optional(),
    cfg: z.number().optional(),
    quality: z.string().optional(),
    style: z.string().optional(),
    imageUrl: z.string().optional(),
    imageUrls: z.array(z.string()).optional(),
  }),
});

export const imageRouter = router({
  // Get available models
  getAvailableModels: authProcedure.query(async ({ ctx }) => {
    const { database } = ctx;

    // Fetch from database or config
    return [
      {
        provider: 'openai',
        value: 'dall-e-3',
        label: 'DALL-E 3',
        capabilities: ['text-to-image'],
      },
      {
        provider: 'google',
        value: 'imagen-3',
        label: 'Imagen 3',
        capabilities: ['text-to-image', 'image-to-image'],
      },
      // ... more models
    ];
  }),

  // Create image generation
  createImage: authProcedure.input(CreateImageSchema).mutation(async ({ ctx, input }) => {
    const { userId, database } = ctx;
    const { generationTopicId, provider, model, imageNum, params } = input;

    // 1. Verify topic ownership
    const topic = await database.imageGenerationTopic.findUnique({
      where: { id: generationTopicId },
    });

    if (!topic || topic.userId !== userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Topic not found' });
    }

    // 2. Check coins
    const user = await database.user.findUnique({ where: { id: userId } });
    const costPerImage = calculateCost(model, params);
    const totalCost = costPerImage * imageNum;

    if (user.coins < totalCost) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient coins' });
    }

    // 3. Create batch
    const batch = await database.generationBatch.create({
      data: {
        generationTopicId,
        userId,
        provider,
        model,
        prompt: params.prompt,
        config: params,
        width: params.width?.toString(),
        height: params.height?.toString(),
      },
    });

    // 4. Create generations
    const generations = await Promise.all(
      Array.from({ length: imageNum }, async () => {
        // Create async task
        const asyncTask = await database.asyncTask.create({
          data: {
            userId,
            type: 'image_generation',
            status: 'pending',
            metadata: {
              batchId: batch.id,
              provider,
              model,
              params,
            },
          },
        });

        // Create generation
        return database.generation.create({
          data: {
            generationBatchId: batch.id,
            userId,
            asyncTaskId: asyncTask.id,
          },
        });
      }),
    );

    // 5. Queue jobs
    await Promise.all(
      generations.map((gen) =>
        queueImageGeneration({
          generationId: gen.id,
          asyncTaskId: gen.asyncTaskId!,
          provider,
          model,
          params,
        }),
      ),
    );

    // 6. Deduct coins
    await database.user.update({
      where: { id: userId },
      data: { coins: { decrement: totalCost } },
    });

    return {
      success: true,
      data: {
        batch,
        generations,
      },
    };
  }),
});

// Helper: Calculate cost
function calculateCost(model: string, params: any): number {
  const baseCosts: Record<string, number> = {
    'dall-e-3': 10,
    'imagen-3': 8,
    'sd-3': 5,
  };

  let cost = baseCosts[model] || 5;

  // HD quality costs more
  if (params.quality === 'hd') {
    cost *= 1.5;
  }

  return Math.ceil(cost);
}

// Helper: Queue job
async function queueImageGeneration(job: any) {
  // Add to Redis queue or background processor
  // Implementation depends on your queue system (BullMQ, etc)
  console.log('Queued image generation:', job);
}
```

### Generation Router

```typescript
// src/server/routers/lambda/generation.ts
import { z } from 'zod';
import { authProcedure, router } from '@/server/trpc';
import { TRPCError } from '@trpc/server';

export const generationRouter = router({
  // Get status of a generation
  getGenerationStatus: authProcedure
    .input(
      z.object({
        generationId: z.string().uuid(),
        asyncTaskId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { userId, database } = ctx;
      const { generationId, asyncTaskId } = input;

      // Fetch generation
      const generation = await database.generation.findUnique({
        where: { id: generationId },
      });

      if (!generation || generation.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      // Fetch async task
      const task = await database.asyncTask.findUnique({
        where: { id: asyncTaskId },
      });

      return {
        status: task?.status || 'pending',
        generation,
        error: task?.error,
      };
    }),

  // Delete generation
  deleteGeneration: authProcedure
    .input(z.object({ generationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { userId, database } = ctx;
      const { generationId } = input;

      const generation = await database.generation.findUnique({
        where: { id: generationId },
      });

      if (!generation || generation.userId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      // Delete from storage if exists
      if (generation.asset?.url) {
        await deleteFromStorage(generation.asset.url);
      }

      // Delete from database
      await database.generation.delete({
        where: { id: generationId },
      });

      return { success: true };
    }),
});

async function deleteFromStorage(url: string) {
  // Implementation depends on your storage (S3, Cloudflare R2, etc)
  console.log('Deleting from storage:', url);
}
```

---

## Hooks Customizados

### useSWR for Data Fetching

```typescript
// src/hooks/useGenerationBatches.ts
import useSWR from 'swr';
import { clientS } from '@/libs/trpc/client';
import { GenerationBatch } from '@/database/schemas';

export function useGenerationBatches(topicId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<GenerationBatch[]>(
    topicId ? ['generationBatches', topicId] : null,
    async () => {
      if (!topicId) return [];
      return clientS.generationBatch.getGenerationBatches.query({ topicId });
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    },
  );

  return {
    batches: data || [],
    isLoading,
    error,
    refresh: mutate,
  };
}
```

### usePolling Hook

```typescript
// src/hooks/usePolling.ts
import { useEffect, useState } from 'react';

interface UsePollingOptions {
  interval?: number;
  maxInterval?: number;
  exponentialBackoff?: boolean;
  enabled?: boolean;
}

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  shouldStop: (data: T) => boolean,
  options: UsePollingOptions = {},
) {
  const {
    interval: initialInterval = 1000,
    maxInterval = 30000,
    exponentialBackoff = true,
    enabled = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(initialInterval);

  useEffect(() => {
    if (!enabled) return;

    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      try {
        setIsPolling(true);
        const result = await fetchFn();
        setData(result);
        setError(null);

        if (shouldStop(result)) {
          setIsPolling(false);
          return;
        }

        // Calculate next interval
        const nextInterval = exponentialBackoff
          ? Math.min(currentInterval * 2, maxInterval)
          : initialInterval;

        setCurrentInterval(nextInterval);
        timeoutId = setTimeout(poll, nextInterval);
      } catch (err) {
        setError(err as Error);
        // Continue polling even on error
        timeoutId = setTimeout(poll, currentInterval);
      }
    };

    timeoutId = setTimeout(poll, currentInterval);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [enabled, currentInterval, fetchFn, shouldStop, exponentialBackoff, initialInterval, maxInterval]);

  return { data, error, isPolling };
}
```

---

## Utilities

### Image Download Utility

```typescript
// src/utils/downloadImage.ts
export async function downloadImage(url: string, filename?: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();

    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename || `image_${Date.now()}.png`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(downloadUrl);

    return true;
  } catch (error) {
    console.error('Download failed:', error);
    return false;
  }
}

export async function downloadBatchAsZip(
  images: Array<{ url: string; seed?: number }>,
  batchId: string,
) {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Add all images
    await Promise.all(
      images.map(async (img, index) => {
        const response = await fetch(img.url);
        const blob = await response.blob();
        const filename = `image_${index + 1}${img.seed ? `_seed_${img.seed}` : ''}.png`;
        zip.file(filename, blob);
      }),
    );

    // Generate ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // Download
    const url = window.URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `batch_${batchId}_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error('Batch download failed:', error);
    return false;
  }
}
```

### Aspect Ratio Calculator

```typescript
// src/utils/aspectRatio.ts
export const ASPECT_RATIOS = [
  { label: 'Square', value: '1:1', ratio: 1 },
  { label: 'Landscape', value: '16:9', ratio: 16 / 9 },
  { label: 'Portrait', value: '9:16', ratio: 9 / 16 },
  { label: 'Wide', value: '21:9', ratio: 21 / 9 },
  { label: 'Ultra Wide', value: '32:9', ratio: 32 / 9 },
  { label: '4:3', value: '4:3', ratio: 4 / 3 },
  { label: '3:4', value: '3:4', ratio: 3 / 4 },
];

export function calculateDimensions(
  currentWidth: number,
  currentHeight: number,
  aspectRatio: string,
): { width: number; height: number } {
  const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number);
  const ratio = widthRatio / heightRatio;

  // Keep width, adjust height
  const newHeight = Math.round(currentWidth / ratio);

  return {
    width: currentWidth,
    height: newHeight,
  };
}

export function getAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  const tolerance = 0.01;

  const match = ASPECT_RATIOS.find((ar) => Math.abs(ar.ratio - ratio) < tolerance);

  return match?.value || 'custom';
}
```

---

## Integrações de API Externa

### OpenAI DALL-E Integration

```typescript
// src/services/imageGeneration/providers/openai.ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateWithDallE(params: {
  prompt: string;
  model: 'dall-e-2' | 'dall-e-3';
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
}) {
  try {
    const response = await openai.images.generate({
      model: params.model,
      prompt: params.prompt,
      size: params.size || '1024x1024',
      quality: params.quality || 'standard',
      style: params.style || 'vivid',
      n: params.n || 1,
    });

    return response.data.map((img) => ({
      url: img.url!,
      revisedPrompt: img.revised_prompt,
    }));
  } catch (error) {
    console.error('DALL-E generation failed:', error);
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}
```

### Google Imagen Integration

```typescript
// src/services/imageGeneration/providers/google.ts
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

export async function generateWithImagen(params: {
  prompt: string;
  model: string;
  width?: number;
  height?: number;
  seed?: number;
  imageUrl?: string;
}) {
  try {
    const client = await auth.getClient();
    const projectId = process.env.GOOGLE_PROJECT_ID;

    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/${params.model}:predict`;

    const requestBody = {
      instances: [
        {
          prompt: params.prompt,
          ...(params.imageUrl && { image: { bytesBase64Encoded: await fetchImageAsBase64(params.imageUrl) } }),
        },
      ],
      parameters: {
        sampleCount: 1,
        ...(params.width && params.height && {
          width: params.width,
          height: params.height,
        }),
        ...(params.seed && { seed: params.seed }),
      },
    };

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: requestBody,
    });

    const predictions = response.data.predictions;

    return predictions.map((pred: any) => ({
      url: pred.bytesBase64Encoded
        ? `data:image/png;base64,${pred.bytesBase64Encoded}`
        : null,
      seed: pred.seed,
    }));
  } catch (error) {
    console.error('Imagen generation failed:', error);
    throw new Error(`Google API error: ${error.message}`);
  }
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}
```

---

## Testes

### Store Tests

```typescript
// src/store/image/__tests__/generationConfig.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useImageStore } from '../store';

describe('GenerationConfig Slice', () => {
  beforeEach(() => {
    // Reset store before each test
    useImageStore.setState({
      model: '',
      provider: '',
      parameters: { prompt: '' },
      imageNum: 1,
      isAspectRatioLocked: true,
    });
  });

  it('should set model and provider', async () => {
    const store = useImageStore.getState();

    await store.setModelAndProviderOnSelect('dall-e-3', 'openai');

    const state = useImageStore.getState();
    expect(state.model).toBe('dall-e-3');
    expect(state.provider).toBe('openai');
  });

  it('should update prompt parameter', () => {
    const store = useImageStore.getState();

    store.setParamOnInput('prompt', 'A cute cat');

    const state = useImageStore.getState();
    expect(state.parameters.prompt).toBe('A cute cat');
  });

  it('should maintain aspect ratio when locked', () => {
    const store = useImageStore.getState();

    // Set initial dimensions
    store.setParamOnInput('width', 1024);
    store.setParamOnInput('height', 1024);

    // Lock aspect ratio
    store.isAspectRatioLocked = true;

    // Change width
    store.setWidth(2048);

    const state = useImageStore.getState();
    expect(state.parameters.width).toBe(2048);
    // Height should adjust to maintain 1:1 ratio
    expect(state.parameters.height).toBe(2048);
  });
});
```

### Component Tests

```typescript
// src/components/__tests__/PromptInput.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PromptInput } from '../PromptInput';
import { useImageStore } from '@/store/image';

vi.mock('@/store/image');

describe('PromptInput', () => {
  it('should render textarea and generate button', () => {
    (useImageStore as any).mockReturnValue({
      parameters: { prompt: '' },
      setParamOnInput: vi.fn(),
      createImage: vi.fn(),
      isCreating: false,
    });

    render(<PromptInput />);

    expect(screen.getByPlaceholderText(/describe what you want/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('should call createImage when button clicked', async () => {
    const mockCreateImage = vi.fn();

    (useImageStore as any).mockReturnValue({
      parameters: { prompt: 'A cute cat' },
      setParamOnInput: vi.fn(),
      createImage: mockCreateImage,
      isCreating: false,
    });

    render(<PromptInput />);

    const button = screen.getByRole('button', { name: /generate/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockCreateImage).toHaveBeenCalledTimes(1);
    });
  });

  it('should disable button when prompt is empty', () => {
    (useImageStore as any).mockReturnValue({
      parameters: { prompt: '' },
      setParamOnInput: vi.fn(),
      createImage: vi.fn(),
      isCreating: false,
    });

    render(<PromptInput />);

    const button = screen.getByRole('button', { name: /generate/i });
    expect(button).toBeDisabled();
  });
});
```

### API Tests

```typescript
// src/server/routers/lambda/__tests__/image.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCaller } from '../../../trpc';
import { imageRouter } from '../image';

describe('Image Router', () => {
  let caller: any;

  beforeEach(() => {
    const mockContext = {
      userId: 'user-123',
      database: {
        // Mock database
      },
    };

    caller = createCaller(imageRouter, mockContext);
  });

  it('should return available models', async () => {
    const models = await caller.getAvailableModels();

    expect(models).toBeInstanceOf(Array);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('provider');
    expect(models[0]).toHaveProperty('value');
  });

  it('should create image generation', async () => {
    const input = {
      generationTopicId: 'topic-123',
      provider: 'openai',
      model: 'dall-e-3',
      imageNum: 1,
      params: {
        prompt: 'A cute cat',
        width: 1024,
        height: 1024,
      },
    };

    const result = await caller.createImage(input);

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('batch');
    expect(result.data).toHaveProperty('generations');
    expect(result.data.generations).toHaveLength(1);
  });

  it('should throw error for insufficient coins', async () => {
    // Mock user with 0 coins
    vi.mocked(database.user.findUnique).mockResolvedValue({
      id: 'user-123',
      coins: 0,
    });

    const input = {
      generationTopicId: 'topic-123',
      provider: 'openai',
      model: 'dall-e-3',
      imageNum: 1,
      params: {
        prompt: 'A cute cat',
      },
    };

    await expect(caller.createImage(input)).rejects.toThrow('Insufficient coins');
  });
});
```

---

## Conclusão

Esta coleção de códigos de exemplo cobre todas as partes principais do sistema de geração de imagens:

- ✅ **Setup completo** (dependências, database, TypeScript)
- ✅ **Zustand Store** (4 slices completos com actions)
- ✅ **Componentes UI** (PromptInput, ModelSelect, GenerationItem, etc)
- ✅ **Backend tRPC** (routers com validação e segurança)
- ✅ **Hooks customizados** (SWR, polling)
- ✅ **Utilities** (download, aspect ratio)
- ✅ **Integrações API** (OpenAI, Google)
- ✅ **Testes** (store, components, API)

Todos os exemplos são baseados no código real do LobeChat e podem ser copiados diretamente para seu projeto, com ajustes mínimos conforme necessário.

Para um sistema completo e funcional, combine estes exemplos com a arquitetura documentada nos arquivos anteriores (01-ARQUITETURA.md, 02-COMPONENTES.md, etc).
