# Fase 5 Wave 4 Backlog Design

## Objetivo

Entregar os itens BACK-01 a BACK-10 no branch `producao` com foco em endurecimento de backend, redução de duplicação, compressão de imagem, ajustes de cache no frontend, lazy loading e acessibilidade básica, preservando o comportamento funcional atual.

## Abordagem Recomendada

Aplicar mudanças incrementais com compatibilidade:

- Backend primeiro, porque já existe implementação parcial para parte dos itens e o risco é baixo quando guiado por testes.
- `Icon` mantém a API atual (`name`, `size`, `className`) e troca a renderização para `lucide-react` com aliases legados, evitando refactor amplo de chamada nesta wave.
- Lazy loading deve respeitar a arquitetura vigente do app. Se a responsabilidade já tiver migrado de `main-app-controller.tsx` para `Router.tsx` ou controladores, a solução deve ser aplicada no ponto real de carregamento.
- Acessibilidade será corrigida nos hotspots concretos do projeto: botões só com ícone, modais/dialogs e imagens sem `alt`.

## Decisões

### Backend

- Validar headers do Helmet na fábrica do app.
- Padronizar rate limit com `createRateLimitMiddleware`, usando `orgId > userId > IP` quando houver auth e IP em rotas públicas.
- Expandir logging admin com structured logs para ações bem-sucedidas e tentativas negadas.
- Reforçar `proxy-video` com validação de posse do blob pela organização ou usuário autenticado.
- Reescrever `listGallery()` para uma única query parametrizada, mantendo exatamente o mesmo formato de retorno.

### Upload e compressão

- Reusar `sharp` em `upload-service.ts`.
- Não comprimir imagens abaixo de `200KB`.
- Preferir WebP quando o resultado for menor.
- Para JPEG, aplicar `quality: 85`.
- Rotas `ai-image` e `upload` devem consumir o mesmo fluxo centralizado para evitar divergência.

### Frontend

- Reduzir `dedupingInterval` de `useAppData` para `60s` e alinhar outras ocorrências equivalentes.
- Lazy loading com `React.lazy`/`Suspense` no ponto de entrada efetivo das views pesadas.
- Adicionar fallbacks por view com skeleton simples e consistente.
- Corrigir acessibilidade básica sem reestruturar toda a UI.
- Migrar `Icon.tsx` para `lucide-react` com mapa compatível para nomes usados no código atual.

## Riscos

- O worktree já contém alterações locais em arquivos do app principal, então qualquer mudança em arquivos sujos deve ser feita preservando o diff existente.
- A migração de `Icon` pode revelar nomes legados inexistentes no Lucide; nesses casos será necessário mapear aliases explícitos.
- O item de lazy loading pode já estar parcialmente resolvido fora de `main-app-controller.tsx`, exigindo adaptação à arquitetura atual em vez de seguir o arquivo citado literalmente.

## Testes

- TDD por grupo lógico com falha observada antes da implementação.
- Backend: testes unitários para headers, rate limit, logging e validação de blob/compressão/query.
- Frontend: testes unitários/RTL para `Icon`, SWR config e fallback/lazy onde houver viabilidade.
- Fechamento obrigatório com `npx tsc --noEmit` e `npx vitest run`.
