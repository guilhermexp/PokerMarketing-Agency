# Migração de Data URLs para Vercel Blob

**Data:** 25 de Janeiro de 2026
**Autor:** Claude Code
**Impacto:** Performance crítica - redução de ~272MB para ~50KB por request

---

## Resumo Executivo

Foi identificado e corrigido um problema crítico de performance onde imagens estavam sendo armazenadas como base64 data URLs diretamente no banco de dados PostgreSQL (Neon), causando:

- **~272MB** de dados transferidos a cada sessão
- **85GB** de network transfer mensal com poucos usuários
- **10-20 segundos** de tempo de carregamento inicial
- Custos elevados de egress no Neon

Após a migração, todas as imagens foram movidas para Vercel Blob Storage, resultando em:

- **~35KB** de dados no endpoint `/init`
- **~1-2 segundos** de tempo de carregamento
- Imagens servidas via CDN global
- Eliminação do double-fetch

---

## Problema Identificado

### Sintomas
- Login demorando 10-20 segundos
- Network transfer de 10.5MB por request no `/api/db/init`
- Network transfer de 63MB por request no `/api/generate/status`
- Dashboard do Neon mostrando 85GB de transferência com poucos usuários
- Double-fetch no `/init` (2 requests em vez de 1)

### Causa Raiz
Imagens estavam sendo salvas como base64 data URLs diretamente nas colunas do banco:

```
❌ ERRADO (como estava)
src_url = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEBLAEsAAD..." (4MB de texto!)

✅ CORRETO (como deveria ser)
src_url = "https://xyz.public.blob.vercel-storage.com/image.jpg" (100 bytes)
```

### Tabelas Afetadas

| Tabela | Coluna | Registros | Tamanho |
|--------|--------|-----------|---------|
| `gallery_images` | `src_url` | 76 | 113MB |
| `scheduled_posts` | `image_url` | 18 | 26MB |
| `brand_profiles` | `logo_url` | 3 | 6MB |
| `week_schedules` | `daily_flyer_urls` (JSONB) | 22 | 27MB |
| `generation_jobs` | `result_url` | 63 | 100MB |
| **TOTAL** | | **182** | **~272MB** |

---

## Solução Implementada

### 1. Proteção Imediata nas Queries

Antes da migração, as queries foram modificadas para não retornar data URLs:

**server/dev-api.mjs** e **server/index.mjs**:

```javascript
// gallery_images - usar thumbnail ou string vazia para data URLs
SELECT id, user_id, organization_id, source,
  CASE WHEN src_url LIKE 'data:%' THEN COALESCE(thumbnail_url, '') ELSE src_url END as src_url,
  thumbnail_url, created_at, ...
FROM gallery_images ...

// scheduled_posts - retornar string vazia para data URLs
SELECT id, ...,
  CASE WHEN image_url LIKE 'data:%' THEN '' ELSE image_url END as image_url,
  ...
FROM scheduled_posts ...

// brand_profiles - retornar string vazia para data URLs
SELECT id, ...,
  CASE WHEN logo_url LIKE 'data:%' THEN '' ELSE logo_url END as logo_url,
  ...
FROM brand_profiles ...

// generation_jobs - retornar string vazia para data URLs
SELECT id, ...,
  CASE WHEN result_url LIKE 'data:%' THEN '' ELSE result_url END as result_url,
  ...
FROM generation_jobs ...
```

### 2. Eliminação do Double-Fetch

O app fazia 2 requests ao `/init` porque o `userId` mudava de `clerkUserId` para `dbUser.id`.

**Arquivos modificados:**

#### `src/components/auth/AuthWrapper.tsx`

```javascript
// ANTES: userId mudava quando dbUser carregava
userId: dbUser?.id || clerkUserId || null,

// DEPOIS: userId sempre usa clerkUserId (servidor resolve)
userId: clerkUserId || null,
```

#### `src/App.tsx`

```javascript
// ANTES: initialDataUserId mudava
const initialDataUserId = dbUser?.id || clerkUserId || null;

// DEPOIS: sempre usa clerkUserId
const initialDataUserId = clerkUserId || null;
```

**Por que funciona:** O servidor já possui `resolveUserId()` que converte `clerkUserId` → `dbUser.id` com cache.

### 3. Scripts de Migração

#### Script Principal: `scripts/migrate-all-data-urls-to-blob.mjs`

Migra data URLs de 3 tabelas para Vercel Blob:
- `gallery_images.src_url`
- `scheduled_posts.image_url`
- `brand_profiles.logo_url`

```bash
# Dry run (preview)
DRY_RUN=true node scripts/migrate-all-data-urls-to-blob.mjs

# Executar migração
node scripts/migrate-all-data-urls-to-blob.mjs
```

#### Script de Flyers: `scripts/migrate-flyer-urls-to-blob.mjs`

Migra data URLs do campo JSONB `week_schedules.daily_flyer_urls`:

```bash
# Dry run (preview)
DRY_RUN=true node scripts/migrate-flyer-urls-to-blob.mjs

# Executar migração
node scripts/migrate-flyer-urls-to-blob.mjs
```

#### Script de Jobs: `scripts/migrate-generation-jobs-to-blob.mjs`

Migra data URLs de `generation_jobs.result_url`:

```bash
# Dry run (preview)
DRY_RUN=true node scripts/migrate-generation-jobs-to-blob.mjs

# Executar migração
node scripts/migrate-generation-jobs-to-blob.mjs
```

#### Script de Diagnóstico: `scripts/check-all-data-urls.mjs`

Verifica se existem data URLs restantes no banco:

```bash
node scripts/check-all-data-urls.mjs
```

---

## Arquivos Modificados

### Server (API)

| Arquivo | Modificação |
|---------|-------------|
| `server/dev-api.mjs` | Queries com CASE para filtrar data URLs em `/init` e `/status` |
| `server/index.mjs` | Queries com CASE para filtrar data URLs em `/init` e `/status` |

### Frontend

| Arquivo | Modificação |
|---------|-------------|
| `src/components/auth/AuthWrapper.tsx` | `userId` sempre usa `clerkUserId` |
| `src/App.tsx` | `initialDataUserId` sempre usa `clerkUserId` |

### Scripts Criados

| Arquivo | Função |
|---------|--------|
| `scripts/migrate-all-data-urls-to-blob.mjs` | Migração de gallery, posts, brand |
| `scripts/migrate-flyer-urls-to-blob.mjs` | Migração de flyers JSONB |
| `scripts/migrate-generation-jobs-to-blob.mjs` | Migração de jobs |
| `scripts/check-all-data-urls.mjs` | Diagnóstico de data URLs |

---

## Arquitetura: Neon + Vercel Blob

### Por que usar ambos?

```
┌─────────────────────────────────────────────────────────────┐
│                     ARQUITETURA CORRETA                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐         ┌─────────────────────────┐       │
│  │   NEON      │         │     VERCEL BLOB         │       │
│  │ PostgreSQL  │         │   Object Storage        │       │
│  ├─────────────┤         ├─────────────────────────┤       │
│  │ • Users     │         │ • Imagens (JPG, PNG)    │       │
│  │ • Posts     │         │ • Vídeos (MP4)          │       │
│  │ • Campaigns │         │ • PDFs, Documentos      │       │
│  │ • Schedules │         │                         │       │
│  │ • Jobs      │         │ Servido via CDN global  │       │
│  ├─────────────┤         ├─────────────────────────┤       │
│  │ ~KB por row │         │ ~MB por arquivo         │       │
│  └─────────────┘         └─────────────────────────┘       │
│         │                          │                        │
│         │   URL de referência      │                        │
│         │◄─────────────────────────┘                        │
│         │                                                   │
│  Banco armazena apenas a URL:                              │
│  "https://xyz.blob.vercel-storage.com/image-123.jpg"       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo Correto de Upload

```
1. Usuário seleciona imagem
2. Frontend envia para /api/upload
3. Server faz upload para Vercel Blob
4. Vercel Blob retorna URL pública
5. Server salva apenas a URL no Neon
6. Response retorna URL para frontend
```

---

## Resultados

### Antes da Migração

```
Endpoint: /api/db/init
├─ Requests: 2 (double-fetch)
├─ Tamanho: 10.5MB cada
└─ Tempo: 9-12s cada

Endpoint: /api/generate/status
├─ Tamanho: 63MB
└─ Tempo: 15-20s

Network/mês: 85GB+
```

### Depois da Migração

```
Endpoint: /api/db/init
├─ Requests: 1 ✅
├─ Tamanho: 35KB ✅
└─ Tempo: 1.2s ✅

Endpoint: /api/generate/status
├─ Tamanho: ~5KB ✅
└─ Tempo: ~500ms ✅

Network/mês: <1GB (estimado)
```

### Verificação Final

```
=== VERIFICAÇÃO FINAL ===

gallery_images.src_url: 0
scheduled_posts.image_url: 0
brand_profiles.logo_url: 0
generation_jobs.result_url: 0
week_schedules.daily_flyer_urls: 0

✅ TOTAL DATA URLs: 0
```

---

## Prevenção Futura

### 1. Código de Upload

O serviço `src/services/blobService.ts` já está configurado para fazer upload correto:

```typescript
export const uploadImageToBlob = async (
  base64Data: string,
  mimeType: string = 'image/png'
): Promise<string> => {
  // Faz upload para Vercel Blob via /api/upload
  // Retorna URL pública
};
```

### 2. Validação no Backend

Considerar adicionar validação para rejeitar data URLs em colunas de imagem:

```javascript
// Exemplo de validação
if (image_url && image_url.startsWith('data:')) {
  throw new Error('Data URLs não são permitidos. Use upload para Blob storage.');
}
```

### 3. Monitoramento

Rodar periodicamente o script de diagnóstico:

```bash
node scripts/check-all-data-urls.mjs
```

---

## Comandos Úteis

```bash
# Verificar data URLs no banco
node scripts/check-all-data-urls.mjs

# Migrar data URLs (se aparecerem novos)
node scripts/migrate-all-data-urls-to-blob.mjs
node scripts/migrate-flyer-urls-to-blob.mjs
node scripts/migrate-generation-jobs-to-blob.mjs

# Verificar tamanho do response do init
curl -s "http://localhost:5177/api/db/init?user_id=XXX" | wc -c

# Verificar tamanho do response do status
curl -s "http://localhost:5177/api/generate/status?userId=XXX" | wc -c
```

---

## Dependências

- `@vercel/blob` - SDK para upload no Vercel Blob Storage
- `BLOB_READ_WRITE_TOKEN` - Token de acesso (configurado no .env)

---

## Sistema de Jobs de Imagem (REMOVIDO)

**Data:** 25 de Janeiro de 2026

O sistema de jobs de imagem em background (BullMQ + Redis) foi **completamente removido** do código devido a problemas recorrentes com a resolução de `userId` (Clerk ID vs UUID do banco).

### Problema Original

O worker de imagens recebia o Clerk ID (`user_xxx...`) mas tentava salvar na galeria com esse ID, causando erro:
```
invalid input syntax for type uuid: "user_378fc20OZ5lfbZMSXns5m68zpB5"
```

### Solução Final

O sistema de jobs de **imagem** foi completamente removido. O sistema de **scheduled posts** continua funcionando normalmente.

### Código Removido

**`server/helpers/job-queue.mjs`:**
- `imageQueue` - variável removida
- `imageWorker` - variável removida
- `getImageQueue()` - função removida
- `addJob()` - função removida
- `getQueueJobStatus()` - função removida
- `addImageJob()` - função removida
- `initializeImageWorker()` - função removida

**`server/dev-api.mjs` e `server/index.mjs`:**
- `processImageJob` - função removida (~280 linhas cada)
- Imports de `initializeImageWorker` e `addImageJob` removidos

**Endpoint `/api/generate/queue`:**
```javascript
// Retorna erro 503 - sistema desativado
app.post("/api/generate/queue", async (req, res) => {
  return res.status(503).json({
    error: "Background job queue is disabled. Use synchronous image generation.",
    disabled: true,
  });
});
```

### O Que Continua Funcionando

- **Scheduled Posts** - Redis + BullMQ continua ativo para posts agendados
- **Geração de Imagens Síncrona** - Via `/api/images` endpoint
- **Redis Connection** - Mantida para scheduled posts

### Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `server/helpers/job-queue.mjs` | Removido ~150 linhas de código de image jobs |
| `server/dev-api.mjs` | Removido ~280 linhas (processImageJob + imports) |
| `server/index.mjs` | Removido ~290 linhas (processImageJob + imports) |

---

## Conclusão

A migração foi concluída com sucesso:

| Métrica | Antes | Depois | Melhoria |
|---------|-------|--------|----------|
| Data URLs no banco | 182 (~272MB) | 0 | 100% eliminado |
| Payload `/init` | 10.5MB | 35KB | **300x menor** |
| Payload `/status` | 63MB | ~5KB | **12.600x menor** |
| Requests no login | 2 | 1 | **50% menos** |
| Tempo de login | 10-20s | 1-2s | **10x mais rápido** |
| Network/mês | 85GB+ | <1GB | **85x menos** |

Todas as imagens agora são servidas via CDN do Vercel Blob, resultando em:

- Carregamento 10x mais rápido
- Redução drástica de custos de network (Neon egress)
- Melhor experiência do usuário
- Arquitetura correta e escalável
- Eliminação do double-fetch
