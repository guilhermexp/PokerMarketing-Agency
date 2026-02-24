# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Socialab is an AI-powered growth toolkit for poker marketing agencies. It transforms content (transcripts, videos, posts) into complete marketing campaigns including video clips, social media posts, ad creatives, and tournament flyers.

## Commands

### Development
```bash
bun install                    # Install dependencies
bun dev                        # Start dev server (API + Vite)
bun run dev:api                # API server only
bun run dev:vite               # Vite only
bun run dev:local              # Full stack with local Redis
```

### Testing & Quality
```bash
bun run test                   # Run tests (vitest)
bun run test:watch             # Watch mode
bun run typecheck              # TypeScript check (tsc --noEmit)
bun run lint                   # ESLint
bun run lint:fix               # ESLint with auto-fix
```

### Build & Production
```bash
bun run build                  # Build for production
bun run start                  # Start production server (server/index.mjs)
```

### Database
```bash
# Apply migrations
node db/migrate.mjs

# Migrate base64 images to Vercel Blob (if needed)
node scripts/migrate-all-data-urls-to-blob.mjs
node scripts/check-all-data-urls.mjs  # Diagnose remaining data URLs
```

## Architecture

### Stack
- **Frontend**: React 19 + TypeScript + Vite 7 + TailwindCSS 4
- **Backend**: Express 5 (Node.js) - modular server with `server/index.mjs` orchestrator (308 LOC) + 57 modules across lib/, routes/, middleware/, helpers/
- **Database**: Neon Serverless Postgres via `@neondatabase/serverless`
- **Storage**: Vercel Blob for images
- **Queue**: Redis + BullMQ (for scheduled posts only; image jobs removed)
- **Auth**: Better Auth (self-hosted, cookie-based, with organizations plugin)
- **AI**: Google Gemini via `@google/genai` (sync operations) + Vercel AI SDK `ai` + `@ai-sdk/google` (streaming chat)

### Data Flow
```
Frontend (React) → Express API → Neon Postgres
                              → Vercel Blob (images)
                              → Redis/BullMQ (scheduled posts)
                              → Google Gemini (AI generation)
```

### State Management
- **SWR**: Server state with cache-first strategy (`src/hooks/useAppData.tsx`)
- **Zustand**: Client state stores (`src/stores/`)
- **React Context**: Chat and background jobs context

### Key Architectural Patterns

1. **Unified Data Fetch**: `/api/db/init` returns all initial data in one request to minimize latency
2. **Optimistic Updates**: UI updates immediately, syncs with server afterward
3. **Image Storage**: Always upload to Vercel Blob, store only URLs in database (never base64 data URLs)
4. **Synchronous Image Generation**: Images generate synchronously via `/api/images` (background job queue was removed)
5. **Image Provider Chain**: `IMAGE_PROVIDERS` env var controls fallback order (default: `gemini,replicate,fal`). See `server/lib/ai/image-providers.mjs`. Replicate offers two models: `google/nano-banana` (Standard, cheaper) and `google/nano-banana-pro` (Pro, better typography). Flyers always force Pro.
6. **Admin Panel**: Route is `/admin` (NOT `/adm`). Protected by `SUPER_ADMIN_EMAILS` env var. See `server/lib/auth.mjs` → `requireSuperAdmin` middleware.

## Key Files

### Server (Express API) — Modular Architecture
- `server/index.mjs` - Orchestrator (308 LOC): setup, middleware, route registration, startup
- `server/lib/` - Core libraries (db, auth, user-resolver, resource-access, logging-helpers, csrf, errors, validation)
- `server/lib/ai/` - AI providers (clients, retry, image-generation, video-generation, prompt-builders, providers, tools)
- `server/routes/` - 23 route modules (health, admin, init, db-*, ai-*, upload, generation-jobs, *-playground, rube)
- `server/middleware/` - CSRF protection, error handler, request logger
- `server/helpers/` - Job queue, scheduled publisher, usage tracking, campaign prompts
- `server/api/chat/` - Vercel AI SDK chat handler with tool support

### Frontend Entry Points
- `src/App.tsx` - Main app component (~91K chars, handles all state)
- `src/hooks/useAppData.tsx` - SWR hooks for data fetching
- `src/services/apiClient.ts` - API client functions
- `src/services/geminiService.ts` - Google Gemini AI integration

### Database
- `db/schema.sql` - Full database schema
- `db/migrations/` - SQL migration files

## Important Conventions

### Image Handling
- Never store base64 data URLs in database columns
- Always upload images to Vercel Blob via `uploadImageToBlob()` from `src/services/blobService.ts`
- Image columns should contain HTTPS URLs only

### User ID Resolution
- Frontend uses Better Auth user ID (from session)
- Backend resolves to database UUID via `resolveUserId()` with caching
- Always use resolved UUID for database operations
- Auth uses cookies (sent automatically with `credentials: "include"`), no Bearer tokens

### Environment Variables
```
DATABASE_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=vercel_blob_...
REDIS_URL=redis://... (optional, for scheduled posts)
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
BETTER_AUTH_SECRET=... (required for session signing, generate with: openssl rand -hex 32)
CSRF_SECRET=... (required for CSRF protection)
SUPER_ADMIN_EMAILS=email1@example.com,email2@example.com (required for /admin access)
IMAGE_PROVIDERS=gemini,replicate,fal (fallback order for image generation)
REPLICATE_API_TOKEN=r8_... (for Replicate image models)
FAL_KEY=... (for FAL.ai image/video models)
```

## Security

### CSRF Protection
DirectorAi implements **CSRF (Cross-Site Request Forgery) protection** using the Double Submit Cookie pattern to prevent malicious state-changing operations.

#### How It Works
1. **Token Generation**: Cryptographically secure tokens are generated using `crypto.randomBytes(32)` (256 bits) and signed with HMAC-SHA256
2. **Double Submit**: Token is sent in both a cookie (`csrf-token`) and a custom header (`X-CSRF-Token`)
3. **Validation**: Backend compares cookie and header values using timing-safe comparison and validates HMAC signature
4. **Cookie Security**: Tokens stored in httpOnly cookies with `sameSite='strict'` and `secure` flag in production

#### Protected Endpoints
CSRF validation is enforced on **all state-changing operations** (POST, PUT, DELETE, PATCH) for these API prefixes:
- `/api/db/*` - Database operations
- `/api/ai/*` - AI generation
- `/api/chat/*` - Chat operations
- `/api/generate/*` - Content generation
- `/api/upload/*` - File uploads
- `/api/proxy-video/*` - Video proxy
- `/api/rube/*` - Rube Goldberg
- `/api/image-playground/*` - Image operations
- `/api/video-playground/*` - Video playground operations
- `/api/admin/*` - Admin operations

**Note:** GET, HEAD, and OPTIONS requests do NOT require CSRF tokens.

#### Token Handling
- **Frontend**: `apiClient.ts` automatically fetches tokens via `/api/csrf-token` and includes them in the `X-CSRF-Token` header for state-changing requests
- **Token Caching**: Tokens are cached in memory (not localStorage) for security
- **Auto-Refresh**: On 403 errors, the frontend automatically clears the cached token and re-fetches on the next request
- **Token Lifetime**: Tokens expire after 24 hours

#### Error Handling
- **403 Forbidden**: Returned when CSRF token is missing, invalid, or mismatched
- **Error Messages**:
  - "CSRF token missing from cookie" - No token provided
  - "CSRF token mismatch" - Cookie and header tokens don't match
  - "Invalid CSRF token" - HMAC signature validation failed
- **Logging**: CSRF failures are logged with structured logging (token values redacted)

#### Production Requirements
- Set `CSRF_SECRET` environment variable to a cryptographically random value:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- Ensure `NODE_ENV=production` to enable secure cookies
- HTTPS must be enabled for secure cookies to work

### Request Body Size Limits
- JSON request bodies are limited to **10MB** to prevent denial-of-service attacks
- This limit is enforced in `server/index.mjs` (used by both dev and prod entrypoints)
- Requests exceeding this limit will receive a 413 (Payload Too Large) error
- For large data transfers, use multipart uploads or chunked transfers instead

### File Upload Content-Type Validation
- All file uploads to Vercel Blob are validated against a whitelist of allowed MIME types
- **Allowed types**: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `image/gif`, `video/mp4`, `video/webm`
- **Blocked types**: HTML (`text/html`), SVG (`image/svg+xml`), JavaScript, executables, and any other non-whitelisted types
- This prevents XSS attacks via uploaded HTML/SVG files containing malicious scripts
- Validation is enforced via `validateContentType()` in `server/lib/validation/contentType.mjs`
- All upload paths validate content-type before uploading to Vercel Blob:
  - `/api/upload` endpoint (direct uploads)
  - `uploadDataUrlImageToBlob()` (data URL uploads)
  - Gemini and Replicate image generation endpoints
  - Scheduled post image processing
  - Image playground generation
- Invalid content types return 400 (Bad Request) with descriptive error messages

## Known Technical Debt

- `src/App.tsx` is ~2,571 lines — central orchestrator, needs decomposition
- `src/components/tabs/clips/ClipCard.tsx` is ~5,500 lines
- `src/services/apiClient.ts` is ~1,726 lines — should split by domain
- In-memory rate limiter (lost on restart, not shared across instances)
- 66+ uses of TypeScript `any` type
- See `docs/ARCHITECTURE-REVIEW-2026-02-11.md` for full review
