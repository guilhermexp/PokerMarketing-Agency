# PROJECT

## Visão do produto

Socialab é um toolkit de growth com IA para agências de marketing de poker. O objetivo é transformar insumos brutos, como transcrições, vídeos, imagens e grades de torneios, em campanhas completas com peças prontas para publicação.

Principais fluxos do produto:
- geração de campanhas com clipes, posts, ads e carrosséis;
- geração de flyers de torneios a partir de planilhas `.xlsx`;
- edição de imagem com máscara, prompt e referências;
- galeria de mídia para reutilização e publicação;
- assistente de IA contextualizado com acesso às entidades do app;
- painel admin para uso, organizações, usuários e logs.

## Stack

- Frontend: React 19, TypeScript, Vite 7, Tailwind CSS 4
- Backend: Express 5 em Node.js (`server/index.mjs` + módulos em `server/lib`, `server/routes`, `server/helpers`)
- Banco: Neon Postgres (`@neondatabase/serverless`)
- Auth: Better Auth com organizações
- Estado cliente: Zustand
- Server state/cache: SWR
- Storage: Vercel Blob
- Filas: Redis + BullMQ para posts agendados
- IA:
  - Google Gemini (`@google/genai`) para geração síncrona
  - Vercel AI SDK (`ai`, `@ai-sdk/google`) para chat streaming
  - Replicate e FAL como fallback/controladores de mídia
  - Claude Agent SDK no Studio Agent

## Decisões principais de arquitetura

1. Frontend e backend vivem no mesmo repositório, mas o servidor é modularizado em rotas e libs, com `server/index.mjs` apenas orquestrando boot, middlewares e workers.
2. O fetch inicial do app é consolidado em `/api/db/init` para reduzir round-trips e latência na dashboard.
3. Imagens nunca devem permanecer em base64 no banco; o contrato é subir para Vercel Blob e persistir apenas URLs HTTPS.
4. Geração de imagem é síncrona por padrão; jobs assíncronos ficaram restritos ao que ainda depende de fila operacional, como posts agendados.
5. A cadeia de fallback de provedores de imagem é controlada por `IMAGE_PROVIDERS`; flyers forçam modelos Pro quando necessário.
6. O Studio Agent usa SSE + Claude Agent SDK e só acessa ferramentas `studio_*`, sem permissões de filesystem/shell nativas.
7. O admin fica em `/admin` e depende de `SUPER_ADMIN_EMAILS`; o auth no backend resolve o usuário de sessão para UUID interno antes de operar no banco.
8. CSRF usa double-submit cookie para todas as operações mutáveis da API.

## Estrutura de referência

- `src/App.tsx`: orquestrador principal do frontend
- `src/components/dashboard/Dashboard.tsx`: shell principal da experiência autenticada
- `src/hooks/useAppData.tsx`: carga e sincronização dos dados iniciais
- `src/services/apiClient.ts`: cliente principal da API do frontend
- `server/index.mjs`: boot do servidor
- `server/app.mjs`: composição do app Express
- `server/lib/ai/`: núcleo de integração com modelos/provedores
- `server/routes/`: superfície HTTP da aplicação
- `server/lib/agent/claude/`: Studio Agent

## Links úteis

- `README.md`
- `CLAUDE.md`
- `docs/DOCUMENTATION.md`
- `docs/MODEL_DOCUMENTATION.md`
- `docs/ARCHITECTURE-REVIEW-2026-02-11.md`
- `DOCS-IMAGE-GENERATION/README.md`
