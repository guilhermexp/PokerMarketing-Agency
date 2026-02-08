/**
 * Video Playground API Helpers
 * Handles CRUD operations for topics, sessions, and generations
 */

// =============================================================================
// Helpers
// =============================================================================

function mapTopic(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    organizationId: r.organization_id,
    title: r.title,
    coverUrl: r.cover_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapSession(r) {
  if (!r) return null;
  return {
    id: r.id,
    topicId: r.topic_id,
    userId: r.user_id,
    organizationId: r.organization_id,
    model: r.model,
    prompt: r.prompt,
    aspectRatio: r.aspect_ratio,
    resolution: r.resolution,
    referenceImageUrl: r.reference_image_url,
    createdAt: r.created_at,
    generations: [],
  };
}

function mapGeneration(r) {
  if (!r) return null;
  return {
    id: r.id,
    sessionId: r.session_id,
    userId: r.user_id,
    status: r.status,
    asset: r.video_url ? { url: r.video_url, duration: r.duration } : null,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  };
}

// =============================================================================
// Topics
// =============================================================================

export async function getTopics(sql, userId, organizationId) {
  const orgId = organizationId || null;

  const rows = orgId
    ? await sql`
        SELECT * FROM video_generation_topics
        WHERE organization_id = ${orgId}
        ORDER BY updated_at DESC
      `
    : await sql`
        SELECT * FROM video_generation_topics
        WHERE user_id = ${userId}
        AND organization_id IS NULL
        ORDER BY updated_at DESC
      `;
  return rows.map(mapTopic);
}

export async function createTopic(sql, userId, organizationId, title = null) {
  const [r] = await sql`
    INSERT INTO video_generation_topics (user_id, organization_id, title)
    VALUES (${userId}, ${organizationId}, ${title})
    RETURNING *
  `;
  return mapTopic(r);
}

export async function updateTopic(sql, topicId, userId, updates, organizationId) {
  const { title, coverUrl } = updates;
  const orgId = organizationId || null;

  const [topic] = orgId
    ? await sql`
        UPDATE video_generation_topics
        SET title = COALESCE(${title}, title), cover_url = COALESCE(${coverUrl}, cover_url), updated_at = NOW()
        WHERE id = ${topicId} AND organization_id = ${orgId}
        RETURNING *
      `
    : await sql`
        UPDATE video_generation_topics
        SET title = COALESCE(${title}, title), cover_url = COALESCE(${coverUrl}, cover_url), updated_at = NOW()
        WHERE id = ${topicId} AND user_id = ${userId}
        RETURNING *
      `;
  return mapTopic(topic);
}

export async function deleteTopic(sql, topicId, userId, organizationId) {
  const orgId = organizationId || null;
  // Cascade deletes will handle sessions and generations
  if (orgId) {
    await sql`DELETE FROM video_generation_topics WHERE id = ${topicId} AND organization_id = ${orgId}`;
  } else {
    await sql`DELETE FROM video_generation_topics WHERE id = ${topicId} AND user_id = ${userId}`;
  }
}

// =============================================================================
// Sessions
// =============================================================================

export async function getSessions(sql, topicId, userId, organizationId, limit = 100) {
  const orgId = organizationId || null;

  // Get sessions
  const sessionRows = orgId
    ? await sql`
        SELECT * FROM video_generation_sessions
        WHERE topic_id = ${topicId} AND organization_id = ${orgId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT * FROM video_generation_sessions
        WHERE topic_id = ${topicId} AND user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

  if (sessionRows.length === 0) return [];

  // Get generations for all sessions
  const sessionIds = sessionRows.map((s) => s.id);
  const generationRows = await sql`
    SELECT * FROM video_generations
    WHERE session_id = ANY(${sessionIds})
    ORDER BY created_at ASC
  `;

  // Map generations to sessions
  const generationsBySession = {};
  for (const gen of generationRows) {
    if (!generationsBySession[gen.session_id]) {
      generationsBySession[gen.session_id] = [];
    }
    generationsBySession[gen.session_id].push(mapGeneration(gen));
  }

  return sessionRows.map((session) => ({
    ...mapSession(session),
    generations: generationsBySession[session.id] || [],
  }));
}

export async function createSession(sql, data, userId, organizationId) {
  const { topicId, model, prompt, aspectRatio, resolution, referenceImageUrl } = data;

  // Ensure aspectRatio is a plain string
  const aspectRatioStr = String(aspectRatio || '9:16');
  const resolutionStr = String(resolution || '720p');

  console.log('[VideoPlayground] createSession data:', { topicId, model, aspectRatioStr, resolutionStr, userId });

  const [session] = await sql`
    INSERT INTO video_generation_sessions (topic_id, user_id, organization_id, model, prompt, aspect_ratio, resolution, reference_image_url)
    VALUES (${topicId}, ${userId}, ${organizationId}, ${model}, ${prompt}, ${aspectRatioStr}, ${resolutionStr}, ${referenceImageUrl || null})
    RETURNING *
  `;

  // Create a pending generation record
  const [generation] = await sql`
    INSERT INTO video_generations (session_id, user_id, status)
    VALUES (${session.id}, ${userId}, 'pending')
    RETURNING *
  `;

  // Update topic's updated_at
  await sql`UPDATE video_generation_topics SET updated_at = NOW() WHERE id = ${topicId}`;

  return {
    session: { ...mapSession(session), generations: [mapGeneration(generation)] },
    generation: mapGeneration(generation),
  };
}

export async function updateGeneration(sql, generationId, updates) {
  const { status, videoUrl, duration, errorMessage } = updates;

  const [gen] = await sql`
    UPDATE video_generations
    SET
      status = COALESCE(${status}, status),
      video_url = COALESCE(${videoUrl}, video_url),
      duration = COALESCE(${duration}, duration),
      error_message = COALESCE(${errorMessage}, error_message)
    WHERE id = ${generationId}
    RETURNING *
  `;
  return mapGeneration(gen);
}

export async function deleteSession(sql, sessionId, userId, organizationId) {
  const orgId = organizationId || null;
  // Cascade deletes will handle generations
  if (orgId) {
    await sql`DELETE FROM video_generation_sessions WHERE id = ${sessionId} AND organization_id = ${orgId}`;
  } else {
    await sql`DELETE FROM video_generation_sessions WHERE id = ${sessionId} AND user_id = ${userId}`;
  }
}

export async function deleteGeneration(sql, generationId, userId, organizationId) {
  const orgId = organizationId || null;
  if (orgId) {
    await sql`
      DELETE FROM video_generations g
      USING video_generation_sessions s
      WHERE g.id = ${generationId}
      AND g.session_id = s.id
      AND s.organization_id = ${orgId}
    `;
  } else {
    await sql`DELETE FROM video_generations WHERE id = ${generationId} AND user_id = ${userId}`;
  }
}

// =============================================================================
// Utility
// =============================================================================

export async function generateTopicTitle(prompts, genai) {
  if (!prompts || prompts.length === 0) {
    return "Novo projeto de vídeo";
  }

  try {
    const promptsText = prompts.slice(0, 3).join("\n- ");
    const model = genai.models.generateContent;

    const result = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Baseado nestes prompts de geração de vídeo, crie um título curto (3-5 palavras) e descritivo em português para o projeto. Responda APENAS com o título, sem aspas ou formatação.

Prompts:
- ${promptsText}`,
            },
          ],
        },
      ],
    });

    const text = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      return text.trim().slice(0, 50);
    }
  } catch (error) {
    console.error("[VideoPlayground] Generate title error:", error);
  }

  // Fallback
  return prompts[0].split(" ").slice(0, 4).join(" ");
}
