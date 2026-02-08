# Architecture

**Analysis Date:** 2026-01-26

## Pattern Overview

**Overall:** Monolithic Full-Stack Application with SPA Frontend

**Key Characteristics:**
- Single Page Application (React 19 + Vite)
- Monolithic Express API backend (~6,900 lines per server file)
- Neon Serverless PostgreSQL database
- Redis + BullMQ for scheduled post publishing
- Multi-tenant via Clerk organizations

## Layers

**UI Layer (React Components):**
- Purpose: User interface and interaction
- Contains: React components, event handlers, local state
- Location: `src/components/` with subdirectories by feature
- Depends on: State layer (stores, hooks), Service layer
- Used by: Router (`src/Router.tsx`)

**State Management Layer:**
- Purpose: Global client state and server state synchronization
- Contains: Zustand stores, SWR hooks
- Location: `src/stores/` (9 stores), `src/hooks/` (10+ hooks)
- Depends on: Service layer for API calls
- Used by: UI components

**Service Layer (Frontend):**
- Purpose: API client abstraction and business logic
- Contains: Typed fetch functions, AI integrations
- Location: `src/services/` (18 files), `src/services/api/` (15 files)
- Depends on: Backend API endpoints
- Used by: State layer, UI components

**API Layer (Express):**
- Purpose: REST endpoints, authentication, rate limiting
- Contains: Route handlers, middleware, error handling
- Location: `server/dev-api.mjs`, `server/index.mjs`
- Depends on: Database, external APIs
- Used by: Frontend service layer

**Helper Layer (Backend):**
- Purpose: Extracted business logic and utilities
- Contains: Job queue setup, publishing logic, usage tracking
- Location: `server/helpers/` (6 files)
- Depends on: Database, external services
- Used by: API layer

**Database Layer:**
- Purpose: Data persistence and queries
- Contains: Schema, migrations, RLS policies
- Location: `db/schema.sql`, `db/migrations/`
- Depends on: Neon PostgreSQL
- Used by: API layer

## Data Flow

**Initial Page Load:**
1. Browser loads `/` → React app boots (`src/index.tsx`)
2. ClerkProvider wraps app for authentication
3. Router.tsx routes to App.tsx (or lazy-loaded AdminApp)
4. App.tsx calls `useInitialData()` hook
5. useAppData.tsx (SWR) makes single request to `/api/db/init`
6. Server executes 5 parallel queries (brand, gallery, posts, campaigns, tournaments)
7. SWR caches response and populates individual cache keys
8. UI renders with data

**Campaign Generation:**
1. User provides input (text + optional image)
2. App.tsx calls `generateCampaign()`
3. POST `/api/ai/campaign` with brand context
4. Server calls Google Gemini API for content
5. Server calls image generation endpoint
6. Images uploaded to Vercel Blob
7. Full campaign object returned
8. UI updates optimistically
9. Campaign saved to database

**Scheduled Post Publishing (Async):**
1. User schedules post via `/api/db/scheduled-posts`
2. BullMQ job created in Redis
3. Job queue monitors scheduled times
4. At scheduled time, triggers `scheduled-publisher.mjs`
5. Publishes to Instagram via Rube MCP
6. Updates database status

**State Management:**
- Client state: Zustand stores (modals, jobs, clips, editor state)
- Server state: SWR with cache-first strategy
- Single unified data load minimizes latency

## Key Abstractions

**Service Pattern:**
- Purpose: Encapsulate API operations with typed functions
- Examples: `src/services/geminiService.ts`, `src/services/blobService.ts`, `src/services/rubeService.ts`
- Pattern: Module-level functions (not classes)

**Store Pattern:**
- Purpose: Global state containers with selectors
- Examples: `src/stores/uiStore.ts`, `src/stores/clipsStore.ts`
- Pattern: Zustand with `create()` and selector hooks

**Hook Pattern:**
- Purpose: Reusable stateful logic
- Examples: `useAppData()`, `useBackgroundJobs()`, `useAiApi()`
- Pattern: Custom hooks wrapping SWR, Zustand, or effect logic

**API Client Pattern:**
- Purpose: Typed HTTP client for backend
- Location: `src/services/apiClient.ts` (40KB)
- Pattern: Functions returning typed responses

## Entry Points

**Frontend:**
- `src/index.tsx` - React root with Clerk provider
- `src/Router.tsx` - Route definitions
- `src/App.tsx` - Main application component (2,507 lines)

**Backend:**
- `server/dev-api.mjs` - Development API (6,556 lines)
- `server/index.mjs` - Production API (6,744 lines)

**Database:**
- `db/schema.sql` - Schema definition
- `db/migrate.mjs` - Migration runner

## Error Handling

**Strategy:** Try-catch at route handler level, JSON error responses

**Patterns:**
- Route handlers catch errors and return `{ error: message }`
- Frontend displays error toasts via Zustand UI store
- AI operations use retry logic with fallbacks

**Gaps (Technical Debt):**
- Inconsistent error response formats
- Missing global error handler middleware
- 500+ console.log statements instead of structured logging

## Cross-Cutting Concerns

**Authentication:**
- Clerk for user auth and organizations
- Server validates via `getAuth(req)` middleware
- Multi-tenant isolation via `organization_id` + `user_id`

**Logging:**
- Currently: console.log/error throughout (unstructured)
- Planned: Pino structured logging (see `docs/REFACTORING_PLAN.md`)

**Validation:**
- Currently: Manual inline checks
- Planned: Zod schemas at API boundary

**Rate Limiting:**
- In-memory Map-based limiter (30 AI requests/60s)
- Not scalable to multiple instances
- Planned: Redis-based via Upstash

---

*Architecture analysis: 2026-01-26*
*Update when major patterns change*
