# Otimização do App Init - Relatório

**Data:** 2026-01-25
**Objetivo:** Reduzir tempo de login/autenticação percebido pelo usuário
**Status:** Implementado

---

## Problema Identificado

O login estava muito lento devido a múltiplos fetches desnecessários durante a inicialização:

1. **Double-fetch para usuários em organizações**: O `useInitialData` era chamado imediatamente com `organizationId = null`, buscando dados "pessoais". Quando o Clerk carregava a organização, `organizationId` mudava e disparava um novo fetch, descartando os dados anteriores.

2. **Payload excessivo na gallery**: O endpoint `/api/db/init` retornava 100 imagens da galeria, quando o frontend já suporta paginação via `loadMore()`.

---

## Alterações Implementadas

### 1. Gate do useInitialData pelo orgLoaded

**Arquivo:** `src/App.tsx` (linha ~293)

**Antes:**
```javascript
const { data: initialData, isLoading: isInitialLoading } = useInitialData(
  initialDataUserId,
  organizationId,
  clerkUserId,
);
```

**Depois:**
```javascript
// PERF: Only fetch after orgLoaded to avoid double-fetch when user is in an organization
// Without this gate, we fetch with organizationId=null first, then refetch when org loads
const { data: initialData, isLoading: isInitialLoading } = useInitialData(
  orgLoaded ? initialDataUserId : null, // Gate by orgLoaded to prevent premature fetch
  organizationId,
  clerkUserId,
);
```

**Impacto:**
- Elimina 1 request desnecessário para usuários em organizações
- Reduz latência percebida em ~500ms-2s (dependendo do tempo do Clerk)
- Não afeta usuários sem organização (personal accounts)

---

### 2. Redução do LIMIT da Gallery

**Arquivos:**
- `server/index.mjs` (linha ~1018)
- `server/dev-api.mjs` (linha ~999)

**Antes:**
```sql
-- LIMIT 100
SELECT ... FROM gallery_images WHERE ... ORDER BY created_at DESC LIMIT 100
```

**Depois:**
```sql
-- LIMIT 25
SELECT ... FROM gallery_images WHERE ... ORDER BY created_at DESC LIMIT 25
```

**Impacto:**
- Reduz payload de ~75% (100 → 25 registros)
- Reduz tempo de serialização/parsing JSON
- Paginação via `loadMore()` já existe e funciona normalmente
- Usuários verão 25 imagens iniciais, podendo carregar mais sob demanda

---

### 3. Atualização da Documentação

**Arquivo:** `src/hooks/useAppData.tsx` (comentário no topo)

Atualizado para refletir:
- Gallery: 25 images (era 100, documentado como 20)
- Adicionado item 7: Gate pelo orgLoaded

---

## Análise de Segurança

| Item | Afeta Dados Existentes? | Risco |
|------|-------------------------|-------|
| Gate orgLoaded | Não | Nenhum - apenas atrasa fetch até contexto estar pronto |
| Redução LIMIT | Não | Nenhum - paginação já implementada |

### Verificações:
- ✅ Brand profiles: Não afetados (carregados normalmente)
- ✅ Organizations: Não afetadas (apenas ordem de carregamento muda)
- ✅ Users: Não afetados
- ✅ Gallery: Funciona igual, apenas menos itens iniciais

---

## Otimizações NÃO Implementadas (e porquê)

### 1. Manter userId estável (clerkUserId vs dbUser.id)
**Motivo:** Risco de cache invalidation incorreto. O cache SWR é indexado por userId, e mudar a lógica poderia causar dados stale em alguns cenários de troca de contexto.

### 2. Skeleton em vez de Loader na troca de contexto
**Motivo:** Risco de mostrar dados da organização errada momentaneamente. Preferimos manter o loader durante `isContextChanging` para garantir consistência visual.

---

## ATUALIZAÇÃO: Causa Raiz Descoberta

**As otimizações acima ajudaram, mas o problema REAL era outro.**

### Descoberta

Após investigar mais, descobrimos que o banco de dados continha **172MB de imagens base64** armazenadas diretamente nas colunas:

| Tabela | Coluna | Data URLs | Tamanho |
|--------|--------|-----------|---------|
| `gallery_images` | `src_url` | 76 | 113MB |
| `scheduled_posts` | `image_url` | 18 | 26MB |
| `brand_profiles` | `logo_url` | 3 | 6MB |
| `week_schedules` | `daily_flyer_urls` | 22 | 27MB |
| **TOTAL** | | **119** | **172MB** |

### Solução Real

1. **Migração para Vercel Blob**: Todas as 119 imagens foram migradas
2. **Queries protegidas**: CASE statements para não retornar data URLs
3. **Scripts criados**: Para diagnóstico e migração futura

**Documentação completa:** [MIGRATION_DATA_URLS_TO_BLOB_2026-01-25.md](./MIGRATION_DATA_URLS_TO_BLOB_2026-01-25.md)

---

## Métricas REAIS (Após Migração)

| Métrica | Antes | Depois |
|---------|-------|--------|
| Requests no login (org user) | 2 | 1 |
| Payload `/api/db/init` | **10-26MB** | **~50KB** |
| Tempo de carregamento | **10-15s** | **2-3s** |
| Network transfer/mês | 85GB+ | <1GB |

---

## Como Testar

1. **Usuário com organização:**
   - Fazer logout
   - Fazer login
   - Verificar no Network tab que só há 1 request para `/api/db/init`

2. **Usuário sem organização:**
   - Fazer logout
   - Fazer login
   - Comportamento deve ser idêntico ao anterior

3. **Gallery:**
   - Verificar que gallery carrega com ~25 imagens
   - Scroll down deve carregar mais via paginação

---

## Rollback

Se necessário reverter:

```bash
# App.tsx - remover gate orgLoaded
git checkout HEAD~1 -- src/App.tsx

# Server - voltar LIMIT 100
git checkout HEAD~1 -- server/index.mjs server/dev-api.mjs
```

---

## Próximos Passos (Futuro)

1. ~~**Adicionar métricas de tempo** no endpoint `/api/db/init`~~ ✅ Implementado (`queryTimings` no response)
2. ~~**Considerar cache Redis** para dados que mudam pouco~~ ✅ Implementado para `brandProfile` (5 min TTL)
3. **Lazy load de scheduled_posts** similar ao que já é feito com tournaments
4. **Monitorar data URLs**: Rodar `node scripts/check-all-data-urls.mjs` periodicamente
5. **Validação no backend**: Rejeitar data URLs em colunas de imagem
