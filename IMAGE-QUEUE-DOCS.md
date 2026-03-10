# Image Generation Queue - Documentação

## Resumo

Implementação de fila de jobs para geração de imagens usando **BullMQ + Redis**, eliminando problemas de rate limit quando gerando múltiplas imagens.

## 🚀 Como Funciona

### Síncrono (Antigo)
```
POST /api/ai/image → Gera imediatamente → Responde quando pronto
```
- ❌ Rate limit com múltiplas requisições simultâneas
- ❌ Sem controle de concorrência
- ✅ Resposta imediata com resultado

### Assíncrono (Novo)
```
POST /api/ai/image/async → Enfileira job → Responde com jobId
GET  /api/ai/image/async/status/:jobId → Polling para resultado
```
- ✅ Controle de concorrência (max 2 simultâneas)
- ✅ Delay entre jobs (1.5s por padrão)
- ✅ Retry automático com exponential backoff
- ✅ Persistência (jobs sobrevivem restart)
- ✅ Progress tracking

## 🔧 Configuração

### Variáveis de Ambiente

```bash
# Já configurado no Dokploy (sociallab.pro)
REDIS_URL=redis://default:QjSsPzQTvlntAGxJYHsZzcQluPDdLneU@sociallab-redis-pohy2a:6379

# Opcional - ajustar comportamento
IMAGE_GEN_CONCURRENCY=2       # Máximo de jobs simultâneos (padrão: 2)
IMAGE_GEN_DELAY_MS=1500       # Delay entre jobs em ms (padrão: 1500)
IMAGE_GEN_MAX_RETRIES=3       # Máximo de tentativas (padrão: 3)
```

### Endpoints

#### 1. Enfileirar uma imagem
```http
POST /api/ai/image/async
Content-Type: application/json

{
  "prompt": "Poker tournament dramatic lighting",
  "brandProfile": { "name": "MidPoker", ... },
  "aspectRatio": "16:9",
  "imageSize": "2K",
  "model": "nano-banana-2",
  "priority": 5  // 1-10, menor = mais prioritário
}
```

**Resposta:**
```json
{
  "success": true,
  "jobId": "img-1741612800000-abc123",
  "status": "queued",
  "delay": 0,
  "estimatedStart": "2025-03-10T15:20:00.000Z",
  "queuePosition": 1
}
```

#### 2. Enfileirar múltiplas imagens (Batch)
```http
POST /api/ai/image/async/batch
Content-Type: application/json

{
  "jobs": [
    { "prompt": "Image 1", "brandProfile": {...}, "aspectRatio": "1:1" },
    { "prompt": "Image 2", "brandProfile": {...}, "aspectRatio": "1:1" },
    { "prompt": "Image 3", "brandProfile": {...}, "aspectRatio": "1:1" },
    { "prompt": "Image 4", "brandProfile": {...}, "aspectRatio": "1:1" }
  ],
  "priority": 3
}
```

**Resposta:**
```json
{
  "success": true,
  "batchSize": 4,
  "queued": 4,
  "jobs": [
    { "jobId": "img-...-1", "status": "queued", "delay": 0, ... },
    { "jobId": "img-...-2", "status": "queued", "delay": 1500, ... },
    { "jobId": "img-...-3", "status": "queued", "delay": 3000, ... },
    { "jobId": "img-...-4", "status": "queued", "delay": 4500, ... }
  ]
}
```

#### 3. Verificar status
```http
GET /api/ai/image/async/status/img-1741612800000-abc123
```

**Respostas:**

**Enfileirado:**
```json
{
  "jobId": "img-...",
  "state": "waiting",
  "progress": 0,
  "data": { "prompt": "...", ... }
}
```

**Processando:**
```json
{
  "jobId": "img-...",
  "state": "active",
  "progress": 45,
  "data": { "prompt": "...", ... }
}
```

**Completado:**
```json
{
  "jobId": "img-...",
  "state": "completed",
  "progress": 100,
  "result": {
    "success": true,
    "imageUrl": "https://vercel.blob/.../generated.png",
    "usedProvider": "gemini",
    "usedModel": "gemini-3.1-flash-image-preview",
    "duration": 3245
  }
}
```

**Falhou:**
```json
{
  "jobId": "img-...",
  "state": "failed",
  "failedReason": "Rate limit exceeded",
  "attemptsMade": 3
}
```

#### 4. Listar jobs do usuário
```http
GET /api/ai/image/async/jobs?limit=20
```

**Resposta:**
```json
{
  "jobs": [
    {
      "jobId": "img-...",
      "state": "completed",
      "progress": 100,
      "prompt": "Poker tournament...",
      "model": "nano-banana-2",
      "createdAt": 1741612800000,
      "finishedOn": 1741612805000
    }
  ]
}
```

#### 5. Cancelar job
```http
DELETE /api/ai/image/async/cancel/img-1741612800000-abc123
```

**Resposta:**
```json
{ "success": true, "message": "Job cancelled" }
```

## 🔄 Estratégia de Retry

```
Tentativa 1: Imediata
Tentativa 2: 5s depois
Tentativa 3: 10s depois
Tentativa 4: 20s depois
...
```

## 📊 Monitoramento

Logs no servidor:
```
[ImageGenQueue] Job img-... queued (delay=0ms, position=1)
[ImageGenWorker] Processing job img-... (waited 1500ms)
[ImageGenWorker] img-... progress: 45%
[ImageGenWorker] ✓ img-... completed (gemini)
```

## 🛠️ Para Desenvolvedores Frontend

### Padrão de Polling
```javascript
async function generateImageAsync(params) {
  // 1. Enfileirar
  const { jobId } = await fetch('/api/ai/image/async', {
    method: 'POST',
    body: JSON.stringify(params)
  }).then(r => r.json());

  // 2. Polling até completar
  return new Promise((resolve, reject) => {
    const poll = async () => {
      const status = await fetch(`/api/ai/image/async/status/${jobId}`)
        .then(r => r.json());
      
      if (status.state === 'completed') {
        resolve(status.result);
      } else if (status.state === 'failed') {
        reject(new Error(status.failedReason));
      } else {
        // Continuar polling a cada 1s
        setTimeout(poll, 1000);
      }
    };
    poll();
  });
}

// Usar
const result = await generateImageAsync({
  prompt: "Poker dramatic scene",
  brandProfile: {...},
  aspectRatio: "16:9"
});
console.log(result.imageUrl);
```

### WebSocket (Futuro)
Para evitar polling, podemos implementar WebSocket/SSE para notificações push quando jobs completarem.

## 📁 Arquivos Modificados

- `server/helpers/job-queue.mjs` - Fila e worker
- `server/routes/ai-image.mjs` - Novos endpoints
- `server/index.mjs` - Inicialização do worker

## ⚠️ Fallback

Se Redis não estiver disponível:
- `POST /api/ai/image/async` retorna 503 com `useSyncEndpoint: true`
- Frontend deve fallback para `POST /api/ai/image` (síncrono)
