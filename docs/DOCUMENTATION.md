# Documentação Técnica

## Arquitetura atual

DirectorAi roda como SPA em Vite/React com backend Express separado, ambos em TypeScript.

### Frontend

- React 19
- React Router 7
- Tailwind CSS 4
- SWR para server state
- Zustand para estado client-only
- PWA com `vite-plugin-pwa`

### Backend

- Express 5
- Better Auth
- PostgreSQL (Neon)
- Vercel Blob
- BullMQ + Redis

## Entrypoints

- `src/main-app-controller.tsx`: orquestração principal do app
- `src/components/dashboard/Dashboard.tsx`: shell do dashboard
- `server/app.ts`: factory do app Express
- `server/dev-api.ts`: entry de desenvolvimento
- `server/index.ts`: entry de produção

## Organização de dados

- `src/hooks/useAppData.tsx`: leitura e mutações otimistas sobre o cache SWR
- `src/stores/`: estado local/transitório
- `src/services/apiClient.ts`: barrel compatível para os módulos em `src/services/api-client/`

## Regras de estado

- Server state: `brandProfile`, `gallery`, `scheduledPosts`, `campaigns`, `tournamentData`
- Client-only state: UI, seleção local, editor state, jobs locais, feedback transitório

## IA e mídia

- Geração de campanhas, imagem, flyer, vídeo e speech passam pelo backend
- Assets persistidos vão para Vercel Blob; o banco guarda metadados e vínculos

## Ambiente

Variáveis essenciais:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `CSRF_SECRET`
- `GEMINI_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `REDIS_URL` quando jobs assíncronos estiverem ativos

## Referências

- [README.md](../README.md)
- [DEVELOPMENT.md](./DEVELOPMENT.md)
- [CAMPAIGN_SYSTEM.md](./CAMPAIGN_SYSTEM.md)
