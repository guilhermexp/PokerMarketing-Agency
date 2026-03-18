# Desenvolvimento Local

## Pré-requisitos

- Node.js 20+
- npm
- Docker opcional para Redis local
- PostgreSQL acessível via `DATABASE_URL`

## Comandos

```bash
npm install
npm run dev
```

Com Redis local:

```bash
npm run dev:local
```

Checks:

```bash
npm run typecheck
npm run test
```

## Entradas de runtime

- `server/dev-api.ts`: backend local em desenvolvimento
- `server/index.ts`: backend de produção
- `vite`: frontend local

## Variáveis mínimas

```bash
DATABASE_URL=
BETTER_AUTH_SECRET=
CSRF_SECRET=
GEMINI_API_KEY=
BLOB_READ_WRITE_TOKEN=
```

Opcional:

```bash
REDIS_URL=
FAL_KEY=
REPLICATE_API_TOKEN=
SUPER_ADMIN_EMAILS=
```

## Portas padrão

- Frontend Vite: `5173`
- API local: `3002`
- Redis local: conforme `docker-compose.yml`
