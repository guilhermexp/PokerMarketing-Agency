# Drizzle ORM Spike

## Contexto

O backend atual usa `@neondatabase/serverless` com SQL tagged templates diretos. A Fase 3 pediu uma avaliação de Drizzle ORM contra o uso atual e, se a recomendação fosse positiva, uma PoC das 5 tabelas mais usadas.

## Tabelas mais frequentes no código

Ranking levantado em `server/routes` + `server/services`:

1. `gallery_images`
2. `video_clip_scripts`
3. `campaigns`
4. `carousel_scripts`
5. `scheduled_posts`

Observação:
- `api_usage_logs` também aparece bastante, mas o uso é mais analítico e menos apropriado para uma PoC incremental.

## Prós do Drizzle neste projeto

- schema-as-code com inferência forte de tipos para leitura e escrita;
- alinhamento com o padrão preferido do workspace para backend TypeScript + Postgres;
- melhor discoverability de tabelas/campos do que queries soltas espalhadas;
- caminho mais sólido para migrations controladas no futuro;
- redução de erros de shape entre banco, serviços e contratos Zod.

## Contras no estado atual

- a aplicação já está profundamente acoplada a SQL cru em rotas e serviços;
- várias queries importantes são analíticas ou usam subqueries/joins/cascatas que continuariam em SQL puro mesmo com Drizzle;
- hoje não existe infraestrutura Drizzle no repo (`schema.ts`, `drizzle.config`, workflow de migrations, client wrapper);
- introduzir Drizzle agora criaria um modo híbrido adicional no mesmo momento em que o backend acabou de estabilizar contratos, testes e migração para TypeScript;
- a maior parte do ganho imediato desta fase veio de contratos, cobertura e docs, não do layer de persistência.

## Estimativa de esforço

### Setup inicial
- `0.5` a `1` dia para instalar, configurar `drizzle.config`, client, pastas e convenções.

### Mapeamento das 5 tabelas
- `2` a `4` dias para definir schemas, relações, tipos e validar compatibilidade com Neon serverless.

### Migração real de serviços
- `3` a `5` dias para substituir queries simples, manter queries complexas em SQL cru e cobrir regressão.

### Hardening
- `1` a `2` dias para revisar testes, docs, rollout e fallback.

### Total
- `~1` a `2` semanas úteis para uma adoção segura, ainda em modo híbrido.

## Recomendação

### Decisão
- **Negativa para esta fase.**

### Motivo
- O custo de introduzir outro eixo estrutural agora é alto demais comparado ao benefício imediato.
- As rotas mais críticas ainda dependem de queries complexas que não teriam ganho relevante com uma PoC parcial.
- O backend acabou de fechar a migração para TypeScript; a próxima melhor alavanca é consolidar qualidade e remover dívidas restantes, não abrir uma nova frente de abstração de dados.

## O que precisa acontecer antes de retomar

- finalizar a remoção dos `@ts-nocheck` remanescentes do server;
- estabilizar a cobertura e os contratos das rotas críticas;
- definir um boundary claro de acesso a dados por domínio;
- reservar uma janela dedicada para coexistência controlada de SQL cru + Drizzle.

## Estratégia sugerida para retomada futura

Se a adoção for retomada em uma fase dedicada:

1. adicionar infra mínima de Drizzle sem migrar rotas;
2. mapear `gallery_images`, `campaigns`, `video_clip_scripts`, `carousel_scripts` e `scheduled_posts`;
3. migrar primeiro queries CRUD simples;
4. manter queries analíticas e agregadas em SQL cru via `sql```;
5. só depois consolidar migrations e client único.
