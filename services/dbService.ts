import { neon, neonConfig } from '@neondatabase/serverless';

// Configure for serverless environment
neonConfig.fetchConnectionCache = true;

// Database URL from environment
const DATABASE_URL = import.meta.env.VITE_DATABASE_URL || process.env.DATABASE_URL;

// Create SQL query function
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

// Check if database is configured
export function isDatabaseConfigured(): boolean {
  return !!DATABASE_URL && DATABASE_URL.length > 0;
}

// ============================================================================
// Types matching the database schema
// ============================================================================

export interface DbUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  auth_provider: string;
  auth_provider_id: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  deleted_at: string | null;
}

export interface DbBrandProfile {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  tone_of_voice: 'Profissional' | 'Espirituoso' | 'Casual' | 'Inspirador' | 'Técnico';
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbCampaign {
  id: string;
  user_id: string;
  brand_profile_id: string | null;
  name: string | null;
  description: string | null;
  input_transcript: string | null;
  input_product_images: unknown[] | null;
  input_inspiration_images: unknown[] | null;
  generation_options: Record<string, unknown> | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbVideoClipScript {
  id: string;
  campaign_id: string;
  user_id: string;
  title: string;
  hook: string;
  image_prompt: string | null;
  audio_script: string | null;
  scenes: Array<{
    scene: number;
    visual: string;
    narration: string;
    duration_seconds: number;
  }>;
  thumbnail_url: string | null;
  video_url: string | null;
  audio_url: string | null;
  video_model: string | null;
  generation_status: string;
  generation_metadata: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbPost {
  id: string;
  campaign_id: string | null;
  user_id: string;
  platform: 'Instagram' | 'LinkedIn' | 'Twitter' | 'Facebook';
  content: string;
  hashtags: string[];
  image_prompt: string | null;
  image_url: string | null;
  image_model: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  reach_count: number;
  is_published: boolean;
  published_at: string | null;
  external_post_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbAdCreative {
  id: string;
  campaign_id: string | null;
  user_id: string;
  platform: 'Facebook' | 'Google';
  headline: string;
  body: string;
  cta: string;
  image_prompt: string | null;
  image_url: string | null;
  image_model: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  spend_cents: number;
  external_ad_id: string | null;
  external_campaign_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbGalleryImage {
  id: string;
  user_id: string;
  src_url: string;
  prompt: string | null;
  source: 'Post' | 'Anúncio' | 'Clipe' | 'Flyer' | 'Flyer Diário' | 'Logo' | 'Edição';
  model: 'gemini-3-pro-image-preview' | 'imagen-4.0-generate-001';
  aspect_ratio: string | null;
  image_size: '1K' | '2K' | '4K' | null;
  post_id: string | null;
  ad_creative_id: string | null;
  video_script_id: string | null;
  is_style_reference: boolean;
  style_reference_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbScheduledPost {
  id: string;
  user_id: string;
  content_type: 'flyer' | 'campaign_post' | 'ad_creative';
  content_id: string | null;
  image_url: string;
  caption: string;
  hashtags: string[];
  scheduled_date: string;
  scheduled_time: string;
  scheduled_timestamp: string;
  timezone: string;
  platforms: 'instagram' | 'facebook' | 'both';
  instagram_content_type: 'photo' | 'video' | 'reel' | 'story' | 'carousel' | null;
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  published_at: string | null;
  error_message: string | null;
  instagram_media_id: string | null;
  instagram_container_id: string | null;
  publish_attempts: number;
  last_publish_attempt: string | null;
  created_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbTournamentEvent {
  id: string;
  user_id: string;
  week_schedule_id: string | null;
  day_of_week: string;
  name: string;
  game: string | null;
  gtd: string | null;
  buy_in: string | null;
  rebuy: string | null;
  add_on: string | null;
  stack: string | null;
  players: string | null;
  late_reg: string | null;
  minutes: string | null;
  structure: string | null;
  times: Record<string, string>;
  event_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbChatSession {
  id: string;
  user_id: string;
  title: string | null;
  is_active: boolean;
  last_tool_image_url: string | null;
  last_uploaded_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbChatMessage {
  id: string;
  user_id: string;
  session_id: string;
  role: 'user' | 'model';
  parts: unknown[];
  grounding_metadata: Record<string, unknown> | null;
  sequence_number: number;
  created_at: string;
}

// ============================================================================
// User Operations
// ============================================================================

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    SELECT * FROM users
    WHERE email = ${email} AND deleted_at IS NULL
    LIMIT 1
  `;

  return result[0] as DbUser || null;
}

export async function getUserById(id: string): Promise<DbUser | null> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    SELECT * FROM users
    WHERE id = ${id} AND deleted_at IS NULL
    LIMIT 1
  `;

  return result[0] as DbUser || null;
}

export async function createUser(data: {
  email: string;
  name: string;
  avatar_url?: string;
  auth_provider?: string;
  auth_provider_id?: string;
}): Promise<DbUser> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    INSERT INTO users (email, name, avatar_url, auth_provider, auth_provider_id)
    VALUES (${data.email}, ${data.name}, ${data.avatar_url || null}, ${data.auth_provider || 'email'}, ${data.auth_provider_id || null})
    RETURNING *
  `;

  return result[0] as DbUser;
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  if (!sql) throw new Error('Database not configured');

  await sql`
    UPDATE users
    SET last_login_at = NOW()
    WHERE id = ${userId}
  `;
}

// ============================================================================
// Brand Profile Operations
// ============================================================================

export async function getBrandProfile(userId: string): Promise<DbBrandProfile | null> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    SELECT * FROM brand_profiles
    WHERE user_id = ${userId} AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return result[0] as DbBrandProfile || null;
}

export async function createBrandProfile(userId: string, data: {
  name: string;
  description?: string;
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  tone_of_voice: DbBrandProfile['tone_of_voice'];
  settings?: Record<string, unknown>;
}): Promise<DbBrandProfile> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    INSERT INTO brand_profiles (user_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice, settings)
    VALUES (${userId}, ${data.name}, ${data.description || null}, ${data.logo_url || null},
            ${data.primary_color}, ${data.secondary_color}, ${data.tone_of_voice}, ${JSON.stringify(data.settings || {})})
    RETURNING *
  `;

  return result[0] as DbBrandProfile;
}

export async function updateBrandProfile(id: string, data: Partial<Omit<DbBrandProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<DbBrandProfile> {
  if (!sql) throw new Error('Database not configured');

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    setClauses.push('name = $' + (values.length + 1));
    values.push(data.name);
  }
  if (data.description !== undefined) {
    setClauses.push('description = $' + (values.length + 1));
    values.push(data.description);
  }
  if (data.logo_url !== undefined) {
    setClauses.push('logo_url = $' + (values.length + 1));
    values.push(data.logo_url);
  }
  if (data.primary_color !== undefined) {
    setClauses.push('primary_color = $' + (values.length + 1));
    values.push(data.primary_color);
  }
  if (data.secondary_color !== undefined) {
    setClauses.push('secondary_color = $' + (values.length + 1));
    values.push(data.secondary_color);
  }
  if (data.tone_of_voice !== undefined) {
    setClauses.push('tone_of_voice = $' + (values.length + 1));
    values.push(data.tone_of_voice);
  }
  if (data.settings !== undefined) {
    setClauses.push('settings = $' + (values.length + 1));
    values.push(JSON.stringify(data.settings));
  }

  const result = await sql`
    UPDATE brand_profiles
    SET ${sql.unsafe(setClauses.join(', '))}
    WHERE id = ${id}
    RETURNING *
  `;

  return result[0] as DbBrandProfile;
}

// ============================================================================
// Campaign Operations
// ============================================================================

export async function getCampaigns(userId: string, options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<DbCampaign[]> {
  if (!sql) throw new Error('Database not configured');

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  if (options?.status) {
    const result = await sql`
      SELECT * FROM campaigns
      WHERE user_id = ${userId} AND status = ${options.status} AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return result as DbCampaign[];
  }

  const result = await sql`
    SELECT * FROM campaigns
    WHERE user_id = ${userId} AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return result as DbCampaign[];
}

export async function getCampaignById(id: string): Promise<DbCampaign | null> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    SELECT * FROM campaigns
    WHERE id = ${id} AND deleted_at IS NULL
    LIMIT 1
  `;

  return result[0] as DbCampaign || null;
}

export async function createCampaign(userId: string, data: {
  brand_profile_id?: string;
  name?: string;
  description?: string;
  input_transcript?: string;
  input_product_images?: unknown[];
  input_inspiration_images?: unknown[];
  generation_options?: Record<string, unknown>;
  status?: string;
}): Promise<DbCampaign> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    INSERT INTO campaigns (user_id, brand_profile_id, name, description, input_transcript,
                           input_product_images, input_inspiration_images, generation_options, status)
    VALUES (${userId}, ${data.brand_profile_id || null}, ${data.name || null}, ${data.description || null},
            ${data.input_transcript || null}, ${JSON.stringify(data.input_product_images || null)},
            ${JSON.stringify(data.input_inspiration_images || null)}, ${JSON.stringify(data.generation_options || null)},
            ${data.status || 'draft'})
    RETURNING *
  `;

  return result[0] as DbCampaign;
}

export async function updateCampaign(id: string, data: Partial<DbCampaign>): Promise<DbCampaign> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    UPDATE campaigns
    SET name = COALESCE(${data.name}, name),
        description = COALESCE(${data.description}, description),
        status = COALESCE(${data.status}, status)
    WHERE id = ${id}
    RETURNING *
  `;

  return result[0] as DbCampaign;
}

export async function deleteCampaign(id: string): Promise<void> {
  if (!sql) throw new Error('Database not configured');

  await sql`
    UPDATE campaigns
    SET deleted_at = NOW()
    WHERE id = ${id}
  `;
}

// ============================================================================
// Gallery Image Operations
// ============================================================================

export async function getGalleryImages(userId: string, options?: {
  source?: DbGalleryImage['source'];
  limit?: number;
  offset?: number;
}): Promise<DbGalleryImage[]> {
  if (!sql) throw new Error('Database not configured');

  const limit = options?.limit || 100;
  const offset = options?.offset || 0;

  if (options?.source) {
    const result = await sql`
      SELECT * FROM gallery_images
      WHERE user_id = ${userId} AND source = ${options.source} AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return result as DbGalleryImage[];
  }

  const result = await sql`
    SELECT * FROM gallery_images
    WHERE user_id = ${userId} AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return result as DbGalleryImage[];
}

export async function createGalleryImage(userId: string, data: {
  src_url: string;
  prompt?: string;
  source: DbGalleryImage['source'];
  model: DbGalleryImage['model'];
  aspect_ratio?: string;
  image_size?: DbGalleryImage['image_size'];
  post_id?: string;
  ad_creative_id?: string;
  video_script_id?: string;
  is_style_reference?: boolean;
  style_reference_name?: string;
}): Promise<DbGalleryImage> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    INSERT INTO gallery_images (user_id, src_url, prompt, source, model, aspect_ratio, image_size,
                                post_id, ad_creative_id, video_script_id, is_style_reference, style_reference_name)
    VALUES (${userId}, ${data.src_url}, ${data.prompt || null}, ${data.source}, ${data.model},
            ${data.aspect_ratio || null}, ${data.image_size || null}, ${data.post_id || null},
            ${data.ad_creative_id || null}, ${data.video_script_id || null},
            ${data.is_style_reference || false}, ${data.style_reference_name || null})
    RETURNING *
  `;

  return result[0] as DbGalleryImage;
}

export async function deleteGalleryImage(id: string): Promise<void> {
  if (!sql) throw new Error('Database not configured');

  await sql`
    UPDATE gallery_images
    SET deleted_at = NOW()
    WHERE id = ${id}
  `;
}

export async function getStyleReferences(userId: string): Promise<DbGalleryImage[]> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    SELECT * FROM gallery_images
    WHERE user_id = ${userId} AND is_style_reference = TRUE AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;

  return result as DbGalleryImage[];
}

// ============================================================================
// Scheduled Post Operations
// ============================================================================

export async function getScheduledPosts(userId: string, options?: {
  status?: DbScheduledPost['status'];
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<DbScheduledPost[]> {
  if (!sql) throw new Error('Database not configured');

  const limit = options?.limit || 100;

  if (options?.status && options?.startDate && options?.endDate) {
    const result = await sql`
      SELECT * FROM scheduled_posts
      WHERE user_id = ${userId}
        AND status = ${options.status}
        AND scheduled_date >= ${options.startDate}
        AND scheduled_date <= ${options.endDate}
      ORDER BY scheduled_timestamp ASC
      LIMIT ${limit}
    `;
    return result as DbScheduledPost[];
  }

  if (options?.startDate && options?.endDate) {
    const result = await sql`
      SELECT * FROM scheduled_posts
      WHERE user_id = ${userId}
        AND scheduled_date >= ${options.startDate}
        AND scheduled_date <= ${options.endDate}
      ORDER BY scheduled_timestamp ASC
      LIMIT ${limit}
    `;
    return result as DbScheduledPost[];
  }

  if (options?.status) {
    const result = await sql`
      SELECT * FROM scheduled_posts
      WHERE user_id = ${userId} AND status = ${options.status}
      ORDER BY scheduled_timestamp ASC
      LIMIT ${limit}
    `;
    return result as DbScheduledPost[];
  }

  const result = await sql`
    SELECT * FROM scheduled_posts
    WHERE user_id = ${userId}
    ORDER BY scheduled_timestamp ASC
    LIMIT ${limit}
  `;

  return result as DbScheduledPost[];
}

export async function createScheduledPost(userId: string, data: {
  content_type: DbScheduledPost['content_type'];
  content_id?: string;
  image_url: string;
  caption: string;
  hashtags: string[];
  scheduled_date: string;
  scheduled_time: string;
  scheduled_timestamp: string;
  timezone: string;
  platforms: DbScheduledPost['platforms'];
  instagram_content_type?: DbScheduledPost['instagram_content_type'];
  created_from?: string;
}): Promise<DbScheduledPost> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    INSERT INTO scheduled_posts (user_id, content_type, content_id, image_url, caption, hashtags,
                                 scheduled_date, scheduled_time, scheduled_timestamp, timezone,
                                 platforms, instagram_content_type, created_from)
    VALUES (${userId}, ${data.content_type}, ${data.content_id || null}, ${data.image_url},
            ${data.caption}, ${data.hashtags}, ${data.scheduled_date}, ${data.scheduled_time},
            ${data.scheduled_timestamp}, ${data.timezone}, ${data.platforms},
            ${data.instagram_content_type || 'photo'}, ${data.created_from || null})
    RETURNING *
  `;

  return result[0] as DbScheduledPost;
}

export async function updateScheduledPost(id: string, data: Partial<DbScheduledPost>): Promise<DbScheduledPost> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    UPDATE scheduled_posts
    SET status = COALESCE(${data.status}, status),
        published_at = COALESCE(${data.published_at}, published_at),
        error_message = COALESCE(${data.error_message}, error_message),
        instagram_media_id = COALESCE(${data.instagram_media_id}, instagram_media_id),
        instagram_container_id = COALESCE(${data.instagram_container_id}, instagram_container_id),
        publish_attempts = COALESCE(${data.publish_attempts}, publish_attempts),
        last_publish_attempt = COALESCE(${data.last_publish_attempt}, last_publish_attempt)
    WHERE id = ${id}
    RETURNING *
  `;

  return result[0] as DbScheduledPost;
}

export async function deleteScheduledPost(id: string): Promise<void> {
  if (!sql) throw new Error('Database not configured');

  await sql`
    DELETE FROM scheduled_posts
    WHERE id = ${id}
  `;
}

export async function getUpcomingPosts(userId: string, hoursAhead: number = 24): Promise<DbScheduledPost[]> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    SELECT * FROM scheduled_posts
    WHERE user_id = ${userId}
      AND status = 'scheduled'
      AND scheduled_timestamp > NOW()
      AND scheduled_timestamp <= NOW() + INTERVAL '${hoursAhead} hours'
    ORDER BY scheduled_timestamp ASC
  `;

  return result as DbScheduledPost[];
}

// ============================================================================
// Tournament Event Operations
// ============================================================================

export async function getTournamentEvents(userId: string, options?: {
  weekScheduleId?: string;
  dayOfWeek?: string;
}): Promise<DbTournamentEvent[]> {
  if (!sql) throw new Error('Database not configured');

  if (options?.weekScheduleId) {
    const result = await sql`
      SELECT * FROM tournament_events
      WHERE user_id = ${userId} AND week_schedule_id = ${options.weekScheduleId}
      ORDER BY day_of_week, name
    `;
    return result as DbTournamentEvent[];
  }

  if (options?.dayOfWeek) {
    const result = await sql`
      SELECT * FROM tournament_events
      WHERE user_id = ${userId} AND day_of_week = ${options.dayOfWeek}
      ORDER BY name
    `;
    return result as DbTournamentEvent[];
  }

  const result = await sql`
    SELECT * FROM tournament_events
    WHERE user_id = ${userId}
    ORDER BY day_of_week, name
  `;

  return result as DbTournamentEvent[];
}

export async function createTournamentEvent(userId: string, data: Omit<DbTournamentEvent, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<DbTournamentEvent> {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    INSERT INTO tournament_events (user_id, week_schedule_id, day_of_week, name, game, gtd, buy_in,
                                   rebuy, add_on, stack, players, late_reg, minutes, structure, times, event_date)
    VALUES (${userId}, ${data.week_schedule_id}, ${data.day_of_week}, ${data.name}, ${data.game || null},
            ${data.gtd || null}, ${data.buy_in || null}, ${data.rebuy || null}, ${data.add_on || null},
            ${data.stack || null}, ${data.players || null}, ${data.late_reg || null}, ${data.minutes || null},
            ${data.structure || null}, ${JSON.stringify(data.times || {})}, ${data.event_date || null})
    RETURNING *
  `;

  return result[0] as DbTournamentEvent;
}

// ============================================================================
// Analytics Operations
// ============================================================================

export async function getAnalyticsDaily(userId: string, startDate: string, endDate: string) {
  if (!sql) throw new Error('Database not configured');

  const result = await sql`
    SELECT * FROM analytics_daily
    WHERE user_id = ${userId}
      AND date >= ${startDate}
      AND date <= ${endDate}
    ORDER BY date DESC
  `;

  return result;
}

export async function incrementAnalytics(userId: string, date: string, field: string, increment: number = 1) {
  if (!sql) throw new Error('Database not configured');

  await sql`
    INSERT INTO analytics_daily (user_id, date, ${sql.unsafe(field)})
    VALUES (${userId}, ${date}, ${increment})
    ON CONFLICT (user_id, date)
    DO UPDATE SET ${sql.unsafe(field)} = analytics_daily.${sql.unsafe(field)} + ${increment}
  `;
}

// ============================================================================
// Health Check
// ============================================================================

export async function healthCheck(): Promise<boolean> {
  if (!sql) return false;

  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
