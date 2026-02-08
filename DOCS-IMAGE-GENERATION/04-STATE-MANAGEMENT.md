# 04 - STATE MANAGEMENT (Zustand)

## 🗄️ Visão Geral

O estado da página de geração de imagens é gerenciado por **Zustand**, uma biblioteca leve de state management para React.

**Store Principal**: `ImageStore` (combinação de 4 slices)

---

## 🏗️ Estrutura do Store

```typescript
// src/store/image/store.ts
export interface ImageStore extends
  GenerationConfigState,          // Configurações de geração
  GenerationTopicState,            // Topics/projetos
  GenerationBatchState,            // Batches de imagens
  CreateImageState,                // Flag de criação
  GenerationConfigAction,          // Actions para config
  GenerationTopicAction,           // Actions para topics
  GenerationBatchAction,           // Actions para batches
  CreateImageAction {}             // Action de criar imagem

export const useImageStore = create<ImageStore>()(
  devtools(
    persist(
      (...args) => ({
        // Slices
        ...generationConfigSlice(...args),
        ...generationTopicSlice(...args),
        ...generationBatchSlice(...args),
        ...createImageSlice(...args),
      }),
      {
        name: 'IMAGE_STORE',
        partialize: (state) => ({
          // Persist apenas configs
          model: state.model,
          provider: state.provider,
          parameters: state.parameters,
          imageNum: state.imageNum,
        }),
      }
    )
  )
);
```

---

## 1️⃣ GENERATION CONFIG SLICE

**Arquivo**: `src/store/image/slices/generationConfig/`

### State

```typescript
interface GenerationConfigState {
  model: string;                    // ex: "gemini-3-pro-image-preview"
  provider: string;                  // ex: "google"
  parameters: RuntimeImageGenParams; // Todos os params
  parametersSchema: ModelParamsSchema; // Schema do modelo
  imageNum: number;                  // 1-4
  isAspectRatioLocked: boolean;
  activeAspectRatio: string | null;  // ex: "16:9"
  isInit: boolean;                   // Se foi inicializado
}
```

### Actions

```typescript
interface GenerationConfigAction {
  // Model Selection
  setModelAndProviderOnSelect: (model: string, provider: string) => void;

  // Parameters
  setParamOnInput: (name: string, value: any) => void;
  setImageNum: (num: number) => void;

  // Dimensions
  setWidth: (width: number) => void;
  setHeight: (height: number) => void;

  // Aspect Ratio
  toggleAspectRatioLock: () => void;
  setAspectRatio: (ratio: string) => void;

  // Reuse Settings
  reuseSettings: (model: string, provider: string, settings: Record<string, any>) => void;
  reuseSeed: (seed: number) => void;

  // Init
  initializeImageConfig: () => Promise<void>;
}
```

### Implementação de Actions Chave

#### setModelAndProviderOnSelect

```typescript
setModelAndProviderOnSelect: (model, provider) => {
  // 1. Buscar schema do modelo
  const modelInfo = getModelInfo(model, provider);
  const parametersSchema = modelInfo.parametersSchema;

  // 2. Resetar params para defaults do schema
  const defaultParams = getDefaultParamsFromSchema(parametersSchema);

  // 3. Manter prompt atual (se existe)
  const currentPrompt = get().parameters.prompt;

  // 4. Update state
  set({
    model,
    provider,
    parametersSchema,
    parameters: {
      ...defaultParams,
      prompt: currentPrompt,
    },
  });

  // 5. Auto-adjust dimensions se necessário
  autoAdjustDimensions(parametersSchema);
}
```

#### setParamOnInput

```typescript
setParamOnInput: (name, value) => {
  const currentParams = get().parameters;

  set({
    parameters: {
      ...currentParams,
      [name]: value,
    },
  });
}
```

#### setWidth (com Aspect Ratio Lock)

```typescript
setWidth: (width) => {
  const { height, isAspectRatioLocked, parametersSchema } = get();

  // Validar constraints
  const constraints = parametersSchema.constraints?.width;
  if (constraints) {
    width = clamp(width, constraints.min, constraints.max);
  }

  // Se locked, ajustar height proporcionalmente
  let newHeight = height;
  if (isAspectRatioLocked && height) {
    const ratio = width / height;
    newHeight = Math.round(width / ratio);

    // Validar height constraints também
    const heightConstraints = parametersSchema.constraints?.height;
    if (heightConstraints) {
      newHeight = clamp(newHeight, heightConstraints.min, heightConstraints.max);
    }
  }

  set({
    parameters: {
      ...get().parameters,
      width,
      height: newHeight,
    },
  });
}
```

#### toggleAspectRatioLock

```typescript
toggleAspectRatioLock: () => {
  const { isAspectRatioLocked, parameters } = get();

  // Se está lockando agora, calcular ratio ativo
  let activeRatio = null;
  if (!isAspectRatioLocked && parameters.width && parameters.height) {
    activeRatio = `${parameters.width}:${parameters.height}`;
  }

  set({
    isAspectRatioLocked: !isAspectRatioLocked,
    activeAspectRatio: activeRatio,
  });
}
```

#### reuseSeed

```typescript
reuseSeed: (seed) => {
  const { parametersSchema } = get();

  // Verificar se modelo suporta seed
  if (!parametersSchema.supportedParams.includes('seed')) {
    // Copiar para clipboard
    navigator.clipboard.writeText(String(seed));
    message.success('Seed copied to clipboard');
    return;
  }

  // Aplicar seed
  get().setParamOnInput('seed', seed);
  message.success('Seed applied to config');
}
```

---

## 2️⃣ GENERATION TOPIC SLICE

**Arquivo**: `src/store/image/slices/generationTopic/`

### State

```typescript
interface GenerationTopicState {
  generationTopics: ImageGenerationTopic[];    // Lista de topics
  activeGenerationTopicId: string | null;      // Topic ativo
  loadingGenerationTopicIds: string[];         // Topics sendo carregados
}
```

### Actions

```typescript
interface GenerationTopicAction {
  // Create
  createGenerationTopic: (prompts: string[]) => Promise<string>;
  openNewGenerationTopic: () => Promise<void>;

  // Update
  switchGenerationTopic: (topicId: string) => void;
  summaryGenerationTopicTitle: (topicId: string, prompts: string[]) => Promise<void>;
  updateGenerationTopicCover: (topicId: string, imageUrl: string) => Promise<void>;

  // Delete
  removeGenerationTopic: (topicId: string) => Promise<void>;

  // Fetch
  refreshGenerationTopics: () => Promise<void>;

  // SWR Hook
  useFetchGenerationTopics: (enabled: boolean) => SWRResponse;
}
```

### Implementação de Actions Chave

#### createGenerationTopic

```typescript
createGenerationTopic: async (prompts) => {
  // 1. Criar topic temporário (otimista)
  const tempTopic: ImageGenerationTopic = {
    id: `temp_${Date.now()}`,
    title: undefined,
    coverUrl: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  set({
    generationTopics: [tempTopic, ...get().generationTopics],
  });

  // 2. Chamar backend
  const { topic } = await generationTopicService.createTopic();

  // 3. Substituir temp por real
  set({
    generationTopics: get().generationTopics.map(t =>
      t.id === tempTopic.id ? topic : t
    ),
  });

  // 4. Gerar título via AI (async, não aguarda)
  get().summaryGenerationTopicTitle(topic.id, prompts);

  return topic.id;
}
```

#### summaryGenerationTopicTitle

```typescript
summaryGenerationTopicTitle: async (topicId, prompts) => {
  try {
    // 1. Gerar título via AI
    const title = await aiService.generateTopicTitle(prompts);

    // 2. Update backend
    await generationTopicService.updateTopic({
      id: topicId,
      value: { title },
    });

    // 3. Update local state
    set({
      generationTopics: get().generationTopics.map(t =>
        t.id === topicId ? { ...t, title } : t
      ),
    });
  } catch (error) {
    // Fallback: usar primeiras palavras do prompt
    const fallbackTitle = prompts[0].split(' ').slice(0, 3).join(' ');

    await generationTopicService.updateTopic({
      id: topicId,
      value: { title: fallbackTitle },
    });

    set({
      generationTopics: get().generationTopics.map(t =>
        t.id === topicId ? { ...t, title: fallbackTitle } : t
      ),
    });
  }
}
```

#### switchGenerationTopic

```typescript
switchGenerationTopic: (topicId) => {
  set({ activeGenerationTopicId: topicId });

  // Update URL
  const url = new URL(window.location.href);
  url.searchParams.set('topic', topicId);
  window.history.pushState({}, '', url);
}
```

#### removeGenerationTopic

```typescript
removeGenerationTopic: async (topicId) => {
  const { generationTopics, activeGenerationTopicId } = get();

  // 1. Se é o topic ativo, mudar para próximo
  if (activeGenerationTopicId === topicId) {
    const index = generationTopics.findIndex(t => t.id === topicId);
    const nextTopic = generationTopics[index + 1] || generationTopics[index - 1];

    if (nextTopic) {
      get().switchGenerationTopic(nextTopic.id);
    } else {
      // Nenhum topic restante, criar novo
      await get().openNewGenerationTopic();
    }
  }

  // 2. Optimistic: remover da lista
  set({
    generationTopics: generationTopics.filter(t => t.id !== topicId),
  });

  // 3. Deletar no backend
  await generationTopicService.deleteTopic({ id: topicId });

  // 4. Refresh para garantir consistência
  await get().refreshGenerationTopics();
}
```

#### useFetchGenerationTopics (SWR Hook)

```typescript
useFetchGenerationTopics: (enabled = true) => {
  return useSWR(
    enabled ? 'generation-topics' : null,
    async () => {
      const topics = await generationTopicService.getAllTopics();

      // Update state
      get().internal_setGenerationTopics(topics);

      return topics;
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );
}
```

---

## 3️⃣ GENERATION BATCH SLICE

**Arquivo**: `src/store/image/slices/generationBatch/`

### State

```typescript
interface GenerationBatchState {
  generationBatchesMap: Record<string, GenerationBatch[]>;
  // Key: topicId, Value: array de batches
}
```

### Actions

```typescript
interface GenerationBatchAction {
  // Fetch
  useFetchGenerationBatches: (topicId: string) => SWRResponse;
  refreshGenerationBatches: () => Promise<void>;

  // Polling
  useCheckGenerationStatus: (
    generationId: string,
    asyncTaskId: string,
    topicId: string
  ) => SWRResponse;

  // Delete
  removeGeneration: (generationId: string) => Promise<void>;
  removeGenerationBatch: (batchId: string, topicId: string) => Promise<void>;

  // Internal
  setTopicBatchLoaded: (topicId: string) => void;
}
```

### Implementação de Actions Chave

#### useFetchGenerationBatches

```typescript
useFetchGenerationBatches: (topicId) => {
  return useSWR(
    topicId ? ['generation-batches', topicId] : null,
    async () => {
      const batches = await generationBatchService.getBatches({ topicId });

      // Update state
      set({
        generationBatchesMap: {
          ...get().generationBatchesMap,
          [topicId]: batches,
        },
      });

      return batches;
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );
}
```

#### useCheckGenerationStatus (Polling)

```typescript
useCheckGenerationStatus: (generationId, asyncTaskId, topicId) => {
  // Exponential backoff state
  const [interval, setInterval] = useState(1000);
  const [requestCount, setRequestCount] = useState(0);

  return useSWR(
    generationId ? ['generation-status', generationId] : null,
    async () => {
      const result = await generationService.getGenerationStatus({
        generationId,
        asyncTaskId,
      });

      // Update local state se success
      if (result.status === 'Success' && result.generation) {
        get().internal_updateGeneration(topicId, result.generation);
      }

      return result;
    },
    {
      refreshInterval: interval,
      refreshWhenHidden: false,
      onSuccess: (data) => {
        // Stop polling se finalizado
        if (data.status === 'Success' || data.status === 'Error') {
          setInterval(0);

          // Update topic cover se primeira imagem
          if (data.status === 'Success' && data.generation?.asset?.thumbnailUrl) {
            get().maybeUpdateTopicCover(topicId, data.generation.asset.thumbnailUrl);
          }

          return;
        }

        // Exponential backoff
        setRequestCount(prev => prev + 1);
        if (requestCount % 5 === 0 && interval < 30000) {
          setInterval(prev => Math.min(prev * 2, 30000));
        }
      },
    }
  );
}
```

#### removeGeneration

```typescript
removeGeneration: async (generationId) => {
  const { generationBatchesMap, activeGenerationTopicId } = get();

  if (!activeGenerationTopicId) return;

  const batches = generationBatchesMap[activeGenerationTopicId];
  if (!batches) return;

  // 1. Encontrar batch e generation
  let targetBatch: GenerationBatch | null = null;
  let updatedBatches = batches.map(batch => {
    const hasGeneration = batch.generations.some(g => g.id === generationId);

    if (hasGeneration) {
      targetBatch = batch;

      return {
        ...batch,
        generations: batch.generations.filter(g => g.id !== generationId),
      };
    }

    return batch;
  });

  // 2. Se batch ficou vazio, remover batch também
  if (targetBatch && targetBatch.generations.length === 1) {
    updatedBatches = updatedBatches.filter(b => b.id !== targetBatch!.id);
  }

  // 3. Optimistic update
  set({
    generationBatchesMap: {
      ...generationBatchesMap,
      [activeGenerationTopicId]: updatedBatches,
    },
  });

  // 4. Backend delete
  await generationService.deleteGeneration({ generationId });

  // 5. Refresh para garantir consistência
  await get().refreshGenerationBatches();
}
```

---

## 4️⃣ CREATE IMAGE SLICE

**Arquivo**: `src/store/image/slices/createImage/`

### State

```typescript
interface CreateImageState {
  isCreating: boolean;
  isCreatingWithNewTopic: boolean;
}
```

### Actions

```typescript
interface CreateImageAction {
  createImage: () => Promise<void>;
  recreateImage: (batchId: string) => Promise<void>;
}
```

### Implementação de createImage

```typescript
createImage: async () => {
  const {
    model,
    provider,
    parameters,
    imageNum,
    activeGenerationTopicId,
    createGenerationTopic,
    setTopicBatchLoaded,
    switchGenerationTopic,
    refreshGenerationBatches,
    setParamOnInput,
  } = get();

  // 1. Validação
  if (!parameters.prompt?.trim()) {
    message.error('Please enter a prompt');
    return;
  }

  try {
    // 2. Se sem topic, criar um novo
    let topicId = activeGenerationTopicId;

    if (!topicId) {
      set({ isCreatingWithNewTopic: true });

      topicId = await createGenerationTopic([parameters.prompt]);
      setTopicBatchLoaded(topicId);
      switchGenerationTopic(topicId);
    }

    // 3. Marcar como criando
    set({ isCreating: true });

    // 4. Chamar backend
    await imageService.createImage({
      generationTopicId: topicId,
      provider,
      model,
      imageNum,
      params: parameters,
    });

    // 5. Refresh batches
    await refreshGenerationBatches();

    // 6. Clear prompt
    setParamOnInput('prompt', '');

    message.success('Generation started!');

  } catch (error) {
    console.error('Failed to create image:', error);
    message.error(error.message || 'Failed to start generation');

  } finally {
    // 7. Reset flags
    set({
      isCreating: false,
      isCreatingWithNewTopic: false,
    });
  }
}
```

---

## 📊 SELECTORS

**Arquivo**: `src/store/image/selectors.ts`

```typescript
export const imageGenerationConfigSelectors = {
  model: (state: ImageStore) => state.model,
  provider: (state: ImageStore) => state.provider,
  parameters: (state: ImageStore) => state.parameters,
  parametersSchema: (state: ImageStore) => state.parametersSchema,
  imageNum: (state: ImageStore) => state.imageNum,

  isSupportedParam: (paramName: string) => (state: ImageStore) =>
    state.parametersSchema.supportedParams.includes(paramName),
};

export const generationBatchSelectors = {
  currentGenerationBatches: (state: ImageStore) => {
    const { activeGenerationTopicId, generationBatchesMap } = state;
    return activeGenerationTopicId
      ? generationBatchesMap[activeGenerationTopicId] || []
      : [];
  },

  isCurrentGenerationTopicLoaded: (state: ImageStore) => {
    const { activeGenerationTopicId, generationBatchesMap } = state;
    return activeGenerationTopicId
      ? activeGenerationTopicId in generationBatchesMap
      : false;
  },

  getGenerationBatchByBatchId: (batchId: string) => (state: ImageStore) => {
    const batches = Object.values(state.generationBatchesMap).flat();
    return batches.find(batch => batch.id === batchId);
  },
};

export const generationTopicSelectors = {
  activeGenerationTopicId: (state: ImageStore) => state.activeGenerationTopicId,
  generationTopics: (state: ImageStore) => state.generationTopics,

  getGenerationTopicById: (topicId: string) => (state: ImageStore) =>
    state.generationTopics.find(t => t.id === topicId),
};
```

### Uso em Componentes

```typescript
// Pegar valores individuais
const model = useImageStore(imageGenerationConfigSelectors.model);
const provider = useImageStore(imageGenerationConfigSelectors.provider);

// Pegar valores computados
const currentBatches = useImageStore(
  generationBatchSelectors.currentGenerationBatches
);

// Pegar actions
const { createImage, setParamOnInput } = useImageStore();

// Uso combinado
function MyComponent() {
  const prompt = useImageStore(s => s.parameters.prompt);
  const setPrompt = useImageStore(s => s.setParamOnInput);
  const createImage = useImageStore(s => s.createImage);

  return (
    <div>
      <input
        value={prompt}
        onChange={e => setPrompt('prompt', e.target.value)}
      />
      <button onClick={createImage}>Generate</button>
    </div>
  );
}
```

---

## 🔄 PERSISTÊNCIA

### LocalStorage

```typescript
persist(
  (...args) => ({ ...slices }),
  {
    name: 'IMAGE_STORE',
    partialize: (state) => ({
      // Apenas configs são persistidas
      model: state.model,
      provider: state.provider,
      parameters: state.parameters,
      imageNum: state.imageNum,
    }),
    storage: createJSONStorage(() => localStorage),
  }
)
```

**O que é persistido**:
- Último modelo/provider selecionado
- Parâmetros (width, height, seed, etc.)
- Número de imagens

**O que NÃO é persistido**:
- Topics (vem do servidor)
- Batches (vem do servidor)
- Flags de loading

---

## 🔗 Próximos Passos

- **[05-FLUXO-DADOS.md](./05-FLUXO-DADOS.md)** - Fluxo de dados completo
- **[06-CODIGOS-EXEMPLO.md](./06-CODIGOS-EXEMPLO.md)** - Exemplos de código
