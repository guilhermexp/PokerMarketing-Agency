# 05. Configuração do Banco de Dados

> **Scripts SQL completos para setup do PostgreSQL**

---

## Scripts de Criação

### 1. Tabela campaigns

```sql
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id TEXT,
  name TEXT,
  description TEXT,
  input_transcript TEXT,
  generation_options JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_campaigns_org_id ON campaigns(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX idx_campaigns_status ON campaigns(status);
```

### 2. Tabela video_clip_scripts

```sql
CREATE TABLE IF NOT EXISTS video_clip_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  image_prompt TEXT,
  audio_script TEXT,
  scenes JSONB NOT NULL,
  thumbnail_url TEXT,
  video_url TEXT,
  audio_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_video_clips_campaign_id ON video_clip_scripts(campaign_id);
CREATE INDEX idx_video_clips_sort ON video_clip_scripts(campaign_id, sort_order);
```

### 3. Tabela posts

```sql
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'linkedin', 'twitter', 'facebook')),
  content TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  image_prompt TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_campaign_id ON posts(campaign_id);
CREATE INDEX idx_posts_platform ON posts(platform);
CREATE INDEX idx_posts_sort ON posts(campaign_id, sort_order);
```

### 4. Tabela ad_creatives

```sql
CREATE TABLE IF NOT EXISTS ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'google')),
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  cta TEXT NOT NULL,
  image_prompt TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ads_campaign_id ON ad_creatives(campaign_id);
CREATE INDEX idx_ads_platform ON ad_creatives(platform);
CREATE INDEX idx_ads_sort ON ad_creatives(campaign_id, sort_order);
```

### 5. Tabela carousel_scripts

```sql
CREATE TABLE IF NOT EXISTS carousel_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  cover_prompt TEXT,
  cover_url TEXT,
  caption TEXT,
  slides JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_carousels_campaign_id ON carousel_scripts(campaign_id);
CREATE INDEX idx_carousels_sort ON carousel_scripts(campaign_id, sort_order);
```

### 6. Tabela gallery_images

```sql
CREATE TABLE IF NOT EXISTS gallery_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id TEXT,
  src TEXT NOT NULL,
  prompt TEXT,
  source TEXT NOT NULL,
  model TEXT,
  aspect_ratio TEXT,
  image_size TEXT,
  media_type TEXT DEFAULT 'image',
  duration INTEGER,

  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  ad_creative_id UUID REFERENCES ad_creatives(id) ON DELETE CASCADE,
  video_script_id UUID REFERENCES video_clip_scripts(id) ON DELETE CASCADE,
  carousel_script_id UUID REFERENCES carousel_scripts(id) ON DELETE CASCADE,
  campaign_id UUID,

  tournament_event_id UUID,
  week_schedule_id UUID,
  daily_flyer_period TEXT,

  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gallery_user_id ON gallery_images(user_id);
CREATE INDEX idx_gallery_post_id ON gallery_images(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX idx_gallery_ad_id ON gallery_images(ad_creative_id) WHERE ad_creative_id IS NOT NULL;
CREATE INDEX idx_gallery_video_id ON gallery_images(video_script_id) WHERE video_script_id IS NOT NULL;
CREATE INDEX idx_gallery_carousel_id ON gallery_images(carousel_script_id) WHERE carousel_script_id IS NOT NULL;
CREATE INDEX idx_gallery_campaign_id ON gallery_images(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_gallery_source ON gallery_images(source);
CREATE INDEX idx_gallery_created_at ON gallery_images(created_at DESC);
```

### 7. Tabela scheduled_posts

```sql
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  organization_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('flyer', 'campaign_post', 'ad_creative')),
  content_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  carousel_image_urls TEXT[],
  caption TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  scheduled_timestamp BIGINT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  platforms TEXT NOT NULL CHECK (platforms IN ('instagram', 'facebook', 'both')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')
  ),
  published_at BIGINT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_user_id ON scheduled_posts(user_id);
CREATE INDEX idx_scheduled_timestamp ON scheduled_posts(scheduled_timestamp);
CREATE INDEX idx_scheduled_status ON scheduled_posts(status);
CREATE INDEX idx_scheduled_date ON scheduled_posts(scheduled_date);
```

---

## Executar Setup Completo

```bash
# Conectar ao banco
psql $DATABASE_URL

# Executar todas as tabelas
\i create_all_tables.sql
```

---

**Última atualização**: 2026-01-18
