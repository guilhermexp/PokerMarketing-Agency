# 02. Modelos de Dados - Schemas e Tipos

> **Schemas PostgreSQL e Tipos TypeScript Completos**
>
> Este documento descreve todos os modelos de dados do sistema de campanhas, incluindo schemas de banco de dados, tipos TypeScript, relacionamentos e exemplos.

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Schemas PostgreSQL](#schemas-postgresql)
3. [Tipos TypeScript](#tipos-typescript)
4. [Relacionamentos](#relacionamentos)
5. [Exemplos de Dados](#exemplos-de-dados)
6. [Validações e Constraints](#validações-e-constraints)

---

## Visão Geral

### Estrutura de Dados

O sistema de campanhas usa dois conjuntos de tipos:

1. **Tipos de Frontend** (`src/types.ts`): Usados na UI e comunicação com IA
2. **Tipos de Database** (`src/services/api/campaignsApi.ts`): Mapeiam diretamente as tabelas PostgreSQL

### Diagrama de Relacionamentos

```
campaigns (1) ───┬──→ (N) video_clip_scripts
                 ├──→ (N) posts
                 ├──→ (N) ad_creatives
                 └──→ (N) carousel_scripts

gallery_images ←──┬── post_id (FK)
                  ├── ad_creative_id (FK)
                  ├── video_script_id (FK)
                  ├── carousel_script_id (FK)
                  └── campaign_id (derived)

users (1) ──→ (N) campaigns
organizations (1) ──→ (N) campaigns
```

---

## Schemas PostgreSQL

### 1. Tabela: `campaigns`

Tabela principal de campanhas.

```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id TEXT,
  name TEXT,
  description TEXT,
  input_transcript TEXT,                    -- Prompt original do usuário
  generation_options JSONB,                 -- Configurações de geração
  status TEXT NOT NULL DEFAULT 'draft',     -- 'draft', 'active', 'archived'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes
  CONSTRAINT campaigns_pkey PRIMARY KEY (id)
);

-- Indexes
CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_campaigns_org_id ON campaigns(organization_id);
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- Row Level Security (RLS)
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_user_policy ON campaigns
  FOR ALL
  USING (
    user_id = current_setting('app.user_id', true)
    OR organization_id = current_setting('app.organization_id', true)
  );
```

**Campos**:

| Campo | Tipo | Nullable | Descrição |
|-------|------|----------|-----------|
| `id` | UUID | NO | Identificador único |
| `user_id` | TEXT | NO | ID do usuário (Clerk) |
| `organization_id` | TEXT | YES | ID da organização (multi-tenant) |
| `name` | TEXT | YES | Nome da campanha |
| `description` | TEXT | YES | Descrição da campanha |
| `input_transcript` | TEXT | YES | Transcript original usado na geração |
| `generation_options` | JSONB | YES | Opções de geração (JSON) |
| `status` | TEXT | NO | Status atual |
| `created_at` | TIMESTAMPTZ | NO | Data de criação |
| `updated_at` | TIMESTAMPTZ | NO | Data de última atualização |

**generation_options (JSONB)**:

```json
{
  "videoClipScripts": { "generate": true, "count": 3 },
  "posts": {
    "instagram": { "generate": true, "count": 2 },
    "linkedin": { "generate": true, "count": 1 },
    "twitter": { "generate": false, "count": 0 },
    "facebook": { "generate": true, "count": 1 }
  },
  "adCreatives": {
    "facebook": { "generate": true, "count": 2 },
    "google": { "generate": true, "count": 1 }
  },
  "carousels": { "generate": true, "count": 1 }
}
```

---

### 2. Tabela: `video_clip_scripts`

Scripts de vídeo clips.

```sql
CREATE TABLE video_clip_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  image_prompt TEXT,                      -- Prompt para thumbnail
  audio_script TEXT,                      -- Script de áudio/narração
  scenes JSONB NOT NULL,                  -- Array de cenas
  thumbnail_url TEXT,                     -- URL do thumbnail gerado
  video_url TEXT,                         -- URL do vídeo gerado (futuro)
  audio_url TEXT,                         -- URL do áudio gerado (futuro)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_video_clips_campaign_id ON video_clip_scripts(campaign_id);
CREATE INDEX idx_video_clips_sort_order ON video_clip_scripts(campaign_id, sort_order);
```

**scenes (JSONB)**:

```json
[
  {
    "scene": 1,
    "visual": "Close-up of a poker chip stack",
    "narration": "Welcome to the ultimate poker experience",
    "duration_seconds": 3,
    "image_url": "https://blob.vercel-storage.com/..."
  },
  {
    "scene": 2,
    "visual": "Wide shot of poker table with players",
    "narration": "Join thousands of players worldwide",
    "duration_seconds": 4,
    "image_url": "https://blob.vercel-storage.com/..."
  }
]
```

---

### 3. Tabela: `posts`

Posts para redes sociais.

```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                 -- 'instagram', 'linkedin', 'twitter', 'facebook'
  content TEXT NOT NULL,                  -- Texto do post
  hashtags TEXT[] NOT NULL DEFAULT '{}',  -- Array de hashtags
  image_prompt TEXT,                      -- Prompt para geração de imagem
  image_url TEXT,                         -- URL da imagem gerada
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT posts_platform_check CHECK (
    platform IN ('instagram', 'linkedin', 'twitter', 'facebook')
  )
);

-- Indexes
CREATE INDEX idx_posts_campaign_id ON posts(campaign_id);
CREATE INDEX idx_posts_platform ON posts(platform);
CREATE INDEX idx_posts_sort_order ON posts(campaign_id, sort_order);
```

**Plataformas suportadas**:
- `instagram` - Aspect ratio 1:1
- `linkedin` - Aspect ratio 1.91:1
- `twitter` - Aspect ratio 16:9
- `facebook` - Aspect ratio 1.91:1

---

### 4. Tabela: `ad_creatives`

Criativos publicitários.

```sql
CREATE TABLE ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                 -- 'facebook', 'google'
  headline TEXT NOT NULL,                 -- Título do anúncio
  body TEXT NOT NULL,                     -- Corpo do anúncio
  cta TEXT NOT NULL,                      -- Call-to-action
  image_prompt TEXT,                      -- Prompt para geração de imagem
  image_url TEXT,                         -- URL da imagem gerada
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ads_platform_check CHECK (
    platform IN ('facebook', 'google')
  )
);

-- Indexes
CREATE INDEX idx_ads_campaign_id ON ad_creatives(campaign_id);
CREATE INDEX idx_ads_platform ON ad_creatives(platform);
CREATE INDEX idx_ads_sort_order ON ad_creatives(campaign_id, sort_order);
```

**Aspect ratio padrão**: 1.91:1 (landscape para anúncios)

---

### 5. Tabela: `carousel_scripts`

Carrosséis para Instagram.

```sql
CREATE TABLE carousel_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  hook TEXT NOT NULL,                     -- Texto de abertura
  cover_prompt TEXT,                      -- Prompt para capa (define estilo visual)
  cover_url TEXT,                         -- URL da capa gerada
  caption TEXT,                           -- Caption do Instagram
  slides JSONB NOT NULL,                  -- Array de slides
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_carousels_campaign_id ON carousel_scripts(campaign_id);
CREATE INDEX idx_carousels_sort_order ON carousel_scripts(campaign_id, sort_order);
```

**slides (JSONB)**:

```json
[
  {
    "slide": 1,
    "visual": "Bold typography with brand colors",
    "text": "5 Tips for Winning Poker",
    "image_url": "https://blob.vercel-storage.com/..."
  },
  {
    "slide": 2,
    "visual": "Poker cards arranged strategically",
    "text": "Tip #1: Know Your Odds",
    "image_url": "https://blob.vercel-storage.com/..."
  }
]
```

**Aspect ratio padrão**: 4:5 (vertical para Instagram)

---

### 6. Tabela: `gallery_images`

Galeria de todas as imagens geradas.

```sql
CREATE TABLE gallery_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id TEXT,
  src TEXT NOT NULL,                      -- URL da imagem
  prompt TEXT,                            -- Prompt usado na geração
  source TEXT NOT NULL,                   -- Origem: 'campaign_post', 'campaign_ad', etc
  model TEXT,                             -- Modelo de IA usado
  aspect_ratio TEXT,                      -- '1:1', '4:5', '16:9', etc
  image_size TEXT,                        -- '1K', '2K', '4K'
  media_type TEXT DEFAULT 'image',        -- 'image', 'video', 'audio'
  duration INTEGER,                       -- Duração em segundos (para vídeos/áudio)

  -- Foreign keys opcionais (para linking)
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  ad_creative_id UUID REFERENCES ad_creatives(id) ON DELETE CASCADE,
  video_script_id UUID REFERENCES video_clip_scripts(id) ON DELETE CASCADE,
  carousel_script_id UUID REFERENCES carousel_scripts(id) ON DELETE CASCADE,
  campaign_id UUID,                       -- Derived via JOINs

  -- Flyer associations
  tournament_event_id UUID,
  week_schedule_id UUID,
  daily_flyer_period TEXT,                -- 'MORNING', 'AFTERNOON', 'NIGHT', 'HIGHLIGHTS'

  -- Publishing
  published_at TIMESTAMPTZ,               -- Data de publicação no Instagram

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT gallery_single_fk CHECK (
    (post_id IS NOT NULL)::integer +
    (ad_creative_id IS NOT NULL)::integer +
    (video_script_id IS NOT NULL)::integer +
    (carousel_script_id IS NOT NULL)::integer +
    (tournament_event_id IS NOT NULL)::integer +
    (week_schedule_id IS NOT NULL)::integer <= 1
  )
);

-- Indexes
CREATE INDEX idx_gallery_user_id ON gallery_images(user_id);
CREATE INDEX idx_gallery_org_id ON gallery_images(organization_id);
CREATE INDEX idx_gallery_post_id ON gallery_images(post_id);
CREATE INDEX idx_gallery_ad_id ON gallery_images(ad_creative_id);
CREATE INDEX idx_gallery_video_id ON gallery_images(video_script_id);
CREATE INDEX idx_gallery_carousel_id ON gallery_images(carousel_script_id);
CREATE INDEX idx_gallery_campaign_id ON gallery_images(campaign_id);
CREATE INDEX idx_gallery_source ON gallery_images(source);
CREATE INDEX idx_gallery_created_at ON gallery_images(created_at DESC);
```

**Valores de `source`**:
- `campaign_post` - Post de campanha
- `campaign_ad` - Anúncio de campanha
- `campaign_clip` - Thumbnail de clip
- `campaign_clip_scene` - Cena de clip
- `carousel_campaign` - Slide de carrossel de campanha
- `carousel_clip` - Slide de carrossel de clip
- `flyer` - Flyer de torneio
- `daily_flyer` - Flyer diário
- `manual_upload` - Upload manual
- `chat_generation` - Gerado via assistant

---

### 7. Tabela: `scheduled_posts`

Posts agendados para publicação.

```sql
CREATE TABLE scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id TEXT,
  type TEXT NOT NULL,                     -- 'flyer', 'campaign_post', 'ad_creative'
  content_id TEXT NOT NULL,               -- ID do conteúdo original
  image_url TEXT NOT NULL,                -- URL da imagem principal
  carousel_image_urls TEXT[],             -- URLs para carrosséis
  caption TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  scheduled_date DATE NOT NULL,           -- Data agendada (YYYY-MM-DD)
  scheduled_time TIME NOT NULL,           -- Hora agendada (HH:mm)
  scheduled_timestamp BIGINT NOT NULL,    -- Unix timestamp
  timezone TEXT NOT NULL DEFAULT 'UTC',
  platforms TEXT NOT NULL,                -- 'instagram', 'facebook', 'both'
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'publishing', 'published', 'failed', 'cancelled'
  published_at BIGINT,                    -- Unix timestamp de publicação
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT scheduled_posts_type_check CHECK (
    type IN ('flyer', 'campaign_post', 'ad_creative')
  ),
  CONSTRAINT scheduled_posts_platforms_check CHECK (
    platforms IN ('instagram', 'facebook', 'both')
  ),
  CONSTRAINT scheduled_posts_status_check CHECK (
    status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')
  )
);

-- Indexes
CREATE INDEX idx_scheduled_user_id ON scheduled_posts(user_id);
CREATE INDEX idx_scheduled_timestamp ON scheduled_posts(scheduled_timestamp);
CREATE INDEX idx_scheduled_status ON scheduled_posts(status);
CREATE INDEX idx_scheduled_date ON scheduled_posts(scheduled_date);
```

---

## Tipos TypeScript

### Frontend Types (`src/types.ts`)

#### 1. MarketingCampaign

```typescript
export interface MarketingCampaign {
  id?: string;                            // Database ID (opcional para novas)
  name?: string;                          // Nome da campanha
  inputTranscript?: string;               // Transcript original
  videoClipScripts: VideoClipScript[];
  posts: Post[];
  adCreatives: AdCreative[];
  carousels: CarouselScript[];
  createdAt?: string;                     // ISO timestamp
  updatedAt?: string;
  generatedWithModel?: string;            // Modelo de IA usado
  toneOfVoiceUsed?: ToneOfVoice;          // Tom aplicado
}
```

#### 2. VideoClipScript

```typescript
export interface VideoClipScript {
  id?: string;                            // Database ID
  title: string;
  hook: string;
  scenes: {
    scene: number;
    visual: string;
    narration: string;
    duration_seconds: number;
    image_url?: string;
  }[];
  image_prompt: string;
  audio_script: string;
  thumbnail_url?: string | null;
}
```

#### 3. Post

```typescript
export interface Post {
  id?: string;                            // Database ID
  platform: "Instagram" | "LinkedIn" | "Twitter" | "Facebook";
  content: string;
  hashtags: string[];
  image_prompt: string;
  image_url?: string | null;
}
```

#### 4. AdCreative

```typescript
export interface AdCreative {
  id?: string;                            // Database ID
  platform: "Facebook" | "Google";
  headline: string;
  body: string;
  cta: string;
  image_prompt: string;
  image_url?: string | null;
}
```

#### 5. CarouselScript

```typescript
export interface CarouselSlide {
  slide: number;
  visual: string;
  text: string;
  image_url?: string;
}

export interface CarouselScript {
  id?: string;                            // Database ID
  title: string;
  hook: string;
  slides: CarouselSlide[];
  cover_prompt: string;
  cover_url?: string | null;
  caption?: string;
}
```

#### 6. GalleryImage

```typescript
export type GalleryMediaType = "image" | "video" | "audio";

export interface GalleryImage {
  id: string;
  src: string;                            // URL da mídia
  prompt?: string;
  source: string;
  model: ImageModel | "video-export" | "tts-generation";
  aspectRatio?: string;
  imageSize?: ImageSize;
  mediaType?: GalleryMediaType;
  duration?: number;                      // Duração (vídeos/áudio)

  // Database linking
  post_id?: string;
  ad_creative_id?: string;
  video_script_id?: string;
  carousel_script_id?: string;
  campaign_id?: string;

  // Flyer linking
  tournament_event_id?: string;
  week_schedule_id?: string;
  daily_flyer_period?: string;

  // Publishing
  published_at?: string;                  // ISO timestamp
  created_at?: string;
}
```

#### 7. GenerationOptions

```typescript
export interface GenerationSetting {
  generate: boolean;
  count: number;
}

export interface GenerationOptions {
  videoClipScripts: GenerationSetting;
  posts: Record<
    "linkedin" | "twitter" | "instagram" | "facebook",
    GenerationSetting
  >;
  adCreatives: Record<"facebook" | "google", GenerationSetting>;
}
```

#### 8. BrandProfile

```typescript
export type ToneOfVoice =
  | "Profissional"
  | "Espirituoso"
  | "Casual"
  | "Inspirador"
  | "Técnico";

export interface BrandProfile {
  name: string;
  description: string;
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  toneOfVoice: ToneOfVoice;
  toneTargets?: ToneTarget[];             // Onde aplicar o tom
  creativeModel?: CreativeModel;          // Modelo de IA padrão
  industry?: string;                      // Indústria/segmento
}
```

---

### Database Types (`src/services/api/campaignsApi.ts`)

#### DbCampaign

```typescript
export interface DbCampaign {
  id: string;
  user_id: string;
  name: string | null;
  description: string | null;
  input_transcript: string | null;
  generation_options: Record<string, unknown> | null;
  status: string;
  created_at: string;
  updated_at: string;

  // Metadata agregada (da query de listagem)
  creator_name?: string | null;
  clips_count?: number;
  posts_count?: number;
  ads_count?: number;
  carousels_count?: number;
  clip_preview_url?: string | null;
  post_preview_url?: string | null;
  ad_preview_url?: string | null;
  posts_breakdown?: Record<string, number>;    // Por plataforma
  ads_breakdown?: Record<string, number>;      // Por plataforma
}
```

#### DbCampaignFull

```typescript
export interface DbCampaignFull extends DbCampaign {
  video_clip_scripts: DbVideoClipScript[];
  posts: DbPost[];
  ad_creatives: DbAdCreative[];
  carousel_scripts: DbCarouselScript[];
}
```

---

## Relacionamentos

### 1. Campaign → Assets (1:N)

Uma campanha contém múltiplos assets:

```typescript
// Query completa de campanha
const campaign: DbCampaignFull = await db.query(`
  SELECT
    c.*,
    (SELECT json_agg(vcs.*) FROM video_clip_scripts vcs WHERE vcs.campaign_id = c.id) as video_clip_scripts,
    (SELECT json_agg(p.*) FROM posts p WHERE p.campaign_id = c.id) as posts,
    (SELECT json_agg(ac.*) FROM ad_creatives ac WHERE ac.campaign_id = c.id) as ad_creatives,
    (SELECT json_agg(cs.*) FROM carousel_scripts cs WHERE cs.campaign_id = c.id) as carousel_scripts
  FROM campaigns c
  WHERE c.id = $1
`);
```

### 2. Assets → Gallery (N:1)

Cada asset pode ter imagens na galeria:

```typescript
// Posts → Gallery
const postImages = gallery.filter(img => img.post_id === post.id);

// Ads → Gallery
const adImages = gallery.filter(img => img.ad_creative_id === ad.id);

// Clips → Gallery (thumbnail)
const clipThumbnail = gallery.find(img => img.video_script_id === clip.id && img.source === 'campaign_clip');

// Clips → Gallery (scenes)
const sceneImages = gallery.filter(img => img.video_script_id === clip.id && img.source === 'campaign_clip_scene');

// Carousels → Gallery (cover + slides)
const carouselImages = gallery.filter(img => img.carousel_script_id === carousel.id);
```

### 3. User/Organization → Campaigns (1:N)

```typescript
// Campanhas do usuário
SELECT * FROM campaigns
WHERE user_id = $1
ORDER BY created_at DESC;

// Campanhas da organização
SELECT * FROM campaigns
WHERE organization_id = $1
ORDER BY created_at DESC;

// Ambos (multi-tenant)
SELECT * FROM campaigns
WHERE user_id = $1
  OR organization_id = $2
ORDER BY created_at DESC;
```

---

## Exemplos de Dados

### Exemplo 1: Campanha Completa

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "user_id": "user_2abc123",
  "organization_id": "org_xyz789",
  "name": "Poker Tournament Promo Q1 2026",
  "description": "Promotional campaign for Q1 poker tournaments",
  "input_transcript": "Create a campaign promoting our upcoming poker tournaments with focus on high stakes and professional players...",
  "generation_options": {
    "videoClipScripts": { "generate": true, "count": 2 },
    "posts": {
      "instagram": { "generate": true, "count": 3 },
      "facebook": { "generate": true, "count": 2 },
      "linkedin": { "generate": false, "count": 0 },
      "twitter": { "generate": true, "count": 1 }
    },
    "adCreatives": {
      "facebook": { "generate": true, "count": 2 },
      "google": { "generate": false, "count": 0 }
    }
  },
  "status": "active",
  "created_at": "2026-01-15T10:30:00Z",
  "updated_at": "2026-01-15T10:35:22Z",

  "video_clip_scripts": [
    {
      "id": "clip_001",
      "campaign_id": "123e4567-e89b-12d3-a456-426614174000",
      "title": "High Stakes Tournament Teaser",
      "hook": "Are you ready for the biggest poker event of the year?",
      "image_prompt": "Dramatic poker table with chips and cards in cinematic lighting",
      "audio_script": "Welcome to the ultimate poker experience...",
      "scenes": [
        {
          "scene": 1,
          "visual": "Close-up of poker chips stacked high",
          "narration": "This season's stakes are higher than ever",
          "duration_seconds": 3,
          "image_url": "https://blob.vercel-storage.com/clip_001_scene_1.png"
        },
        {
          "scene": 2,
          "visual": "Professional players at the table",
          "narration": "Join the best players in the world",
          "duration_seconds": 4,
          "image_url": "https://blob.vercel-storage.com/clip_001_scene_2.png"
        }
      ],
      "thumbnail_url": "https://blob.vercel-storage.com/clip_001_thumb.png",
      "sort_order": 0
    }
  ],

  "posts": [
    {
      "id": "post_001",
      "campaign_id": "123e4567-e89b-12d3-a456-426614174000",
      "platform": "instagram",
      "content": "🎰 The wait is over! Join us for the biggest poker tournament of 2026. Professional players, massive prizes, and unforgettable moments await. Are you in?",
      "hashtags": ["#PokerTournament", "#HighStakes", "#PokerLife", "#CardGames"],
      "image_prompt": "Vibrant poker tournament scene with excited players and dramatic lighting",
      "image_url": "https://blob.vercel-storage.com/post_001.png",
      "sort_order": 0
    }
  ],

  "ad_creatives": [
    {
      "id": "ad_001",
      "campaign_id": "123e4567-e89b-12d3-a456-426614174000",
      "platform": "facebook",
      "headline": "Win Big at the 2026 Poker Championship",
      "body": "Experience the thrill of high-stakes poker. Register now for exclusive early-bird rates and secure your spot at the table.",
      "cta": "Register Now",
      "image_prompt": "Professional poker table setup with championship branding",
      "image_url": "https://blob.vercel-storage.com/ad_001.png",
      "sort_order": 0
    }
  ],

  "carousel_scripts": [
    {
      "id": "carousel_001",
      "campaign_id": "123e4567-e89b-12d3-a456-426614174000",
      "title": "5 Reasons to Join Our Tournament",
      "hook": "Why you can't miss this event",
      "cover_prompt": "Bold typography saying '5 Reasons' with poker theme",
      "cover_url": "https://blob.vercel-storage.com/carousel_001_cover.png",
      "caption": "Here are 5 compelling reasons to join our upcoming poker tournament! Swipe to see all. 👉",
      "slides": [
        {
          "slide": 1,
          "visual": "Professional venue with luxury ambiance",
          "text": "World-Class Venue",
          "image_url": "https://blob.vercel-storage.com/carousel_001_slide_1.png"
        },
        {
          "slide": 2,
          "visual": "Trophy and cash prizes displayed",
          "text": "$100K Prize Pool",
          "image_url": "https://blob.vercel-storage.com/carousel_001_slide_2.png"
        }
      ],
      "sort_order": 0
    }
  ]
}
```

### Exemplo 2: GalleryImage

```json
{
  "id": "gallery_image_001",
  "user_id": "user_2abc123",
  "organization_id": "org_xyz789",
  "src": "https://blob.vercel-storage.com/post_001.png",
  "prompt": "Vibrant poker tournament scene with excited players and dramatic lighting",
  "source": "campaign_post",
  "model": "gemini-3-pro-image-preview",
  "aspect_ratio": "1:1",
  "image_size": "2K",
  "media_type": "image",

  "post_id": "post_001",
  "campaign_id": "123e4567-e89b-12d3-a456-426614174000",

  "published_at": null,
  "created_at": "2026-01-15T10:35:22Z"
}
```

### Exemplo 3: ScheduledPost

```json
{
  "id": "scheduled_001",
  "user_id": "user_2abc123",
  "organization_id": "org_xyz789",
  "type": "campaign_post",
  "content_id": "post_001",
  "image_url": "https://blob.vercel-storage.com/post_001.png",
  "caption": "🎰 The wait is over! Join us for the biggest poker tournament of 2026.",
  "hashtags": ["#PokerTournament", "#HighStakes"],
  "scheduled_date": "2026-01-20",
  "scheduled_time": "14:00",
  "scheduled_timestamp": 1737381600000,
  "timezone": "America/Sao_Paulo",
  "platforms": "instagram",
  "status": "scheduled",
  "created_at": "2026-01-15T10:40:00Z",
  "updated_at": "2026-01-15T10:40:00Z"
}
```

---

## Validações e Constraints

### 1. Check Constraints

```sql
-- Posts: plataformas válidas
ALTER TABLE posts ADD CONSTRAINT posts_platform_check
  CHECK (platform IN ('instagram', 'linkedin', 'twitter', 'facebook'));

-- Ads: plataformas válidas
ALTER TABLE ad_creatives ADD CONSTRAINT ads_platform_check
  CHECK (platform IN ('facebook', 'google'));

-- Gallery: apenas um FK por registro
ALTER TABLE gallery_images ADD CONSTRAINT gallery_single_fk
  CHECK (
    (post_id IS NOT NULL)::integer +
    (ad_creative_id IS NOT NULL)::integer +
    (video_script_id IS NOT NULL)::integer +
    (carousel_script_id IS NOT NULL)::integer <= 1
  );

-- Scheduled posts: status válidos
ALTER TABLE scheduled_posts ADD CONSTRAINT scheduled_posts_status_check
  CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled'));
```

### 2. Foreign Key Cascades

```sql
-- Deletar campanha deleta todos os assets
ALTER TABLE video_clip_scripts
  ADD CONSTRAINT fk_campaign
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

ALTER TABLE posts
  ADD CONSTRAINT fk_campaign
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Deletar post deleta imagens na galeria
ALTER TABLE gallery_images
  ADD CONSTRAINT fk_post
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE;
```

### 3. Not Null Constraints

```sql
-- Campaigns
ALTER TABLE campaigns ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE campaigns ALTER COLUMN status SET NOT NULL;

-- Posts
ALTER TABLE posts ALTER COLUMN platform SET NOT NULL;
ALTER TABLE posts ALTER COLUMN content SET NOT NULL;

-- Gallery
ALTER TABLE gallery_images ALTER COLUMN src SET NOT NULL;
ALTER TABLE gallery_images ALTER COLUMN source SET NOT NULL;
```

### 4. Default Values

```sql
-- Campaigns
ALTER TABLE campaigns ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE campaigns ALTER COLUMN created_at SET DEFAULT NOW();

-- Gallery
ALTER TABLE gallery_images ALTER COLUMN media_type SET DEFAULT 'image';

-- Scheduled posts
ALTER TABLE scheduled_posts ALTER COLUMN status SET DEFAULT 'scheduled';
ALTER TABLE scheduled_posts ALTER COLUMN timezone SET DEFAULT 'UTC';
```

---

## Queries Comuns

### 1. Listar Campanhas com Contagens

```sql
SELECT
  c.id,
  c.name,
  c.status,
  c.created_at,
  COUNT(DISTINCT vcs.id) as clips_count,
  COUNT(DISTINCT p.id) as posts_count,
  COUNT(DISTINCT ac.id) as ads_count,
  COUNT(DISTINCT cs.id) as carousels_count,

  -- Preview URLs (primeira imagem de cada tipo)
  (SELECT gi.src FROM gallery_images gi
   WHERE gi.video_script_id = (SELECT id FROM video_clip_scripts WHERE campaign_id = c.id LIMIT 1)
   LIMIT 1) as clip_preview_url,

  (SELECT gi.src FROM gallery_images gi
   WHERE gi.post_id = (SELECT id FROM posts WHERE campaign_id = c.id LIMIT 1)
   LIMIT 1) as post_preview_url,

  (SELECT gi.src FROM gallery_images gi
   WHERE gi.ad_creative_id = (SELECT id FROM ad_creatives WHERE campaign_id = c.id LIMIT 1)
   LIMIT 1) as ad_preview_url

FROM campaigns c
LEFT JOIN video_clip_scripts vcs ON vcs.campaign_id = c.id
LEFT JOIN posts p ON p.campaign_id = c.id
LEFT JOIN ad_creatives ac ON ac.campaign_id = c.id
LEFT JOIN carousel_scripts cs ON cs.campaign_id = c.id

WHERE c.user_id = $1

GROUP BY c.id
ORDER BY c.created_at DESC
LIMIT 10;
```

### 2. Carregar Campanha Completa

```sql
-- Main campaign
SELECT * FROM campaigns WHERE id = $1;

-- Video clips
SELECT * FROM video_clip_scripts WHERE campaign_id = $1 ORDER BY sort_order;

-- Posts
SELECT * FROM posts WHERE campaign_id = $1 ORDER BY sort_order;

-- Ads
SELECT * FROM ad_creatives WHERE campaign_id = $1 ORDER BY sort_order;

-- Carousels
SELECT * FROM carousel_scripts WHERE campaign_id = $1 ORDER BY sort_order;

-- Gallery images
SELECT * FROM gallery_images
WHERE campaign_id = $1
  OR post_id IN (SELECT id FROM posts WHERE campaign_id = $1)
  OR ad_creative_id IN (SELECT id FROM ad_creatives WHERE campaign_id = $1)
  OR video_script_id IN (SELECT id FROM video_clip_scripts WHERE campaign_id = $1)
  OR carousel_script_id IN (SELECT id FROM carousel_scripts WHERE campaign_id = $1);
```

### 3. Buscar Imagens de Post

```sql
-- Primeiro tenta pela FK direta
SELECT * FROM gallery_images WHERE post_id = $1;

-- Se não encontrar, busca por campaign_id e source
SELECT * FROM gallery_images
WHERE campaign_id = (SELECT campaign_id FROM posts WHERE id = $1)
  AND source = 'campaign_post'
LIMIT 1;
```

---

## Próximos Passos

Leia os documentos relacionados:
- [03_API_REFERENCE.md](./03_API_REFERENCE.md) - Endpoints que manipulam estes dados
- [05_DATABASE_SETUP.md](./05_DATABASE_SETUP.md) - Scripts SQL completos de criação
- [01_ARCHITECTURE.md](./01_ARCHITECTURE.md) - Como os dados fluem no sistema

---

**Última atualização**: 2026-01-18
