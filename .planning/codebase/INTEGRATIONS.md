# External Integrations

**Analysis Date:** 2026-01-26

## APIs & External Services

**AI Text/Content Generation (Primary):**
- Google Gemini - Campaign content, text generation
  - SDK/Client: `@google/genai` v1.17.0
  - Models: `gemini-3-pro-preview`, `gemini-3-flash-preview`
  - Auth: `GEMINI_API_KEY` env var
  - Location: `src/services/geminiService.ts`, `server/dev-api.mjs`

**AI Text Generation (Fallback):**
- OpenRouter - Multi-model LLM access (GPT-5.2, Grok, Claude)
  - SDK/Client: `@openrouter/sdk` v0.3.10, `@openrouter/ai-sdk-provider`
  - Auth: `OPENROUTER_API_KEY` env var
  - Location: `server/dev-api.mjs` lines 3752+

**AI Image Generation (Primary):**
- Google Gemini Image - Image generation
  - Model: `gemini-3-pro-image-preview`
  - Auth: `GEMINI_API_KEY` env var
  - Location: `server/dev-api.mjs`

**AI Image Generation (Fallback):**
- Replicate - Fallback image generation
  - SDK/Client: `replicate` v1.0.1
  - Model: `google/nano-banana-pro`
  - Auth: `REPLICATE_API_TOKEN` env var
  - Location: `server/dev-api.mjs` line 3427

**AI Video Generation:**
- FAL.ai - Video generation
  - SDK/Client: `@fal-ai/client` v1.8.0
  - Auth: `FAL_KEY` env var
  - Location: `server/dev-api.mjs` line 5824 (`generateVideoWithFal()`)

- Google Veo - Video generation (primary)
  - Model: `veo-3.0-generate-preview`
  - Auth: `GEMINI_API_KEY` env var
  - Location: `server/dev-api.mjs`

## Data Storage

**Databases:**
- Neon Serverless PostgreSQL - Primary data store
  - Connection: `DATABASE_URL` env var
  - Client: `@neondatabase/serverless`
  - Schema: `db/schema.sql` (14+ tables)
  - Features: HTTP caching, multi-tenant RLS

**File Storage:**
- Vercel Blob - Image and media storage
  - SDK/Client: `@vercel/blob` v2.0.0
  - Auth: `BLOB_READ_WRITE_TOKEN` env var
  - Location: `src/services/blobService.ts`
  - Pattern: Store URLs only (never base64)

**Caching/Queue:**
- Redis + BullMQ - Scheduled post publishing
  - Connection: `REDIS_URL` env var
  - Client: `bullmq`, `ioredis`
  - Location: `server/helpers/job-queue.mjs`
  - Local dev: `docker-compose.yml` (Redis 7-alpine)

## Authentication & Identity

**Auth Provider:**
- Clerk - Multi-tenant authentication
  - SDKs: `@clerk/clerk-react`, `@clerk/backend`, `@clerk/express`
  - Auth: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
  - Features: Organizations, JWT tokens, user management
  - Location: `src/services/authService.ts`, middleware in `server/dev-api.mjs`

**Session Management:**
- JWT tokens from Clerk
- Token refresh handled by Clerk SDK
- Server validates via `getAuth(req)` middleware

## Social Media Publishing

**Instagram Publishing:**
- Rube MCP - Instagram API proxy
  - Protocol: JSON-RPC via HTTP
  - Auth: Per-user tokens stored in database (`RUBE_TOKEN` for system)
  - Endpoint: `/api/rube` (proxy handler)
  - Location: `src/services/rubeService.ts`
  - Supported tools:
    - `INSTAGRAM_CREATE_MEDIA_CONTAINER` (posts, reels)
    - `INSTAGRAM_CREATE_CAROUSEL_CONTAINER`
    - `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH`
    - `INSTAGRAM_CREATE_POST` (carousel publish)
    - `INSTAGRAM_GET_POST_STATUS`
    - `INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT`

## Monitoring & Observability

**Usage Tracking:**
- Custom implementation - AI token and cost tracking
  - Location: `server/helpers/usage-tracking.mjs`
  - Functions: `logAiUsage()`, `extractGeminiTokens()`, `extractOpenRouterTokens()`
  - Storage: `ai_logs` and `usage_tracking` tables

**Error Logging:**
- Console logging (unstructured)
- Errors stored in database (`ai_logs` table)
- Admin dashboard: `/api/admin/logs`

## CI/CD & Deployment

**Hosting:**
- Docker multi-stage build
  - Build: Node 20 Alpine
  - Runtime: Bun 1 Alpine
  - Config: `Dockerfile`, `docker-compose.yml`

**Environment Management:**
- `.env` files for local (git-ignored)
- `.env.example` for template
- Docker `ARG`/`ENV` for container builds

## Environment Configuration

**Development:**
- Required env vars:
  - `DATABASE_URL` (Neon connection string)
  - `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
  - `GEMINI_API_KEY` (AI generation)
  - `BLOB_READ_WRITE_TOKEN` (image storage)
- Optional:
  - `REDIS_URL` (for scheduled posts)
  - `OPENROUTER_API_KEY`, `REPLICATE_API_TOKEN`, `FAL_KEY` (fallbacks)
- Local services: Redis via `docker-compose.yml`

**Production:**
- Same env vars as development
- Secrets managed via deployment platform
- Multi-tenant: Uses Clerk organizations

## Webhooks & Callbacks

**Incoming:**
- None currently configured

**Outgoing:**
- Scheduled publisher calls Instagram API
- AI services called synchronously (no callbacks)

## Rate Limiting

**Internal:**
- In-memory rate limiter (30 AI requests/60 seconds)
- Location: `server/dev-api.mjs` lines 136-156
- Limitation: Not persistent, single-instance only

**Planned:**
- Upstash Rate Limit (`@upstash/ratelimit` in dependencies)
- Redis-based for persistence

## Service Dependencies Summary

| Service | Package | Purpose | Required |
|---------|---------|---------|----------|
| Google Gemini | `@google/genai` | AI text/image/video | Yes |
| OpenRouter | `@openrouter/sdk` | LLM fallback | Yes |
| Replicate | `replicate` | Image fallback | Yes |
| FAL.ai | `@fal-ai/client` | Video generation | Yes |
| Clerk | `@clerk/*` | Authentication | Yes |
| Neon PostgreSQL | `@neondatabase/serverless` | Database | Yes |
| Vercel Blob | `@vercel/blob` | Image storage | Yes |
| Redis/BullMQ | `bullmq`, `ioredis` | Job queue | Optional |
| Rube MCP | Custom | Instagram publishing | Optional |

---

*Integration audit: 2026-01-26*
*Update when adding/removing external services*
