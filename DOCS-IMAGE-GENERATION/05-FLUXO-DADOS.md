# 🔄 FLUXO DE DADOS - Sistema de Geração de Imagens

Este documento detalha como os dados fluem através de todo o sistema de geração de imagens, desde a entrada do usuário até a exibição final.

---

## 📋 Índice

1. [Visão Geral do Fluxo](#visão-geral-do-fluxo)
2. [Fluxo Principal: Gerar Imagem](#fluxo-principal-gerar-imagem)
3. [Fluxo de Polling de Status](#fluxo-de-polling-de-status)
4. [Fluxo de Topics](#fluxo-de-topics)
5. [Fluxo de Upload de Referências](#fluxo-de-upload-de-referências)
6. [Fluxo de Download](#fluxo-de-download)
7. [Fluxo de Reutilização de Configurações](#fluxo-de-reutilização-de-configurações)
8. [Casos de Uso Completos](#casos-de-uso-completos)

---

## Visão Geral do Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│                      CICLO COMPLETO DE GERAÇÃO                  │
└─────────────────────────────────────────────────────────────────┘

1. Usuário configura parâmetros no ConfigPanel
   ↓
2. Parâmetros salvos no Zustand (generationConfig slice)
   ↓
3. Usuário digita prompt no PromptInput
   ↓
4. Usuário clica em "Generate"
   ↓
5. createImage action é chamada
   ↓
6. Topic é criado (se necessário) → backend tRPC
   ↓
7. Backend cria Batch + Generations → AsyncTasks
   ↓
8. Response retorna com generation IDs
   ↓
9. UI mostra loading states (GenerationItem)
   ↓
10. Frontend inicia polling (exponential backoff)
    ↓
11. Backend processa (chamada API externa)
    ↓
12. Polling detecta conclusão (status = Success)
    ↓
13. UI atualiza para mostrar imagem gerada
    ↓
14. Imagem disponível para ações (download, reusar seed, etc)
```

---

## Fluxo Principal: Gerar Imagem

### Diagrama de Sequência

```
Usuario          PromptInput      ImageStore       Backend         Database        ExternalAPI
  |                  |               |                |               |               |
  |--type prompt---> |               |                |               |               |
  |                  |               |                |               |               |
  |--click Generate->|               |                |               |               |
  |                  |               |                |               |               |
  |                  |--createImage()->               |               |               |
  |                  |               |                |               |               |
  |                  |               |--validate----->|               |               |
  |                  |               |                |               |               |
  |                  |               |<--validado-----|               |               |
  |                  |               |                |               |               |
  |                  |               |--trpc.imageRouter.createImage->|               |
  |                  |               |                |               |               |
  |                  |               |                |--INSERT topic->               |
  |                  |               |                |               |               |
  |                  |               |                |<--topic id----|               |
  |                  |               |                |               |               |
  |                  |               |                |--INSERT batch->               |
  |                  |               |                |               |               |
  |                  |               |                |<--batch id----|               |
  |                  |               |                |               |               |
  |                  |               |                |--INSERT generations----------->
  |                  |               |                |               |               |
  |                  |               |                |<--generation ids--------------|
  |                  |               |                |               |               |
  |                  |               |                |--INSERT async_tasks---------->
  |                  |               |                |               |               |
  |                  |               |                |--queue job------------------>|
  |                  |               |                |               |               |
  |                  |               |<--{batch, generations}---------|               |
  |                  |               |                |               |               |
  |                  |<--success-----|                |               |               |
  |                  |               |                |               |               |
  |                  |--refreshBatches()              |               |               |
  |                  |               |                |               |               |
  |<--UI atualizada--|               |                |               |               |
  |                  |               |                |               |               |
  | (LOADING STATE)  |               |                |               |               |
  |                  |               |                |               |    [processing]
  |                  |               |--START POLLING->               |               |
  |                  |               |                |               |               |
  |                  |               |--checkStatus-->|               |               |
  |                  |               |                |               |               |
  |                  |               |                |--SELECT task->|               |
  |                  |               |                |               |               |
  |                  |               |<--{status:pending}-------------|               |
  |                  |               |                |               |               |
  |                  |               | [wait 1s]      |               |               |
  |                  |               |                |               |               |
  |                  |               |--checkStatus-->|               |               |
  |                  |               |                |               |               |
  |                  |               |<--{status:processing}----------|               |
  |                  |               |                |               |               |
  |                  |               | [wait 2s]      |               |               |
  |                  |               |                |               |      [completed]
  |                  |               |--checkStatus-->|               |               |
  |                  |               |                |               |               |
  |                  |               |                |--SELECT gen-->|               |
  |                  |               |                |               |               |
  |                  |               |<--{status:success, asset}------|               |
  |                  |               |                |               |               |
  |                  |               |--update UI---->|               |               |
  |                  |               |                |               |               |
  |<--IMAGE DISPLAYED                |                |               |               |
```

### Passo a Passo Detalhado

#### 1. **Usuário Configura Parâmetros**

```typescript
// ConfigPanel: usuário seleciona modelo
const handleModelSelect = (model: string, provider: string) => {
  imageStore.setModelAndProviderOnSelect(model, provider);
};

// State atualizado:
// generationConfig: {
//   model: 'dall-e-3',
//   provider: 'openai',
//   parameters: { width: 1024, height: 1024, quality: 'standard' },
//   imageNum: 1
// }
```

#### 2. **Usuário Digita Prompt**

```typescript
// PromptInput
const [prompt, setPrompt] = useState('');

<TextArea
  value={prompt}
  onChange={(e) => setPrompt(e.target.value)}
  placeholder="Describe what you want to generate..."
/>
```

#### 3. **Clique em Generate**

```typescript
// PromptInput
const handleGenerate = () => {
  if (!prompt.trim()) {
    toast.error('Please enter a prompt');
    return;
  }

  imageStore.createImage();
};

<Button
  onClick={handleGenerate}
  loading={isCreating}
  disabled={!prompt.trim()}
>
  Generate
</Button>
```

#### 4. **createImage Action (Frontend)**

```typescript
// src/store/image/slices/createImage/action.ts
createImage: async () => {
  const { prompt, model, provider, parameters, imageNum } = get();
  const { activeGenerationTopicId, createGenerationTopic } = get();

  // Validação
  if (!prompt.trim()) throw new Error('Prompt is required');

  try {
    set({ isCreating: true });

    // Criar topic se não existir
    let topicId = activeGenerationTopicId;
    if (!topicId) {
      set({ isCreatingWithNewTopic: true });
      const newTopic = await createGenerationTopic();
      topicId = newTopic.id;
    }

    // Chamar backend
    const result = await clientS.image.createImage.mutate({
      generationTopicId: topicId,
      provider,
      model,
      imageNum,
      params: {
        prompt,
        ...parameters,
      }
    });

    // Atualizar UI
    await get().refreshGenerationBatches(topicId);

    // Limpar prompt
    set({ prompt: '' });

    toast.success(`Generating ${imageNum} image(s)...`);

  } catch (error) {
    console.error('Failed to create image:', error);
    toast.error('Failed to generate image');
  } finally {
    set({
      isCreating: false,
      isCreatingWithNewTopic: false
    });
  }
};
```

#### 5. **Backend - createImage Endpoint**

```typescript
// src/server/routers/lambda/image.ts
createImage: authProcedure
  .input(CreateImageSchema)
  .mutation(async ({ ctx, input }) => {
    const { userId, database } = ctx;
    const { generationTopicId, provider, model, imageNum, params } = input;

    // 1. Verificar permissões e coins
    const user = await database.user.findUnique(userId);
    const cost = calculateCost(model, params);
    if (user.coins < cost * imageNum) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient coins' });
    }

    // 2. Criar batch
    const batch = await database.generationBatch.create({
      data: {
        generationTopicId,
        userId,
        provider,
        model,
        prompt: params.prompt,
        config: params,
        width: params.width,
        height: params.height,
      }
    });

    // 3. Criar generations (N imagens)
    const generations = await Promise.all(
      Array.from({ length: imageNum }).map(async () => {
        // Criar AsyncTask para processamento
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
            }
          }
        });

        // Criar Generation
        return database.generation.create({
          data: {
            generationBatchId: batch.id,
            userId,
            asyncTaskId: asyncTask.id,
          }
        });
      })
    );

    // 4. Adicionar jobs à fila de processamento
    await Promise.all(
      generations.map(gen =>
        queueImageGeneration({
          generationId: gen.id,
          asyncTaskId: gen.asyncTaskId!,
          provider,
          model,
          params,
        })
      )
    );

    // 5. Deduzir coins
    await database.user.update({
      where: { id: userId },
      data: { coins: { decrement: cost * imageNum } }
    });

    return {
      success: true,
      data: {
        batch,
        generations,
      }
    };
  });
```

#### 6. **Background Processing**

```typescript
// Simplified background job processor
async function processImageGeneration(job: {
  generationId: string;
  asyncTaskId: string;
  provider: string;
  model: string;
  params: ImageGenParams;
}) {
  try {
    // 1. Atualizar status para 'processing'
    await database.asyncTask.update({
      where: { id: job.asyncTaskId },
      data: { status: 'processing' }
    });

    // 2. Chamar API externa (OpenAI, Google, etc)
    const externalResult = await callExternalAPI(
      job.provider,
      job.model,
      job.params
    );

    // 3. Upload da imagem para storage (S3, Cloudflare R2, etc)
    const imageUrl = await uploadToStorage(externalResult.imageData);

    // 4. Atualizar generation com resultado
    await database.generation.update({
      where: { id: job.generationId },
      data: {
        asset: {
          url: imageUrl,
          width: externalResult.width,
          height: externalResult.height,
          contentType: 'image/png',
        },
        seed: externalResult.seed,
      }
    });

    // 5. Atualizar AsyncTask para 'success'
    await database.asyncTask.update({
      where: { id: job.asyncTaskId },
      data: {
        status: 'success',
        updatedAt: new Date(),
      }
    });

    // 6. Atualizar cover do topic se for primeira imagem
    await updateTopicCoverIfNeeded(job.generationId);

  } catch (error) {
    // Marcar como erro
    await database.asyncTask.update({
      where: { id: job.asyncTaskId },
      data: {
        status: 'error',
        error: {
          message: error.message,
          stack: error.stack,
        },
        updatedAt: new Date(),
      }
    });
  }
}
```

#### 7. **Polling no Frontend**

```typescript
// src/store/image/slices/generationBatch/action.ts
useCheckGenerationStatus: (generationId: string, asyncTaskId: string) => {
  const [status, setStatus] = useState<'pending' | 'processing' | 'success' | 'error'>('pending');
  const [pollInterval, setPollInterval] = useState(1000); // Start at 1s
  const maxInterval = 30000; // Max 30s

  useEffect(() => {
    if (status === 'success' || status === 'error') {
      return; // Stop polling
    }

    const checkStatus = async () => {
      try {
        const result = await clientS.generation.getGenerationStatus.query({
          generationId,
          asyncTaskId,
        });

        setStatus(result.status);

        if (result.status === 'success' || result.status === 'error') {
          // Refresh batches to get updated data
          await imageStore.refreshGenerationBatches(topicId);
        } else {
          // Exponential backoff: double interval cada vez
          setPollInterval(prev => Math.min(prev * 2, maxInterval));
        }
      } catch (error) {
        console.error('Failed to check status:', error);
      }
    };

    const timer = setTimeout(checkStatus, pollInterval);

    return () => clearTimeout(timer);
  }, [status, pollInterval, generationId, asyncTaskId]);

  return status;
};
```

#### 8. **UI Atualizada com Imagem**

```typescript
// GenerationItem
const GenerationItem = ({ generation }: { generation: Generation }) => {
  const asyncTaskId = generation.asyncTaskId;
  const status = useCheckGenerationStatus(generation.id, asyncTaskId);

  if (status === 'success' && generation.asset) {
    return (
      <SuccessState
        imageUrl={generation.asset.url}
        seed={generation.seed}
        onDownload={() => handleDownload(generation.asset.url)}
        onReuseSeed={() => imageStore.reuseSeed(generation.seed)}
        onDelete={() => imageStore.removeGeneration(generation.id)}
      />
    );
  }

  if (status === 'error') {
    return <ErrorState error={generation.error} onRetry={() => retry()} />;
  }

  return <LoadingState elapsedTime={calculateElapsedTime(generation.createdAt)} />;
};
```

---

## Fluxo de Polling de Status

### Estratégia de Exponential Backoff

```
Tentativa  | Intervalo | Tempo Total Acumulado
-----------|-----------|----------------------
    1      |    1s     |         1s
    2      |    2s     |         3s
    3      |    4s     |         7s
    4      |    8s     |        15s
    5      |   16s     |        31s
    6      |   30s     |        61s (max atingido)
    7      |   30s     |        91s
    8      |   30s     |       121s
    ...    |   30s     |       ...
```

### Código Completo de Polling

```typescript
function useGenerationPolling(generationId: string, asyncTaskId: string) {
  const [attempts, setAttempts] = useState(0);
  const [status, setStatus] = useState<AsyncTaskStatus>('pending');
  const MIN_INTERVAL = 1000; // 1 segundo
  const MAX_INTERVAL = 30000; // 30 segundos

  const getNextInterval = (currentAttempts: number): number => {
    const interval = MIN_INTERVAL * Math.pow(2, currentAttempts);
    return Math.min(interval, MAX_INTERVAL);
  };

  useEffect(() => {
    if (status === 'success' || status === 'error') {
      return; // Stop polling
    }

    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      try {
        const result = await checkGenerationStatus(generationId, asyncTaskId);

        setStatus(result.status);

        if (result.status === 'success' || result.status === 'error') {
          // Polling completo
          onComplete?.(result);
        } else {
          // Continuar polling
          setAttempts(prev => prev + 1);
          const nextInterval = getNextInterval(attempts + 1);
          timeoutId = setTimeout(poll, nextInterval);
        }
      } catch (error) {
        console.error('Polling error:', error);
        // Continuar tentando mesmo com erro
        setAttempts(prev => prev + 1);
        const nextInterval = getNextInterval(attempts + 1);
        timeoutId = setTimeout(poll, nextInterval);
      }
    };

    // Iniciar polling após primeiro intervalo
    const initialInterval = getNextInterval(attempts);
    timeoutId = setTimeout(poll, initialInterval);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [status, attempts, generationId, asyncTaskId]);

  return { status, attempts };
}
```

---

## Fluxo de Topics

### Criar Novo Topic

```
Usuario         TopicSidebar    ImageStore      Backend        Database
  |                 |              |               |              |
  |--click New----> |              |               |              |
  |                 |              |               |              |
  |                 |--createTopic()               |              |
  |                 |              |               |              |
  |                 |              |--trpc.generationTopicRouter.createTopic-->
  |                 |              |               |              |
  |                 |              |               |--INSERT----> |
  |                 |              |               |              |
  |                 |              |               | <--topic id--|
  |                 |              |               |              |
  |                 |              | <--{id, title, coverUrl}-----|
  |                 |              |               |              |
  |                 | <--success---|               |              |
  |                 |              |               |              |
  |                 |--setActive(topicId)          |              |
  |                 |              |               |              |
  | <--UI updated---|              |               |              |
```

### Gerar Título com IA

```typescript
// Após primeira geração em um topic
async summaryGenerationTopicTitle(topicId: string) {
  try {
    // Pegar primeiro batch do topic
    const batches = get().generationBatchesMap[topicId];
    if (!batches?.length) return;

    const firstPrompt = batches[0].prompt;

    // Chamar LLM para gerar título baseado no prompt
    const title = await clientS.generationTopic.summaryTitle.mutate({
      topicId,
      content: firstPrompt,
    });

    // Atualizar local
    set((state) => ({
      generationTopics: state.generationTopics.map(t =>
        t.id === topicId ? { ...t, title } : t
      )
    }));

    toast.success('Topic title generated');
  } catch (error) {
    console.error('Failed to generate title:', error);
  }
}
```

### Switch de Topic

```typescript
// TopicItem onClick
const handleTopicClick = (topicId: string) => {
  imageStore.switchGenerationTopic(topicId);
};

// Action
switchGenerationTopic: (topicId: string) => {
  set({ activeGenerationTopicId: topicId });

  // Carregar batches desse topic
  get().refreshGenerationBatches(topicId);

  // Salvar no localStorage
  localStorage.setItem('active_topic_id', topicId);
};
```

---

## Fluxo de Upload de Referências

### Upload de Imagem Única (imageUrl)

```
Usuario       ImageUrlUpload    FileService     Backend       Storage
  |                |               |              |             |
  |--select file-> |               |              |             |
  |                |               |              |             |
  |                |--validate---> |              |             |
  |                |               |              |             |
  |                | <--valid------|              |             |
  |                |               |              |             |
  |                |--upload---------------------> |            |
  |                |               |              |             |
  |                |               |              |--PUT------> |
  |                |               |              |             |
  |                |               |              | <--URL------|
  |                |               |              |             |
  |                | <--imageUrl------------------|             |
  |                |               |              |             |
  |                |--setParam('imageUrl', url)   |             |
  |                |               |              |             |
  | <--preview-----|               |              |             |
```

### Código de Upload

```typescript
// ImageUrlUpload component
const ImageUrlUpload = () => {
  const { setParamOnInput } = useImageStore();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    // Validação
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
      toast.error('File size must be less than 10MB');
      return;
    }

    try {
      setUploading(true);

      // Upload para servidor
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const { url } = await response.json();

      // Salvar URL no state
      setParamOnInput('imageUrl', url);

      toast.success('Image uploaded');
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Upload
      beforeUpload={handleUpload}
      showUploadList={false}
      accept="image/*"
    >
      <Button loading={uploading} icon={<UploadOutlined />}>
        Upload Reference Image
      </Button>
    </Upload>
  );
};
```

---

## Fluxo de Download

### Download de Imagem Individual

```typescript
// ActionButtons - Download button
const handleDownload = async (imageUrl: string, generationId: string) => {
  try {
    // Fetch da imagem
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    // Criar link de download
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `generation_${generationId}_${Date.now()}.png`;

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success('Image downloaded');
  } catch (error) {
    console.error('Download failed:', error);
    toast.error('Failed to download image');
  }
};
```

### Download de Batch Completo (ZIP)

```typescript
// BatchItem - Download All button
const handleDownloadBatch = async (batchId: string, generations: Generation[]) => {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Adicionar cada imagem ao ZIP
    await Promise.all(
      generations.map(async (gen, index) => {
        if (!gen.asset?.url) return;

        const response = await fetch(gen.asset.url);
        const blob = await response.blob();

        zip.file(`image_${index + 1}_seed_${gen.seed}.png`, blob);
      })
    );

    // Gerar ZIP
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

    toast.success('Batch downloaded as ZIP');
  } catch (error) {
    console.error('Batch download failed:', error);
    toast.error('Failed to download batch');
  }
};
```

---

## Fluxo de Reutilização de Configurações

### Reusar Seed

```
Usuario        ActionButton     ImageStore      ConfigPanel
  |                |               |               |
  |--click Seed--> |               |               |
  |                |               |               |
  |                |--reuseSeed(seed)              |
  |                |               |               |
  |                |               |--setParam('seed', seed)
  |                |               |               |
  |                |               |               |--update UI
  |                |               |               |
  | <----------toast "Seed copied"----------------|
```

### Reusar Todas Configurações

```typescript
// BatchItem - "Reuse Settings" button
const handleReuseSettings = (batch: GenerationBatch) => {
  imageStore.reuseSettings(
    batch.model,
    batch.provider,
    batch.config
  );

  toast.success('Settings applied');
};

// Action
reuseSettings: (model: string, provider: string, settings: Record<string, any>) => {
  // 1. Trocar modelo/provider
  get().setModelAndProviderOnSelect(model, provider);

  // 2. Aguardar schema carregar
  await waitForSchemaLoad();

  // 3. Aplicar cada parâmetro
  Object.entries(settings).forEach(([key, value]) => {
    get().setParamOnInput(key, value);
  });

  // 4. Scroll para ConfigPanel
  document.querySelector('#config-panel')?.scrollIntoView({ behavior: 'smooth' });
};
```

---

## Casos de Uso Completos

### Caso 1: Primeira Geração (Novo Usuário)

```
1. Usuário entra na página /image
   → Layout renderiza 3 painéis vazios
   → useFetchGenerationTopics retorna []
   → Mostra "No topics yet"

2. Usuário clica no ConfigPanel
   → Seleciona modelo: "DALL-E 3" (OpenAI)
   → parametersSchema carrega → mostra controles disponíveis
   → Ajusta parâmetros:
     - Size: 1024x1024
     - Quality: HD
     - Style: Vivid

3. Usuário digita no PromptInput
   → "A futuristic city with flying cars at sunset"

4. Usuário clica "Generate"
   → createImage action:
     a. Detecta que não há topic ativo
     b. Cria novo topic (POST /api/trpc/generationTopic.createTopic)
     c. Topic criado com ID e título vazio
     d. Envia criação (POST /api/trpc/image.createImage)
     e. Backend cria Batch + 1 Generation + 1 AsyncTask
     f. Job adicionado à fila

5. UI atualizada
   → Topic aparece no TopicSidebar (sem título ainda)
   → Batch aparece no GenerationFeed
   → GenerationItem mostra LoadingState
   → ElapsedTime começa contagem: "0s"

6. Polling inicia (1s interval)
   → Tentativa 1 (1s): status = 'pending'
   → Tentativa 2 (2s): status = 'processing'
   → Tentativa 3 (4s): status = 'processing'
   → Tentativa 4 (8s): status = 'success' ✓

7. UI atualiza para SuccessState
   → Imagem aparece
   → ActionButtons disponíveis (Download, Seed, Delete)
   → Topic título é gerado com IA: "Futuristic Cityscape"
   → Topic cover atualizado com URL da imagem

8. Usuário pode:
   → Baixar imagem
   → Reusar seed
   → Reusar configurações
   → Gerar novas variações
```

### Caso 2: Geração em Lote (4 Imagens)

```
1. Usuário já tem topic ativo
2. Ajusta imageNum para 4
3. Digite prompt: "Cute robot character, different poses"
4. Clica Generate

5. Backend cria:
   → 1 Batch
   → 4 Generations
   → 4 AsyncTasks
   → 4 Jobs na fila

6. UI mostra 4 LoadingStates
   → Cada um com seu próprio polling independente

7. Imagens completam em momentos diferentes:
   → Img 1: 5s (completa primeiro)
   → Img 2: 7s
   → Img 3: 6s
   → Img 4: 9s (completa por último)

8. Cada GenerationItem atualiza individualmente
   → Não precisa esperar todas terminarem
   → UI sempre responsiva

9. Batch agora tem 4 imagens
   → Pode baixar todas como ZIP
   → Pode reusar configurações do batch inteiro
```

### Caso 3: Uso de Referência de Imagem

```
1. Usuário seleciona modelo que suporta imageUrl (ex: Imagen)
2. ConfigPanel mostra ImageUrlUpload
3. Usuário faz upload de foto de cachorro
   → Upload para storage (S3)
   → URL salva em generationConfig.parameters.imageUrl

4. Usuário digita prompt: "Transform into cartoon style"
5. Clica Generate

6. Backend recebe:
   {
     prompt: "Transform into cartoon style",
     imageUrl: "https://storage.../dog.jpg",
     model: "imagen-3",
     ...
   }

7. API externa processa imagem de referência + prompt
8. Retorna imagem estilizada
9. UI mostra resultado com ambas imagens (original + gerada)
```

### Caso 4: Gerenciamento de Topics

```
1. Usuário tem 5 topics:
   - "Character Designs"
   - "Logo Ideas"
   - "Product Photos"
   - "Abstract Art"
   - "Landscapes"

2. Clica em "Logo Ideas"
   → switchGenerationTopic('logo-id')
   → GenerationFeed carrega batches desse topic
   → Mostra 10 batches anteriores

3. Scroll infinito:
   → Ao chegar no final, carrega mais 10 batches
   → useFetchGenerationBatches com paginação

4. Busca por texto:
   → Digita "minimalist" no search
   → Filtra batches por prompt
   → Mostra apenas resultados relevantes

5. Delete topic:
   → Clica em Delete no TopicItem
   → Confirmação: "Delete 'Logo Ideas' and all 45 images?"
   → Backend cascade delete:
     - Deleta topic
     - Deleta todos batches do topic
     - Deleta todas generations
     - Deleta todos asyncTasks
   → UI atualiza, topic removido
```

### Caso 5: Tratamento de Erros

```
1. Erro de validação (prompt vazio):
   → Toast: "Please enter a prompt"
   → Não chama backend

2. Erro de coins insuficientes:
   → Backend retorna TRPCError
   → Toast: "Insufficient coins. Please top up."
   → Link para página de billing

3. Erro de API externa (rate limit):
   → Job falha após 3 retries
   → AsyncTask marcado como 'error'
   → GenerationItem mostra ErrorState:
     - Mensagem: "Rate limit exceeded. Try again later."
     - Botão "Retry"
   → Polling para
   → Coins são reembolsados

4. Erro de network (timeout):
   → Polling continua tentando (exponential backoff)
   → Se 30s sem sucesso, mostra warning:
     - "Taking longer than expected..."
     - "Check your connection"
   → Não falha imediatamente, continua polling

5. Erro de storage (upload falha):
   → Backend tenta upload 3x
   → Se falha todas, marca como erro
   → AsyncTask tem error details
   → UI mostra erro técnico + ID da task para suporte
```

---

## Otimizações de Performance

### 1. **Debouncing de Inputs**

```typescript
// DimensionControlGroup
const [width, setWidth] = useState(1024);
const debouncedUpdateWidth = useDebounceFn(
  (value: number) => {
    imageStore.setWidth(value);
  },
  { wait: 300 }
);

const handleWidthChange = (value: number) => {
  setWidth(value); // Update local immediately
  debouncedUpdateWidth.run(value); // Update store after 300ms
};
```

### 2. **Memoization de Componentes**

```typescript
// BatchItem - evita re-render desnecessário
const BatchItem = memo(({ batch }: { batch: GenerationBatch }) => {
  // ... component logic
}, (prevProps, nextProps) => {
  return prevProps.batch.id === nextProps.batch.id &&
         prevProps.batch.generations.length === nextProps.batch.generations.length;
});
```

### 3. **Virtualização de Listas**

```typescript
// GenerationFeed - virtual scrolling para muitos batches
import { Virtuoso } from 'react-virtuoso';

const GenerationFeed = () => {
  const batches = useGenerationBatches();

  return (
    <Virtuoso
      data={batches}
      itemContent={(index, batch) => <BatchItem key={batch.id} batch={batch} />}
      style={{ height: '100%' }}
    />
  );
};
```

### 4. **Image Lazy Loading**

```typescript
// GenerationItem
<Image
  src={generation.asset.url}
  loading="lazy"
  placeholder={<Skeleton.Image active />}
/>
```

### 5. **SWR Cache Configuration**

```typescript
const swrOptions = {
  revalidateOnFocus: false, // Não revalidar ao focar tab
  revalidateOnReconnect: true, // Revalidar ao reconectar
  dedupingInterval: 5000, // Dedup requests em 5s
  focusThrottleInterval: 10000, // Throttle focus revalidation
};
```

---

## Segurança no Fluxo

### 1. **Autenticação em Cada Request**

```typescript
// Middleware tRPC
const authProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
```

### 2. **Validação de Ownership**

```typescript
// Antes de deletar generation
const generation = await db.generation.findUnique({
  where: { id: generationId }
});

if (generation.userId !== ctx.userId) {
  throw new TRPCError({ code: 'FORBIDDEN' });
}
```

### 3. **Rate Limiting**

```typescript
// Redis-based rate limiting
const rateLimiter = new RateLimiter({
  redis,
  limit: 10, // 10 requests
  window: 60, // per 60 seconds
});

await rateLimiter.check(userId);
```

### 4. **Input Sanitization**

```typescript
// Sanitizar prompt antes de salvar
const sanitizePrompt = (prompt: string): string => {
  return prompt
    .trim()
    .replace(/<script>/gi, '') // Remove script tags
    .substring(0, 2000); // Limit length
};
```

---

## Resumo dos Fluxos Principais

| Fluxo | Duração Típica | Endpoints Envolvidos | Polling? |
|-------|----------------|---------------------|----------|
| **Criar Imagem** | 5-15s | createImage, getGenerationStatus | ✅ Sim |
| **Criar Topic** | <1s | createTopic | ❌ Não |
| **Switch Topic** | <1s | - (local) | ❌ Não |
| **Upload Referência** | 1-3s | /api/upload | ❌ Não |
| **Download Imagem** | 1-2s | - (fetch direto) | ❌ Não |
| **Delete Generation** | <1s | deleteGeneration | ❌ Não |
| **Reusar Settings** | <1s | - (local) | ❌ Não |
| **Gerar Título IA** | 2-5s | summaryTitle | ❌ Não |

---

## Conclusão

O sistema de geração de imagens do LobeChat implementa um fluxo robusto e otimizado que:

- ✅ Separa claramente concerns (UI → State → Backend → DB)
- ✅ Usa polling inteligente com exponential backoff
- ✅ Atualiza UI de forma otimista
- ✅ Trata erros gracefully
- ✅ Implementa segurança em todas camadas
- ✅ Otimiza performance com memoization, virtualização, lazy loading
- ✅ Escala para múltiplas imagens simultâneas

Esta arquitetura permite replicar facilmente em outros projetos mantendo qualidade e performance.
