# 04. Dependências e Infraestrutura

> **Lista completa de pacotes e setup de infraestrutura**

---

## NPM Dependencies

### Produção

```json
{
  "dependencies": {
    "@ai-sdk/google": "^3.0.9",
    "@ai-sdk/react": "^3.0.39",
    "@clerk/backend": "^2.29.0",
    "@clerk/clerk-react": "^5.59.2",
    "@clerk/express": "^1.7.60",
    "@google/genai": "^1.17.0",
    "@lobehub/ui": "^4.21.0",
    "@neondatabase/serverless": "^1.0.2",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@vercel/blob": "^2.0.0",
    "ai": "^6.0.37",
    "antd": "^6.2.0",
    "bullmq": "^5.66.4",
    "framer-motion": "^12.24.10",
    "ioredis": "^5.8.2",
    "jszip": "^3.10.1",
    "lucide-react": "^0.562.0",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "react-image-crop": "^11.0.10",
    "react-router-dom": "^7.11.0",
    "swr": "^2.3.8",
    "tesseract.js": "^7.0.0",
    "xlsx": "0.18.5",
    "zod": "^4.3.5",
    "zustand": "^5.0.10"
  }
}
```

### Desenvolvimento

```json
{
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.18",
    "@testing-library/react": "^16.3.1",
    "@types/node": "^25.0.3",
    "@types/react": "^19.2.8",
    "@typescript-eslint/eslint-plugin": "^8.53.0",
    "@vitejs/plugin-react": "^5.0.0",
    "concurrently": "^9.2.1",
    "express": "^5.2.1",
    "tailwindcss": "^4.1.18",
    "typescript": "^5.9.3",
    "vite": "^7.3.0",
    "vitest": "^4.0.17"
  }
}
```

---

## Infraestrutura Necessária

### 1. Banco de Dados: Neon PostgreSQL

**Setup**:
```bash
# Criar conta em https://neon.tech
# Criar novo projeto
# Copiar connection string
```

**Variável de ambiente**:
```env
DATABASE_URL=postgresql://user:pass@ep-name.region.aws.neon.tech/dbname?sslmode=require
```

**Configuração**:
```typescript
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
```

### 2. Storage: Vercel Blob

**Setup**:
```bash
# Ativar Vercel Blob no dashboard
# Gerar token
```

**Variáveis**:
```env
BLOB_READ_WRITE_TOKEN=vercel_blob_...
```

### 3. Queue: Redis + BullMQ

**Setup local (Docker)**:
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Ou Upstash Redis (serverless)**:
```env
REDIS_URL=redis://default:password@host:port
```

**Configuração BullMQ**:
```typescript
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL);
const queue = new Queue('generation-queue', { connection });
```

### 4. IA: Google Generative AI

**Setup**:
```bash
# Criar projeto no Google Cloud
# Ativar Generative AI API
# Gerar API key
```

**Variável**:
```env
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

### 5. Auth: Clerk

**Setup**:
```bash
# Criar conta em https://clerk.com
# Criar aplicação
# Copiar chaves
```

**Variáveis**:
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

---

## Variáveis de Ambiente Completas

```env
# Database
DATABASE_URL=postgresql://...

# Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Queue
REDIS_URL=redis://...

# AI
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# Auth
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Instagram (opcional)
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_BUSINESS_ACCOUNT_ID=...

# Environment
NODE_ENV=development
PORT=3000
```

---

## Instalação

```bash
# Instalar dependências
npm install

# Ou com bun (recomendado)
bun install
```

---

## Scripts

```json
{
  "scripts": {
    "dev": "concurrently -n api,vite \"bun run dev:api\" \"vite\"",
    "dev:api": "node server/dev-api.mjs",
    "dev:vite": "vite",
    "build": "vite build",
    "start": "node server/index.mjs",
    "typecheck": "tsc --noEmit"
  }
}
```

---

**Última atualização**: 2026-01-18
