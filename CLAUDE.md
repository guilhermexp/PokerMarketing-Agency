# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DirectorAi is an AI-powered growth toolkit for poker marketing agencies. It transforms content (transcripts, videos, posts) into complete marketing campaigns including video clips, social media posts, ad creatives, and tournament flyers.

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
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS 4
- **Backend**: Express 5 (Node.js) - two files: `server/dev-api.mjs` (dev) and `server/index.mjs` (prod)
- **Database**: Neon Serverless Postgres via `@neondatabase/serverless`
- **Storage**: Vercel Blob for images
- **Queue**: Redis + BullMQ (for scheduled posts only; image jobs removed)
- **Auth**: Clerk (multi-tenant with organizations)
- **AI**: Google Gemini (`@google/genai`) for text/image generation

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

## Key Files

### Server (Express API)
- `server/dev-api.mjs` - Development API (~6,900 lines, monolithic)
- `server/index.mjs` - Production API (~6,900 lines, mirrors dev-api)
- `server/helpers/job-queue.mjs` - BullMQ setup for scheduled posts

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
- Frontend uses Clerk user ID (`user_xxx...`)
- Backend resolves to database UUID via `resolveUserId()` with caching
- Always use resolved UUID for database operations

### Environment Variables
```
DATABASE_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=vercel_blob_...
REDIS_URL=redis://... (optional, for scheduled posts)
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

## Security

### Request Body Size Limits
- JSON request bodies are limited to **10MB** to prevent denial-of-service attacks
- This limit is enforced in both `server/dev-api.mjs` and `server/index.mjs`
- Requests exceeding this limit will receive a 413 (Payload Too Large) error
- For large data transfers, use multipart uploads or chunked transfers instead

## Known Technical Debt

- Server files are monolithic (~7K lines each) - see `docs/REFACTORING_PLAN.md`
- `src/components/tabs/clips/ClipCard.tsx` is ~5,500 lines
- Many `console.log` statements need structured logging
- 66+ uses of TypeScript `any` type
