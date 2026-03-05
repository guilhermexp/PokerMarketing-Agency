# Socialab — Diagramas de Arquitetura

## 1. Visão Geral do Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React 19)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │Dashboard │ │Campaigns │ │ Image    │ │ Video    │ │Studio Agent │  │
│  │          │ │Posts/Ads │ │Playground│ │Playground│ │ (Claude AI) │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬──────┘  │
│       │             │            │             │              │         │
│  ┌────┴─────────────┴────────────┴─────────────┴──────────────┴──────┐  │
│  │              SWR (useAppData) + Zustand Stores                    │  │
│  │         apiClient.ts → fetch with CSRF + credentials              │  │
│  └──────────────────────────┬────────────────────────────────────────┘  │
└─────────────────────────────┼──────────────────────────────────────────┘
                              │ HTTPS (cookies + CSRF token)
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Express 5 / Bun)                       │
│                                                                        │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  ┌───────────────────────┐  │
│  │  Auth   │  │  CSRF    │  │Rate Limiter│  │   24 Route Modules    │  │
│  │(Better  │  │(Double   │  │ (30/min AI │  │  /api/db/* /api/ai/*  │  │
│  │ Auth)   │  │ Submit)  │  │  5/min vid)│  │  /api/agent/* etc.    │  │
│  └────┬────┘  └────┬─────┘  └─────┬──────┘  └──────────┬────────────┘  │
│       └─────────────┴──────────────┴─────────────────────┘              │
│                                    │                                    │
│  ┌─────────────────────────────────┼────────────────────────────────┐   │
│  │              Core Libraries (server/lib/)                        │   │
│  │  ┌───────────┐  ┌────────────┐  ┌───────────┐  ┌─────────────┐  │   │
│  │  │    AI     │  │  Database  │  │   Agent   │  │  Security   │  │   │
│  │  │ Module    │  │  (Neon PG) │  │  (Claude  │  │  (CSRF,     │  │   │
│  │  │(Gemini+  │  │            │  │   SDK)    │  │   Auth)     │  │   │
│  │  │fallbacks)│  │            │  │           │  │             │  │   │
│  │  └────┬─────┘  └─────┬──────┘  └─────┬─────┘  └─────────────┘  │   │
│  └───────┼──────────────┼────────────────┼─────────────────────────┘   │
└──────────┼──────────────┼────────────────┼─────────────────────────────┘
           │              │                │
           ▼              ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Google      │ │ Neon         │ │  Anthropic   │ │ Vercel Blob  │
│  Gemini API  │ │ Postgres     │ │  Claude API  │ │ (Storage)    │
│  (AI/ML)     │ │ (Database)   │ │  (Agent)     │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Replicate   │ │  FAL.ai      │ │  Redis       │
│  (Image      │ │  (Image/     │ │  (BullMQ -   │
│   fallback)  │ │   Video)     │ │  Scheduler)  │
└──────────────┘ └──────────────┘ └──────────────┘
```

---

## 2. Arquitetura do Backend (server/)

```
server/
├── index.mjs ─────────────────── Orchestrator (prod entry, 308 LOC)
├── app.mjs ───────────────────── Express factory (CORS, Helmet, middleware)
├── dev-api.mjs ───────────────── Dev entry point
│
├── middleware/
│   ├── csrfProtection.mjs ────── CSRF validation (Double Submit + HMAC)
│   ├── errorHandler.mjs ──────── Global error handler + 404
│   └── requestLogger.mjs ─────── HTTP request logging (Pino)
│
├── lib/
│   ├── auth.mjs ──────────────── requireAuth, requireSuperAdmin, rate limits
│   ├── better-auth.mjs ──────── Better Auth server config
│   ├── user-resolver.mjs ─────── UUID ↔ Better Auth ID (cached)
│   ├── resource-access.mjs ───── Row-level access control
│   ├── db.mjs ────────────────── Neon PG pool + warmup
│   ├── csrf.mjs ──────────────── CSRF token generation (HMAC-SHA256)
│   ├── logger.mjs ────────────── Pino structured logger
│   │
│   ├── ai/ ───────────────────── AI Module (centralized)
│   │   ├── models.mjs ────────── ★ Single source of truth (model IDs)
│   │   ├── text-generation.mjs ── Provider-agnostic text gen
│   │   ├── image-generation.mjs ─ Gemini native image gen
│   │   ├── video-generation.mjs ─ Veo 3.1 Fast, Sora 2
│   │   ├── clients.mjs ────────── SDK factories
│   │   ├── providers.mjs ──────── Vercel AI SDK wrapper
│   │   ├── image-providers.mjs ── Registry + fallback chain
│   │   ├── prompt-builders.mjs ── Prompt templates (59KB)
│   │   ├── retry.mjs ──────────── Exponential backoff
│   │   ├── providers/
│   │   │   ├── gemini-adapter.mjs
│   │   │   ├── replicate-adapter.mjs
│   │   │   └── fal-adapter.mjs
│   │   └── tools/
│   │       ├── create-image.mjs
│   │       ├── create-logo.mjs
│   │       └── edit-image.mjs
│   │
│   ├── agent/claude/ ─────────── Studio Agent (Claude SDK)
│   │   ├── runner.mjs ─────────── SSE orchestrator
│   │   ├── tool-registry.mjs ──── 30+ studio_* tools
│   │   ├── session-store.mjs ──── Thread persistence
│   │   ├── mcp-bridge.mjs ─────── MCP server interface
│   │   └── message-translator.mjs
│   │
│   ├── errors/
│   │   └── AppError.mjs
│   └── validation/
│       └── contentType.mjs ───── MIME whitelist
│
├── routes/ ───────────────────── 24 Route Modules
│   ├── health.mjs ────────────── GET /api/health, /api/csrf-token
│   ├── admin.mjs ─────────────── GET /api/admin/* (super admin only)
│   ├── init.mjs ──────────────── GET /api/db/init (unified fetch)
│   ├── db-users.mjs ──────────── /api/db/users/*
│   ├── db-brand-profiles.mjs ─── /api/db/brand-profiles/*
│   ├── db-campaigns.mjs ──────── /api/db/campaigns/*
│   ├── db-posts.mjs ──────────── /api/db/posts/*
│   ├── db-gallery.mjs ────────── /api/db/gallery/*
│   ├── db-scheduled-posts.mjs ── /api/db/scheduled-posts/*
│   ├── db-tournaments.mjs ────── /api/db/tournaments/*
│   ├── db-instagram.mjs ──────── /api/db/instagram-accounts/*
│   ├── ai-campaign.mjs ──────── POST /api/ai/campaign
│   ├── ai-text.mjs ──────────── POST /api/ai/text/*
│   ├── ai-image.mjs ─────────── POST /api/ai/image
│   ├── ai-video.mjs ─────────── POST /api/ai/video
│   ├── ai-speech.mjs ─────────── POST /api/ai/speech
│   ├── ai-assistant.mjs ──────── POST /api/ai/assistant
│   ├── image-playground.mjs ──── /api/image-playground/*
│   ├── video-playground.mjs ──── /api/video-playground/*
│   ├── agent-studio.mjs ──────── POST /api/agent/studio/stream
│   ├── upload.mjs ────────────── POST /api/upload
│   ├── generation-jobs.mjs ───── /api/generate/jobs/*
│   ├── rube.mjs ──────────────── /api/rube/* (Instagram pub)
│   └── feedback.mjs ─────────── POST /api/feedback
│
├── helpers/
│   ├── job-queue.mjs ─────────── BullMQ Redis queue
│   ├── scheduled-publisher.mjs ── Instagram auto-publisher
│   ├── usage-tracking.mjs ────── AI cost tracking
│   ├── image-playground.mjs ──── Image gen orchestration (32KB)
│   ├── video-playground.mjs ──── Video gen orchestration
│   ├── campaign-prompts.mjs ──── Campaign prompts
│   └── organization-context.mjs ─ Org helpers
│
└── api/chat/
    ├── route.mjs ─────────────── Vercel AI SDK streaming
    └── schema.mjs ────────────── Chat schemas
```

---

## 3. Arquitetura do Frontend (src/)

```
src/
├── App.tsx ────────────────────── Main orchestrator (2,571 LOC ⚠️)
├── Router.tsx ─────────────────── React Router
├── index.tsx ──────────────────── Entry point
│
├── components/
│   ├── layout/
│   │   └── FloatingSidebar.tsx ── Navigation sidebar
│   │
│   ├── auth/
│   │   ├── AuthWrapper.tsx ────── Auth provider
│   │   ├── SignInForm.tsx ─────── Login form
│   │   ├── SignUpForm.tsx ─────── Register form
│   │   └── OrgSwitcher.tsx ────── Organization selector
│   │
│   ├── dashboard/
│   │   └── Dashboard.tsx ──────── Home dashboard
│   │
│   ├── brand/
│   │   └── BrandProfileSetup.tsx ─ Brand onboarding
│   │
│   ├── campaigns/ ────────────── Campaign management (4 files)
│   ├── tabs/
│   │   ├── ClipsTab.tsx ──────── Video clips list
│   │   ├── PostsTab.tsx ──────── Social posts list
│   │   ├── AdCreativesTab.tsx ── Ad creatives list
│   │   └── clips/
│   │       └── ClipCard.tsx ──── Video clip card (5,500 LOC ⚠️)
│   │
│   ├── image-playground/ ─────── Image generation (8 files)
│   │   ├── ImagePlaygroundPage.tsx
│   │   ├── ConfigPanel.tsx ───── Model/size selection
│   │   ├── PromptInput.tsx
│   │   └── GenerationFeed.tsx
│   │
│   ├── playground/ ───────────── Video generation (5 files)
│   │   ├── PlaygroundView.tsx
│   │   └── VideoCard.tsx
│   │
│   ├── image-preview/ ────────── Image editor (29 files)
│   │   ├── ImageEditor.tsx
│   │   ├── ImagePreviewCanvas.tsx
│   │   ├── edit-panel/
│   │   ├── chat-panel/
│   │   ├── overlay/
│   │   ├── services/
│   │   └── hooks/
│   │
│   ├── carousel/ ─────────────── Carousel builder (13 files)
│   │   ├── CarouselBuilder.tsx
│   │   ├── CarouselSlideEditor.tsx
│   │   └── CarouselPreview.tsx
│   │
│   ├── flyer/ ────────────────── Flyer generator (9 files)
│   │   ├── FlyerGenerator.tsx
│   │   └── FlyerGallery.tsx
│   │
│   ├── calendar/ ─────────────── Scheduler (6 files)
│   │   ├── CalendarView.tsx
│   │   └── SchedulePostModal.tsx
│   │
│   ├── gallery/
│   │   └── GalleryView.tsx ───── Image gallery
│   │
│   ├── studio-agent/ ─────────── Claude Agent UI (3 files)
│   │   └── StudioAgentPanel.tsx
│   │
│   ├── assistant/ ────────────── AI chat (12 files)
│   │   ├── AssistantPanel.tsx
│   │   └── MessageResponse.tsx
│   │
│   ├── admin/ ────────────────── Admin panel (10 files)
│   │   ├── AdminApp.tsx
│   │   └── pages/ (Overview, Users, Orgs, Usage, Logs)
│   │
│   ├── settings/ ─────────────── Settings (3 files)
│   │   ├── SettingsModal.tsx
│   │   └── TeamManagement.tsx
│   │
│   ├── common/ ───────────────── Shared components (20 files)
│   │   ├── Button.tsx (wrapper)
│   │   ├── *PostPreview.tsx ──── Platform previews
│   │   └── QuickPostModal.tsx
│   │
│   └── ui/ ───────────────────── Shadcn/UI primitives (28 files)
│       ├── button.tsx (source of truth)
│       ├── card, dialog, input, select, tabs, etc.
│       └── social-stories.tsx
│
├── stores/ (Zustand) ─────────── Client state
│   ├── uiStore.ts
│   ├── jobsStore.ts
│   ├── imagePlaygroundStore.ts (27KB)
│   ├── videoPlaygroundStore.ts
│   ├── flyerStore.ts (15KB)
│   ├── imagePreviewStore.ts
│   ├── clipsStore.ts
│   ├── carouselStore.ts
│   ├── galleryStore.ts
│   └── feedbackStore.ts
│
├── hooks/ ─────────────────────── Custom hooks
│   ├── useAppData.tsx ─────────── SWR: /api/db/init
│   ├── useAuth.tsx ────────────── Better Auth
│   ├── useAiApi.ts ────────────── AI API calls
│   ├── useImagePlayground.ts
│   ├── useVideoPlayground.ts
│   ├── useStudioAgent.ts ─────── Claude Agent SSE
│   ├── useBackgroundJobs.tsx
│   └── flyer/ (2 hooks)
│
├── services/
│   ├── apiClient.ts (1,726 LOC ⚠️)
│   ├── api/ ──────────────────── Modular API clients
│   │   ├── client.ts ─────────── Base HTTP + CSRF
│   │   ├── dbApi.ts, aiApi.ts
│   │   ├── imagePlayground.ts
│   │   ├── videoPlayground.ts
│   │   ├── studioAgent.ts
│   │   └── types/
│   ├── blobService.ts ────────── Vercel Blob upload
│   ├── geminiService.ts ──────── Gemini (frontend)
│   ├── ocrService.ts ─────────── Tesseract.js OCR
│   └── ffmpeg/ ───────────────── Client-side video processing
│       ├── videoEncoder.ts
│       ├── videoTranscoder.ts
│       └── subtitleBurner.ts
│
├── config/
│   ├── ai-models.ts ──────────── Gemini model definitions
│   └── imageGenerationModelOptions.ts
│
├── lib/
│   ├── auth-client.ts ────────── Better Auth client
│   └── utils.ts ──────────────── cn() class merger
│
├── contexts/
│   └── ChatContext.tsx
│
├── ai-prompts/ ───────────────── Frontend prompt templates
│   ├── carouselPrompts.ts
│   ├── clipsPrompts.ts
│   ├── flyerPrompts.ts
│   └── logoPrompts.ts
│
└── styles/
    └── main.css ──────────────── Tailwind v4 + shadcn theme
```

---

## 4. Pipeline de AI (Fluxo de Geração)

```
                    ┌─────────────────────────┐
                    │     User Request         │
                    │  (text/image/video/flyer)│
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │   Express Route Handler   │
                    │  (ai-text / ai-image /    │
                    │   image-playground / etc.) │
                    └───────────┬──────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
    ┌─────────▼──────┐  ┌──────▼───────┐  ┌──────▼───────┐
    │ Text Generation│  │   Image Gen  │  │  Video Gen   │
    │text-generation │  │image-generat │  │video-generat │
    │    .mjs        │  │   ion.mjs    │  │   ion.mjs    │
    └─────────┬──────┘  └──────┬───────┘  └──────┬───────┘
              │                │                  │
              │         ┌──────▼───────┐          │
              │         │  Provider    │          │
              │         │  Fallback    │          │
              │         │  Chain       │          │
              │         └──────┬───────┘          │
              │                │                  │
    ┌─────────▼──┐  ┌──┬──────▼──────┬──┐  ┌─────▼──────┐
    │  Gemini    │  │  │  Gemini     │  │  │  Veo 3.1   │
    │  (text)    │  │  │  (native)   │  │  │  Fast      │
    │ @google/   │  │  │  image gen  │  │  │            │
    │  genai     │  │  └─────────────┘  │  └────────────┘
    └────────────┘  │  ┌─────────────┐  │
                    │  │  Replicate   │  │
                    │  │ nano-banana  │  │
                    │  │ (Std / Pro)  │  │
                    │  └─────────────┘  │
                    │  ┌─────────────┐  │
                    │  │  FAL.ai     │  │
                    │  │  gemini-3   │  │
                    │  │  pro-image  │  │
                    │  └─────────────┘  │
                    └───────────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │    Vercel Blob Storage    │
                    │  (URLs stored in Neon PG) │
                    └──────────────────────────┘
```

---

## 5. Modelo de Dados (ER Simplificado)

```
┌──────────────┐       ┌──────────────────┐       ┌────────────────┐
│    users     │       │  brand_profiles   │       │   campaigns    │
├──────────────┤       ├──────────────────┤       ├────────────────┤
│ id (UUID)    │──┐    │ id (UUID)        │──┐    │ id (UUID)      │
│ name         │  │    │ user_id (FK)     │  │    │ user_id (FK)   │
│ email        │  │    │ org_id           │  │    │ brand_id (FK)  │
│ avatar_url   │  ├───▶│ brand_name       │  ├───▶│ title          │
│ created_at   │  │    │ logo_url         │  │    │ transcript     │
└──────────────┘  │    │ primary_color    │  │    │ video_url      │
                  │    │ tone_of_voice    │  │    │ status         │
                  │    │ target_audience  │  │    │ type           │
                  │    │ social_links     │  │    └───────┬────────┘
                  │    └──────────────────┘            │
                  │                          ┌─────────┼─────────┐
                  │                          │         │         │
                  │                   ┌──────▼──┐ ┌───▼────┐ ┌──▼──────────┐
                  │                   │  posts  │ │  ads   │ │video_clip   │
                  │                   ├─────────┤ ├────────┤ │  _scripts   │
                  │                   │campaign │ │campaign│ ├─────────────┤
                  │                   │ _id(FK) │ │_id(FK) │ │campaign     │
                  │                   │platform │ │platform│ │ _id(FK)     │
                  │                   │content  │ │headline│ │title        │
                  │                   │image_url│ │body    │ │scenes(JSONB)│
                  │                   └─────────┘ └────────┘ └─────────────┘
                  │
                  │    ┌──────────────────┐       ┌────────────────────┐
                  │    │ gallery_images   │       │ scheduled_posts    │
                  │    ├──────────────────┤       ├────────────────────┤
                  ├───▶│ id (UUID)        │       │ id (UUID)          │
                  │    │ user_id (FK)     │       │ user_id (FK)       │
                  │    │ image_url        │       │ post_id (FK)       │
                  │    │ prompt           │       │ instagram_account  │
                  │    │ model            │       │ scheduled_for      │
                  │    │ provider         │       │ status (enum)      │
                  │    └──────────────────┘       │ published_at       │
                  │                               └────────────────────┘
                  │
                  │    ┌──────────────────┐       ┌────────────────────┐
                  │    │ tournament_events│       │  week_schedules    │
                  │    ├──────────────────┤       ├────────────────────┤
                  ├───▶│ id (UUID)        │◀──────│ id (UUID)          │
                  │    │ user_id (FK)     │       │ user_id (FK)       │
                  │    │ week_id (FK)     │       │ title              │
                  │    │ name, buy_in     │       │ upload_url         │
                  │    │ guaranteed       │       │ flyer_urls (JSONB) │
                  │    │ day_of_week      │       └────────────────────┘
                  │    │ times (JSONB)    │
                  │    └──────────────────┘
                  │
                  │    ┌──────────────────┐       ┌────────────────────┐
                  │    │  chat_sessions   │       │  chat_messages     │
                  │    ├──────────────────┤       ├────────────────────┤
                  └───▶│ id (UUID)        │──────▶│ id (UUID)          │
                       │ user_id (FK)     │       │ session_id (FK)    │
                       │ title            │       │ role               │
                       │ model            │       │ parts (JSONB)      │
                       └──────────────────┘       └────────────────────┘

  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
  │ api_usage_logs   │    │aggregated_usage  │    │ generation_jobs  │
  ├──────────────────┤    ├──────────────────┤    ├──────────────────┤
  │ provider         │    │ date + provider  │    │ id (UUID)        │
  │ model            │    │ + operation      │    │ user_id (FK)     │
  │ operation        │    │ total_cost       │    │ type             │
  │ tokens_in/out    │    │ request_count    │    │ status           │
  │ cost             │    │ avg_latency      │    │ result_url       │
  └──────────────────┘    └──────────────────┘    └──────────────────┘
```

---

## 6. Fluxo de Autenticação e Segurança

```
┌──────────┐     POST /api/auth/sign-in      ┌──────────────┐
│ Browser  │ ───────────────────────────────▶ │ Better Auth  │
│          │                                  │  (server)    │
│          │ ◀─── Set-Cookie: session_token ── │              │
│          │                                  └──────┬───────┘
│          │                                         │
│          │     GET /api/csrf-token                  │ validates
│          │ ───────────────────────────────▶         │ session
│          │ ◀─── Set-Cookie: csrf-token ────         │
│          │ ◀─── JSON { token: "..." }  ────        │
│          │                                  ┌──────▼───────┐
│          │     POST /api/db/posts           │   Express    │
│          │     Cookie: session + csrf       │  Middleware   │
│          │     X-CSRF-Token: "..."          │   Stack      │
│          │ ───────────────────────────────▶ │              │
│          │                                  │ 1. Auth      │
│          │                                  │ 2. CSRF      │
│          │                                  │ 3. Rate Limit│
│          │                                  │ 4. Route     │
│          │ ◀─── 200 OK / 403 Forbidden ──── │              │
└──────────┘                                  └──────────────┘
```

---

## 7. Fluxo de Dados Principal

```
┌─────────┐   /api/db/init    ┌─────────────┐    SQL queries    ┌──────────┐
│ React   │ ────────────────▶ │  Express     │ ────────────────▶ │ Neon     │
│ App     │                   │  init.mjs    │                   │ Postgres │
│         │ ◀──── JSON ─────── │              │ ◀──── rows ────── │          │
│         │  {campaigns,      │              │                   └──────────┘
│         │   posts, gallery, │              │
│         │   brand, events}  │              │
│         │                   └──────────────┘
│         │
│ SWR     │   Optimistic UI
│ cache   │ ─────────────────▶ Update local state immediately
│         │                    ▶ POST/PUT/DELETE to API
│         │                    ▶ Revalidate SWR cache on success
│         │
│ Zustand │   Feature state
│ stores  │ ─────────────────▶ imagePlaygroundStore
│         │                    videoPlaygroundStore
│         │                    flyerStore
│         │                    carouselStore
└─────────┘
```

---

## 8. Studio Agent (Claude SDK)

```
┌─────────────┐     POST /api/agent/studio/stream
│ Frontend    │ ──────────────────────────────────────▶ ┌──────────────┐
│ SSE Client  │                                        │ agent-studio │
│ (studioAgent│ ◀───────── SSE events ──────────────── │    .mjs      │
│  .ts)       │   text_delta, tool_use, tool_result    └──────┬───────┘
└─────────────┘                                               │
                                                              ▼
                                                       ┌──────────────┐
                                                       │  runner.mjs  │
                                                       │  (Claude SDK │
                                                       │   query())   │
                                                       └──────┬───────┘
                                                              │
                                                       ┌──────▼───────┐
                                                       │ MCP Bridge   │
                                                       │ (mcp-bridge  │
                                                       │   .mjs)      │
                                                       └──────┬───────┘
                                                              │
                                                       ┌──────▼───────┐
                                                       │ Tool Registry│
                                                       │ 30+ tools:   │
                                                       │              │
                                                       │ studio_*     │
                                                       ├──────────────┤
                                                       │ generate_img │
                                                       │ edit_image   │
                                                       │ search_gallery│
                                                       │ list_campaigns│
                                                       │ create_post  │
                                                       │ create_video │
                                                       │ get_brand    │
                                                       │ ...          │
                                                       └──────────────┘
```

---

## 9. Features por Área

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SOCIALAB FEATURES                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ Campaigns ──────────────────────────────────────────────────┐   │
│  │  • Upload transcript/video → AI generates full campaign      │   │
│  │  • Posts (Instagram, LinkedIn, Twitter, Facebook)            │   │
│  │  • Ad creatives (Facebook Ads, Google Ads)                   │   │
│  │  • Video clip scripts with scene-by-scene breakdown          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Image Studio ───────────────────────────────────────────────┐   │
│  │  • AI image generation (Gemini / Replicate / FAL.ai)         │   │
│  │  • Image editing (crop, filter, resize, AI-powered)          │   │
│  │  • Style references & prompt history                         │   │
│  │  • Gallery management                                        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Video Studio ───────────────────────────────────────────────┐   │
│  │  • AI video generation (Veo 3.1 Fast)                        │   │
│  │  • Client-side editing (FFmpeg.js)                           │   │
│  │  • Trim, transcode, subtitles, watermark                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Carousel Builder ──────────────────────────────────────────┐   │
│  │  • Multi-slide carousel creation                             │   │
│  │  • AI-generated slide content                                │   │
│  │  • Drag & drop reordering                                    │   │
│  │  • Export for social media                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Flyer Generator ───────────────────────────────────────────┐   │
│  │  • Tournament schedule upload (image/table)                  │   │
│  │  • AI daily flyer generation (forces Pro model)              │   │
│  │  • Event-by-event or period-based generation                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Scheduler & Publishing ────────────────────────────────────┐   │
│  │  • Calendar view (monthly/weekly)                            │   │
│  │  • Instagram auto-publishing (via Rube MCP)                  │   │
│  │  • BullMQ queue for scheduled delivery                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ AI Assistant ───────────────────────────────────────────────┐   │
│  │  • Chat-based marketing assistant                            │   │
│  │  • Vercel AI SDK streaming                                   │   │
│  │  • Tool-augmented responses                                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Studio Agent (Claude) ─────────────────────────────────────┐   │
│  │  • Multi-turn AI creative assistant                          │   │
│  │  • 30+ MCP tools for image/video/content                     │   │
│  │  • SSE streaming with tool visualization                     │   │
│  │  • @mentions for gallery/campaigns/clips/carousels           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Admin Panel ────────────────────────────────────────────────┐   │
│  │  • Usage analytics & cost tracking                           │   │
│  │  • User/organization management                              │   │
│  │  • Activity logs                                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Stack Tecnológica

```
┌────────────────────────────────────────────────────────────────┐
│                         STACK                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  FRONTEND              BACKEND              INFRASTRUCTURE     │
│  ─────────             ───────              ──────────────     │
│  React 19              Express 5            Docker             │
│  TypeScript            Node.js (ESM)        Dokploy            │
│  Vite 7                Bun runtime          Hostinger VPS      │
│  TailwindCSS 4                                                 │
│  Shadcn/UI             DATABASE             STORAGE            │
│  SWR                   ──────────           ───────            │
│  Zustand               Neon Postgres        Vercel Blob        │
│  React Router          Redis (BullMQ)                          │
│                                                                │
│  AI / ML               AUTH                 VIDEO              │
│  ──────                ────                 ─────              │
│  Google Gemini         Better Auth          FFmpeg.js          │
│  Replicate             (self-hosted)        Veo 3.1 Fast       │
│  FAL.ai                Cookie-based         Sora 2             │
│  Claude Agent SDK      Organizations                           │
│  Vercel AI SDK         CSRF (HMAC)                             │
│  Tesseract.js (OCR)                                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```
