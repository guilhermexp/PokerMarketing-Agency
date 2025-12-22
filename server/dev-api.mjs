/**
 * Development API Server
 * Runs alongside Vite to handle API routes during development
 */

import express from 'express';
import cors from 'cors';
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import {
  resolveOrganizationContext,
  hasPermission,
  generateInviteToken,
  generateSlug,
  PERMISSIONS,
  OrganizationAccessError,
  PermissionDeniedError,
} from './helpers/organization-context.mjs';

config();

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const DATABASE_URL = process.env.DATABASE_URL;

function getSql() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  return neon(DATABASE_URL);
}

// Helper to resolve user ID (handles both Clerk IDs and UUIDs)
// Clerk IDs look like: user_2qyqJjnqMXEGJWJNf9jx86C0oQT
// UUIDs look like: 550e8400-e29b-41d4-a716-446655440000
async function resolveUserId(sql, userId) {
  if (!userId) return null;

  // Check if it's a UUID format (8-4-4-4-12 hex characters)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(userId)) {
    return userId; // Already a UUID
  }

  // It's a Clerk ID - look up the user by auth_provider_id
  const result = await sql`
    SELECT id FROM users
    WHERE auth_provider_id = ${userId}
    AND deleted_at IS NULL
    LIMIT 1
  `;

  if (result.length > 0) {
    return result[0].id;
  }

  // User doesn't exist - return the original ID (will fail on insert, but that's expected)
  console.log('[User Lookup] No user found for auth_provider_id:', userId);
  return null;
}

// Health check
app.get('/api/db/health', async (req, res) => {
  try {
    const sql = getSql();
    await sql`SELECT 1`;
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Users API
app.get('/api/db/users', async (req, res) => {
  try {
    const sql = getSql();
    const { email, id } = req.query;

    if (id) {
      const result = await sql`SELECT * FROM users WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    if (email) {
      const result = await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    return res.status(400).json({ error: 'email or id is required' });
  } catch (error) {
    console.error('[Users API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/users', async (req, res) => {
  console.log('[Users API] POST request body:', req.body);
  try {
    const sql = getSql();
    const { email, name, avatar_url, auth_provider, auth_provider_id } = req.body;

    if (!email || !name) {
      console.log('[Users API] Missing fields - email:', email, 'name:', name);
      return res.status(400).json({ error: 'email and name are required' });
    }

    const existing = await sql`SELECT * FROM users WHERE email = ${email} AND deleted_at IS NULL LIMIT 1`;

    if (existing.length > 0) {
      await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${existing[0].id}`;
      return res.json(existing[0]);
    }

    const result = await sql`
      INSERT INTO users (email, name, avatar_url, auth_provider, auth_provider_id)
      VALUES (${email}, ${name}, ${avatar_url || null}, ${auth_provider || 'email'}, ${auth_provider_id || null})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('[Users API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Brand Profiles API
app.get('/api/db/brand-profiles', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, id, organization_id } = req.query;

    if (id) {
      const result = await sql`SELECT * FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    if (user_id) {
      // Resolve user_id (handles both Clerk IDs and UUIDs)
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (!resolvedUserId) {
        return res.json(null); // No user found, return null
      }

      let result;
      if (organization_id) {
        // Organization context - verify membership
        await resolveOrganizationContext(sql, resolvedUserId, organization_id);
        result = await sql`
          SELECT * FROM brand_profiles
          WHERE organization_id = ${organization_id} AND deleted_at IS NULL
          LIMIT 1
        `;
      } else {
        // Personal context
        result = await sql`
          SELECT * FROM brand_profiles
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
          LIMIT 1
        `;
      }
      return res.json(result[0] || null);
    }

    return res.status(400).json({ error: 'user_id or id is required' });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Brand Profiles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/brand-profiles', async (req, res) => {
  console.log('[Brand Profiles API] POST request body:', req.body);
  try {
    const sql = getSql();
    const { user_id, organization_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice } = req.body;

    if (!user_id || !name) {
      console.log('[Brand Profiles API] Missing fields - user_id:', user_id, 'name:', name);
      return res.status(400).json({ error: 'user_id and name are required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Verify organization membership and permission if organization_id provided
    if (organization_id) {
      const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
      if (!hasPermission(context, PERMISSIONS.MANAGE_BRAND)) {
        return res.status(403).json({ error: 'Permission denied: manage_brand required' });
      }
    }

    const result = await sql`
      INSERT INTO brand_profiles (user_id, organization_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${name}, ${description || null}, ${logo_url || null},
              ${primary_color || '#FFFFFF'}, ${secondary_color || '#000000'}, ${tone_of_voice || 'Profissional'})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Brand Profiles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/db/brand-profiles', async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { user_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    // Get the brand profile to check organization
    const existing = await sql`SELECT organization_id FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL`;
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Brand profile not found' });
    }

    // If profile belongs to an organization, verify permission
    if (existing[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(sql, resolvedUserId, existing[0].organization_id);
        if (!hasPermission(context, PERMISSIONS.MANAGE_BRAND)) {
          return res.status(403).json({ error: 'Permission denied: manage_brand required' });
        }
      }
    }

    const result = await sql`
      UPDATE brand_profiles
      SET name = COALESCE(${name || null}, name),
          description = COALESCE(${description || null}, description),
          logo_url = COALESCE(${logo_url || null}, logo_url),
          primary_color = COALESCE(${primary_color || null}, primary_color),
          secondary_color = COALESCE(${secondary_color || null}, secondary_color),
          tone_of_voice = COALESCE(${tone_of_voice || null}, tone_of_voice)
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Brand Profiles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gallery Images API
app.get('/api/db/gallery', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, source, limit } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]); // No user found, return empty array
    }

    let query;
    const limitNum = parseInt(limit) || 50;

    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      if (source) {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE organization_id = ${organization_id} AND source = ${source} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE organization_id = ${organization_id} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }
    } else {
      // Personal context
      if (source) {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND source = ${source} AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        query = await sql`
          SELECT * FROM gallery_images
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }
    }

    res.json(query);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Gallery API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/gallery', async (req, res) => {
  console.log('[Gallery API] POST request - user_id:', req.body.user_id, 'source:', req.body.source);
  try {
    const sql = getSql();
    const { user_id, organization_id, src_url, prompt, source, model, aspect_ratio, image_size } = req.body;

    if (!user_id || !src_url || !source || !model) {
      console.log('[Gallery API] Missing fields - user_id:', user_id, 'src_url:', !!src_url, 'source:', source, 'model:', model);
      return res.status(400).json({ error: 'user_id, src_url, source, and model are required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Verify organization membership if organization_id provided
    if (organization_id) {
      const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
      if (!hasPermission(context, PERMISSIONS.CREATE_FLYER)) {
        return res.status(403).json({ error: 'Permission denied: create_flyer required' });
      }
    }

    const result = await sql`
      INSERT INTO gallery_images (user_id, organization_id, src_url, prompt, source, model, aspect_ratio, image_size)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${src_url}, ${prompt || null}, ${source}, ${model}, ${aspect_ratio || null}, ${image_size || null})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Gallery API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/db/gallery', async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    // Check if image belongs to an organization and verify permission
    const image = await sql`SELECT organization_id FROM gallery_images WHERE id = ${id} AND deleted_at IS NULL`;
    if (image.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (image[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(sql, resolvedUserId, image[0].organization_id);
        if (!hasPermission(context, PERMISSIONS.DELETE_GALLERY)) {
          return res.status(403).json({ error: 'Permission denied: delete_gallery required' });
        }
      }
    }

    await sql`UPDATE gallery_images SET deleted_at = NOW() WHERE id = ${id}`;
    res.status(204).end();
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Gallery API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Scheduled Posts API
app.get('/api/db/scheduled-posts', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, status, start_date, end_date } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]); // No user found, return empty array
    }

    let query;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      if (status) {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE organization_id = ${organization_id} AND status = ${status}
          ORDER BY scheduled_timestamp ASC
        `;
      } else {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE organization_id = ${organization_id}
          ORDER BY scheduled_timestamp ASC
        `;
      }
    } else {
      // Personal context
      if (status) {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND status = ${status}
          ORDER BY scheduled_timestamp ASC
        `;
      } else {
        query = await sql`
          SELECT * FROM scheduled_posts
          WHERE user_id = ${resolvedUserId} AND organization_id IS NULL
          ORDER BY scheduled_timestamp ASC
        `;
      }
    }

    res.json(query);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Scheduled Posts API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/scheduled-posts', async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id, organization_id, content_type, content_id, image_url, caption, hashtags,
      scheduled_date, scheduled_time, scheduled_timestamp, timezone,
      platforms, instagram_content_type, created_from
    } = req.body;

    console.log('[Scheduled Posts API] POST body:', { user_id, organization_id, content_type, image_url: !!image_url, scheduled_timestamp });

    if (!user_id || !image_url || !scheduled_timestamp || !scheduled_date || !scheduled_time || !platforms) {
      console.log('[Scheduled Posts API] Missing fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Verify organization membership and permission if organization_id provided
    if (organization_id) {
      const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
      if (!hasPermission(context, PERMISSIONS.SCHEDULE_POST)) {
        return res.status(403).json({ error: 'Permission denied: schedule_post required' });
      }
    }

    const result = await sql`
      INSERT INTO scheduled_posts (
        user_id, organization_id, content_type, content_id, image_url, caption, hashtags,
        scheduled_date, scheduled_time, scheduled_timestamp, timezone,
        platforms, instagram_content_type, created_from
      ) VALUES (
        ${resolvedUserId}, ${organization_id || null}, ${content_type || 'flyer'}, ${content_id || null}, ${image_url}, ${caption || ''},
        ${hashtags || []}, ${scheduled_date}, ${scheduled_time}, ${scheduled_timestamp},
        ${timezone || 'America/Sao_Paulo'}, ${platforms || 'instagram'},
        ${instagram_content_type || 'photo'}, ${created_from || null}
      )
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Scheduled Posts API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/db/scheduled-posts', async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    // Check if post belongs to an organization and verify permission
    const post = await sql`SELECT organization_id FROM scheduled_posts WHERE id = ${id}`;
    if (post.length === 0) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    if (post[0].organization_id && updates.user_id) {
      const resolvedUserId = await resolveUserId(sql, updates.user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(sql, resolvedUserId, post[0].organization_id);
        if (!hasPermission(context, PERMISSIONS.SCHEDULE_POST)) {
          return res.status(403).json({ error: 'Permission denied: schedule_post required' });
        }
      }
    }

    // Simple update with raw SQL (not ideal but works for now)
    const result = await sql`
      UPDATE scheduled_posts
      SET status = COALESCE(${updates.status || null}, status),
          published_at = COALESCE(${updates.published_at || null}, published_at),
          error_message = COALESCE(${updates.error_message || null}, error_message),
          instagram_media_id = COALESCE(${updates.instagram_media_id || null}, instagram_media_id),
          publish_attempts = COALESCE(${updates.publish_attempts || null}, publish_attempts),
          last_publish_attempt = COALESCE(${updates.last_publish_attempt || null}, last_publish_attempt)
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Scheduled Posts API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/db/scheduled-posts', async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    // Check if post belongs to an organization and verify permission
    const post = await sql`SELECT organization_id FROM scheduled_posts WHERE id = ${id}`;
    if (post.length === 0) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    if (post[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(sql, resolvedUserId, post[0].organization_id);
        if (!hasPermission(context, PERMISSIONS.SCHEDULE_POST)) {
          return res.status(403).json({ error: 'Permission denied: schedule_post required' });
        }
      }
    }

    await sql`DELETE FROM scheduled_posts WHERE id = ${id}`;
    res.status(204).end();
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Scheduled Posts API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Campaigns API
app.get('/api/db/campaigns', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, id, include_content } = req.query;

    // Get single campaign by ID
    if (id) {
      console.log('[Campaigns API] Fetching campaign by ID:', id, 'include_content:', include_content);

      const result = await sql`
        SELECT * FROM campaigns
        WHERE id = ${id} AND deleted_at IS NULL
        LIMIT 1
      `;

      console.log('[Campaigns API] Campaign found:', result[0] ? 'yes' : 'no');

      if (!result[0]) {
        return res.status(200).json(null);
      }

      // If include_content is true, also fetch video_clip_scripts, posts, and ad_creatives
      if (include_content === 'true') {
        const campaign = result[0];

        const [videoScripts, posts, adCreatives] = await Promise.all([
          sql`
            SELECT * FROM video_clip_scripts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
          sql`
            SELECT * FROM posts
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `,
          sql`
            SELECT * FROM ad_creatives
            WHERE campaign_id = ${id}
            ORDER BY sort_order ASC
          `
        ]);

        console.log('[Campaigns API] Content counts:', videoScripts.length, 'clips,', posts.length, 'posts,', adCreatives.length, 'ads');

        return res.status(200).json({
          ...campaign,
          video_clip_scripts: videoScripts,
          posts: posts,
          ad_creatives: adCreatives,
        });
      }

      return res.status(200).json(result[0]);
    }

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      console.log('[Campaigns API] Could not resolve user_id:', user_id);
      return res.status(200).json([]); // Return empty array if user not found
    }

    let campaigns;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      campaigns = await sql`
        SELECT * FROM campaigns
        WHERE organization_id = ${organization_id} AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
    } else {
      // Personal context
      campaigns = await sql`
        SELECT * FROM campaigns
        WHERE user_id = ${resolvedUserId} AND organization_id IS NULL AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
    }

    // Get counts for each campaign
    const result = await Promise.all(campaigns.map(async (c) => {
      const [clips, posts, ads] = await Promise.all([
        sql`SELECT COUNT(*) as count FROM video_clip_scripts WHERE campaign_id = ${c.id}`,
        sql`SELECT platform, COUNT(*) as count FROM posts WHERE campaign_id = ${c.id} GROUP BY platform`,
        sql`SELECT platform, COUNT(*) as count FROM ad_creatives WHERE campaign_id = ${c.id} GROUP BY platform`
      ]);

      // Build posts breakdown
      const postsBreakdown = {};
      posts.forEach(p => { postsBreakdown[p.platform] = Number(p.count); });

      // Build ads breakdown
      const adsBreakdown = {};
      ads.forEach(a => { adsBreakdown[a.platform] = Number(a.count); });

      return {
        ...c,
        clips_count: Number(clips[0]?.count) || 0,
        posts_count: posts.reduce((sum, p) => sum + Number(p.count), 0),
        ads_count: ads.reduce((sum, a) => sum + Number(a.count), 0),
        posts_breakdown: postsBreakdown,
        ads_breakdown: adsBreakdown,
      };
    }));

    res.json(result);
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Campaigns API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/campaigns', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, name, brand_profile_id, input_transcript, generation_options, status, video_clip_scripts, posts, ad_creatives } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      console.log('[Campaigns API] Could not resolve user_id:', user_id);
      return res.status(400).json({ error: 'User not found. Please ensure user exists before creating campaigns.' });
    }

    // Verify organization membership and permission if organization_id provided
    if (organization_id) {
      const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
      if (!hasPermission(context, PERMISSIONS.CREATE_CAMPAIGN)) {
        return res.status(403).json({ error: 'Permission denied: create_campaign required' });
      }
    }

    // Create campaign
    const result = await sql`
      INSERT INTO campaigns (user_id, organization_id, name, brand_profile_id, input_transcript, generation_options, status)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${name || null}, ${brand_profile_id || null}, ${input_transcript || null}, ${JSON.stringify(generation_options) || null}, ${status || 'draft'})
      RETURNING *
    `;

    const campaign = result[0];

    // Create video clip scripts if provided
    if (video_clip_scripts && Array.isArray(video_clip_scripts)) {
      for (let i = 0; i < video_clip_scripts.length; i++) {
        const script = video_clip_scripts[i];
        await sql`
          INSERT INTO video_clip_scripts (campaign_id, user_id, organization_id, title, hook, image_prompt, audio_script, scenes, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${script.title}, ${script.hook}, ${script.image_prompt || null}, ${script.audio_script || null}, ${JSON.stringify(script.scenes || [])}, ${i})
        `;
      }
    }

    // Create posts if provided
    if (posts && Array.isArray(posts)) {
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        await sql`
          INSERT INTO posts (campaign_id, user_id, organization_id, platform, content, hashtags, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${post.platform}, ${post.content}, ${post.hashtags || []}, ${post.image_prompt || null}, ${i})
        `;
      }
    }

    // Create ad creatives if provided
    if (ad_creatives && Array.isArray(ad_creatives)) {
      for (let i = 0; i < ad_creatives.length; i++) {
        const ad = ad_creatives[i];
        await sql`
          INSERT INTO ad_creatives (campaign_id, user_id, organization_id, platform, headline, body, cta, image_prompt, sort_order)
          VALUES (${campaign.id}, ${resolvedUserId}, ${organization_id || null}, ${ad.platform}, ${ad.headline}, ${ad.body}, ${ad.cta}, ${ad.image_prompt || null}, ${i})
        `;
      }
    }

    console.log('[Campaigns API] Created campaign with', video_clip_scripts?.length || 0, 'clips,', posts?.length || 0, 'posts,', ad_creatives?.length || 0, 'ads');

    res.status(201).json(campaign);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Campaigns API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/db/campaigns', async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    // Check if campaign belongs to an organization and verify permission
    const campaign = await sql`SELECT organization_id FROM campaigns WHERE id = ${id} AND deleted_at IS NULL`;
    if (campaign.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign[0].organization_id && user_id) {
      const resolvedUserId = await resolveUserId(sql, user_id);
      if (resolvedUserId) {
        const context = await resolveOrganizationContext(sql, resolvedUserId, campaign[0].organization_id);
        if (!hasPermission(context, PERMISSIONS.DELETE_CAMPAIGN)) {
          return res.status(403).json({ error: 'Permission denied: delete_campaign required' });
        }
      }
    }

    await sql`
      UPDATE campaigns
      SET deleted_at = NOW()
      WHERE id = ${id}
    `;

    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Campaigns API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API - List all schedules for a user
app.get('/api/db/tournaments/list', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedules: [] }); // No user found
    }

    let schedules;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      schedules = await sql`
        SELECT
          ws.*,
          COUNT(te.id)::int as event_count
        FROM week_schedules ws
        LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
        WHERE ws.organization_id = ${organization_id}
        GROUP BY ws.id
        ORDER BY ws.start_date DESC
      `;
    } else {
      // Personal context
      schedules = await sql`
        SELECT
          ws.*,
          COUNT(te.id)::int as event_count
        FROM week_schedules ws
        LEFT JOIN tournament_events te ON te.week_schedule_id = ws.id
        WHERE ws.user_id = ${resolvedUserId} AND ws.organization_id IS NULL
        GROUP BY ws.id
        ORDER BY ws.start_date DESC
      `;
    }

    res.json({ schedules });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Tournaments API] List Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Tournaments API
app.get('/api/db/tournaments', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, week_schedule_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ schedule: null, events: [] }); // No user found
    }

    // If week_schedule_id is provided, get events for that schedule
    if (week_schedule_id) {
      const events = await sql`
        SELECT * FROM tournament_events
        WHERE week_schedule_id = ${week_schedule_id}
        ORDER BY day_of_week, name
      `;
      return res.json({ events });
    }

    let schedules;
    if (organization_id) {
      // Organization context - verify membership
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);

      schedules = await sql`
        SELECT * FROM week_schedules
        WHERE organization_id = ${organization_id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    } else {
      // Personal context
      schedules = await sql`
        SELECT * FROM week_schedules
        WHERE user_id = ${resolvedUserId} AND organization_id IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
    }

    if (schedules.length === 0) {
      return res.json({ schedule: null, events: [] });
    }

    const schedule = schedules[0];

    // Get events for this schedule
    const events = await sql`
      SELECT * FROM tournament_events
      WHERE week_schedule_id = ${schedule.id}
      ORDER BY day_of_week, name
    `;

    res.json({ schedule, events });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Tournaments API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/tournaments', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, start_date, end_date, filename, events } = req.body;

    if (!user_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'user_id, start_date, and end_date are required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Verify organization membership if organization_id provided
    if (organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    }

    // Create week schedule
    const scheduleResult = await sql`
      INSERT INTO week_schedules (user_id, organization_id, start_date, end_date, filename, original_filename)
      VALUES (${resolvedUserId}, ${organization_id || null}, ${start_date}, ${end_date}, ${filename || null}, ${filename || null})
      RETURNING *
    `;

    const schedule = scheduleResult[0];

    // Create events if provided - using parallel batch inserts for performance
    if (events && Array.isArray(events) && events.length > 0) {
      console.log(`[Tournaments API] Inserting ${events.length} events in parallel batches...`);

      // Process in batches - each batch runs concurrently, batches run sequentially
      const batchSize = 50; // 50 concurrent inserts per batch
      const totalBatches = Math.ceil(events.length / batchSize);

      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        console.log(`[Tournaments API] Processing batch ${batchNum}/${totalBatches} (${batch.length} events)...`);

        // Execute all inserts in this batch concurrently
        await Promise.all(
          batch.map((event) =>
            sql`
              INSERT INTO tournament_events (
                user_id, organization_id, week_schedule_id, day_of_week, name, game, gtd, buy_in,
                rebuy, add_on, stack, players, late_reg, minutes, structure, times, event_date
              )
              VALUES (
                ${resolvedUserId}, ${organization_id || null}, ${schedule.id}, ${event.day}, ${event.name}, ${event.game || null},
                ${event.gtd || null}, ${event.buyIn || null}, ${event.rebuy || null},
                ${event.addOn || null}, ${event.stack || null}, ${event.players || null},
                ${event.lateReg || null}, ${event.minutes || null}, ${event.structure || null},
                ${JSON.stringify(event.times || {})}, ${event.eventDate || null}
              )
            `
          )
        );
      }
      console.log(`[Tournaments API] All ${events.length} events inserted successfully`);
    }

    res.status(201).json({
      schedule,
      eventsCount: events?.length || 0,
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Tournaments API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/db/tournaments', async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id || !user_id) {
      return res.status(400).json({ error: 'id and user_id are required' });
    }

    // Resolve user_id (handles both Clerk IDs and UUIDs)
    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check if schedule belongs to an organization and verify membership
    const schedule = await sql`SELECT organization_id FROM week_schedules WHERE id = ${id}`;
    if (schedule.length > 0 && schedule[0].organization_id) {
      await resolveOrganizationContext(sql, resolvedUserId, schedule[0].organization_id);
    }

    // Delete events first
    await sql`
      DELETE FROM tournament_events
      WHERE week_schedule_id = ${id}
    `;

    // Delete schedule
    await sql`
      DELETE FROM week_schedules
      WHERE id = ${id}
    `;

    res.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Tournaments API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Generation Jobs API (Background Processing)
// Note: In dev mode, QStash callback won't work (needs public URL)
// Jobs are created but will remain in 'queued' status until deployed
// ============================================================================

app.post('/api/generate/queue', async (req, res) => {
  try {
    const sql = getSql();
    const { userId, organizationId, jobType, prompt, config } = req.body;

    if (!userId || !jobType || !prompt || !config) {
      return res.status(400).json({ error: 'Missing required fields: userId, jobType, prompt, config' });
    }

    // Verify organization membership if organizationId provided
    if (organizationId) {
      const resolvedUserId = await resolveUserId(sql, userId);
      if (resolvedUserId) {
        await resolveOrganizationContext(sql, resolvedUserId, organizationId);
      }
    }

    // Create job in database
    const result = await sql`
      INSERT INTO generation_jobs (user_id, organization_id, job_type, prompt, config, status)
      VALUES (${userId}, ${organizationId || null}, ${jobType}, ${prompt}, ${JSON.stringify(config)}, 'queued')
      RETURNING id, created_at
    `;

    const job = result[0];
    console.log(`[Generate Queue] Created job ${job.id} for user ${userId}`);

    // In dev mode, we just return the job ID
    // QStash won't work locally, so jobs will stay in 'queued' status
    // For full testing, deploy to Vercel or use ngrok

    res.json({
      success: true,
      jobId: job.id,
      messageId: 'dev-mode-no-qstash',
      status: 'queued',
      note: 'Dev mode: QStash disabled. Job created but won\'t process automatically. Deploy to Vercel for full functionality.'
    });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Generate Queue] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/generate/status', async (req, res) => {
  try {
    const sql = getSql();
    const { jobId, userId, status: filterStatus, limit } = req.query;

    // Single job query
    if (jobId) {
      const jobs = await sql`
        SELECT
          id, user_id, job_type, status, progress,
          result_url, result_gallery_id, error_message,
          created_at, started_at, completed_at, attempts
        FROM generation_jobs
        WHERE id = ${jobId}
        LIMIT 1
      `;

      if (jobs.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      return res.json(jobs[0]);
    }

    // List jobs for user
    if (userId) {
      let jobs;
      const limitNum = parseInt(limit) || 50;

      if (filterStatus) {
        jobs = await sql`
          SELECT
            id, user_id, job_type, status, progress,
            result_url, result_gallery_id, error_message,
            created_at, started_at, completed_at
          FROM generation_jobs
          WHERE user_id = ${userId} AND status = ${filterStatus}
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      } else {
        jobs = await sql`
          SELECT
            id, user_id, job_type, status, progress,
            result_url, result_gallery_id, error_message,
            created_at, started_at, completed_at
          FROM generation_jobs
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;
      }

      return res.json({ jobs, total: jobs.length });
    }

    return res.status(400).json({ error: 'jobId or userId is required' });
  } catch (error) {
    console.error('[Generate Status] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ORGANIZATIONS API
// ============================================================================

// List organizations for user
app.get('/api/db/organizations', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json([]);
    }

    // Get organizations where user is a member
    const organizations = await sql`
      SELECT
        o.id,
        o.name,
        o.slug,
        o.description,
        o.logo_url,
        o.owner_id,
        o.created_at,
        om.status as member_status,
        r.name as role_name,
        r.permissions,
        (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id AND status = 'active') as member_count
      FROM organizations o
      JOIN organization_members om ON om.organization_id = o.id
      JOIN organization_roles r ON om.role_id = r.id
      WHERE om.user_id = ${resolvedUserId}
        AND om.status = 'active'
        AND o.deleted_at IS NULL
      ORDER BY o.name ASC
    `;

    res.json(organizations);
  } catch (error) {
    console.error('[Organizations API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create organization
app.post('/api/db/organizations', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, name, description, logo_url } = req.body;

    if (!user_id || !name) {
      return res.status(400).json({ error: 'user_id and name are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Generate unique slug
    let slug = generateSlug(name);
    let slugSuffix = 0;
    let uniqueSlug = slug;

    // Check for slug conflicts
    while (true) {
      const existing = await sql`
        SELECT id FROM organizations WHERE slug = ${uniqueSlug} LIMIT 1
      `;
      if (existing.length === 0) break;
      slugSuffix++;
      uniqueSlug = `${slug}-${slugSuffix}`;
    }

    // Create organization (trigger will create default roles and add owner as admin)
    const result = await sql`
      INSERT INTO organizations (name, slug, description, logo_url, owner_id)
      VALUES (${name}, ${uniqueSlug}, ${description || null}, ${logo_url || null}, ${resolvedUserId})
      RETURNING *
    `;

    const org = result[0];
    console.log(`[Organizations API] Created organization ${org.id} for user ${resolvedUserId}`);

    res.status(201).json(org);
  } catch (error) {
    console.error('[Organizations API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update organization
app.put('/api/db/organizations', async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { user_id, name, description, logo_url } = req.body;

    if (!id || !user_id) {
      return res.status(400).json({ error: 'id and user_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check permission
    const context = await resolveOrganizationContext(sql, resolvedUserId, id);
    if (!hasPermission(context, PERMISSIONS.MANAGE_ORGANIZATION)) {
      return res.status(403).json({ error: 'Permission denied: manage_organization required' });
    }

    const result = await sql`
      UPDATE organizations
      SET
        name = COALESCE(${name || null}, name),
        description = COALESCE(${description || null}, description),
        logo_url = COALESCE(${logo_url || null}, logo_url),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organizations API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete organization (soft delete)
app.delete('/api/db/organizations', async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id } = req.query;

    if (!id || !user_id) {
      return res.status(400).json({ error: 'id and user_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Only owner can delete
    const org = await sql`
      SELECT owner_id FROM organizations WHERE id = ${id} AND deleted_at IS NULL
    `;

    if (org.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    if (org[0].owner_id !== resolvedUserId) {
      return res.status(403).json({ error: 'Only the owner can delete the organization' });
    }

    await sql`UPDATE organizations SET deleted_at = NOW() WHERE id = ${id}`;
    res.json({ success: true });
  } catch (error) {
    console.error('[Organizations API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ORGANIZATION MEMBERS API
// ============================================================================

// List members
app.get('/api/db/organizations/members', async (req, res) => {
  try {
    const sql = getSql();
    const { organization_id, user_id } = req.query;

    if (!organization_id || !user_id) {
      return res.status(400).json({ error: 'organization_id and user_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check if user is member
    const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);

    const members = await sql`
      SELECT
        om.id,
        om.user_id,
        om.status,
        om.invited_at,
        om.joined_at,
        u.email,
        u.name,
        u.avatar_url,
        r.id as role_id,
        r.name as role_name,
        r.permissions,
        r.is_system_role,
        ib.name as invited_by_name
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      JOIN organization_roles r ON om.role_id = r.id
      LEFT JOIN users ib ON om.invited_by = ib.id
      WHERE om.organization_id = ${organization_id}
      ORDER BY om.joined_at ASC
    `;

    res.json({ members });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Members API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update member role
app.put('/api/db/organizations/members', async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { user_id, organization_id, role_id, status } = req.body;

    if (!id || !user_id || !organization_id) {
      return res.status(400).json({ error: 'id, user_id, and organization_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check permission
    const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    if (!hasPermission(context, PERMISSIONS.MANAGE_MEMBERS)) {
      return res.status(403).json({ error: 'Permission denied: manage_members required' });
    }

    // Prevent removing the last admin
    if (role_id || status === 'inactive') {
      const admins = await sql`
        SELECT om.id
        FROM organization_members om
        JOIN organization_roles r ON om.role_id = r.id
        WHERE om.organization_id = ${organization_id}
          AND r.name = 'Admin'
          AND om.status = 'active'
          AND om.id != ${id}
      `;

      const targetMember = await sql`
        SELECT r.name as role_name
        FROM organization_members om
        JOIN organization_roles r ON om.role_id = r.id
        WHERE om.id = ${id}
      `;

      if (targetMember[0]?.role_name === 'Admin' && admins.length === 0) {
        return res.status(400).json({ error: 'Cannot remove the last admin' });
      }
    }

    const result = await sql`
      UPDATE organization_members
      SET
        role_id = COALESCE(${role_id || null}, role_id),
        status = COALESCE(${status || null}, status),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Members API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove member
app.delete('/api/db/organizations/members', async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id, organization_id } = req.query;

    if (!id || !user_id || !organization_id) {
      return res.status(400).json({ error: 'id, user_id, and organization_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check permission (or allow self-removal)
    const member = await sql`SELECT user_id FROM organization_members WHERE id = ${id}`;
    const isSelf = member[0]?.user_id === resolvedUserId;

    if (!isSelf) {
      const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
      if (!hasPermission(context, PERMISSIONS.MANAGE_MEMBERS)) {
        return res.status(403).json({ error: 'Permission denied' });
      }
    }

    // Prevent removing the last admin
    const targetMember = await sql`
      SELECT r.name as role_name
      FROM organization_members om
      JOIN organization_roles r ON om.role_id = r.id
      WHERE om.id = ${id}
    `;

    if (targetMember[0]?.role_name === 'Admin') {
      const admins = await sql`
        SELECT COUNT(*) as count
        FROM organization_members om
        JOIN organization_roles r ON om.role_id = r.id
        WHERE om.organization_id = ${organization_id}
          AND r.name = 'Admin'
          AND om.status = 'active'
      `;

      if (Number(admins[0].count) <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin' });
      }
    }

    await sql`DELETE FROM organization_members WHERE id = ${id}`;
    res.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Members API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ORGANIZATION ROLES API
// ============================================================================

// List roles
app.get('/api/db/organizations/roles', async (req, res) => {
  try {
    const sql = getSql();
    const { organization_id, user_id } = req.query;

    if (!organization_id || !user_id) {
      return res.status(400).json({ error: 'organization_id and user_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check if user is member
    await resolveOrganizationContext(sql, resolvedUserId, organization_id);

    const roles = await sql`
      SELECT
        r.*,
        (SELECT COUNT(*) FROM organization_members WHERE role_id = r.id) as member_count
      FROM organization_roles r
      WHERE r.organization_id = ${organization_id}
      ORDER BY r.is_system_role DESC, r.name ASC
    `;

    res.json({ roles });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Roles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create custom role
app.post('/api/db/organizations/roles', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, name, description, permissions } = req.body;

    if (!user_id || !organization_id || !name || !permissions) {
      return res.status(400).json({ error: 'user_id, organization_id, name, and permissions are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check permission
    const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    if (!hasPermission(context, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Permission denied: manage_roles required' });
    }

    const result = await sql`
      INSERT INTO organization_roles (organization_id, name, description, permissions, is_system_role)
      VALUES (${organization_id}, ${name}, ${description || null}, ${JSON.stringify(permissions)}, FALSE)
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Roles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update role
app.put('/api/db/organizations/roles', async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { user_id, organization_id, name, description, permissions } = req.body;

    if (!id || !user_id || !organization_id) {
      return res.status(400).json({ error: 'id, user_id, and organization_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check permission
    const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    if (!hasPermission(context, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Permission denied: manage_roles required' });
    }

    // Don't allow editing system roles (except permissions)
    const role = await sql`SELECT is_system_role FROM organization_roles WHERE id = ${id}`;
    if (role[0]?.is_system_role && name) {
      return res.status(400).json({ error: 'Cannot rename system roles' });
    }

    const result = await sql`
      UPDATE organization_roles
      SET
        name = COALESCE(${name || null}, name),
        description = COALESCE(${description || null}, description),
        permissions = COALESCE(${permissions ? JSON.stringify(permissions) : null}, permissions),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    res.json(result[0]);
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Roles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete role
app.delete('/api/db/organizations/roles', async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id, organization_id } = req.query;

    if (!id || !user_id || !organization_id) {
      return res.status(400).json({ error: 'id, user_id, and organization_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check permission
    const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    if (!hasPermission(context, PERMISSIONS.MANAGE_ROLES)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Don't allow deleting system roles
    const role = await sql`SELECT is_system_role FROM organization_roles WHERE id = ${id}`;
    if (role[0]?.is_system_role) {
      return res.status(400).json({ error: 'Cannot delete system roles' });
    }

    // Check if role has members
    const members = await sql`SELECT COUNT(*) as count FROM organization_members WHERE role_id = ${id}`;
    if (Number(members[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete role with members. Reassign members first.' });
    }

    await sql`DELETE FROM organization_roles WHERE id = ${id}`;
    res.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Roles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ORGANIZATION INVITES API
// ============================================================================

// List invites for organization
app.get('/api/db/organizations/invites', async (req, res) => {
  try {
    const sql = getSql();
    const { organization_id, user_id } = req.query;

    if (!organization_id || !user_id) {
      return res.status(400).json({ error: 'organization_id and user_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check permission
    const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    if (!hasPermission(context, PERMISSIONS.MANAGE_MEMBERS)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const invites = await sql`
      SELECT
        i.*,
        r.name as role_name,
        u.name as invited_by_name
      FROM organization_invites i
      JOIN organization_roles r ON i.role_id = r.id
      JOIN users u ON i.invited_by = u.id
      WHERE i.organization_id = ${organization_id}
        AND i.status = 'pending'
        AND i.expires_at > NOW()
      ORDER BY i.created_at DESC
    `;

    res.json({ invites });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Invites API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create invite
app.post('/api/db/organizations/invites', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, organization_id, email, role_id, expires_in_days = 7 } = req.body;

    if (!user_id || !organization_id || !email || !role_id) {
      return res.status(400).json({ error: 'user_id, organization_id, email, and role_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check permission
    const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    if (!hasPermission(context, PERMISSIONS.MANAGE_MEMBERS)) {
      return res.status(403).json({ error: 'Permission denied: manage_members required' });
    }

    // Check if user is already a member
    const existingMember = await sql`
      SELECT om.id
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = ${organization_id}
        AND u.email = ${email}
    `;

    if (existingMember.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this organization' });
    }

    // Check for pending invite
    const existingInvite = await sql`
      SELECT id FROM organization_invites
      WHERE organization_id = ${organization_id}
        AND email = ${email}
        AND status = 'pending'
        AND expires_at > NOW()
    `;

    if (existingInvite.length > 0) {
      return res.status(400).json({ error: 'A pending invite already exists for this email' });
    }

    const token = generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);

    const result = await sql`
      INSERT INTO organization_invites (organization_id, email, role_id, token, expires_at, invited_by)
      VALUES (${organization_id}, ${email}, ${role_id}, ${token}, ${expiresAt.toISOString()}, ${resolvedUserId})
      RETURNING *
    `;

    console.log(`[Organization Invites API] Created invite for ${email} to organization ${organization_id}`);

    // Get role name for frontend display
    const roleResult = await sql`SELECT name FROM organization_roles WHERE id = ${role_id}`;
    const invite = { ...result[0], role_name: roleResult[0]?.name || 'Unknown' };
    res.status(201).json({ invite });
  } catch (error) {
    if (error instanceof OrganizationAccessError || error instanceof PermissionDeniedError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Invites API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel invite
app.delete('/api/db/organizations/invites', async (req, res) => {
  try {
    const sql = getSql();
    const { id, user_id, organization_id } = req.query;

    if (!id || !user_id || !organization_id) {
      return res.status(400).json({ error: 'id, user_id, and organization_id are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Check permission
    const context = await resolveOrganizationContext(sql, resolvedUserId, organization_id);
    if (!hasPermission(context, PERMISSIONS.MANAGE_MEMBERS)) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    await sql`
      UPDATE organization_invites
      SET status = 'cancelled'
      WHERE id = ${id}
    `;

    res.json({ success: true });
  } catch (error) {
    if (error instanceof OrganizationAccessError) {
      return res.status(403).json({ error: error.message });
    }
    console.error('[Organization Invites API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// USER INVITES API (for accepting/declining)
// ============================================================================

// List invites for user
app.get('/api/db/user/invites', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.json({ invites: [] });
    }

    // Get user's email
    const user = await sql`SELECT email FROM users WHERE id = ${resolvedUserId}`;
    if (user.length === 0) {
      return res.json({ invites: [] });
    }

    const invites = await sql`
      SELECT
        i.*,
        o.name as organization_name,
        o.logo_url as organization_logo,
        r.name as role_name,
        u.name as invited_by_name
      FROM organization_invites i
      JOIN organizations o ON i.organization_id = o.id
      JOIN organization_roles r ON i.role_id = r.id
      JOIN users u ON i.invited_by = u.id
      WHERE i.email = ${user[0].email}
        AND i.status = 'pending'
        AND i.expires_at > NOW()
        AND o.deleted_at IS NULL
      ORDER BY i.created_at DESC
    `;

    res.json({ invites });
  } catch (error) {
    console.error('[User Invites API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Accept invite
app.post('/api/db/organizations/invites/accept', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, token } = req.body;

    if (!user_id || !token) {
      return res.status(400).json({ error: 'user_id and token are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Get user's email
    const user = await sql`SELECT email FROM users WHERE id = ${resolvedUserId}`;
    if (user.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Find the invite
    const invites = await sql`
      SELECT * FROM organization_invites
      WHERE token = ${token}
        AND email = ${user[0].email}
        AND status = 'pending'
        AND expires_at > NOW()
    `;

    if (invites.length === 0) {
      return res.status(404).json({ error: 'Invite not found or expired' });
    }

    const invite = invites[0];

    // Check if already a member
    const existingMember = await sql`
      SELECT id FROM organization_members
      WHERE organization_id = ${invite.organization_id}
        AND user_id = ${resolvedUserId}
    `;

    if (existingMember.length > 0) {
      // Update invite status
      await sql`UPDATE organization_invites SET status = 'accepted', accepted_at = NOW() WHERE id = ${invite.id}`;
      return res.status(400).json({ error: 'Already a member of this organization' });
    }

    // Add as member
    await sql`
      INSERT INTO organization_members (organization_id, user_id, role_id, status, invited_by, joined_at)
      VALUES (${invite.organization_id}, ${resolvedUserId}, ${invite.role_id}, 'active', ${invite.invited_by}, NOW())
    `;

    // Update invite status
    await sql`
      UPDATE organization_invites
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = ${invite.id}
    `;

    console.log(`[User Invites API] User ${resolvedUserId} accepted invite to organization ${invite.organization_id}`);

    // Return the organization info
    const org = await sql`
      SELECT * FROM organizations WHERE id = ${invite.organization_id}
    `;

    res.json({ success: true, organization: org[0] });
  } catch (error) {
    console.error('[User Invites API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Decline invite
app.post('/api/db/organizations/invites/decline', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, token } = req.body;

    if (!user_id || !token) {
      return res.status(400).json({ error: 'user_id and token are required' });
    }

    const resolvedUserId = await resolveUserId(sql, user_id);
    if (!resolvedUserId) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Get user's email
    const user = await sql`SELECT email FROM users WHERE id = ${resolvedUserId}`;
    if (user.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    await sql`
      UPDATE organization_invites
      SET status = 'declined'
      WHERE token = ${token}
        AND email = ${user[0].email}
        AND status = 'pending'
    `;

    res.json({ success: true });
  } catch (error) {
    console.error('[User Invites API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Dev API Server] Running on http://localhost:${PORT}`);
  console.log(`[Dev API Server] Database: ${DATABASE_URL ? 'Connected' : 'NOT CONFIGURED'}`);
});
