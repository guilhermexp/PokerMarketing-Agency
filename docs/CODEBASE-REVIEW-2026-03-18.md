# Codebase Review Completa — Socialab

**Data:** 2026-03-18
**Escopo:** Analise completa (Seguranca, Logica, Performance, API, Frontend)
**Metodo:** 5 agentes especializados em paralelo com analise estatica do codigo

---

## Resumo Executivo

| Area | Critico | Alto | Medio | Baixo | Total |
|------|---------|------|-------|-------|-------|
| Seguranca | 3 | 7 | 7 | 3 | **20** |
| Logica/Bugs | 3 | 4 | 5 | 5 | **17** |
| Performance | 5 | 9 | 6 | 5 | **25** |
| API | 3 | 4 | 5 | 3 | **15** |
| Frontend | 4 | 6 | 7 | 8 | **25** |
| **Total** | **18** | **30** | **30** | **24** | **102** |

**Ganhos estimados se todos os issues forem corrigidos:**
- 50-70% mais rapido no load inicial
- 30-40% mais rapido em mutations
- 200-300KB menor no bundle
- Eliminacao de vulnerabilidades XSS/CSRF criticas

---

## Indice

1. [TOP 10 — Issues Mais Urgentes](#top-10--issues-mais-urgentes)
2. [Seguranca](#1-seguranca)
3. [Logica e Bugs](#2-logica-e-bugs)
4. [Performance](#3-performance)
5. [API](#4-api)
6. [Frontend](#5-frontend)
7. [Plano de Acao](#plano-de-acao-recomendado)

---

## TOP 10 — Issues Mais Urgentes

### 1. CSP permite `unsafe-inline` e `unsafe-eval`

- **Severidade:** CRITICO (Seguranca)
- **Arquivo:** `server/app.ts:101-108`
- **Problema:** Content Security Policy permite scripts inline e eval(), anulando quase toda protecao contra XSS. Combinado com `dangerouslySetInnerHTML` sem sanitizacao no frontend, qualquer injection se torna exploitavel.
- **Codigo:**
  ```typescript
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",    // Permite <script> inline
    "'unsafe-eval'",      // Permite eval() e Function()
    "https://*.sociallab.pro",
    "https://cdn.jsdelivr.net",
    "https://aistudiocdn.com",
  ],
  ```
- **Fix:** Remover `unsafe-inline`/`unsafe-eval` do CSP. Usar nonce tokens para scripts dinamicos.

### 2. `dangerouslySetInnerHTML` sem sanitizacao

- **Severidade:** CRITICO (Seguranca)
- **Arquivos:**
  - `src/components/assistant/AssistantPanel.tsx` (conteudo HTML gerado por AI)
  - `src/components/admin/modals/LogDetailModal.tsx` (logs)
  - `src/components/ai-elements/code-block.tsx` (syntax highlighting)
- **Problema:** HTML de fontes externas (AI, logs) renderizado direto sem sanitizacao. Se APIs de AI forem comprometidas ou logs contiverem conteudo malicioso, XSS e garantido.
- **Fix:** Usar `dompurify` ou `sanitize-html` antes de renderizar. Alternativa: usar `html-react-parser` com sanitizacao.

### 3. N+1 Subqueries em Campaign Listings

- **Severidade:** CRITICO (Performance)
- **Arquivo:** `server/services/campaigns-service.ts:240-327`
- **Problema:** Listagem de campanhas usa 8 subqueries correlacionadas por campanha (4 COUNTs + 4 preview URLs). Para 10 campanhas = 80+ subqueries.
- **Codigo:**
  ```sql
  SELECT c.*,
    (SELECT COUNT(*) FROM video_clip_scripts WHERE campaign_id = c.id),
    (SELECT COUNT(*) FROM posts WHERE campaign_id = c.id),
    (SELECT COUNT(*) FROM ad_creatives WHERE campaign_id = c.id),
    -- + 4 subqueries para preview URLs
  FROM campaigns WHERE user_id = $1 LIMIT 10
  ```
- **Fix:** Consolidar em LEFT JOINs com aggregation, window functions ou CTEs.

### 4. Inserts sequenciais na criacao de campanhas

- **Severidade:** CRITICO (Performance)
- **Arquivo:** `server/services/campaigns-service.ts:418-461`
- **Problema:** 23 inserts sequenciais com `await` individual em loop (scripts + posts + ads + carousels).
- **Fix:** Multi-row INSERT, `Promise.all()` por tipo de conteudo, ou transaction unica.

### 5. Upload usa Base64 no frontend

- **Severidade:** CRITICO (Performance)
- **Arquivo:** `src/services/api-client/uploadApi.ts:29-34`
- **Problema:** Blob convertido pra base64 antes do upload — aumenta payload em 33% e bloqueia main thread.
- **Codigo:**
  ```javascript
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => ..., "")
  );
  ```
- **Fix:** Usar FormData com binary payload ou Vercel Blob direct upload.

### 6. Zero Error Boundaries no app

- **Severidade:** CRITICO (Frontend)
- **Arquivo:** Codebase inteira
- **Problema:** Nenhum Error Boundary implementado. Um erro em qualquer componente crasha o app inteiro sem graceful degradation.
- **Fix:** Implementar em 4 niveis: root, feature, view, componente.

### 7. CSRF token nao regenerado apos autenticacao

- **Severidade:** CRITICO (Seguranca)
- **Arquivo:** `server/routes/health.ts:37-59`
- **Problema:** Token reutilizado do cookie se ja existir. Atacante pode fixar token pre-login no site dele, usuario loga, atacante usa o token.
- **Codigo:**
  ```typescript
  let token = req.cookies?.csrf_token || null; // Reusa se existir
  ```
- **Fix:** Sempre regenerar CSRF token apos sign-in/sign-up/org switch.

### 8. Async route handlers sem error wrapper

- **Severidade:** CRITICO (API)
- **Arquivos:** Todos em `server/routes/*.ts`
- **Problema:** Handlers async sem `asyncHandler()`. Promise rejections nao passam pelo error middleware, causando falhas silenciosas ou crash do server.
- **Fix:** Wrappear todos os handlers async com `asyncHandler()` do `server/middleware/errorHandler.ts`.

### 9. Formatos de erro inconsistentes

- **Severidade:** CRITICO (API)
- **Arquivos:** Multiplos routes
- **Problema:** Dois formatos coexistem:
  - `throw` → envelope `{ error: { code, statusCode, message, details, timestamp } }`
  - Manual → `res.status().json({ error: "message" })`
- **Fix:** Padronizar pra sempre `throw` e deixar error middleware formatar.

### 10. Campaign create/delete sem transaction

- **Severidade:** CRITICO (Logica)
- **Arquivo:** `server/services/campaigns-service.ts:410-463`
- **Problema:** Campaign + filhos (scripts, posts, ads, carousels) criados sem transaction. Falha parcial gera records orfaos.
- **Fix:** Wrappear em transaction explicita do Neon/Postgres.

---

## 1. Seguranca

### CRITICO

#### S1. CSP `unsafe-inline`/`unsafe-eval`
- **Arquivo:** `server/app.ts:101-108`
- **Detalhes:** Ver [TOP 10 #1](#1-csp-permite-unsafe-inline-e-unsafe-eval)

#### S2. `dangerouslySetInnerHTML` sem sanitize
- **Arquivos:** `AssistantPanel.tsx`, `LogDetailModal.tsx`, `code-block.tsx`
- **Detalhes:** Ver [TOP 10 #2](#2-dangerouslysetinnerhtml-sem-sanitizacao)

#### S3. CSRF token nao regenerado pos-auth
- **Arquivo:** `server/routes/health.ts:37-59`
- **Detalhes:** Ver [TOP 10 #7](#7-csrf-token-nao-regenerado-apos-autenticacao)

### ALTO

#### S4. CSP permite `wss:` sem restricao de origin
- **Arquivo:** `server/app.ts:124`
- **Problema:** `connectSrc` inclui `"wss:"` que permite WebSocket pra qualquer origin.
- **Impacto:** Atacante pode estabelecer WebSocket de browser do usuario pra servidor malicioso.
- **Fix:** Restringir a `"wss://sociallab.pro"`, `"wss://localhost:3002"`.

#### S5. Headers HTTP de seguranca faltando
- **Arquivo:** `server/app.ts` (helmet config)
- **Problema:** Headers criticos ausentes ou nao configurados:
  - `X-Frame-Options: DENY` (clickjacking)
  - `X-Content-Type-Options: nosniff` (MIME sniffing)
  - `Strict-Transport-Security` (HTTP downgrade)
  - `Referrer-Policy` (leak de referrer)
- **Fix:** Verificar que Helmet esta configurado corretamente sem overrides.

#### S6. Request logging expoe userId/orgId
- **Arquivo:** `server/middleware/requestLogger.ts:81-82`
- **Problema:** Logs incluem `userId`, `organizationId` e `ip` sem masking.
- **Fix:** Hash ou anonimizar IDs nos logs.

#### S7. Internal API Token em plain headers
- **Arquivo:** `server/app.ts:160-181`
- **Problema:** `X-Internal-Token` transmitido sem criptografia, visivel em logs/proxies.
- **Fix:** Usar mutual TLS (mTLS) ou JWT com expiracao curta. Nunca logar headers com tokens.

#### S8. User ID aceito de query/body params
- **Arquivo:** `server/routes/init.ts:19-31`, `server/lib/auth.ts:300-310`
- **Problema:** `enforceAuthenticatedIdentity` extrai user IDs de `req.query` e `req.body`. Deveria usar apenas o ID da sessao.
- **Fix:** Usar `authUserId` da sessao diretamente, nunca aceitar de request params.

#### S9. JSON.parse sem error handling em paths criticos
- **Arquivos:** `server/lib/agent/claude/tool-registry.ts:1167,1228`, `server/lib/ai/prompt-builders.ts:670,846,1001`
- **Problema:** Alguns `JSON.parse()` sem try-catch. AI pode gerar JSON invalido.
- **Fix:** Wrappear todos em try-catch, usar Zod pra validacao runtime.

#### S10. CORS sem validacao de URL
- **Arquivo:** `server/app.ts:72-91`
- **Problema:** `CORS_ORIGINS` splitado de CSV sem validacao. Espacos ou origins invalidas aceitos.
- **Fix:** Parsear com `new URL()` e validar contra schema. Rejeitar origins invalidas no startup.

### MEDIO

#### S11. Rate limiter in-memory perde state no restart
- **Arquivo:** `server/lib/auth.ts:74-100`
- **Problema:** Rate limiter usa `Map` que zera no restart. Upstash Redis e opcional.
- **Fix:** Usar Redis-backed rate limiter em producao.

#### S12. Cookie cache desabilitado sem documentacao
- **Arquivo:** `server/lib/better-auth.ts:98-104`
- **Problema:** `cookieCache: { enabled: false }` sem explicacao. Aumenta load no DB.
- **Fix:** Documentar trade-off; considerar invalidacao por evento.

#### S13. Admin route protecao por email string
- **Arquivo:** `server/lib/auth.ts:421-467`
- **Problema:** Super admin verificado por comparacao de email. Sem audit log de acoes admin, sem rate limit em tentativas falhas.
- **Fix:** Logar todas as tentativas admin (sucesso + falha). Adicionar rate limit em `/api/admin/*`.

#### S14. File upload size limits inconsistentes
- **Arquivos:** `server/app.ts:138-142`, `server/services/upload-service.ts:10`
- **Problema:** Express tem 10MB global, rotas de image-playground tem 25MB, upload-service tem MAX_FILE_SIZE de 100MB.
- **Fix:** Definir single source of truth pra limits.

#### S15. Video proxy aceita qualquer Vercel Blob URL
- **Arquivo:** `server/services/upload-service.ts:18-37`
- **Problema:** `/api/proxy-video` aceita qualquer URL do Vercel Blob sem validar que pertence ao usuario/org.
- **Fix:** Validar que a URL pertence a org autenticada. Adicionar rate limit por IP/user.

#### S16. CSP permite `data:` e `blob:` pra imagens sem limites
- **Arquivo:** `server/app.ts:112-113`
- **Problema:** `imgSrc: ["'self'", "data:", "blob:", ...]` — combinado com XSS, permite embedding de arquivos grandes.
- **Fix:** Limitar data: URI size.

#### S17. Rate limiting falta em rotas nao-autenticadas
- **Arquivos:** `server/routes/health.ts`, `server/routes/init.ts`
- **Problema:** `/api/csrf-token` e `/api/db/init` sem rate limit. Permite geracao ilimitada de tokens e enumeracao de usuarios.
- **Fix:** Adicionar rate limit por IP (50 req/min) pra endpoints nao-autenticados.

### BAIXO

#### S18. TypeScript `as unknown` type assertions (31 instancias)
- **Arquivos:** `server/lib/auth.ts:60,216`, `server/lib/better-auth.ts`
- **Fix:** Usar tipos corretos; documentar quando `as unknown` for inevitavel.

#### S19. Logs mostram dominio do email parcialmente mascarado
- **Arquivo:** `server/lib/auth.ts:448-451`
- **Problema:** `***@example.com` ainda revela o dominio.
- **Fix:** Hash ou dropar email dos logs completamente.

#### S20. Sem timeout em conexoes de banco
- **Arquivo:** `server/lib/db.ts`
- **Problema:** `neon(DATABASE_URL)` sem configuracao de timeout.
- **Fix:** `neon(DATABASE_URL, { connectionTimeout: 5000 })`.

---

## 2. Logica e Bugs

### CRITICO

#### L1. Coluna `carousel_image_urls` faltando no schema
- **Arquivo:** `server/helpers/scheduled-publisher.ts:580-592` e `db/schema.sql`
- **Problema:** Codigo referencia `post.carousel_image_urls` que nao existe na tabela `scheduled_posts`. Posts de carousel vao crashar com TypeError.
- **Fix:** Adicionar `carousel_image_urls TEXT[]` via migration.

#### L2. Blob deletions sequenciais em campaign deletion
- **Arquivo:** `server/services/campaigns-service.ts:557-567`
- **Problema:** Arquivos deletados sequencialmente com `await` em loop. Se uma delecao trava, as seguintes ficam bloqueadas.
- **Codigo:**
  ```typescript
  for (const url of urlsToDelete) {
    try {
      await del(url);  // Sequencial
    }
  }
  ```
- **Fix:** `Promise.all()` pra delecoes paralelas com error handling individual.

#### L3. Campaign create sem transaction
- **Arquivo:** `server/services/campaigns-service.ts:410-463`
- **Detalhes:** Ver [TOP 10 #10](#10-campaign-createdelete-sem-transaction)

### ALTO

#### L4. Array index access sem verificacao de existencia
- **Arquivos:** `server/services/scheduled-posts-service.ts:206,253,280,315,367,399,422`, `server/services/campaigns-service.ts:416,425,437,449,461,503,610,626,643,777,794`, `server/services/brand-profiles-service.ts:55,153,219`
- **Problema:** Non-null assertion `!` em `result[0]!` sem verificar se array tem elementos.
- **Codigo:**
  ```typescript
  const newPost = result[0]!;  // result pode ser array vazio
  ```
- **Fix:** Checar `.length > 0` antes de acessar indice.

#### L5. Falha silenciosa no agendamento de posts
- **Arquivo:** `server/services/scheduled-posts-service.ts:208-222`
- **Problema:** Erro no job queue scheduling e logado mas nao propagado. Post criado no DB mas nunca vai ser publicado.
- **Codigo:**
  ```typescript
  try {
    await schedulePostForPublishing(...);
  } catch (error) {
    logger.error(...);  // Loga mas nao lanca
  }
  ```
- **Fix:** Propagar erro ou retornar status de erro pro client.

#### L6. Route handler `throw` sem resposta
- **Arquivo:** `server/routes/db-scheduled-posts.ts:48`
- **Problema:** `throw error` dentro do handler sem `asyncHandler()` — client recebe 500 generico ao inves de 400/403.
- **Fix:** Usar `asyncHandler()` ou retornar `res.status().json()` diretamente.

#### L7. Validacao de carousel permite arrays vazios
- **Arquivo:** `server/helpers/scheduled-publisher.ts:463`
- **Problema:** Carousel requer minimo 2 items mas validacao permite arrays vazios em etapas anteriores.
- **Fix:** Validar tamanho do array antes de entrar no loop.

### MEDIO

#### L8. Rate limiter in-memory sem persistencia
- **Arquivo:** `server/lib/auth.ts:74-100`
- **Problema:** `Map<string, RateLimitEntry>()` perde state no restart.
- **Fix:** Usar Redis ou Upstash como backend obrigatorio.

#### L9. CSRF safe methods nao geram tokens
- **Arquivo:** `server/middleware/csrfProtection.ts:110-122`
- **Problema:** GET/HEAD/OPTIONS nao geram tokens. Primeiro POST apos page load pode falhar.
- **Fix:** Garantir que `/api/csrf-token` e chamado antes de qualquer POST.

#### L10. Optional chaining sem fallback
- **Arquivo:** `server/routes/ai-speech.ts:49`
- **Codigo:**
  ```typescript
  response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || ""
  ```
- **Fix:** Adicionar fallback explicito e type guard.

#### L11. `ScheduledPostRow` interface diverge do schema
- **Arquivo:** `server/helpers/scheduled-publisher.ts:28-56`
- **Problema:** Interface inclui `carousel_image_urls` que nao existe na tabela.
- **Fix:** Alinhar interface com schema SQL.

#### L12. Soft delete inconsistente
- **Arquivos:** Multiplos route handlers
- **Problema:** Alguns queries filtram `deleted_at IS NULL`, outros nao.
- **Fix:** Padronizar todos os queries pra incluir filtro de soft delete.

### BAIXO

#### L13. Database operations sequenciais em campaign delete
- **Arquivo:** `server/services/campaigns-service.ts:557-577`
- **Fix:** `Promise.all()` pra Blob deletions + transaction pra DB deletes.

#### L14. User ID cache nunca faz eviction
- **Arquivo:** `server/lib/user-resolver.ts:17-30`
- **Problema:** Cache usa TTL no read mas nunca remove entries expiradas proativamente.
- **Fix:** Cleanup periodico ou usar `node-cache` com eviction.

#### L15. Hashtags sem validacao
- **Arquivo:** `server/helpers/scheduled-publisher.ts:574-577`
- **Problema:** Strings vazias e duplicatas aceitas no array de hashtags.
- **Fix:** Filtrar e validar array.

#### L16. DST nao tratado em publishing hours
- **Arquivo:** `server/helpers/scheduled-publisher.ts:733-747`
- **Problema:** `toLocaleString` com timezone pode dar off-by-one durante transicao de horario de verao.
- **Fix:** Usar library propria (date-fns-tz).

#### L17. Job queue events sem error recovery
- **Arquivo:** `server/helpers/job-queue.ts:491-500`
- **Problema:** Handlers de `completed` e `failed` nao implementam recovery.
- **Fix:** Adicionar tracking de erros e retry logic.

---

## 3. Performance

### CRITICO

#### P1. N+1 subqueries em campaigns
- **Arquivo:** `server/services/campaigns-service.ts:240-327`
- **Detalhes:** Ver [TOP 10 #3](#3-n1-subqueries-em-campaign-listings)
- **Impacto estimado:** ~40% mais rapido com fix.

#### P2. Inserts sequenciais em campaign creation
- **Arquivo:** `server/services/campaigns-service.ts:418-461`
- **Detalhes:** Ver [TOP 10 #4](#4-inserts-sequenciais-na-criacao-de-campanhas)
- **Impacto estimado:** ~10x mais rapido.

#### P3. Upload base64 no frontend
- **Arquivo:** `src/services/api-client/uploadApi.ts:29-34`
- **Detalhes:** Ver [TOP 10 #5](#5-upload-usa-base64-no-frontend)
- **Impacto estimado:** ~50% upload mais rapido.

#### P4. God Component — Main App Controller
- **Arquivo:** `src/main-app-controller.tsx` (311 linhas)
- **Problema:** Gerencia ~55 states, 30+ subscriptions Zustand, 150+ variaveis. Qualquer mudanca de prop re-renderiza hierarquia inteira.
- **Fix:** Decompor em controllers por dominio (Brand, Campaign, Gallery, Tournament).

#### P5. User ID cache sem eviction
- **Arquivo:** `server/lib/user-resolver.ts:16-30`
- **Problema:** `Map` sem limite de tamanho. Cresce indefinidamente com milhares de usuarios.
- **Fix:** Implementar LRU com max 10K entries.

### ALTO

#### P6. CalendarView — 1,005 linhas sem memoizacao
- **Arquivo:** `src/components/calendar/CalendarView.tsx`
- **Problema:** Componente gigante com schedule rendering, modais, timezone, drag-and-drop. Sem `useMemo`/`useCallback` pra dados derivados.
- **Fix:** Extrair SchedulePostModal, DayCell, WeeklyCalendar em componentes memoizados.

#### P7. Gallery query duplicada 4x
- **Arquivo:** `server/services/gallery-service.ts:53-169`
- **Problema:** `listGallery()` repete a mesma query 4 vezes com condicionais (org+source, org-source, user+source, user-source).
- **Fix:** Query unica parametrizada com WHERE dinamico.

#### P8. Uploads sem compressao de imagem
- **Arquivos:** `server/routes/ai-image.ts`, `server/routes/ai-video.ts`
- **Problema:** Imagens e videos vao pro Vercel Blob sem otimizacao (sem compress, sem WebP, sem resize).
- **Fix:** Usar `sharp` (ja no package.json) pra comprimir antes do upload.

#### P9. SWR deduplication interval de 10 minutos
- **Arquivo:** `src/hooks/useAppData.tsx:40`
- **Problema:** `dedupingInterval: 600000` — dados ficam stale por 10 minutos entre tabs.
- **Fix:** Reduzir pra 30-60 segundos ou implementar sync via BroadcastChannel API.

#### P10. Scheduled posts sem batch processing
- **Arquivo:** `server/services/gallery-service.ts:225-238`
- **Problema:** Imagens organizadas por dia/periodo em loop sem batch. Queries subsequentes serao N+1.
- **Fix:** Pre-organizar em SQL com window functions ou GROUP BY.

#### P11. node_modules 851MB
- **Problema:** Dependencias pesadas: tesseract.js (~50MB), sharp (~100MB), Radix UI + shadcn (~50MB), FFmpeg WASM.
- **Fix:** Auditar dependencias, remover Radix components nao usados, lazy-load tesseract.js.

#### P12. imagePlaygroundStore monolitico (868 linhas)
- **Arquivo:** `src/stores/imagePlaygroundStore.ts`
- **Problema:** Store unico gerencia config, topics, batches, image creation. Todos os subscribers re-renderizam em qualquer mudanca.
- **Fix:** Splittar em 4 stores separados com Zustand composition ou selectors com shallow comparison.

#### P13. Video generation faz fetch HTTP desnecessario
- **Arquivo:** `server/lib/ai/video-generation.ts:146-149`
- **Problema:** Pra usar imagem com Google Veo, faz fetch HTTP da URL. Adiciona 500ms-2s de latencia.
- **Fix:** Aceitar imagem como base64 param ou usar blob URL local.

#### P14. Lucide-React bundled como chunk de 924KB
- **Arquivo:** `vite.config.ts:151`
- **Problema:** Barrel imports criam chunk unico de 924KB mesmo usando ~30 icones.
- **Fix:** Converter pra direct imports: `import { IconName } from 'lucide-react/dist/esm/icons/icon-name'`.

### MEDIO

#### P15. Gallery init carrega 100 imagens sem paginacao cursor
- **Arquivo:** `server/routes/init.ts:99-100`
- **Problema:** Usuarios com 10,000+ imagens vao ter load lento.
- **Fix:** Cursor-based pagination, reduzir initial limit pra 25-50.

#### P16. Modais nao memoizados
- **Arquivo:** `src/components/calendar/SchedulePostModal.tsx` (907 linhas)
- **Problema:** Re-renderiza em toda mudanca de state do parent.
- **Fix:** `React.memo()` + `useCallback()` pra todas as props de funcao.

#### P17. 239 useEffect hooks no frontend
- **Problema:** Alto numero sugere logica reativa dispersa.
- **Fix:** Auditar cada useEffect; mover fetch logic pra custom hooks ou SWR.

#### P18. Sem request batching pra API calls
- **Problema:** Cada acao UI e um HTTP request separado. Sem batching de mutations.
- **Fix:** Implementar batch endpoint ou migrar pra tRPC.

#### P19. console.log em production builds
- **Arquivo:** `vite.config.ts:147`
- **Problema:** Vite dropa `console.log` mas `clientLogger` calls nao sao removidos.
- **Fix:** Wrappear logging em dev check.

#### P20. Imagens publicadas sem compressao
- **Arquivo:** `server/helpers/scheduled-publisher.ts`
- **Problema:** Imagens publicadas em resolucao total. Redes sociais comprimem de qualquer forma.
- **Fix:** JPEG 85% quality, WebP antes de publicar.

### BAIXO

#### P21. State nao utilizado no main controller
- **Arquivo:** `src/main-app-controller.tsx:96-150`

#### P22. Cache expiration so no access
- **Arquivo:** `server/lib/user-resolver.ts:20-26`

#### P23. Sem query logging pra analise de performance
- **Problema:** Impossivel identificar slow queries sem APM.
- **Fix:** Logar queries >100ms.

#### P24. PWA precaching limitado a assets estaticos
- **Arquivo:** `vite.config.ts:72-74`

#### P25. CORS com subdominios wildcard
- **Arquivo:** `server/app.ts:72-91`

---

## 4. API

### CRITICO

#### A1. Async handlers sem error wrapper
- **Arquivos:** Todos em `server/routes/*.ts`
- **Detalhes:** Ver [TOP 10 #8](#8-async-route-handlers-sem-error-wrapper)

#### A2. Error response formats inconsistentes
- **Arquivos:** Multiplos routes
- **Detalhes:** Ver [TOP 10 #9](#9-formatos-de-erro-inconsistentes)

#### A3. Type casting sem validacao
- **Arquivos:** ~107 ocorrencias em routes
- **Problema:** `req.body as Type`, `req.query as Type` sem verificar que validacao middleware executou.
- **Codigo:**
  ```typescript
  const { id } = req.query as PostsPatchQuery; // Assume validacao passou
  ```
- **Fix:** Adicionar null checks explicitos ou type guards apos cast.

### ALTO

#### A4. Path params sem validacao
- **Arquivos:** `db-instagram.ts`, `generation-jobs.ts`, `image-playground.ts`
- **Problema:** Path params como `:id` nao validados (UUID format, length, required vs optional).
- **Fix:** Criar schemas pra path params e validar com `validateRequest`.

#### A5. CSRF protection por prefix — novas rotas facilmente esquecidas
- **Arquivo:** `server/app.ts:186-204`
- **Problema:** CSRF aplicado por PREFIX matching. Rotas novas fora dos prefixes conhecidos ficam desprotegidas.
- **Fix:** Aplicar CSRF por rota (opt-out ao inves de opt-in).

#### A6. Rate limit falta em endpoints caros
- **Arquivo:** `server/app.ts:206-216`
- **Problema:** `POST /api/admin/logs/:id/ai-suggestions` (operacao AI cara) sem rate limit. `/api/agent/studio/stream` com limit generico.
- **Fix:** Rate limits mais estritos (5-10 req/min) pra operacoes caras.

#### A7. Admin auth dentro do handler ao inves de middleware
- **Arquivo:** `server/routes/admin.ts`
- **Problema:** `requireSuperAdmin` chamado manualmente dentro do handler. Facil esquecer em novas rotas.
- **Fix:** Aplicar como middleware na definicao da rota.

### MEDIO

#### A8. Error codes inconsistentes
- **Problema:** Nem todos os `AppError` usam codes especificos. Alguns usam `INTERNAL_SERVER_ERROR` generico.
- **Fix:** Padronizar error codes pra cada tipo de erro.

#### A9. Middleware ordering — CSRF apos response envelope
- **Arquivo:** `server/app.ts:186-204`
- **Problema:** CSRF roda apos response envelope middleware. Timing diferente pra erros CSRF vs outros.
- **Fix:** CSRF antes do response envelope.

#### A10. Nested objects sem limites de tamanho
- **Arquivos:** `db-campaigns.ts`, `db-gallery.ts`
- **Problema:** Arrays de hashtags, slides, carousel items sem `.max()` constraints.
- **Fix:** Adicionar limites nos schemas Zod.

#### A11. Query param `limit` sem validacao numerica
- **Arquivo:** `generation-jobs.ts:76-115`
- **Problema:** `parseInt` de string arbitraria sem validacao pra negativo/NaN.
- **Fix:** Usar `z.coerce.number().positive().max(50)`.

#### A12. POST retorna 200 ao inves de 201
- **Arquivos:** `feedback.ts:69`, `upload.ts:53`
- **Problema:** Criacao de resource retorna 200 ao inves do correto 201.
- **Fix:** Padronizar pra 201 em POST creation.

### BAIXO

#### A13. Flags customizadas no lugar de error codes
- **Arquivo:** `init.ts:51`
- **Problema:** `userNotFound: true` como flag ao inves de error code padrao.

#### A14. Streaming routes sem schema documentado
- **Arquivo:** `server/schemas/api-contracts.ts`
- **Problema:** Rotas SSE (agent-studio, chat) com documentacao minima.

#### A15. Status codes hardcoded nas responses
- **Arquivo:** `db-gallery.ts:72`
- **Problema:** `res.status(400)` manual ao inves de `throw` pra error middleware gerenciar.

---

## 5. Frontend

### CRITICO

#### F1. God Component — MainAppController
- **Arquivo:** `src/main-app-controller.tsx` (311 linhas)
- **Problema:** ~55 pieces of state, 40+ props drilled pro Dashboard, 8 useEffects com dependency chains complexas.
- **Fix:** Splittar em domain controllers: BrandProfileController, CampaignController, GalleryController, TournamentController. Usar React Context pra props deeply nested.

#### F2. Dashboard recebe 100+ props
- **Arquivo:** `src/components/dashboard/dashboard-shared.tsx` (180 linhas)
- **Problema:** `DashboardProps` com 100+ properties. Dashboard recebe tudo mas usa ~20% por view. Qualquer prop change re-renderiza tudo.
- **Fix:** Splittar em view-specific controllers com contexts separados.

#### F3. Zero Error Boundaries
- **Detalhes:** Ver [TOP 10 #6](#6-zero-error-boundaries-no-app)

#### F4. 52x TypeScript `any`
- **Arquivos:** `llmService.ts`, `useImagePlayground.ts`, `useTournamentHandlers.ts`, `PeriodCardRow.tsx`, `CalendarView.tsx`, +47 mais
- **Problema:** `strict: true` no tsconfig mas 52 `any` no codigo.
- **Fix:** Substituir todos por tipos corretos. Enforcar via ESLint `no-implicit-any`.

### ALTO

#### F5. CalendarView sem memoizacao (1,005 linhas)
- **Arquivo:** `src/components/calendar/CalendarView.tsx`
- **Problema:** `React.memo()` aplicado mas props de funcao sem `useCallback`. Sem `useMemo` pra derived state. Multiplos `.filter()` criando novas refs cada render.
- **Fix:** Memoizar todas as callbacks e dados derivados.

#### F6. SWR cache invalidation inconsistente
- **Arquivo:** `src/hooks/useAppData.tsx` (524 linhas)
- **Problema:**
  - `revalidateOnMount: false` com `mutate()` manual inconsistente
  - Sem invalidacao automatica apos mutations
  - Optimistic updates sem rollback em caso de erro
  - `dedupingInterval: 300000` (5 min) muito alto
- **Fix:** Invalidacao automatica pos-mutation, rollback em erro, reduzir dedup pra 60s.

#### F7. GalleryView sem virtual scrolling (997 linhas)
- **Arquivo:** `src/components/gallery/GalleryView.tsx`
- **Problema:** 30 items por pagina sem virtualizacao. GalleryItem recebe 12 props (acoplamento). Sem Intersection Observer pra lazy load.
- **Fix:** Implementar react-virtual/react-window. Extrair GalleryItem memoizado.

#### F8. imagePlaygroundStore monolitico (868 linhas)
- **Arquivo:** `src/stores/imagePlaygroundStore.ts`
- **Problema:** Nested state `batchesMap[topicId][batchIndex][generationIndex]` sem normalizacao. Duplicacao de reducer logic.
- **Fix:** Normalizar com entity pattern. Splittar em stores menores.

#### F9. Acessibilidade — keyboard navigation e ARIA ausentes
- **Problema:** Apenas 129 atributos ARIA no codebase inteiro. Gallery e Calendar sem keyboard nav. Modais sem focus management. Sem skip links.
- **Fix:** ARIA labels em todos os elementos interativos. Focus trap em modais. Keyboard nav pra tabs/dropdowns.

#### F10. Loading/error states faltando
- **Problema:**
  - Calendar: sem loading state ao agendar posts
  - Gallery: paginacao sem error handling
  - Image Playground: sem UI de erro pra geracoes falhas
  - Chat: `.catch()` so loga (63 instancias), sem feedback pro usuario
- **Fix:** Implementar error states com mensagens pro usuario.

### MEDIO

#### F11. Data transformations sem memoizacao
- **Arquivo:** `src/hooks/useDataTransformers.ts`
- **Problema:** `useTransformedGalleryImages`, `useStyleReferences`, `useTransformedCampaignsList` transformam dados a cada render.
- **Fix:** `useMemo` pra todas as transformacoes.

#### F12. Componentes grandes demais
- **Arquivos:**
  - `CalendarView.tsx` (1,005 linhas)
  - `GalleryView.tsx` (997 linhas)
  - `SchedulePostModal.tsx` (907 linhas)
  - `AssistantPanelNew.tsx` (870 linhas)
  - `imagePlaygroundStore.ts` (868 linhas)
  - `PlaygroundView.tsx` (807 linhas)
  - `FlyerGenerator.tsx` (788 linhas)
- **Fix:** Quebrar em componentes focados de 300-400 linhas max.

#### F13. Handlers exportados mas nao usados
- **Arquivo:** `src/hooks/useCampaignHandlers.ts` (588 linhas)
- **Problema:** 6 `useCallback` hooks exportados, Dashboard usa ~4.
- **Fix:** Remover handlers nao utilizados.

#### F14. Sem code splitting pra views pesadas
- **Problema:** Dashboard nao e lazy loaded, forcando todo o bundle upfront. So AssistantPanel e lazy.
- **Fix:** `React.lazy()` pra cada view (Campaign, Flyer, Gallery, Calendar).

#### F15. Icon.tsx monolitico (548 linhas)
- **Arquivo:** `src/components/common/Icon.tsx`
- **Problema:** 200+ SVG paths inline. Nao e tree-shakeable.
- **Fix:** Migrar pra Lucide-React direct imports.

#### F16. API calls sequenciais ao inves de paralelos
- **Problema:** Apenas 13 instancias de `Promise.all()` no codebase inteiro.
- **Fix:** `Promise.all()` pra operacoes independentes.

#### F17. setTimeout hack pra state sync
- **Arquivos:** `src/main-app-controller.tsx:228-229`, Chat store com `setTimeout(100)`
- **Fix:** Usar state batching correto.

### BAIXO

#### F18. Prop drilling 3-4 niveis de profundidade
- **Fix:** React Context pra props frequentemente drilled (galleryImages, brandProfile).

#### F19. strict mode nao enforcado
- **Fix:** ESLint `no-implicit-any` + `tsc --noEmit` no CI.

#### F20. Tailwind v4 inconsistencias
- **Fix:** Configurar @theme inline per CLAUDE.md.

#### F21. Testes faltando pra handler hooks
- **Arquivos:** `useCampaignHandlers.ts` (588 linhas), `useGalleryHandlers.ts` (323 linhas), `useTournamentHandlers.ts` (577 linhas)
- **Fix:** Unit tests pra todos os handlers.

#### F22. `useTransition` importado mas nao usado
- **Arquivo:** `Dashboard.tsx:87`
- **Fix:** Implementar com Suspense boundaries ou remover.

#### F23. Image loading state manual
- **Arquivo:** `GalleryView.tsx:80-98`
- **Fix:** Intersection Observer API.

#### F24. Service Worker caching pode servir JS desatualizado
- **Arquivo:** `vite.config.ts` (Workbox config)
- **Fix:** NetworkFirst pra JS assets ou version checking.

#### F25. Lazy loading sem skeletons contextuais
- **Arquivo:** `main-app-controller.tsx`
- **Problema:** LazyFallback generico "Carregando..." sem contexto.
- **Fix:** Skeletons especificos por view.

---

## Plano de Acao Recomendado

### Semana 1 — Seguranca Critica

| # | Task | Issues |
|---|------|--------|
| 1 | Remover `unsafe-inline`/`unsafe-eval` do CSP + nonces | S1 |
| 2 | Adicionar `dompurify` nos `dangerouslySetInnerHTML` | S2 |
| 3 | Regenerar CSRF token apos autenticacao | S3 |
| 4 | Restringir `wss:` a origins especificos | S4 |
| 5 | Verificar headers HTTP de seguranca (helmet) | S5 |

### Semana 2 — Estabilidade Backend

| # | Task | Issues |
|---|------|--------|
| 6 | Wrappear async handlers com `asyncHandler()` | A1 |
| 7 | Padronizar error responses (sempre throw) | A2, A8, A12, A15 |
| 8 | Adicionar transactions em campaign create/delete | L3, L2 |
| 9 | Fix N+1 queries em campaigns (JOINs/CTEs) | P1 |
| 10 | Batch inserts em campaign creation | P2 |
| 11 | Adicionar migration pra `carousel_image_urls` | L1 |

### Semana 3 — Performance

| # | Task | Issues |
|---|------|--------|
| 12 | Remover base64 encoding do upload | P3 |
| 13 | Comprimir imagens com sharp antes do Blob | P8 |
| 14 | Fix Lucide-React barrel imports | P14, F15 |
| 15 | Reduzir SWR dedup interval | P9, F6 |
| 16 | Parametrizar gallery query (remover duplicacao) | P7 |

### Semana 4 — Frontend

| # | Task | Issues |
|---|------|--------|
| 17 | Implementar Error Boundaries (4 niveis) | F3 |
| 18 | Memoizar CalendarView + GalleryView | F5, F7, F11 |
| 19 | Split imagePlaygroundStore em slices | F8, P12 |
| 20 | Decompor MainAppController em domain controllers | F1, F2, P4 |

### Backlog

| # | Task | Issues |
|---|------|--------|
| 21 | Eliminar 52x `any` no TypeScript | F4 |
| 22 | Code splitting pra views | F14 |
| 23 | Acessibilidade (ARIA, keyboard nav, focus) | F9 |
| 24 | Rate limiting em rotas nao-autenticadas | S17 |
| 25 | Admin audit logging | S13 |
| 26 | Video proxy validacao por org | S15 |
| 27 | Testes pra handler hooks | F21 |

---

## Comparacao com Review Anterior (2026-02-11)

Issues que **persistem** da review de `ARCHITECTURE-REVIEW-2026-02-11.md`:
- `App.tsx` como god component (agora parcialmente decomposto em `main-app-controller.tsx` mas problema continua)
- 66+ `any` (agora 52 — leve melhora)
- Rate limiter in-memory
- `apiClient.ts` monolitico (agora parcialmente splitado em `api-client/`)

Issues **novas** nesta review:
- CSP `unsafe-inline`/`unsafe-eval` (nao identificado antes)
- N+1 subqueries em campaigns
- Base64 upload encoding
- CSRF token fixation
- Zero error boundaries
- 239 useEffect hooks

---

*Relatorio gerado automaticamente por 5 agentes especializados em 2026-03-18.*
