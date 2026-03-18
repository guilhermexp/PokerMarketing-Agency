# STATE

## Estado atual

- Aplicação web full-stack em produção para operação de marketing com IA focada em poker.
- Frontend em React/Vite e backend Express já integrados no mesmo repo.
- TypeScript com `strict: true`.
- ESLint configurado com `no-explicit-any: error`.
- CI criada em GitHub Actions para typecheck, testes e lint.
- Validação de env obrigatória adicionada no boot do servidor.

## Features implementadas

- geração de campanhas a partir de transcrição com múltiplos formatos de saída;
- geração e edição de carrosséis;
- geração de posts sociais e ad creatives;
- geração de flyers de torneio e flyers diários por período;
- galeria de imagens com reuso e edição;
- scheduler/publicação de posts;
- integração com Instagram via Rube;
- Image Playground;
- Video Playground;
- Studio Agent com SSE e ferramentas contextualizadas;
- admin panel com visão de usuários, organizações, logs e uso.

## Features pendentes ou incompletas

- lint ainda não está verde; há warnings históricos e alguns errors fora do escopo desta fase rápida;
- decomposição de `src/App.tsx`;
- decomposição de `src/components/tabs/clips/ClipCard.tsx`;
- fatiamento de `src/services/apiClient.ts` por domínio;
- revisão da cobertura de testes para fluxos críticos do frontend;
- limpeza de logs de debug e dependências de desenvolvimento legadas;
- fechamento de dívidas de hooks com `exhaustive-deps`.

## Tech debt conhecida

- arquivos centrais muito grandes e com responsabilidade excessiva;
- presença de regras de lint novas batendo em código antigo;
- rate limiting ainda em memória;
- alguns fluxos dependem de providers externos com contratos heterogêneos;
- coexistência de padrões antigos e novos no frontend;
- lockfile do Bun estava fora do versionamento e precisou ser incluído para CI reprodutível.

## Observações operacionais

- envs obrigatórias para boot: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CSRF_SECRET`, `GEMINI_API_KEY`;
- envs opcionais suportadas: `REDIS_URL`, `BLOB_READ_WRITE_TOKEN`, `REPLICATE_API_TOKEN`, `FAL_KEY`, `IMAGE_PROVIDERS`, `SUPER_ADMIN_EMAILS`;
- rota admin correta: `/admin`;
- uploads devem validar MIME type e persistir URL em Blob, nunca base64 no banco.
