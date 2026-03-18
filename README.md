# DirectorAi: Poker Marketing Agency

DirectorAi é uma SPA para operação de marketing com IA focada em campanhas, clips, flyers, galeria e assistente criativo.

## Stack atual

- Frontend: Vite 7, React 19, React Router 7, TypeScript, Tailwind CSS 4, PWA via `vite-plugin-pwa`
- Backend: Express 5 em TypeScript (`server/app.ts`, `server/dev-api.ts`, `server/index.ts`)
- Auth: Better Auth com organizações
- Banco: PostgreSQL (Neon Serverless)
- Storage: Vercel Blob
- Jobs: BullMQ + Redis
- Estado: SWR para server state, Zustand para estado client-only

## Principais fluxos

- Geração de campanhas multiasset a partir de transcript e brand profile
- Geração de flyers de torneios a partir de planilhas `.xlsx`
- Geração e edição de imagens com IA
- Geração de vídeo e narração
- Galeria, agendamento e publicação
- Assistente contextual com ações sobre assets do projeto

## Estrutura

```text
src/
  components/
  hooks/
  services/
  stores/
  main-app-controller.tsx
server/
  app.ts
  dev-api.ts
  index.ts
db/
docs/
```

## Desenvolvimento

```bash
npm install
npm run dev
```

Com Redis local:

```bash
npm run dev:local
```

Checks principais:

```bash
npm run typecheck
npm run test
```

## Ambiente

Variáveis importantes:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `CSRF_SECRET`
- `GEMINI_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `REDIS_URL` (opcional, mas necessário para jobs)

## Documentação

- [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [docs/CAMPAIGN_SYSTEM.md](docs/CAMPAIGN_SYSTEM.md)
