/**
 * Development API Server
 * Runs alongside Vite to handle API routes during development
 */

import express from 'express';
import cors from 'cors';
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const DATABASE_URL = process.env.DATABASE_URL;

function getSql() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  return neon(DATABASE_URL);
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
    const { user_id, id } = req.query;

    if (id) {
      const result = await sql`SELECT * FROM brand_profiles WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    if (user_id) {
      const result = await sql`SELECT * FROM brand_profiles WHERE user_id = ${user_id} AND deleted_at IS NULL LIMIT 1`;
      return res.json(result[0] || null);
    }

    return res.status(400).json({ error: 'user_id or id is required' });
  } catch (error) {
    console.error('[Brand Profiles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/brand-profiles', async (req, res) => {
  console.log('[Brand Profiles API] POST request body:', req.body);
  try {
    const sql = getSql();
    const { user_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice } = req.body;

    if (!user_id || !name) {
      console.log('[Brand Profiles API] Missing fields - user_id:', user_id, 'name:', name);
      return res.status(400).json({ error: 'user_id and name are required' });
    }

    const result = await sql`
      INSERT INTO brand_profiles (user_id, name, description, logo_url, primary_color, secondary_color, tone_of_voice)
      VALUES (${user_id}, ${name}, ${description || null}, ${logo_url || null},
              ${primary_color || '#FFFFFF'}, ${secondary_color || '#000000'}, ${tone_of_voice || 'Profissional'})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('[Brand Profiles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/db/brand-profiles', async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;
    const { name, description, logo_url, primary_color, secondary_color, tone_of_voice } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
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
    console.error('[Brand Profiles API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Gallery Images API
app.get('/api/db/gallery', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, source, limit } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    let query;
    if (source) {
      query = await sql`
        SELECT * FROM gallery_images
        WHERE user_id = ${user_id} AND source = ${source} AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${parseInt(limit) || 50}
      `;
    } else {
      query = await sql`
        SELECT * FROM gallery_images
        WHERE user_id = ${user_id} AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${parseInt(limit) || 50}
      `;
    }

    res.json(query);
  } catch (error) {
    console.error('[Gallery API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/gallery', async (req, res) => {
  console.log('[Gallery API] POST request - user_id:', req.body.user_id, 'source:', req.body.source);
  try {
    const sql = getSql();
    const { user_id, src_url, prompt, source, model, aspect_ratio, image_size } = req.body;

    if (!user_id || !src_url || !source || !model) {
      console.log('[Gallery API] Missing fields - user_id:', user_id, 'src_url:', !!src_url, 'source:', source, 'model:', model);
      return res.status(400).json({ error: 'user_id, src_url, source, and model are required' });
    }

    const result = await sql`
      INSERT INTO gallery_images (user_id, src_url, prompt, source, model, aspect_ratio, image_size)
      VALUES (${user_id}, ${src_url}, ${prompt || null}, ${source}, ${model}, ${aspect_ratio || null}, ${image_size || null})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('[Gallery API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/db/gallery', async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    await sql`UPDATE gallery_images SET deleted_at = NOW() WHERE id = ${id}`;
    res.status(204).end();
  } catch (error) {
    console.error('[Gallery API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Scheduled Posts API
app.get('/api/db/scheduled-posts', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, status, start_date, end_date } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    let query;
    if (status) {
      query = await sql`
        SELECT * FROM scheduled_posts
        WHERE user_id = ${user_id} AND status = ${status}
        ORDER BY scheduled_timestamp ASC
      `;
    } else {
      query = await sql`
        SELECT * FROM scheduled_posts
        WHERE user_id = ${user_id}
        ORDER BY scheduled_timestamp ASC
      `;
    }

    res.json(query);
  } catch (error) {
    console.error('[Scheduled Posts API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/scheduled-posts', async (req, res) => {
  try {
    const sql = getSql();
    const {
      user_id, content_type, content_id, image_url, caption, hashtags,
      scheduled_date, scheduled_time, scheduled_timestamp, timezone,
      platforms, instagram_content_type, created_from
    } = req.body;

    if (!user_id || !image_url || !caption || !scheduled_timestamp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await sql`
      INSERT INTO scheduled_posts (
        user_id, content_type, content_id, image_url, caption, hashtags,
        scheduled_date, scheduled_time, scheduled_timestamp, timezone,
        platforms, instagram_content_type, created_from
      ) VALUES (
        ${user_id}, ${content_type || 'flyer'}, ${content_id || null}, ${image_url}, ${caption},
        ${hashtags || []}, ${scheduled_date}, ${scheduled_time}, ${scheduled_timestamp},
        ${timezone || 'America/Sao_Paulo'}, ${platforms || 'instagram'},
        ${instagram_content_type || 'photo'}, ${created_from || null}
      )
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
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

    // Build dynamic update
    const setClauses = [];
    const values = [];

    if (updates.status !== undefined) setClauses.push('status = $' + (values.push(updates.status)));
    if (updates.published_at !== undefined) setClauses.push('published_at = $' + (values.push(updates.published_at)));
    if (updates.error_message !== undefined) setClauses.push('error_message = $' + (values.push(updates.error_message)));
    if (updates.instagram_media_id !== undefined) setClauses.push('instagram_media_id = $' + (values.push(updates.instagram_media_id)));
    if (updates.publish_attempts !== undefined) setClauses.push('publish_attempts = $' + (values.push(updates.publish_attempts)));
    if (updates.last_publish_attempt !== undefined) setClauses.push('last_publish_attempt = $' + (values.push(updates.last_publish_attempt)));

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
    console.error('[Scheduled Posts API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/db/scheduled-posts', async (req, res) => {
  try {
    const sql = getSql();
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    await sql`DELETE FROM scheduled_posts WHERE id = ${id}`;
    res.status(204).end();
  } catch (error) {
    console.error('[Scheduled Posts API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Campaigns API
app.get('/api/db/campaigns', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await sql`
      SELECT * FROM campaigns
      WHERE user_id = ${user_id} AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    res.json(result);
  } catch (error) {
    console.error('[Campaigns API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/db/campaigns', async (req, res) => {
  try {
    const sql = getSql();
    const { user_id, name, brand_profile_id, input_transcript, generation_options, video_clip_scripts, posts, ad_creatives } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await sql`
      INSERT INTO campaigns (user_id, name, brand_profile_id, input_transcript, generation_options)
      VALUES (${user_id}, ${name || null}, ${brand_profile_id || null}, ${input_transcript || null}, ${JSON.stringify(generation_options) || null})
      RETURNING *
    `;

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('[Campaigns API] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Dev API Server] Running on http://localhost:${PORT}`);
  console.log(`[Dev API Server] Database: ${DATABASE_URL ? 'Connected' : 'NOT CONFIGURED'}`);
});
