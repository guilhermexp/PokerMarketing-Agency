# Documentacao Tecnica: DirectorAi (Aura Engine) v3.0

Este documento serve como o guia mestre para engenheiros e designers. Ele detalha a arquitetura, o fluxo de dados e as integracoes de Inteligencia Artificial do ecossistema **DirectorAi**.

---

## 1. Arquitetura do Sistema

O DirectorAi e uma aplicacao full-stack com frontend React e backend Express, otimizada para deploy em Railway.

### Stack Tecnologico

| Camada | Tecnologia | Descricao |
|--------|------------|-----------|
| **Frontend** | React 19 + TypeScript + Tailwind CSS | SPA com componentes modulares |
| **Backend** | Express.js (ESM) | API REST servindo frontend e endpoints de IA |
| **Banco de Dados** | PostgreSQL (Neon Serverless) | Persistencia de usuarios, campanhas, galeria |
| **Armazenamento** | Vercel Blob Storage | Imagens, videos e audios gerados |
| **Autenticacao** | Clerk | Auth multi-tenant com organizacoes |
| **Fila de Jobs** | BullMQ + Redis | Processamento assincrono de imagens |
| **IA - Imagem** | Google Gemini API | Geracao e edicao de imagens |
| **IA - Video** | Veo 3.1 + Fal.ai (Sora 2) | Geracao de videos a partir de imagens |
| **IA - Audio** | Gemini TTS (Zephyr) | Narracao em portugues brasileiro |
| **Deploy** | Railway | Container Docker com Redis integrado |

### Diagrama de Fluxo

```
[Usuario] --> [Frontend React]
                   |
                   v
            [Express Server]
                   |
    +--------------+--------------+
    |              |              |
    v              v              v
[PostgreSQL]  [Vercel Blob]  [BullMQ/Redis]
                                  |
                                  v
                          [Job Processor]
                                  |
                   +--------------+--------------+
                   |              |              |
                   v              v              v
             [Gemini API]   [Veo API]    [Fal.ai API]
```

---

## 2. Mudanca de Arquitetura: SDK para API

### Problema Anterior
O frontend usava o SDK `@google/genai` diretamente no navegador, o que:
- Exigia que a API key estivesse exposta no cliente
- Limitava o uso a ambientes que suportam ESM no browser
- Impedia deploy em plataformas que nao suportam serverless functions (ex: Railway)

### Solucao Atual
Todas as chamadas de IA agora passam por endpoints no Express server:

| Endpoint | Metodo | Funcao |
|----------|--------|--------|
| `/api/ai/generate-image` | POST | Gera imagem via Gemini |
| `/api/ai/edit-image` | POST | Edita imagem existente |
| `/api/ai/generate-campaign` | POST | Gera campanha completa |
| `/api/ai/generate-tts` | POST | Gera audio TTS |
| `/api/ai/generate-video` | POST | Gera video via Veo |
| `/api/generate/queue` | POST | Adiciona job na fila BullMQ |
| `/api/generate/status` | GET | Consulta status dos jobs |
| `/api/generate/job/:id` | DELETE | Cancela um job |
| `/api/generate/cancel-all` | POST | Cancela todos os jobs |

### Fluxo de Geracao de Imagem

```typescript
// ANTES (SDK direto no frontend)
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI(apiKey);
const response = await ai.models.generateImages({ prompt });

// DEPOIS (via API endpoint)
const response = await fetch('/api/ai/generate-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt, brandProfile, options })
});
const data = await response.json();
```

---

## 3. Sistema de Filas (Background Jobs)

### Motivacao
Geracao de imagens pode levar 10-30 segundos. Para melhor UX, implementamos processamento assincrono.

### Tecnologias
- **BullMQ**: Biblioteca de filas baseada em Redis
- **Redis**: Armazenamento de estado dos jobs (via Railway)
- **Worker**: Processa jobs em paralelo (concurrency: 2)

### Tipos de Jobs

| Tipo | Descricao | Contexto |
|------|-----------|----------|
| `flyer` | Flyer individual de torneio | `flyer-{tournamentId}` |
| `flyer_daily` | Grade diaria de torneios | `flyer-period-{period}` |
| `post` | Imagem para post social | `post-{index}` |
| `ad` | Criativo de anuncio | `ad-{index}` |
| `clip` | Capa/thumbnail de clip | `clip-{index}` |

### Ciclo de Vida do Job

```
[queued] --> [processing] --> [completed]
                  |
                  +--> [failed]
```

### Persistencia de Contexto
O campo `context` e salvo no banco para permitir que o frontend identifique qual componente deve atualizar quando um job completa:

```typescript
// Frontend enfileira job com contexto
await queueJob(userId, 'clip', prompt, config, 'clip-0');

// Quando job completa, o callback verifica o contexto
onJobComplete((job) => {
  if (job.context === 'clip-0') {
    // Atualiza o componente do clip 0
  }
});
```

---

## 4. Estrutura de Arquivos

```
/
├── server/
│   ├── index.mjs              # Express server principal
│   └── helpers/
│       └── job-queue.mjs      # BullMQ queue e worker
│
├── services/
│   ├── apiClient.ts           # Cliente HTTP para todas as APIs
│   ├── geminiService.ts       # Wrapper para /api/ai/* endpoints
│   ├── blobService.ts         # Upload para Vercel Blob
│   └── rubeService.ts         # Geracao de video (Veo/Fal.ai)
│
├── hooks/
│   ├── useBackgroundJobs.tsx  # Provider e hooks para jobs
│   ├── useInitialData.ts      # Carrega dados iniciais via SWR
│   ├── useGalleryImages.ts    # CRUD de galeria
│   └── useCampaigns.ts        # CRUD de campanhas
│
├── components/
│   ├── tabs/
│   │   ├── ClipsTab.tsx       # Edicao de clips de video
│   │   ├── PostsTab.tsx       # Posts para redes sociais
│   │   └── AdCreativesTab.tsx # Criativos de anuncio
│   ├── common/
│   │   └── BackgroundJobsIndicator.tsx  # UI de jobs em andamento
│   ├── Dashboard.tsx
│   ├── FlyerGenerator.tsx
│   └── BrandProfileSetup.tsx
│
├── db/
│   ├── schema.sql             # Schema completo do PostgreSQL
│   └── run-migration.mjs      # Script de migracao
│
├── Dockerfile                 # Build para Railway
├── railway.toml               # Configuracao Railway
└── vite.config.ts             # Build do frontend
```

---

## 5. Variaveis de Ambiente

### Obrigatorias

| Variavel | Descricao |
|----------|-----------|
| `DATABASE_URL` | URL do PostgreSQL (Neon) |
| `GEMINI_API_KEY` | Chave da API Google Gemini |
| `BLOB_READ_WRITE_TOKEN` | Token do Vercel Blob Storage |
| `VITE_CLERK_PUBLISHABLE_KEY` | Chave publica do Clerk |
| `CLERK_SECRET_KEY` | Chave secreta do Clerk |

### Opcionais

| Variavel | Descricao |
|----------|-----------|
| `REDIS_URL` ou `REDIS_PRIVATE_URL` | URL do Redis (Railway) |
| `FAL_KEY` | Chave da API Fal.ai (Sora 2) |
| `OPENROUTER_API_KEY` | Chave OpenRouter (modelos alternativos) |
| `RUBE_TOKEN` | Token para API Rube (video) |

---

## 6. Tabela de Modelos de IA

| Funcionalidade | Modelo | Endpoint |
|----------------|--------|----------|
| Campanhas (JSON) | `gemini-2.5-flash-preview-05-20` | `/api/ai/generate-campaign` |
| Imagens Pro | `gemini-3-pro-image-preview` | `/api/ai/generate-image` |
| Edicao Rapida | `gemini-2.5-flash-preview-image` | `/api/ai/edit-image` |
| TTS (Voz) | `gemini-2.5-flash-preview-tts` | `/api/ai/generate-tts` |
| Video | `veo-3.1-fast-generate-preview` | `/api/ai/generate-video` |
| Video (Fallback) | `fal-ai/sora-2/text-to-video` | Fal.ai API |

---

## 7. Fluxo de Autenticacao

### Clerk Integration

1. Usuario faz login via Clerk (Google, email, etc.)
2. Frontend obtem `userId` do Clerk
3. Backend cria/atualiza usuario no PostgreSQL via `/api/db/init`
4. Todas as requisicoes incluem `userId` para multi-tenancy

### Multi-Organizacao

Usuarios podem pertencer a organizacoes, permitindo:
- Compartilhamento de campanhas
- Galeria compartilhada
- Controle de permissoes (viewer, member, admin)

---

## 8. Persistencia de Dados

### Galeria de Imagens

Imagens sao salvas em duas camadas:
1. **Vercel Blob**: Arquivo binario (URL persistente)
2. **PostgreSQL**: Metadados (prompt, source, video_script_id, etc.)

### Importante: URLs vs Data URLs

```typescript
// ERRADO - data URL nao persiste bem
onAddImageToGallery({ src: dataUrl }); // data:image/png;base64,...

// CERTO - URL do blob persiste
const httpUrl = await uploadImageToBlob(base64Data, mimeType);
onAddImageToGallery({ src: httpUrl }); // https://xxx.blob.vercel-storage.com/...
```

### Vinculacao de Imagens

Imagens podem ser vinculadas a:
- `post_id`: Post especifico
- `ad_creative_id`: Anuncio especifico
- `video_script_id`: Clip de video especifico

Isso permite recuperar imagens ao recarregar a pagina.

---

## 9. Guia de Depuracao

### Jobs Travados
1. Verifique o indicador de "Jobs em Background"
2. Use o botao "Cancelar" ou "Cancelar Todos"
3. Verifique logs do Railway: `railway logs`

### Imagens Nao Persistem
1. Verifique se esta usando `httpUrl` (blob) e nao `dataUrl`
2. Verifique se `video_script_id` esta sendo salvo
3. Verifique se a galeria esta carregando: `console.log(galleryImages)`

### Erros de API
1. Verifique variaveis de ambiente no Railway
2. Teste endpoint direto: `curl https://seu-app.up.railway.app/api/health`
3. Verifique logs: `railway logs --tail 50`

### Migracao de Banco
```bash
# Adicionar coluna manualmente
node db/run-context-migration.mjs

# Ou via auto-migracao no startup do server
# (coluna 'context' e enum 'clip' sao adicionados automaticamente)
```

---

## 10. Deploy no Railway

### Passo a Passo

1. Crie projeto no Railway
2. Adicione servico Redis
3. Configure variaveis de ambiente
4. Conecte repositorio GitHub ou use CLI:
   ```bash
   railway link
   railway up
   ```

### Dockerfile

O Dockerfile faz build do frontend (Vite) e inicia o server Express:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["node", "server/index.mjs"]
```

---

## 11. Desenvolvimento Local

### Modos de Desenvolvimento

A aplicacao tem dois modos de desenvolvimento:

| Modo | Comando | Redis | Descricao |
|------|---------|-------|-----------|
| **Padrao** | `npm run dev` | Railway (remoto) | Usa Redis do Railway, recomendado |
| **Local** | `npm run dev:local` | Docker (local) | Usa Redis local, funciona offline |

### Modo Padrao (Railway Redis)

```bash
npm run dev
```

- Roda `dev-api.mjs` (porta 3002) + Vite (porta 5173)
- Usa Redis do Railway (mesmo da producao)
- Jobs em background funcionam normalmente
- Requer `REDIS_URL` ou `REDIS_PRIVATE_URL` no `.env`

### Modo Local (Docker Redis)

```bash
npm run dev:local
```

- Roda Docker Redis (porta 6380) + `dev-api.mjs` + Vite
- Nao depende de servicos externos
- Bom para desenvolvimento offline
- Requer Docker instalado

### Comandos Uteis

```bash
# Desenvolvimento padrao
npm run dev

# Desenvolvimento local (Docker)
npm run dev:local

# Iniciar apenas Redis local
npm run dev:redis

# Parar containers
npm run dev:stop
```

---

## 12. Documentacao Adicional

- `docs/DEVELOPMENT.md` - Guia completo de desenvolvimento local
- `docs/DEPLOYMENT.md` - Guia de deploy no Railway
- `docs/DEBUGGING.md` - Guia de depuracao
- `docs/MODEL_DOCUMENTATION.md` - Detalhes dos modelos de IA

---

*DirectorAi - Aura Engine Documentation v3.0*
*Ultima atualizacao: Janeiro 2026*
