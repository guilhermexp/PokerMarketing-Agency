# 03 - APIs E ENDPOINTS

## 🌐 Visão Geral

O backend usa **tRPC** (Type-safe RPC) para comunicação client-server. Todos os endpoints são **type-safe** e validados com Zod schemas.

**Total**: 15+ endpoints organizados em 4 routers principais

---

## 📡 ROUTERS tRPC

### 1. **imageRouter** - Criação de Imagens

**Arquivo**: `src/server/routers/lambda/image/index.ts`

#### **createImage**

**Descrição**: Cria um batch de gerações de imagens

**Input Schema**:
```typescript
{
  generationTopicId: string;      // UUID do topic
  provider: string;                // ex: "google"
  model: string;                   // ex: "gemini-3-pro-image-preview"
  imageNum: number;                // 1-4 imagens
  params: {
    prompt: string;                // Required
    width?: number;
    height?: number;
    seed?: number;
    steps?: number;
    cfg?: number;
    quality?: string;
    size?: string;
    aspectRatio?: string;
    imageUrl?: string;             // S3 key (não URL)
    imageUrls?: string[];          // S3 keys
    // ... outros params dinâmicos
  }
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    batch: GenerationBatch;        // Batch criado
    generations: Generation[];      // Array de generations
  }
}
```

**Fluxo Interno**:
```typescript
async createImage(input) {
  // 1. Validação de input
  const validated = CreateImageInputSchema.parse(input);

  // 2. Charge coins/credits (se habilitado)
  await chargeCoins(userId, model, imageNum);

  // 3. Converter URLs para S3 keys
  const s3Keys = await convertUrlsToKeys(params.imageUrls);

  // 4. Transaction: Criar batch + generations + asyncTasks
  const result = await db.transaction(async (tx) => {
    // Inserir batch
    const batch = await tx.insert(generationBatches).values({
      generationTopicId,
      userId,
      provider,
      model,
      prompt: params.prompt,
      config: params,
      width: params.width,
      height: params.height,
    }).returning();

    // Inserir generations (N vezes)
    const generations = await Promise.all(
      Array.from({ length: imageNum }).map(async () => {
        return tx.insert(generations).values({
          generationBatchId: batch.id,
          userId,
          seed: params.seed || Math.floor(Math.random() * 1000000),
        }).returning();
      })
    );

    // Inserir asyncTasks
    const tasks = await Promise.all(
      generations.map((gen) =>
        tx.insert(asyncTasks).values({
          userId,
          type: 'image_generation',
          status: 'Pending',
          metadata: {
            generationId: gen.id,
            provider,
            model,
            params: { ...params, imageUrls: s3Keys },
          },
        }).returning()
      )
    );

    // Update generations com asyncTaskId
    await Promise.all(
      generations.map((gen, i) =>
        tx.update(generations)
          .set({ asyncTaskId: tasks[i].id })
          .where(eq(generations.id, gen.id))
      )
    );

    return { batch, generations };
  });

  // 5. Fire-and-forget: Processar asyncTasks em background
  processAsyncTasks(result.generations.map(g => g.asyncTaskId));

  // 6. Retornar resultado
  return { success: true, data: result };
}
```

**Erros Possíveis**:
- 400: Input inválido (prompt vazio, etc.)
- 402: Saldo insuficiente (coins/credits)
- 500: Erro no banco de dados

---

### 2. **generationRouter** - Operações em Generations

**Arquivo**: `src/server/routers/lambda/generation.ts`

#### **getGenerationStatus**

**Descrição**: Verifica status de geração (polling)

**Input**:
```typescript
{
  generationId: string;
  asyncTaskId: string;
}
```

**Response**:
```typescript
{
  status: 'Pending' | 'Processing' | 'Success' | 'Error';
  generation?: Generation;          // Se success
  error?: {
    code: string;
    message: string;
    details?: any;
  }
}
```

**Exemplo**:
```typescript
const result = await lambdaClient.generation.getGenerationStatus.query({
  generationId: 'xxx',
  asyncTaskId: 'yyy',
});

if (result.status === 'Success') {
  console.log(result.generation.asset.url); // S3 URL da imagem
}
```

---

#### **deleteGeneration**

**Descrição**: Deleta uma generation

**Input**:
```typescript
{
  generationId: string;
}
```

**Response**:
```typescript
{
  success: true;
  deletedGeneration: Generation;
}
```

**Fluxo Interno**:
```typescript
async deleteGeneration({ generationId }) {
  // 1. Buscar generation
  const generation = await db.query.generations.findFirst({
    where: eq(generations.id, generationId),
  });

  if (!generation) throw new Error('Generation not found');

  // 2. Deletar thumbnail de S3 (se existe)
  if (generation.asset?.thumbnailUrl) {
    await fileService.deleteFile(generation.asset.thumbnailUrl);
  }

  // 3. Deletar do banco
  await db.delete(generations).where(eq(generations.id, generationId));

  // 4. Retornar
  return { success: true, deletedGeneration: generation };
}
```

---

### 3. **generationBatchRouter** - Operações em Batches

**Arquivo**: `src/server/routers/lambda/generationBatch.ts`

#### **getGenerationBatches**

**Descrição**: Lista todos os batches de um topic

**Input**:
```typescript
{
  generationTopicId: string;
}
```

**Response**:
```typescript
GenerationBatch[]              // Array de batches com generations incluídas
```

**Exemplo SQL**:
```sql
SELECT
  gb.*,
  array_agg(g.*) as generations
FROM generation_batches gb
LEFT JOIN generations g ON g.generation_batch_id = gb.id
WHERE gb.generation_topic_id = $1
  AND gb.user_id = $2
GROUP BY gb.id
ORDER BY gb.created_at DESC
```

---

#### **deleteGenerationBatch**

**Descrição**: Deleta um batch inteiro

**Input**:
```typescript
{
  batchId: string;
}
```

**Response**:
```typescript
{
  success: true;
}
```

**Fluxo Interno**:
```typescript
async deleteGenerationBatch({ batchId }) {
  // 1. Buscar batch com generations
  const batch = await db.query.generationBatches.findFirst({
    where: eq(generationBatches.id, batchId),
    with: { generations: true },
  });

  // 2. Deletar thumbnails de S3
  const thumbnails = batch.generations
    .map(g => g.asset?.thumbnailUrl)
    .filter(Boolean);

  await fileService.deleteFiles(thumbnails);

  // 3. Deletar generations (cascade)
  await db.delete(generations)
    .where(eq(generations.generationBatchId, batchId));

  // 4. Deletar batch
  await db.delete(generationBatches)
    .where(eq(generationBatches.id, batchId));

  return { success: true };
}
```

---

### 4. **generationTopicRouter** - Operações em Topics

**Arquivo**: `src/server/routers/lambda/generationTopic.ts`

#### **getAllGenerationTopics**

**Descrição**: Lista todos os topics do usuário

**Input**: (nenhum, usa userId do contexto)

**Response**:
```typescript
ImageGenerationTopic[]
```

**Ordenação**: Por `updatedAt DESC` (mais recente primeiro)

---

#### **createTopic**

**Descrição**: Cria um novo topic

**Input**:
```typescript
{
  title?: string;                // Opcional, pode ser gerado depois
}
```

**Response**:
```typescript
{
  success: true;
  topic: ImageGenerationTopic;
}
```

---

#### **updateTopic**

**Descrição**: Atualiza título de topic

**Input**:
```typescript
{
  id: string;
  value: {
    title: string;
  }
}
```

**Response**:
```typescript
{
  success: true;
  updatedTopic: ImageGenerationTopic;
}
```

---

#### **updateTopicCover**

**Descrição**: Atualiza cover image do topic

**Input**:
```typescript
{
  id: string;
  coverUrl: string;              // S3 URL da thumbnail
}
```

**Response**:
```typescript
{
  success: true;
}
```

**Quando usar**: Automaticamente após primeira geração bem-sucedida

---

#### **deleteTopic**

**Descrição**: Deleta topic e todos os batches/generations

**Input**:
```typescript
{
  id: string;
}
```

**Response**:
```typescript
{
  success: true;
}
```

**Cascade**: Deleta todos batches, generations e asyncTasks relacionados

---

## 📊 ESTRUTURA DE DADOS

### Generation Asset

```typescript
interface GenerationAsset {
  url: string;                   // S3 URL completa da imagem
  originalUrl?: string;          // URL original do provider (expira)
  thumbnailUrl?: string;         // S3 URL da thumbnail (200x200)
  width?: number;                // Largura em pixels
  height?: number;               // Altura em pixels
}
```

### Generation Config

```typescript
interface GenerationConfig {
  prompt: string;                // Required

  // Dimensions
  width?: number;
  height?: number;
  size?: string;                 // ex: "1024x1024"
  aspectRatio?: string;          // ex: "16:9"

  // Quality
  quality?: string;              // ex: "high", "medium", "low"
  resolution?: string;

  // Model-specific
  seed?: number;
  steps?: number;                // Diffusion steps
  cfg?: number;                  // CFG scale

  // References
  imageUrl?: string;             // S3 key (single)
  imageUrls?: string[];          // S3 keys (multiple)

  // Provider-specific (dinâmico)
  [key: string]: any;
}
```

### Async Task Status

```typescript
type AsyncTaskStatus =
  | 'Pending'      // Aguardando processamento
  | 'Processing'   // Em processamento
  | 'Success'      // Concluído com sucesso
  | 'Error';       // Falhou

interface AsyncTaskError {
  code: string;              // ex: "RATE_LIMIT_EXCEEDED"
  message: string;           // Mensagem human-readable
  details?: any;             // Detalhes técnicos
}
```

---

## 🔄 FLUXO DE ASYNC TASKS

### Background Processing

```typescript
// Worker (background job)
async function processImageGenerationTask(taskId: string) {
  const task = await db.query.asyncTasks.findFirst({
    where: eq(asyncTasks.id, taskId),
  });

  // 1. Update status para Processing
  await db.update(asyncTasks)
    .set({ status: 'Processing' })
    .where(eq(asyncTasks.id, taskId));

  try {
    // 2. Chamar provider de IA
    const result = await imageProvider.generate({
      provider: task.metadata.provider,
      model: task.metadata.model,
      params: task.metadata.params,
    });

    // 3. Upload thumbnail para S3
    const thumbnailUrl = await createThumbnail(result.url);

    // 4. Update generation com asset
    await db.update(generations)
      .set({
        asset: {
          url: result.url,
          originalUrl: result.originalUrl,
          thumbnailUrl,
          width: result.width,
          height: result.height,
        },
      })
      .where(eq(generations.id, task.metadata.generationId));

    // 5. Update task para Success
    await db.update(asyncTasks)
      .set({ status: 'Success' })
      .where(eq(asyncTasks.id, taskId));

  } catch (error) {
    // 6. Update task para Error
    await db.update(asyncTasks)
      .set({
        status: 'Error',
        error: {
          code: error.code || 'UNKNOWN_ERROR',
          message: error.message,
          details: error.details,
        },
      })
      .where(eq(asyncTasks.id, taskId));
  }
}
```

### Polling Strategy (Client)

```typescript
// Frontend: useCheckGenerationStatus
export function useCheckGenerationStatus(
  generationId: string,
  asyncTaskId: string,
  topicId: string
) {
  // Exponential backoff
  const [interval, setInterval] = useState(1000);  // Start: 1s
  const [requestCount, setRequestCount] = useState(0);

  const { data, error } = useSWR(
    [generationId, asyncTaskId],
    () => lambdaClient.generation.getGenerationStatus.query({
      generationId,
      asyncTaskId,
    }),
    {
      refreshInterval: interval,
      // Stop polling quando Success ou Error
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      onSuccess: (data) => {
        if (data.status === 'Success' || data.status === 'Error') {
          // Stop polling
          setInterval(0);
        } else {
          // Exponential backoff
          setRequestCount(prev => prev + 1);

          // Dobrar intervalo a cada 5 requests
          if (requestCount % 5 === 0 && interval < 30000) {
            setInterval(prev => Math.min(prev * 2, 30000));  // Max 30s
          }
        }
      },
    }
  );

  return { data, error, isPolling: interval > 0 };
}
```

**Backoff Schedule**:
```
Requests 1-5:   1s interval
Requests 6-10:  2s interval
Requests 11-15: 4s interval
Requests 16-20: 8s interval
Requests 21-25: 16s interval
Requests 26+:   30s interval (max)
```

---

## 🔐 AUTENTICAÇÃO E AUTORIZAÇÃO

### Middleware tRPC

```typescript
// Todos os endpoints requerem autenticação
const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

// imageRouter
export const imageRouter = router({
  createImage: protectedProcedure
    .input(CreateImageInputSchema)
    .mutation(async ({ input, ctx }) => {
      // ctx.userId está disponível e validado
      return createImage(input, ctx.userId);
    }),
});
```

### Ownership Validation

```typescript
// Antes de deletar/atualizar, verificar ownership
const generation = await db.query.generations.findFirst({
  where: and(
    eq(generations.id, generationId),
    eq(generations.userId, ctx.userId)  // Ownership check
  ),
});

if (!generation) {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: 'Generation not found or access denied',
  });
}
```

---

## 📈 RATE LIMITING E COINS

### Charging Coins

```typescript
async function chargeCoins(userId: string, model: string, imageNum: number) {
  // 1. Calcular custo
  const costPerImage = getModelCost(model);  // ex: 10 coins
  const totalCost = costPerImage * imageNum;

  // 2. Verificar saldo
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (user.coins < totalCost) {
    throw new TRPCError({
      code: 'PAYMENT_REQUIRED',
      message: 'Insufficient coins',
    });
  }

  // 3. Deduzir coins
  await db.update(users)
    .set({ coins: user.coins - totalCost })
    .where(eq(users.id, userId));

  // 4. Registrar transação
  await db.insert(coinTransactions).values({
    userId,
    amount: -totalCost,
    type: 'image_generation',
    metadata: { model, imageNum },
  });
}
```

---

## 🌍 ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgres://...
REDIS_URL=redis://...

# S3 Storage
S3_ACCESS_KEY_ID=xxx
S3_SECRET_ACCESS_KEY=xxx
S3_BUCKET=lobe-chat-images
S3_REGION=us-east-1
S3_PUBLIC_DOMAIN=https://images.lobechat.com

# AI Providers
GOOGLE_API_KEY=xxx
OPENAI_API_KEY=xxx
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# Optional: Coins
ENABLE_COINS=true
IMAGE_GEN_COST_PER_IMAGE=10
```

---

## 📊 Resumo de Endpoints

| Router | Endpoint | Método | Auth | Descrição |
|--------|----------|--------|------|-----------|
| **image** | createImage | Mutation | ✅ | Criar batch de imagens |
| **generation** | getGenerationStatus | Query | ✅ | Verificar status (polling) |
| **generation** | deleteGeneration | Mutation | ✅ | Deletar generation |
| **generationBatch** | getGenerationBatches | Query | ✅ | Listar batches de topic |
| **generationBatch** | deleteGenerationBatch | Mutation | ✅ | Deletar batch completo |
| **generationTopic** | getAllGenerationTopics | Query | ✅ | Listar todos os topics |
| **generationTopic** | createTopic | Mutation | ✅ | Criar novo topic |
| **generationTopic** | updateTopic | Mutation | ✅ | Atualizar título |
| **generationTopic** | updateTopicCover | Mutation | ✅ | Atualizar cover image |
| **generationTopic** | deleteTopic | Mutation | ✅ | Deletar topic (cascade) |

---

## 🔗 Próximos Passos

- **[04-STATE-MANAGEMENT.md](./04-STATE-MANAGEMENT.md)** - State management (Zustand)
- **[05-FLUXO-DADOS.md](./05-FLUXO-DADOS.md)** - Fluxo de dados completo
- **[06-CODIGOS-EXEMPLO.md](./06-CODIGOS-EXEMPLO.md)** - Exemplos de código
