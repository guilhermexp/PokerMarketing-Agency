# Documento de Arquitetura — Socialab

Visão detalhada da arquitetura do sistema, decisões técnicas, fluxo de dados e padrões adotados.

## Índice

- [Contexto e Objetivos](#contexto-e-objetivos)
- [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
- [Stack Tecnológica](#stack-tecnológica)
- [Fluxo de Dados](#fluxo-de-dados)
- [Arquitetura do Backend](#arquitetura-do-backend)
- [Arquitetura do Frontend](#arquitetura-do-frontend)
- [Módulos de IA](#módulos-de-ia)
- [Studio Agent](#studio-agent)
- [Banco de Dados](#banco-de-dados)
- [Segurança](#segurança)
- [Pipeline de Middleware](#pipeline-de-middleware)
- [Armazenamento de Imagens](#armazenamento-de-imagens)
- [Sistema de Filas](#sistema-de-filas)
- [Decisões Arquiteturais](#decisões-arquiteturais)
- [Pontos de Integração](#pontos-de-integração)
- [Débito Técnico](#débito-técnico)

---

## Contexto e Objetivos

O Socialab foi projetado para ser o toolkit central de agências de marketing de poker. Os objetivos arquiteturais são:

1. **Geração rápida** — minimizar latência entre input do usuário e conteúdo gerado
2. **Multi-provider** — não depender de um único provider de IA, com fallback automático
3. **Multi-tenant** — suportar múltiplas organizações com isolamento de dados
4. **Experiência fluida** — updates otimistas no frontend, carregamento unificado
5. **Segurança robusta** — CSRF, rate limiting, validação de upload, autenticação por cookies

## Visão Geral da Arquitetura

O Socialab é uma aplicação monolítica modular com separação clara entre frontend (SPA React) e backend (API Express), ambos servidos pelo mesmo processo Node.js em produção.

```
┌─────────────────────────────────────────────────────────┐
│                     Cliente (Browser)                     │
│  React 19 + Zustand + SWR + TailwindCSS + Radix UI      │
└──────────┬──────────────────────────────────┬────────────┘
           │ HTTP/JSON (cookies)              │ SSE
           ▼                                  ▼
┌─────────────────────────────────────────────────────────┐
│                  Express 5 (Node.js)                     │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Routes   │  │Middleware │  │   Lib    │  │ Helpers │ │
│  │ (24 mods) │  │(CSRF,Log)│  │(AI,Auth) │  │(Queue)  │ │
│  └────┬──┬──┘  └──────────┘  └──┬───┬───┘  └────┬────┘ │
│       │  │                      │   │            │       │
└───────┼──┼──────────────────────┼───┼────────────┼───────┘
        │  │                      │   │            │
        ▼  ▼                      ▼   ▼            ▼
   ┌────────┐  ┌──────────┐  ┌────────┐  ┌──────────────┐
   │  Neon  │  │  Vercel  │  │ Google │  │    Redis     │
   │Postgres│  │   Blob   │  │ Gemini │  │   BullMQ     │
   └────────┘  └──────────┘  └────────┘  └──────────────┘
                                 │
                          ┌──────┴──────┐
                          ▼             ▼
                    ┌──────────┐  ┌──────────┐
                    │Replicate │  │  FAL.ai  │
                    │(fallback)│  │(fallback) │
                    └──────────┘  └──────────┘
```

## Stack Tecnológica

### Frontend

| Tecnologia | Versão | Propósito |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | 5.9 | Tipagem estática |
| Vite | 7 | Build tool e dev server |
| TailwindCSS | 4 | Utility-first CSS |
| Zustand | 5 | Estado do cliente (15+ stores) |
| SWR | 2.4 | Estado do servidor com cache-first |
| Radix UI | Várias | Componentes acessíveis |
| Framer Motion | 12 | Animações |
| FFmpeg.js | 0.12 | Processamento de vídeo no browser |
| Tesseract.js | — | OCR no browser |

### Backend

| Tecnologia | Versão | Propósito |
|---|---|---|
| Express | 5 | Framework HTTP |
| Neon Serverless | 1.0 | PostgreSQL serverless |
| Vercel Blob | 2.2 | Object storage para imagens |
| BullMQ | 5.67 | Fila de jobs |
| IORedis | 5.9 | Cliente Redis |
| Better Auth | 1.4 | Autenticação self-hosted |
| Pino | 10 | Logging estruturado |
| Zod | 4.3 | Validação de schemas |
| Sharp | 0.34 | Processamento de imagens |
| Helmet | 8.1 | Headers de segurança |

### IA

| Tecnologia | Propósito |
|---|---|
| Google Gemini (`@google/genai`) | Geração de texto e imagem (provider primário) |
| Vercel AI SDK (`ai` + `@ai-sdk/google`) | Streaming de chat |
| Claude Agent SDK | Studio Agent com ferramentas MCP |
| Replicate | Fallback de imagem (nano-banana, nano-banana-pro) |
| FAL.ai | Fallback de imagem e geração de vídeo |

## Fluxo de Dados

### Carregamento Inicial

```
Browser → GET /api/db/init (user_id, org_id)
       ← { brand_profile, gallery, scheduled_posts, campaigns, tournaments, schedules }
       → SWR cache (cache-first strategy)
       → Zustand stores (client state)
```

O endpoint `/api/db/init` retorna todos os dados do usuário em uma única request, evitando cascata de chamadas.

### Geração de Conteúdo (IA)

```
1. Usuário inicia geração (ex: campanha)
2. Frontend → POST /api/ai/campaign (otimistic update no UI)
3. Backend → Google Gemini (texto)
4. Backend → Image Provider Chain (imagem)
   4a. Gemini Native → sucesso? retorna
   4b. Replicate → sucesso? retorna
   4c. FAL.ai → sucesso? retorna
5. Backend → Vercel Blob (upload da imagem)
6. Backend → Neon Postgres (salva com URL)
7. Backend ← resposta com dados completos
8. Frontend → SWR revalidate → UI atualizado
```

### Studio Agent (SSE)

```
1. Usuário envia mensagem → POST /api/agent/studio/stream
2. Runner cria instância Claude Agent SDK
3. Agent avalia → seleciona ferramentas MCP (studio_*)
4. Tool execution → tool_registry.ts processa
5. Resultados streamados via SSE ao frontend
6. Conversa persiste em session-store
```

### Posts Agendados

```
1. Usuário agenda post → POST /api/db/scheduled-posts
2. Scheduled Publisher (BullMQ worker) verifica periodicamente
3. No horário → publica via Rube (Instagram API proxy)
4. Atualiza status: scheduled → publishing → published/failed
```

## Arquitetura do Backend

### Organização Modular

O servidor Express é organizado em 4 camadas:

```
server/
├── index.ts          # Orquestrador: setup, middleware, rotas, startup (308 LOC)
├── routes/           # 24 módulos de rota (cada um um Express Router)
├── lib/              # Bibliotecas core
│   ├── ai/          # Módulos de IA centralizados
│   ├── agent/       # Studio Agent (Claude SDK)
│   ├── errors/      # Hierarquia de erros
│   └── validation/  # Validadores
├── middleware/       # Middlewares reutilizáveis
└── helpers/          # Lógica de negócio auxiliar
```

### Registro de Rotas

O `index.ts` registra rotas por prefixo. Cada arquivo de rota exporta um `Router` do Express que é montado no path correspondente. Isso permite que cada domínio (campaigns, gallery, etc.) tenha seu próprio módulo isolado.

### Resolução de Usuário

O sistema usa Better Auth para autenticação (cookies de sessão). O backend resolve o auth user ID para o UUID interno do banco via `resolveUserId()` com cache em memória. Todas as operações de banco usam o UUID resolvido.

```
Cookie → Better Auth session → auth_user_id → resolveUserId() → database UUID
```

### Controle de Acesso a Recursos

O middleware `resource-access` valida que o usuário tem acesso ao recurso solicitado (pertence à mesma organização). Aplicado em todas as rotas `/api/db/*`.

## Arquitetura do Frontend

### Gestão de Estado (3 camadas)

```
┌─────────────────────────────────┐
│         React Context           │  Providers globais (chat, background jobs)
├─────────────────────────────────┤
│       Zustand (15+ stores)      │  Estado do cliente (UI, formulários, seleções)
├─────────────────────────────────┤
│         SWR (hooks)             │  Estado do servidor (campanhas, galeria, etc.)
└─────────────────────────────────┘
```

**SWR** (`useAppData.tsx`): Gerencia dados do servidor com estratégia cache-first. Hooks como `useBrandProfile()`, `useCampaigns()`, `useGallery()` encapsulam fetch, cache e revalidação.

**Zustand** (`src/stores/`): 15+ stores para estado local do cliente — UI (modais, painéis), formulários em progresso, estado de playgrounds, etc.

**React Context**: Providers para chat e background jobs que precisam estar disponíveis globalmente na árvore de componentes.

### Updates Otimistas

O frontend atualiza a UI imediatamente após ação do usuário, antes da confirmação do servidor. Se o servidor falhar, a UI reverte. Isso proporciona uma experiência snappy mesmo com operações que envolvem IA.

### Componentes (208 total)

Organizados por feature em `src/components/`:

- `tabs/` — Tabs de campanha (clips, posts, ads, carousels, daily flyers)
- `gallery/` — Galeria de imagens com grid e preview
- `calendar/` — Calendário de posts agendados
- `studio-agent/` — Interface do Studio Agent (chat + ferramentas)
- `playground/` — Playgrounds de geração (imagem e vídeo)
- `admin/` — Dashboard admin com páginas e modais
- `image-preview/` — Editor de imagem avançado (crop, efeitos, edição com IA)
- `ui/` — Componentes base (wrappers sobre Radix UI)

## Módulos de IA

### Arquitetura Centralizada

Toda interação com providers de IA passa por módulos centralizados em `server/lib/ai/`. Nenhum arquivo de rota importa diretamente de `@google/genai`.

```
server/lib/ai/
├── models.ts              # Source of truth: IDs de modelo, enum Type, normalizeModelId()
├── text-generation.ts     # Geração de texto agnóstica de provider
├── image-generation.ts    # Geração de imagem com cadeia de fallback
├── image-providers.ts     # Lógica de fallback (Gemini → Replicate → FAL)
├── video-generation.ts    # Geração de vídeo (Veo 3.1, FAL Sora)
├── clients.ts             # Fábricas de SDK (getGeminiAi, configureFal)
├── providers.ts           # Wrapper Vercel AI SDK para streaming
├── prompt-builders.ts     # Templates de prompt e schemas Zod
└── retry.ts               # Lógica de retry para operações de IA
```

### Cadeia de Providers de Imagem

A variável `IMAGE_PROVIDERS` (padrão: `gemini,replicate,fal`) controla a ordem de fallback:

```
1. Gemini Native (imagem nativa do modelo)
2. Replicate
   - google/nano-banana (Standard, mais barato)
   - google/nano-banana-pro (Pro, melhor tipografia — forçado para flyers)
3. FAL.ai
```

Se um provider falhar, o sistema tenta automaticamente o próximo na cadeia.

### Funções de Texto

`text-generation.ts` expõe funções agnósticas:

- `generateText()` — Geração simples de texto
- `generateTextFromMessages()` — A partir de array de mensagens
- `streamTextFromMessages()` — Streaming de texto
- `generateStructuredContent()` — Output estruturado com schema Zod
- `generateTextWithVision()` — Texto a partir de imagem + prompt

## Studio Agent

### Arquitetura

O Studio Agent é um assistente criativo baseado no **Claude Agent SDK** que opera nos Image Studio e Video Studio.

```
Frontend (SSE client)
    │
    ▼
POST /api/agent/studio/stream
    │
    ▼
runner.ts (Orquestrador)
    ├── Claude Agent SDK query()
    ├── Loop guards (max iterações)
    ├── Interaction timeouts
    └── SSE streaming
          │
          ▼
    mcp-bridge.ts (MCP Server)
          │
          ▼
    tool-registry.ts (30+ ferramentas)
          ├── studio_generate_image
          ├── studio_edit_image
          ├── studio_generate_video
          ├── studio_search_gallery
          ├── studio_get_brand_profile
          ├── studio_list_campaigns
          └── ... (30+ ferramentas prefixadas studio_*)
```

### Ferramentas MCP

O agente só pode usar ferramentas `mcp__studio__*`. Ferramentas nativas (Read, Write, Bash, etc.) são bloqueadas. As ferramentas cobrem: CRUD de imagem/vídeo, geração, galeria, perfil de marca, campanhas, posts, clips e carousels.

### Menções de Conteúdo

O sistema suporta referências inline no formato `@tipo:uuid`:

- `@gallery:uuid` — Imagem da galeria
- `@campaign:uuid` — Campanha
- `@clip:uuid` — Clipe de vídeo
- `@carousel:uuid` — Carousel

Essas menções são resolvidas e injetadas como contexto na conversa do agente.

### Persistência de Sessão

Conversas são persistidas via `session-store.ts`, permitindo multi-turn conversations com histórico completo.

## Banco de Dados

### Neon Serverless Postgres

O banco usa **Neon Serverless** com o driver `@neondatabase/serverless`, otimizado para conexões de curta duração em ambientes serverless.

### Schema Simplificado

```
users ─────────┐
               ├──→ brand_profiles (1:1 por org)
               ├──→ campaigns ──→ posts
               │                ──→ ad_creatives
               │                ──→ video_clip_scripts
               │                ──→ carousels
               ├──→ gallery_images
               ├──→ scheduled_posts ──→ instagram_accounts
               ├──→ tournament_events ──→ week_schedules
               ├──→ chat_sessions ──→ chat_messages
               └──→ generation_jobs
                    ai_usage_logs
```

### Enums do Banco

- **tone_of_voice**: Profissional, Espirituoso, Casual, Inspirador, Técnico
- **social_platform**: Instagram, LinkedIn, Twitter, Facebook
- **ad_platform**: Facebook, Google
- **publication_status**: scheduled, publishing, published, failed, cancelled
- **generation_job_status**: queued, processing, completed, failed

### Migrações

Migrações SQL ficam em `db/migrations/` e são aplicadas com `node db/migrate.mjs`. O schema completo está em `db/schema.sql`.

## Segurança

### Camadas de Proteção

```
Request → CORS → Helmet (CSP, HSTS, etc.)
       → Cookie Parser
       → Better Auth (sessão)
       → CSRF Validation (Double Submit Cookie, HMAC-SHA256)
       → Rate Limiting (Upstash Redis / in-memory)
       → Resource Access Control
       → Content-Type Validation (uploads)
       → Zod Schema Validation
       → Route Handler
```

### CSRF — Double Submit Cookie

Tokens gerados com `crypto.randomBytes(32)` e assinados com HMAC-SHA256. Enviados em cookie httpOnly (`csrf-token`) e header (`X-CSRF-Token`). Validação timing-safe. Expiração: 24h.

### Rate Limiting

Implementado com Upstash Redis (produção) ou in-memory (fallback). Limites diferenciados por tipo de endpoint: 30 req/min para IA geral, 5 req/min para vídeo.

### Validação de Uploads

Whitelist de MIME types: jpeg, png, webp, heic, heif, gif (imagem) e mp4, webm (vídeo). Bloqueia HTML, SVG, JavaScript para prevenir XSS via upload.

## Pipeline de Middleware

Ordem de execução no Express (definida em `server/index.ts`):

1. CORS
2. Geração de nonce CSP
3. Helmet (headers de segurança)
4. JSON body parser (limite 10MB)
5. Cookie parser
6. Better Auth (extração de sessão)
7. Validação de token interno de API
8. Request logger (Pino)
9. Response envelope middleware
10. Auth + CSRF (prefixos protegidos)
11. Rate limiting (endpoints de IA e vídeo)
12. Resource access control (rotas `/api/db/*`)
13. Route handlers
14. 404 handler
15. Error handler global

## Armazenamento de Imagens

Regra fundamental: **nunca armazenar base64 data URLs no banco**. Todas as imagens são uploadadas para Vercel Blob e apenas URLs HTTPS são salvas nas colunas do banco.

```
Geração de Imagem → Upload Vercel Blob → URL HTTPS → Salva no Postgres
Upload do Usuário → Validação MIME type → Upload Vercel Blob → URL HTTPS
```

O utilitário `uploadImageToBlob()` em `src/services/blobService.ts` centraliza essa lógica no frontend. No backend, todas as rotas de geração e upload usam a mesma abordagem.

## Sistema de Filas

### BullMQ + Redis

Usado exclusivamente para **posts agendados**. O sistema de jobs de imagem foi removido (geração agora é síncrona).

```
Scheduled Publisher (Worker BullMQ)
    │
    ├── Verifica posts com horário atingido
    ├── Publica via Rube (Instagram API proxy)
    └── Atualiza status no banco
```

Redis é **opcional**. Sem Redis, posts agendados não são publicados automaticamente, mas o resto do sistema funciona normalmente.

## Decisões Arquiteturais

### 1. Monolito Modular vs Microserviços
**Decisão**: Monolito modular com 24 módulos de rota.
**Razão**: Simplicidade de deploy, menos overhead operacional, adequado para o tamanho atual do time e escala.

### 2. Geração Síncrona de Imagens
**Decisão**: Imagens são geradas de forma síncrona (job queue foi removido).
**Razão**: Redução de complexidade. A latência dos providers de IA é aceitável para o UX com updates otimistas.

### 3. Fetch Unificado (/api/db/init)
**Decisão**: Um único endpoint retorna todos os dados iniciais.
**Razão**: Minimiza waterfall de requests no carregamento, reduz latência percebida.

### 4. SWR + Zustand (não Redux)
**Decisão**: SWR para estado do servidor, Zustand para estado do cliente.
**Razão**: Separação clara de responsabilidades. SWR gerencia cache e revalidação automaticamente. Zustand é leve e sem boilerplate.

### 5. Better Auth (não NextAuth/Clerk)
**Decisão**: Better Auth self-hosted.
**Razão**: Controle total sobre autenticação, sem dependência de SaaS, suporte nativo a organizações.

### 6. Cadeia de Providers de Imagem
**Decisão**: Fallback automático Gemini → Replicate → FAL.
**Razão**: Resiliência. Se um provider falhar ou atingir quota, o sistema continua funcionando com o próximo.

### 7. Vercel Blob (não S3)
**Decisão**: Vercel Blob para armazenamento de imagens.
**Razão**: Integração nativa com o ecossistema Vercel, CDN inclusa, API simples.

## Pontos de Integração

| Serviço | Propósito | Módulo |
|---|---|---|
| Neon Postgres | Banco de dados principal | `server/lib/db.ts` |
| Vercel Blob | Armazenamento de imagens | `src/services/blobService.ts` |
| Google Gemini | Geração de texto e imagem | `server/lib/ai/text-generation.ts`, `image-generation.ts` |
| Replicate | Fallback de imagem | `server/lib/ai/image-providers.ts` |
| FAL.ai | Fallback imagem + vídeo | `server/lib/ai/fal-image-generation.ts`, `video-generation.ts` |
| Redis | Fila de posts agendados | `server/helpers/job-queue.ts` |
| Rube | Publishing Instagram | `server/routes/rube.ts` |
| Claude Agent SDK | Studio Agent | `server/lib/agent/claude/runner.ts` |

## Débito Técnico

### Crítico

- **App.tsx** (~2.571 linhas): Componente monolítico que centraliza estado e lógica. Precisa ser decomposto em componentes menores e hooks dedicados.
- **ClipCard.tsx** (~5.500 linhas): Componente único maior do projeto. Deve ser dividido em subcomponentes.
- **apiClient.ts** (~1.726 linhas): Cliente HTTP monolítico. Deve ser dividido por domínio (campaigns, gallery, etc.).

### Moderado

- 66+ usos de `any` no TypeScript, reduzindo a segurança de tipos
- Rate limiter in-memory não persiste entre restarts e não é compartilhado entre instâncias
- Redis opcional pode causar confusão operacional (posts agendados não funcionam sem ele)

### Referência

Para a revisão completa de arquitetura e recomendações detalhadas, consulte `docs/ARCHITECTURE-REVIEW-2026-02-11.md` e `docs/AUDIT-REPORT-2026-02-27.md`.
