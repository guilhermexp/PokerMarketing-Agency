# Technology Stack

**Analysis Date:** 2026-01-26

## Languages

**Primary:**
- TypeScript 5.9.3 - All frontend and configuration files (`tsconfig.json`, `package.json`)
- JavaScript (ESM) - Server files use `.mjs` extension (`server/dev-api.mjs`, `server/index.mjs`)

**Secondary:**
- SQL - Database schema and migrations (`db/schema.sql`, `db/migrations/`)
- CSS - TailwindCSS utilities (`src/styles/main.css`)

## Runtime

**Environment:**
- Node.js 20 (Alpine) - Build stage in `Dockerfile`
- Bun 1 (Alpine) - Production server runtime in `Dockerfile` for faster execution
- Browser - React SPA targeting modern browsers

**Package Manager:**
- npm - Primary package manager with `package.json`
- Bun - Production runtime; uses `bun.lockb` lockfile
- Install requires `--legacy-peer-deps` for ai@6.x peer dependency resolution

## Frameworks

**Core Frontend:**
- React 19.1.1 - UI framework (`src/App.tsx`, `src/index.tsx`)
- React Router 7.11.0 - Client-side routing (`src/Router.tsx`)
- Vite 7.3.0 - Build tool and dev server (`vite.config.ts`)

**Core Backend:**
- Express 5.2.1 - REST API framework (`server/dev-api.mjs` ~6,900 lines)

**Testing:**
- Vitest 4.0.17 - Test framework (`vitest.config.ts`)
- Testing Library - React component testing (`@testing-library/react`)

**Build/Dev:**
- TypeScript 5.9.3 - Type checking and compilation
- TailwindCSS 4.1.18 - Utility-first CSS (`vite.config.ts` with `@tailwindcss/postcss`)
- PostCSS 8.5.6 - CSS processing
- ESLint 9.39.2 - Code linting (`eslint.config.mjs`)

## Key Dependencies

**AI & LLM Integration:**
- `@google/genai` v1.17.0 - Google Gemini API (primary) - `src/services/geminiService.ts`
- `ai` v6.0.39 - Vercel AI SDK - `package.json`
- `@ai-sdk/google`, `@ai-sdk/react`, `@ai-sdk/gateway` - AI SDK modules
- `@openrouter/sdk` v0.3.10 - Multi-model LLM fallback - `server/dev-api.mjs`
- `replicate` v1.0.1 - Image generation fallback - `server/dev-api.mjs`
- `@fal-ai/client` v1.8.0 - Video generation - `server/dev-api.mjs`

**Authentication:**
- `@clerk/clerk-react`, `@clerk/backend`, `@clerk/express` - Multi-tenant auth

**Database:**
- `@neondatabase/serverless` - Neon Serverless PostgreSQL
- `pg` v8.16.3 - PostgreSQL driver

**State Management:**
- `swr` v2.3.8 - Server state with caching (`src/hooks/useAppData.tsx`)
- `zustand` v5.0.10 - Client state stores (`src/stores/`)

**File Storage:**
- `@vercel/blob` v2.0.0 - Image storage (`src/services/blobService.ts`)

**Job Queue:**
- `bullmq` v5.66.4 - Redis-based job queue (`server/helpers/job-queue.mjs`)
- `ioredis` v5.8.2 - Redis client

**Media Processing:**
- `@ffmpeg/ffmpeg` v0.12.15 - Client-side video editing
- `tesseract.js` v7.0.0 - OCR text extraction (`src/services/ocrService.ts`)

**UI Components:**
- Radix UI - Accessible primitives (`@radix-ui/react-*`)
- Ant Design v6.2.0 - Component library
- Lucide React v0.562.0 - Icon library
- Framer Motion 12.29.0 - Animations

**Utilities:**
- `zod` v4.3.5 - Runtime type validation
- `nanoid` v5.1.6 - Unique ID generation
- `clsx` v2.1.1 + `tailwind-merge` v3.4.0 - CSS class merging

## Configuration

**Environment:**
- `.env` files for local development (git-ignored)
- `.env.example` template with all required variables
- Docker builds pass args via `ARG` and set `ENV` in `Dockerfile`

**Key Environment Variables:**
- AI: `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `REPLICATE_API_TOKEN`, `FAL_KEY`
- Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Storage: `BLOB_READ_WRITE_TOKEN`
- Database: `DATABASE_URL`
- Jobs: `REDIS_URL` (optional)

**Build Config:**
- `tsconfig.json` - ES2022 target, JSX React, path aliases (`@/*`)
- `vite.config.ts` - Port 3000, API proxy to localhost:3002, COEP headers, PWA
- `eslint.config.mjs` - Flat config with TypeScript rules

## Platform Requirements

**Development:**
- macOS/Linux/Windows (any platform with Node.js 20+)
- Redis (optional, for scheduled posts) - `docker-compose.yml` provides local Redis 7-alpine

**Production:**
- Docker multi-stage build (Node 20 for build, Bun 1 for runtime)
- Neon Serverless PostgreSQL
- Vercel Blob for image storage
- Optional: Redis for job queue

---

*Stack analysis: 2026-01-26*
*Update after major dependency changes*
