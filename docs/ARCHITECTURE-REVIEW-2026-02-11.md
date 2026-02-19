# Socialab - Architecture Review & Diagrams

> **Date**: 2026-02-11
> **Context**: Post server refactoring (7,967 LOC monolith → 308 LOC orchestrator + 57 modular files)
> **Total Server LOC**: ~15,500 across 57 .mjs files

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph Client["Frontend (React 19 + Vite 7)"]
        App["App.tsx<br/>2,571 LOC"]
        SWR["SWR Cache<br/>(useAppData)"]
        Zustand["Zustand Stores<br/>(10 stores)"]
        API["apiClient.ts<br/>1,726 LOC"]
        Services["Services Layer<br/>(47 files)"]
    end

    subgraph Server["Express 5 Server"]
        Index["index.mjs<br/>308 LOC orchestrator"]
        MW["Middleware Stack"]
        Routes["23 Route Modules"]
        Lib["Library Layer"]
        AI["AI Provider Layer"]
    end

    subgraph External["External Services"]
        Neon[(Neon Postgres)]
        Blob["Vercel Blob"]
        Gemini["Google Gemini"]
        FAL["FAL.ai"]
        Replicate["Replicate"]
        Redis[(Redis/BullMQ)]
        Clerk["Clerk Auth"]
        IG["Instagram API"]
    end

    App --> SWR
    App --> Zustand
    App --> API
    API --> |CSRF + Auth| Index
    Services --> API

    Index --> MW --> Routes
    Routes --> Lib
    Routes --> AI
    Lib --> Neon
    Lib --> Blob
    AI --> Gemini
    AI --> FAL
    AI --> Replicate
    Routes --> Redis
    MW --> Clerk
    Routes --> IG
```

---

## 2. Server Layer Architecture

```mermaid
graph TB
    subgraph L0["Layer 0: Foundation"]
        Logger["logger.mjs<br/>Pino structured logging"]
        Errors["errors/<br/>AppError + 11 subclasses"]
        Validation["validation/<br/>contentType whitelist"]
    end

    subgraph L1["Layer 1: Core Infrastructure"]
        DB["db.mjs<br/>Neon singleton + warmup"]
        CSRF["csrf.mjs<br/>HMAC-SHA256 tokens"]
        LogHelpers["logging-helpers.mjs<br/>API call logging"]
    end

    subgraph L2["Layer 2: Identity & Access"]
        UserResolver["user-resolver.mjs<br/>Clerk→UUID + 5min cache"]
        Auth["auth.mjs<br/>Auth + rate limiting"]
        OrgCtx["organization-context.mjs<br/>13 permissions, 2 roles"]
        ResourceAccess["resource-access.mjs<br/>RLS for 13 resource types"]
    end

    subgraph L3["Layer 3: AI Providers"]
        Clients["ai/clients.mjs<br/>Gemini, OpenRouter, FAL, Replicate"]
        Retry["ai/retry.mjs<br/>503 retry + error sanitization"]
        ImageGen["ai/image-generation.mjs<br/>Gemini + Replicate fallback"]
        VideoGen["ai/video-generation.mjs<br/>Veo 3.1 + FAL"]
        PromptBuild["ai/prompt-builders.mjs<br/>Brand-aware prompts"]
        Providers["ai/providers.mjs<br/>Vercel AI SDK wrapper"]
        Tools["ai/tools/<br/>createImage, editImage, createLogo"]
    end

    subgraph L4["Layer 4: Middleware"]
        ReqLogger["requestLogger.mjs<br/>pino-http + request IDs"]
        ErrorHandler["errorHandler.mjs<br/>Global catch-all"]
        CSRFMiddleware["csrfProtection.mjs<br/>Double-submit cookie"]
    end

    subgraph L5["Layer 5: Helpers"]
        JobQueue["job-queue.mjs<br/>BullMQ scheduled posts"]
        UsageTracking["usage-tracking.mjs<br/>Cost tracking, 20+ models"]
        ScheduledPub["scheduled-publisher.mjs<br/>Instagram auto-publish"]
        CampaignPrompts["campaign-prompts.mjs"]
    end

    subgraph L6["Layer 6: Routes (23 modules)"]
        Health["health.mjs"]
        Admin["admin.mjs"]
        Init["init.mjs"]
        DBRoutes["db-*.mjs (8 files)<br/>Users, Brand, Gallery, Posts,<br/>Campaigns, Tournaments,<br/>Scheduled, Instagram"]
        AIRoutes["ai-*.mjs (6 files)<br/>Campaign, Text, Image,<br/>Video, Speech, Assistant"]
        Upload["upload.mjs"]
        GenJobs["generation-jobs.mjs"]
        Playground["*-playground.mjs (2)"]
        Rube["rube.mjs"]
    end

    subgraph L7["Layer 7: Orchestrator"]
        IndexMjs["index.mjs (308 LOC)<br/>Setup + Middleware + Registration"]
    end

    L0 --> L1
    L1 --> L2
    L2 --> L3
    L1 --> L3
    L0 --> L4
    L2 --> L5
    L3 --> L5
    L1 --> L6
    L2 --> L6
    L3 --> L6
    L5 --> L6
    L4 --> L7
    L6 --> L7
```

---

## 3. Dependency Graph (Internal Modules)

```mermaid
graph LR
    subgraph Foundation
        logger["logger.mjs<br/>fan-in: 32+"]
        errors["errors/index.mjs<br/>fan-in: 8"]
        appError["AppError.mjs"]
    end

    subgraph Core
        db["db.mjs<br/>fan-in: 25+"]
        csrf["csrf.mjs<br/>fan-in: 1"]
        logHelp["logging-helpers.mjs<br/>fan-in: 6"]
        contentType["contentType.mjs<br/>fan-in: 4"]
    end

    subgraph Identity
        userRes["user-resolver.mjs<br/>fan-in: 12"]
        auth["auth.mjs<br/>fan-in: 8"]
        orgCtx["organization-context.mjs<br/>fan-in: 2"]
        resAccess["resource-access.mjs<br/>fan-in: 2"]
    end

    subgraph AI
        clients["ai/clients.mjs<br/>fan-in: 6"]
        retry["ai/retry.mjs<br/>fan-in: 5"]
        imageGen["ai/image-gen.mjs<br/>fan-in: 3"]
        videoGen["ai/video-gen.mjs<br/>fan-in: 2"]
        prompts["ai/prompt-builders.mjs<br/>fan-in: 4"]
    end

    appError --> errors
    logger --> db
    logger --> logHelp
    db --> userRes
    logger --> userRes
    orgCtx --> auth
    db --> resAccess
    userRes --> resAccess
    logger --> resAccess
    logger --> retry
    clients --> imageGen
    retry --> imageGen
    clients --> videoGen
    contentType --> videoGen
    logHelp --> videoGen
    clients --> prompts
    retry --> prompts
```

**Key Property: Zero Circular Dependencies** - All arrows flow in one direction (DAG validated).

---

## 4. Request Flow

```mermaid
sequenceDiagram
    participant C as Client (React)
    participant MW as Middleware Stack
    participant R as Route Handler
    participant L as Lib Layer
    participant DB as Neon Postgres
    participant AI as AI Provider
    participant B as Vercel Blob

    C->>MW: POST /api/ai/image<br/>{prompt, aspectRatio, model}
    Note over MW: 1. requestLogger (assign ID)
    Note over MW: 2. Clerk auth (verify JWT)
    Note over MW: 3. enforceAuthenticatedIdentity
    Note over MW: 4. csrfProtection (validate token)
    MW->>R: ai-image.mjs handler
    R->>L: resolveUserId(clerkId)
    L->>DB: SELECT id FROM users
    L-->>R: UUID
    R->>L: getBrandProfile(userId)
    L->>DB: SELECT * FROM brand_profiles
    L-->>R: brand context
    R->>L: buildImagePrompt(prompt, brand)
    R->>AI: generateGeminiImage(prompt, config)
    AI-->>R: base64 image
    R->>B: put(filename, buffer)
    B-->>R: blob URL
    R->>DB: INSERT INTO gallery_images
    R->>DB: INSERT INTO api_usage_logs
    R-->>C: {success: true, url: "..."}
```

---

## 5. Frontend Architecture

```mermaid
graph TB
    subgraph Entry
        Index["index.tsx<br/>ClerkProvider + SW"]
        Router["Router.tsx<br/>Lazy routes"]
    end

    subgraph State["State Management (3 layers)"]
        SWR["SWR Hooks (Server State)<br/>useInitialData, useGallery,<br/>useScheduledPosts, useCampaigns"]
        ZS["Zustand Stores (Client State)<br/>10 stores: UI, Jobs, Gallery,<br/>Carousel, Clips, Flyer, etc."]
        Ctx["React Context (UI Coupling)<br/>ChatContext only"]
    end

    subgraph Components["Component Tree (191 files)"]
        App["App.tsx (2,571 LOC)<br/>Central orchestrator"]
        UI["ui/ (25)<br/>shadcn primitives"]
        Common["common/ (18)<br/>Generic wrappers"]
        Features["Feature Components"]
    end

    subgraph FeatureDetail["Feature Modules"]
        ImgPreview["image-preview/ (20)"]
        Assistant["assistant/ (10)"]
        Carousel["carousel/ (10)"]
        Flyer["flyer/ (10)"]
        Clips["clips/ (ClipCard 5.5K LOC)"]
        Playground["playground/ (7)"]
        Calendar["calendar/ (6)"]
        Admin["admin/ (5)"]
    end

    subgraph ServicesLayer["Services (47 files)"]
        APIClient["apiClient.ts (1,726 LOC)"]
        GeminiSvc["geminiService.ts"]
        RubeSvc["rubeService.ts"]
        FFmpeg["ffmpeg/videoEncoder.ts"]
        BlobSvc["blobService.ts"]
    end

    Index --> Router --> App
    App --> SWR
    App --> ZS
    App --> Ctx
    App --> Features
    Features --> ImgPreview
    Features --> Assistant
    Features --> Carousel
    Features --> Flyer
    Features --> Clips
    Features --> Playground
    Features --> Calendar
    Features --> Admin
    Features --> UI
    Features --> Common
    App --> ServicesLayer
    APIClient --> |CSRF auto-fetch| Server["Express API"]
```

---

## 6. Data Flow Architecture

```mermaid
graph LR
    subgraph Frontend
        Action["User Action"]
        OptUpdate["Optimistic Update<br/>(Zustand)"]
        SWRCache["SWR Cache<br/>(revalidate)"]
    end

    subgraph API["Express API"]
        CSRF["CSRF Validation"]
        Auth["Auth Check"]
        Handler["Route Handler"]
    end

    subgraph Storage
        DB[(Neon Postgres)]
        Blob["Vercel Blob<br/>(images/videos)"]
        Redis[(Redis<br/>scheduled jobs)]
    end

    Action --> OptUpdate
    Action --> |apiClient.ts| CSRF
    CSRF --> Auth --> Handler
    Handler --> DB
    Handler --> Blob
    Handler --> Redis
    DB --> |response| SWRCache
    OptUpdate --> |rollback on error| SWRCache
```

---

## 7. Security Architecture

```mermaid
graph TB
    subgraph Client
        Token["CSRF Token<br/>(in-memory, not localStorage)"]
        ClerkJWT["Clerk JWT<br/>(httpOnly cookie)"]
    end

    subgraph Middleware["Security Middleware Chain"]
        M1["1. Helmet<br/>Security headers"]
        M2["2. CORS<br/>Origin whitelist"]
        M3["3. Clerk Auth<br/>JWT verification"]
        M4["4. Identity Enforcement<br/>userId match"]
        M5["5. CSRF Protection<br/>Double-submit cookie"]
        M6["6. Resource Access<br/>Ownership validation"]
    end

    subgraph Validation
        CT["Content-Type<br/>Whitelist"]
        SQL["Parameterized SQL<br/>(Neon driver)"]
        RL["Rate Limiting<br/>(30 req/min AI)"]
        SSRF["SSRF Protection<br/>(URL parsing)"]
    end

    Client --> M1 --> M2 --> M3 --> M4 --> M5 --> M6
    M6 --> Validation
```

### Security Matrix

| Control | Status | Coverage |
|---------|--------|----------|
| Authentication (Clerk) | **STRONG** | All /api/db/*, /api/ai/*, /api/admin/* |
| CSRF (Double-Submit) | **EXCELLENT** | All state-changing operations |
| SQL Injection | **EXCELLENT** | 100% parameterized (Neon driver) |
| XSS (Upload) | **EXCELLENT** | Content-type whitelist blocks HTML/SVG/JS |
| SSRF (Proxy) | **FIXED** | URL parsing with hostname validation |
| API Key Isolation | **FIXED** | Gemini key never exposed to client |
| Rate Limiting | **PARTIAL** | Only /api/chat - AI endpoints unprotected |
| Input Validation | **GOOD** | Most endpoints validate, some accept arbitrary |
| Error Sanitization | **GOOD** | `sanitizeErrorForClient()` strips internals |

---

## 8. Dependency Metrics

### High Fan-In (Most Depended Upon)

| Module | Fan-In | Expected? |
|--------|--------|-----------|
| logger.mjs | 32+ | Yes - foundation |
| db.mjs | 25+ | Yes - data layer |
| user-resolver.mjs | 12 | Yes - identity |
| auth.mjs | 8 | Yes - security |
| errors/index.mjs | 8 | Yes - error handling |
| ai/clients.mjs | 6 | Yes - AI singleton |
| logging-helpers.mjs | 6 | Yes - observability |

### High Fan-Out (Most Dependencies)

| Module | Fan-Out | Risk |
|--------|---------|------|
| index.mjs | 40+ | Expected (orchestrator) |
| ai-image.mjs | 8 | Medium (complex route) |
| ai-campaign.mjs | 7 | Medium (complex route) |
| ai-assistant.mjs | 7 | Medium (complex route) |

### Coupling Health: **HEALTHY**
- Zero circular dependencies
- Clear directional flow (bottom → top)
- 1 minor layering violation (routes/rube.mjs → routes/db-instagram.mjs)

---

## 9. Issues Found & Recommendations

### CRITICAL (Fix Now)

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 1 | **AI endpoints lack rate limiting** | Cost exposure - users can hammer expensive AI APIs (video=$0.50+/call) | All `/api/ai/*` routes except /chat |
| 2 | **`/api/db/stats` unprotected** | Debug endpoint exposed without auth - cache info leak + DoS via reset | `routes/health.mjs:32-44` |

### MEDIUM (Plan for Next Sprint)

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 3 | **Cross-route import** | Layering violation - rube.mjs imports from db-instagram.mjs | `routes/rube.mjs:3` |
| 4 | **In-memory rate limiter** | Lost on server restart, not shared across instances | `lib/auth.mjs:18` |
| 5 | **App.tsx monolith** (2,571 LOC) | Frontend equivalent of old server monolith | `src/App.tsx` |
| 6 | **ClipCard.tsx** (~5,500 LOC) | Largest single component, hard to maintain | `src/components/tabs/clips/ClipCard.tsx` |
| 7 | **apiClient.ts** (1,726 LOC) | Growing API layer, should split by domain | `src/services/apiClient.ts` |

### LOW (Technical Debt Backlog)

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| 8 | 66+ TypeScript `any` types | Type safety gaps | Across frontend |
| 9 | CLAUDE.md outdated | Still says "~7K lines monolithic" | `CLAUDE.md:43` |
| 10 | Playground helpers not in routes pattern | `helpers/image-playground.mjs` (1,181 LOC) is a helper, not a route | `server/helpers/` |

---

## 10. Module Inventory Summary

| Layer | Files | Total LOC | % of Server |
|-------|-------|-----------|-------------|
| Orchestrator (index.mjs) | 1 | 308 | 2% |
| Middleware | 3 | 665 | 4% |
| Library - Core | 8 | 879 | 6% |
| Library - Errors | 2 | 352 | 2% |
| Library - Validation | 2 | 268 | 2% |
| Library - AI | 8 | 1,641 | 11% |
| Helpers | 11 | 3,551 | 23% |
| API (Chat) | 2 | 557 | 4% |
| Routes | 24 | 7,264 | 47% |
| **Total** | **61** | **~15,500** | **100%** |

---

## 11. Architecture Score Card

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Modularity** | 9/10 | Excellent post-refactor. 57 focused modules, clear boundaries |
| **Separation of Concerns** | 8/10 | Clean layers. -1 for playground helpers coupling, -1 for rube cross-import |
| **Security** | 8/10 | Strong auth/CSRF/SQL. -1 for missing rate limits, -1 for exposed stats |
| **Testability** | 7/10 | Modules are independently testable. Few actual tests exist |
| **Observability** | 9/10 | Structured logging everywhere, usage tracking, request IDs |
| **Scalability** | 7/10 | Stateless routes (good), in-memory rate limiter (bad), single process |
| **Maintainability** | 8/10 | Consistent patterns, clear naming. Large frontend files remain |
| **Documentation** | 7/10 | Good CLAUDE.md + docs/. Needs update post-refactor |
| **Overall** | **8/10** | **Solid architecture with clear improvement paths** |
