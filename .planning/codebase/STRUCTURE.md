# Codebase Structure

**Analysis Date:** 2026-01-26

## Directory Layout

```
PokerMarketing-Agency/
├── server/                          # Backend Express API
│   ├── dev-api.mjs                  # Development API (6,556 lines)
│   ├── index.mjs                    # Production API (6,744 lines)
│   ├── helpers/                     # Business logic helpers
│   └── api/chat/                    # Chat endpoints
├── db/                              # Database
│   ├── schema.sql                   # PostgreSQL schema (38KB)
│   ├── migrations/                  # SQL migration files
│   └── migrate.mjs                  # Migration runner
├── src/                             # Frontend React SPA
│   ├── components/                  # React components (~20 subdirs)
│   ├── services/                    # API clients and services
│   ├── stores/                      # Zustand state stores
│   ├── hooks/                       # Custom React hooks
│   ├── types.ts                     # Central type definitions
│   ├── App.tsx                      # Main app (2,507 lines)
│   └── Router.tsx                   # Route configuration
├── docs/                            # Documentation (46+ files)
├── .planning/                       # GSD planning artifacts
├── package.json                     # Dependencies
├── vite.config.ts                   # Vite bundler config
├── tsconfig.json                    # TypeScript config
└── CLAUDE.md                        # Claude Code instructions
```

## Directory Purposes

**server/**
- Purpose: Express API backend (monolithic)
- Contains: Route handlers, middleware, authentication
- Key files: `dev-api.mjs` (dev), `index.mjs` (prod)
- Subdirectories: `helpers/` (extracted logic), `api/chat/` (streaming)

**server/helpers/**
- Purpose: Extracted business logic
- Contains: Job queue, publishing, organization context, usage tracking
- Key files: `job-queue.mjs`, `scheduled-publisher.mjs`, `organization-context.mjs`, `usage-tracking.mjs`

**db/**
- Purpose: Database schema and migrations
- Contains: SQL files for schema and changes
- Key files: `schema.sql` (38KB, 14+ tables), `migrate.mjs` (runner)

**src/components/**
- Purpose: React UI components
- Contains: Feature-organized component directories
- Subdirectories: `tabs/`, `assistant/`, `image-preview/`, `calendar/`, `flyer/`, `gallery/`, `brand/`, `admin/`, `common/`, `ui/`

**src/components/tabs/**
- Purpose: Main tab views for dashboard
- Contains: ClipsTab, PostsTab, AdCreativesTab, etc.
- Key files: `clips/ClipCard.tsx` (5,549 lines - large)

**src/services/**
- Purpose: Business logic and API clients
- Contains: Service modules and API sub-services
- Key files: `apiClient.ts` (40KB), `geminiService.ts`, `rubeService.ts`
- Subdirectories: `api/` (15 API files), `ffmpeg/` (video processing)

**src/stores/**
- Purpose: Zustand global state
- Contains: 9 state stores
- Key files: `uiStore.ts`, `clipsStore.ts`, `jobsStore.ts`, `editorStore.ts`, `carouselStore.ts`, `flyerStore.ts`, `galleryStore.ts`, `imagePreviewStore.ts`

**src/hooks/**
- Purpose: Custom React hooks
- Contains: Data fetching, state integration, feature hooks
- Key files: `useAppData.tsx` (core), `useBackgroundJobs.tsx`, `useAiApi.ts`
- Subdirectories: `flyer/` (flyer-specific hooks), `__tests__/`

**docs/**
- Purpose: Project documentation
- Contains: Technical docs, API docs, style guides
- Key files: `DOCUMENTATION.md`, `MODEL_DOCUMENTATION.md`, `REFACTORING_PLAN.md`, `STYLE_GUIDE.md`

## Key File Locations

**Entry Points:**
- `src/index.tsx` - React root with Clerk provider
- `src/Router.tsx` - Route definitions (lazy-loaded admin)
- `src/App.tsx` - Main application component
- `server/dev-api.mjs` - API server entry

**Configuration:**
- `tsconfig.json` - TypeScript config
- `vite.config.ts` - Vite bundler config
- `eslint.config.mjs` - ESLint rules
- `.env.example` - Environment variable template

**Core Logic:**
- `src/services/apiClient.ts` - Central API client
- `src/services/geminiService.ts` - AI generation
- `src/hooks/useAppData.tsx` - Data fetching
- `server/dev-api.mjs` - All API routes

**Testing:**
- `test/setup.ts` - Test globals and mocks
- `src/**/__tests__/` - Co-located test directories
- `vitest.config.ts` - Test configuration

**Documentation:**
- `CLAUDE.md` - Claude Code instructions
- `README.md` - Project overview
- `docs/REFACTORING_PLAN.md` - Refactoring roadmap

## Naming Conventions

**Files:**
- PascalCase.tsx - React components (`Button.tsx`, `ClipCard.tsx`)
- camelCase.ts - Services, stores, utilities (`apiClient.ts`, `uiStore.ts`)
- camelCase.test.ts - Test files (`authService.test.ts`)
- kebab-case.md - Documentation files

**Directories:**
- kebab-case - All directories (`image-preview/`, `ai-prompts/`)
- Plural for collections (`components/`, `services/`, `stores/`)
- Feature-based grouping (`components/calendar/`, `components/flyer/`)

**Special Patterns:**
- `index.ts` - Barrel exports for module grouping
- `__tests__/` - Co-located test directories
- `*.types.ts` - Type definition files (`flyer.types.ts`)

## Where to Add New Code

**New Feature:**
- Primary code: `src/components/{feature-name}/`
- Services: `src/services/` or `src/services/api/`
- State: `src/stores/{feature}Store.ts`
- Types: `src/types.ts` or `src/types/{feature}.types.ts`

**New API Endpoint:**
- Route: Add to `server/dev-api.mjs` and `server/index.mjs`
- Helper logic: Extract to `server/helpers/`
- Client: Add function to `src/services/apiClient.ts` or `src/services/api/`

**New Component:**
- Implementation: `src/components/{feature}/` or `src/components/common/`
- Styles: Use TailwindCSS utilities inline
- Tests: `src/components/{feature}/__tests__/`

**Utilities:**
- Shared helpers: `src/utils/`
- Type definitions: `src/types.ts`
- Prompts: `src/ai-prompts/`

## Special Directories

**dist/**
- Purpose: Production build output
- Source: Generated by `vite build`
- Committed: No (in `.gitignore`)

**.planning/**
- Purpose: GSD planning artifacts
- Source: Created by planning tools
- Committed: Yes

**node_modules/**
- Purpose: npm dependencies
- Committed: No (in `.gitignore`)

**coverage/**
- Purpose: Test coverage reports
- Committed: No (in `.gitignore`)

---

*Structure analysis: 2026-01-26*
*Update when directory structure changes*
