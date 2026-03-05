# Socialab — Relatório Completo de Auditoria Técnica

**Data**: 27 de Fevereiro de 2026
**Método**: 7 agentes paralelos (senior-architect + vercel-react-best-practices)
**Escopo**: Frontend, Backend, State Management, Bundle, Performance, Segurança

---

## Resumo Executivo

| Área | Crítico | Alto | Médio | Baixo | Quick Wins |
|------|---------|------|-------|-------|------------|
| Segurança (Backend) | 3 | 2 | 1 | - | 2 |
| Performance (React) | 3 | 5 | 7 | - | 8 |
| Arquitetura (Decomposição) | - | 3 | - | - | - |
| Bundle Size | 2 | 1 | 3 | 1 | 7 |
| State Management | 1 | 2 | 5 | 4 | 8 |
| Backend Patterns | 1 | 3 | 7 | 5 | 7 |
| **TOTAL** | **10** | **16** | **23** | **10** | **32** |

---

## PARTE 1: BUGS E ISSUES CRÍTICOS (Correção Imediata)

### BUG-1: `selectEnabledPeriodTournaments` — Condição sempre true
**Arquivo**: `src/stores/flyerStore.ts`, linhas 408-422
```
(state.showPastTournaments || !state.showPastTournaments) → sempre true
```
O filtro não faz nada. Torneios passados sempre aparecem.

### BUG-2: `toggleStyleFavorite` — Nunca adiciona favoritos novos
**Arquivo**: `src/stores/flyerStore.ts`
Busca o ID na lista de favoritos existentes (que obviamente não contém o novo item). `.find()` retorna `undefined`, `.filter(Boolean)` remove. O favorito nunca é adicionado.

### BUG-3: `useCreateVideo` — Sessão duplicada no store
**Arquivo**: `src/hooks/useVideoPlayground.ts`, linhas 190 e 222
Chama `addSession` duas vezes para o mesmo tópico: uma com status pending, outra com URL do vídeo. Cria entrada duplicada ao invés de atualizar.

### SEC-1: `error.message` exposto ao cliente em ~50 endpoints
**Arquivos**: `video-playground.mjs` (10x), `image-playground.mjs` (10x), `db-campaigns.mjs` (6x), `db-gallery.mjs` (4x), `db-tournaments.mjs` (5x), `db-instagram.mjs` (4x), `upload.mjs` (1x)
```javascript
res.status(500).json({ error: error.message }) // ← Vaza nomes de tabelas, constraints, paths
```
Rotas AI já usam `sanitizeErrorForClient()`. DB routes não.

### SEC-2: Sem transações no banco — Dados parciais em caso de falha
**Arquivo**: `server/routes/db-campaigns.mjs`
- `POST /api/db/campaigns` (linhas 213-336): Cria campanha + posts + ads + clips em loops sequenciais. Se falhar no 3º post, fica com dados parciais.
- `DELETE /api/db/campaigns` (linhas 338-543): 8 operações DELETE sequenciais sem BEGIN/COMMIT.
- **Zero `BEGIN`/`COMMIT`/`ROLLBACK` em todo o codebase.**

### SEC-3: LIKE wildcards não escapados
**Arquivo**: `server/routes/agent-studio.mjs`, linha 339
```javascript
const pattern = query ? `%${query}%` : '%'; // ← query pode conter %, _
```
Mesmo pattern em `server/lib/agent/claude/tool-registry.mjs`, linha 556.

---

## PARTE 2: PERFORMANCE — QUICK WINS (Alto Impacto, Baixo Esforço)

Estas 8 correções tocam apenas **2-3 arquivos** e eliminam a maioria dos re-renders desnecessários:

### PERF-1: Memoizar transformações de dados em App.tsx (10 min)
**Arquivo**: `src/App.tsx`, linhas 440-504
```javascript
// ANTES (roda em CADA render — cria referência nova → cascata de re-renders)
const galleryImages = (swrGalleryImages || []).filter(...).map(...);
const scheduledPosts = (swrScheduledPosts || []).map(...).sort(...);
const campaignsList = (swrCampaigns || []).map(...);

// DEPOIS
const galleryImages = useMemo(() => (swrGalleryImages || []).filter(...).map(...), [swrGalleryImages]);
const scheduledPosts = useMemo(() => (swrScheduledPosts || []).map(...).sort(...), [swrScheduledPosts]);
const campaignsList = useMemo(() => (swrCampaigns || []).map(...), [swrCampaigns]);
```
**Impacto**: Maior quick win. Estas arrays são passadas ao Dashboard → todos os filhos.

### PERF-2: Memoizar context value do BackgroundJobsProvider (5 min)
**Arquivo**: `src/hooks/useBackgroundJobs.tsx`, linhas 114-119, 312-324
```javascript
// ANTES
const pendingJobs = jobs.filter(...);   // nova array a cada render
const value = { jobs, pendingJobs, ... }; // novo objeto a cada render

// DEPOIS
const pendingJobs = useMemo(() => jobs.filter(...), [jobs]);
const value = useMemo(() => ({ jobs, pendingJobs, ... }), [jobs, pendingJobs, ...]);
```
**Impacto**: 9+ componentes consumidores param de re-renderizar em cada mudança de job.

### PERF-3: Extrair inline arrow functions do Dashboard props (20 min)
**Arquivo**: `src/App.tsx`, linhas 2533-2678
10+ funções inline passadas como props criam novas referências a cada render:
```javascript
// ANTES
onEditProfile={() => setIsEditingProfile(true)}
onResetCampaign={() => { setCampaign(null); ... }}
onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}

// DEPOIS — useCallback para cada uma
const handleEditProfile = useCallback(() => setIsEditingProfile(true), []);
const handleResetCampaign = useCallback(() => { setCampaign(null); ... }, []);
```

### PERF-4: Memoizar `instagramContext` (2 min)
**Arquivo**: `src/App.tsx`, linhas 405-415
```javascript
// ANTES — função chamada no JSX, cria objeto novo a cada render
instagramContext={getInstagramContext()}

// DEPOIS
const instagramContext = useMemo(() => { ... }, [instagramAccounts, userId, organizationId]);
```

### PERF-5: Converter sync effects para useMemo (5 min)
**Arquivo**: `src/App.tsx`, linhas 506-524
```javascript
// ANTES — useEffect + setState = render extra
useEffect(() => {
  if (swrTournamentEvents?.length > 0) setTournamentEvents(swrTournamentEvents.map(...));
}, [swrTournamentEvents]);

// DEPOIS — derivado durante render, sem ciclo extra
const tournamentEvents = useMemo(() => (swrTournamentEvents || []).map(...), [swrTournamentEvents]);
```

### PERF-6: Adicionar `useShallow` nos consumers de Zustand (30 min)
**Arquivos**: `useImagePlayground.ts`, `useVideoPlayground.ts`, `ConfigPanel.tsx`, `PlaygroundView.tsx`
```javascript
// ANTES — subscribe em TODOS os 30+ campos do store
const { topics, activeTopicId } = useImagePlaygroundStore();

// DEPOIS — subscribe apenas nos campos usados
import { useShallow } from 'zustand/react/shallow';
const { topics, activeTopicId } = useImagePlaygroundStore(
  useShallow(s => ({ topics: s.topics, activeTopicId: s.activeTopicId }))
);
```

### PERF-7: Remover debug useEffects do ClipCard (2 min)
**Arquivo**: `src/components/tabs/clips/ClipCard.tsx`, linhas 260-275
Dois `useEffect` que apenas fazem `console.debug` a cada mudança de thumbnail. Remover.

### PERF-8: Guardar console.debug com import.meta.env.DEV (15 min)
**Arquivos**: App.tsx (58 chamadas), ClipCard.tsx (35 chamadas), useAppData.tsx, useBackgroundJobs.tsx
Logging de debug cria overhead de formatação de string em produção.

---

## PARTE 3: DECOMPOSIÇÃO DE ARQUIVOS GRANDES

### 3A. App.tsx (2,718 LOC → ~650 LOC)

**7 hooks a extrair:**

| Hook | Arquivo | LOC | Linhas removidas do App.tsx |
|------|---------|-----|---------------------------|
| `useBrandProfile` | `src/hooks/useBrandProfile.ts` | ~150 | ~200 |
| `useCampaignManager` | `src/hooks/useCampaignManager.ts` | ~280 | ~360 |
| `useGalleryManager` | `src/hooks/useGalleryManager.ts` | ~200 | ~235 |
| `useScheduledPostsManager` | `src/hooks/useScheduledPostsManager.ts` | ~240 | ~280 |
| `useTournamentManager` | `src/hooks/useTournamentManager.ts` | ~350 | ~420 |
| `useAssistantChat` | `src/hooks/useAssistantChat.ts` | ~280 | ~320 |
| `useToolEditApproval` | `src/hooks/useToolEditApproval.ts` | ~120 | ~135 |

**Ordem de migração (por dependência):**
1. Utilities (funções puras) + useToolEditApproval
2. useBrandProfile + useGalleryManager
3. useScheduledPostsManager + useTournamentManager
4. useAssistantChat
5. useCampaignManager
6. Stores Zustand (navigationStore, brandProfileStore)

**Riscos:**
- ALTO: Refs compartilhados entre useAssistantChat ↔ useGalleryManager (`toolImageReference`)
- MÉDIO: SWR cache mutation coupling (cada hook precisa dos mutators SWR)
- BAIXO: Dashboard ainda recebe 90+ props (requer refactor secundário)

### 3B. ClipCard.tsx (5,519 LOC → ~250 LOC)

**7 hooks a extrair:**

| Hook | Arquivo | LOC |
|------|---------|-----|
| `useSceneManager` | `src/hooks/clips/useSceneManager.ts` | ~350 |
| `useVideoGeneration` | `src/hooks/clips/useVideoGeneration.ts` | ~450 |
| `useImageGeneration` | `src/hooks/clips/useImageGeneration.ts` | ~280 |
| `useAudioGeneration` | `src/hooks/clips/useAudioGeneration.ts` | ~120 |
| `useVideoExport` | `src/hooks/clips/useVideoExport.ts` | ~220 |
| `useVideoEditor` | `src/hooks/clips/useVideoEditor.ts` | ~1,200 |
| `useFavorites` | `src/hooks/clips/useFavorites.ts` | ~40 |

**13 componentes a extrair:**

| Componente | Caminho |
|------------|---------|
| `ClipCardHeader` | `clips/ClipCardHeader.tsx` |
| `ClipPreviewCarousel` | `clips/ClipPreviewCarousel.tsx` |
| `SceneCarousel` | `clips/SceneCarousel.tsx` |
| `SceneCard` | `clips/SceneCard.tsx` |
| `VideoEditor` | `clips/editor/VideoEditor.tsx` |
| `EditorPreview` | `clips/editor/EditorPreview.tsx` |
| `EditorTimeline` | `clips/editor/EditorTimeline.tsx` |
| `TimelineClipStrip` | `clips/editor/TimelineClipStrip.tsx` |
| `TimelineAudioStrip` | `clips/editor/TimelineAudioStrip.tsx` |
| `TransportControls` | `clips/editor/TransportControls.tsx` |
| `PromptPreviewModal` | `clips/modals/PromptPreviewModal.tsx` |
| `AddClipModal` | `clips/modals/AddClipModal.tsx` |
| `TransitionPickerModal` | `clips/modals/TransitionPickerModal.tsx` |

**Ordem:** Modals (zero risco) → Hooks isolados → Hooks com dependências → Editor → Componentes visuais

**Risco ALTO:** `useVideoEditor` tem 8+ refs, rAF loop, mouse listeners no `window`, e sincronização de playback complexa.

### 3C. apiClient.ts (1,793 LOC → deletar)

Já existe estrutura modular em `src/services/api/`. A migração é:

1. **Mover CSRF para `client.ts`** (bloqueia tudo — singleton state não pode ser duplicado)
2. **Adicionar funções faltantes** (`getDailyFlyers`, `retryScheduledPost`, `getCarousels`)
3. **Consolidar 4 implementações de `fetchWithAuth`** em uma só
4. **Migrar consumers** (14 funções em App.tsx, 7 em useAppData, etc.)
5. **Deletar apiClient.ts**

**Risco ALTO:** CSRF token é `let` module-level. Se `apiClient.ts` e `client.ts` ambos definirem, ficam com tokens diferentes → 403 errors.

---

## PARTE 4: STATE MANAGEMENT

### Dead Code — 4 stores sem nenhum consumer
| Store | LOC | Status |
|-------|-----|--------|
| `galleryStore.ts` | 57 | **Nunca importado** — gallery usa SWR |
| `clipsStore.ts` | 70 | **Nunca importado** |
| `carouselStore.ts` | 52 | **Nunca importado** |
| `imagePreviewStore.ts` | 25 | **Nunca importado** |

**Ação:** Deletar os 4 arquivos (204 LOC removidos, zero risco).

### Duplicação: BackgroundJobs — Context vs Zustand
`useBackgroundJobs.tsx` (Context, 366 LOC) e `jobsStore.ts` (Zustand, 373 LOC) implementam a mesma coisa em paralelo. O Context é o usado (9+ consumers). O Zustand store está dormant.

**Ação:** Completar migração para Zustand ou deletar o store.

### Duplicação: Playground Topics/Batches em SWR + Zustand
Image/Video Playground usam "SWR fetch → onSuccess → sync to Zustand". Dados vivem em dois lugares. Se SWR revalida, pode sobrescrever mudanças locais no Zustand.

### Stores saudáveis
- `uiStore.ts` — Bem estruturado, selectors corretos
- `feedbackStore.ts` — Minimal e focado
- `imagePlaygroundStore.ts` — Grande (866 LOC) mas bem organizado com persistence sofisticada
- `videoPlaygroundStore.ts` — Espelho saudável do image playground

### Issues em stores ativos
- `flyerStore.ts`: 2 bugs (listados em PARTE 1), base64 em state, weekStats manual
- `jobsStore.ts`: Sets mutáveis no state Zustand, selectors não memoizados
- `imagePlaygroundStore.ts`: 5 mode booleans mutuamente exclusivos deviam ser union type, `setActiveTopicId`/`switchTopic` duplicados

---

## PARTE 5: BUNDLE SIZE

### Build atual: 15 MB total, 335 chunks

| Issue | Impacto | Saving Estimado |
|-------|---------|----------------|
| Main chunk 1,133 KB (inclui agentation) | CRÍTICO | 30-60 KB gzipped |
| 299 Shiki grammar chunks precached pelo SW | CRÍTICO | ~8.5 MB precache |
| `@openrouter/*` deps mortos no package.json | MÉDIO | 5.3 MB node_modules |
| `xlsx` 572 KB chunk (já lazy) | BAIXO | Potencial 400 KB |
| 6 pesos de font Google (poderia ser 4) | BAIXO | ~20 KB |
| `chunkSizeWarningLimit: 3000` esconde warnings | BAIXO | Preventivo |
| Barrel `ai-prompts/index.ts` com `export *` | BAIXO | 5-15 KB |

### Bem feito (já otimizado)
- Lazy loading via `React.lazy()` para todas as tabs/páginas
- Dynamic imports para `xlsx`, `tesseract.js`, `shiki`, `ffmpeg`, `jszip`
- `esbuild.drop` remove console.log/debug em produção
- Dados iniciais unificados em `/api/db/init` (sem waterfalls)
- Stable empty references no SWR (`EMPTY_GALLERY`, etc.)

---

## PARTE 6: BACKEND

### Padrões que precisam de fix

| Issue | Severidade | Quick Win? |
|-------|-----------|------------|
| `error.message` exposto em ~50 endpoints | CRÍTICO | Sim — replace com `sanitizeErrorForClient()` |
| Sem transações no DB (nenhum BEGIN/COMMIT) | CRÍTICO | Não — requer refactor com Pool mode |
| `asyncHandler` definido mas nunca usado | ALTO | Sim — wrap route handlers |
| 3 estratégias de error handling diferentes | ALTO | Médio — padronizar com asyncHandler |
| `.catch(() => {})` em 21 chamadas de logging | ALTO | Sim — trocar por `.catch(err => logger.warn(...))` |
| GoogleGenAI instanciado a cada chamada | ALTO | Sim — cache singleton em clients.mjs |
| 2 playgrounds criam `new GoogleGenAI()` diretamente | MÉDIO | Sim — importar `getGeminiAi()` |
| Query SQL duplicada 4x em db-campaigns.mjs | MÉDIO | Médio — parametrizar query |
| Query SQL duplicada 8x em db-gallery.mjs | MÉDIO | Médio — parametrizar query |
| Org/personal branching duplicado em 8+ rotas | MÉDIO | Médio — criar helper |
| Dead code em PATCH /api/db/carousels | BAIXO | Sim — deletar linhas 725-738 |
| console.log em ai-text.mjs | BAIXO | Sim — trocar por logger.info |
| Token estimation por char/4 | BAIXO | Sim — usar tiktoken |
| `isQuotaOrRateLimitError` broad demais | BAIXO | Sim — match frase exata |

---

## PARTE 7: PLANO DE AÇÃO PRIORIZADO

### Sprint 1: Quick Wins (1-2 dias)

**Segurança:**
- [ ] Substituir `error.message` por `sanitizeErrorForClient()` em ~50 endpoints
- [ ] Escapar LIKE wildcards no agent-studio e tool-registry
- [ ] Cache singleton GoogleGenAI em clients.mjs

**Performance:**
- [ ] `useMemo` nas 3 transformações de dados em App.tsx (PERF-1)
- [ ] `useMemo` no context value do BackgroundJobsProvider (PERF-2)
- [ ] `useMemo` no instagramContext (PERF-4)
- [ ] Converter sync effects para useMemo (PERF-5)

**Bugs:**
- [ ] Fix `selectEnabledPeriodTournaments` tautologia no flyerStore
- [ ] Fix `toggleStyleFavorite` que nunca adiciona
- [ ] Fix `useCreateVideo` sessão duplicada

**Cleanup:**
- [ ] Deletar 4 stores não usados (gallery, clips, carousel, imagePreview)
- [ ] Remover `@openrouter/*` do package.json
- [ ] Deletar dead code em PATCH /api/db/carousels

### Sprint 2: Performance & Bundle (2-3 dias)

- [ ] Extrair inline callbacks do Dashboard props para useCallback (PERF-3)
- [ ] Adicionar `useShallow` nos consumers de Zustand (PERF-6)
- [ ] Lazy-load `ClientFeedback`/agentation
- [ ] Excluir Shiki grammars do SW precache
- [ ] Trocar `.catch(() => {})` por `.catch(err => logger.warn(...))`
- [ ] Wrap route handlers com `asyncHandler`

### Sprint 3: apiClient.ts Migration (2-3 dias)

- [ ] Mover CSRF para client.ts (re-exports em apiClient.ts)
- [ ] Adicionar funções faltantes aos módulos
- [ ] Consolidar 4 `fetchWithAuth` implementations
- [ ] Migrar consumers (1 PR por batch de 3-4 arquivos)
- [ ] Deletar apiClient.ts

### Sprint 4: App.tsx Decomposition (3-5 dias)

- [ ] Extrair utilities (funções puras)
- [ ] Extrair useBrandProfile + useGalleryManager
- [ ] Extrair useScheduledPostsManager + useTournamentManager
- [ ] Extrair useAssistantChat + useToolEditApproval
- [ ] Extrair useCampaignManager
- [ ] Resultado: App.tsx de 2.7K → ~650 LOC

### Sprint 5: ClipCard.tsx Decomposition (5-7 dias)

- [ ] Fase 1: Extrair 3 modals (zero risco)
- [ ] Fase 2: Extrair hooks isolados (audio, favorites, export)
- [ ] Fase 3: Extrair useSceneManager (core data hook)
- [ ] Fase 4: Extrair useImageGeneration + useVideoGeneration
- [ ] Fase 5: Extrair useVideoEditor + componentes do editor
- [ ] Fase 6: Extrair componentes visuais (SceneCard, Preview, etc.)
- [ ] Resultado: ClipCard.tsx de 5.5K → ~250 LOC

### Sprint 6: Backend Robustness (3-5 dias)

- [ ] Introduzir Pool mode do Neon para transações
- [ ] Wrapping das operações multi-step em `withTransaction()`
- [ ] Parametrizar queries duplicadas em campaigns/gallery
- [ ] Criar helper para org/personal context branching
- [ ] Completar migração BackgroundJobs → Zustand

---

## Métricas de Sucesso

| Métrica | Antes | Depois (estimado) |
|---------|-------|-------------------|
| App.tsx LOC | 2,718 | ~650 |
| ClipCard.tsx LOC | 5,519 | ~250 |
| apiClient.ts LOC | 1,793 | 0 (deletado) |
| Dead code stores | 4 (204 LOC) | 0 |
| Endpoints com error.message exposto | ~50 | 0 |
| Transações no DB | 0 | Todas as multi-step ops |
| SW precache size | ~15 MB | ~6 MB |
| Main chunk size | 1,133 KB | ~1,000 KB |
| Bugs conhecidos corrigidos | 0 | 3 |
