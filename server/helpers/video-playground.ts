/**
 * Video Playground API Helpers
 * Handles CRUD operations for topics, sessions, and generations
 */

import type { SqlClient } from "../lib/db.js";
import type { GoogleGenAI } from "@google/genai";

// =============================================================================
// Database Row Types (snake_case from Postgres)
// =============================================================================

interface TopicRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  title: string | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  topic_id: string;
  user_id: string;
  organization_id: string | null;
  model: string;
  prompt: string;
  aspect_ratio: string;
  resolution: string;
  reference_image_url: string | null;
  created_at: string;
}

interface GenerationRow {
  id: string;
  session_id: string;
  user_id: string;
  status: "pending" | "generating" | "success" | "error";
  video_url: string | null;
  duration: number | null;
  error_message: string | null;
  created_at: string;
}

// =============================================================================
// API Response Types (camelCase for frontend)
// =============================================================================

export interface Topic {
  id: string;
  userId: string;
  organizationId: string | null;
  title: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoAsset {
  url: string;
  duration: number | null;
}

export interface Generation {
  id: string;
  sessionId: string;
  userId: string;
  status: "pending" | "generating" | "success" | "error";
  asset: VideoAsset | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  topicId: string;
  userId: string;
  organizationId: string | null;
  model: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  referenceImageUrl: string | null;
  createdAt: string;
  generations: Generation[];
}

// =============================================================================
// Input Types
// =============================================================================

export interface TopicUpdates {
  title?: string | null;
  coverUrl?: string | null;
}

export interface CreateSessionData {
  topicId: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  referenceImageUrl?: string | null;
}

export interface GenerationUpdates {
  status?: "pending" | "generating" | "success" | "error";
  videoUrl?: string | null;
  duration?: number | null;
  errorMessage?: string | null;
}

export interface CreateSessionResult {
  session: Session;
  generation: Generation;
}

// =============================================================================
// Helpers
// =============================================================================

function mapTopic(r: TopicRow | null | undefined): Topic | null {
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

function mapSession(r: SessionRow | null | undefined): Session | null {
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

function mapGeneration(r: GenerationRow | null | undefined): Generation | null {
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

export async function getTopics(
  sql: SqlClient,
  userId: string,
  organizationId: string | null,
): Promise<Topic[]> {
  const orgId = organizationId || null;

  const rows = (orgId
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
      `) as TopicRow[];
  return rows.map(mapTopic).filter((t): t is Topic => t !== null);
}

export async function createTopic(
  sql: SqlClient,
  userId: string,
  organizationId: string | null,
  title: string | null = null,
): Promise<Topic | null> {
  const rows = (await sql`
    INSERT INTO video_generation_topics (user_id, organization_id, title)
    VALUES (${userId}, ${organizationId}, ${title})
    RETURNING *
  `) as TopicRow[];
  return mapTopic(rows[0]);
}

export async function updateTopic(
  sql: SqlClient,
  topicId: string,
  userId: string,
  updates: TopicUpdates,
  organizationId: string | null,
): Promise<Topic | null> {
  const { title, coverUrl } = updates;
  const orgId = organizationId || null;

  const rows = (orgId
    ? await sql`
        UPDATE video_generation_topics
        SET title = COALESCE(${title ?? null}, title), cover_url = COALESCE(${coverUrl ?? null}, cover_url), updated_at = NOW()
        WHERE id = ${topicId} AND organization_id = ${orgId}
        RETURNING *
      `
    : await sql`
        UPDATE video_generation_topics
        SET title = COALESCE(${title ?? null}, title), cover_url = COALESCE(${coverUrl ?? null}, cover_url), updated_at = NOW()
        WHERE id = ${topicId} AND user_id = ${userId}
        RETURNING *
      `) as TopicRow[];
  return mapTopic(rows[0]);
}

export async function deleteTopic(
  sql: SqlClient,
  topicId: string,
  userId: string,
  organizationId: string | null,
): Promise<void> {
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

export async function getSessions(
  sql: SqlClient,
  topicId: string,
  userId: string,
  organizationId: string | null,
  limit: number = 100,
): Promise<Session[]> {
  const orgId = organizationId || null;

  // Get sessions
  const sessionRows = (orgId
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
      `) as SessionRow[];

  if (sessionRows.length === 0) return [];

  // Get generations for all sessions
  const sessionIds = sessionRows.map((s) => s.id);
  const generationRows = (await sql`
    SELECT * FROM video_generations
    WHERE session_id = ANY(${sessionIds})
    ORDER BY created_at ASC
  `) as GenerationRow[];

  // Map generations to sessions
  const generationsBySession: Record<string, Generation[]> = {};
  for (const gen of generationRows) {
    const sessionId = gen.session_id;
    if (!generationsBySession[sessionId]) {
      generationsBySession[sessionId] = [];
    }
    const mapped = mapGeneration(gen);
    if (mapped) {
      generationsBySession[sessionId].push(mapped);
    }
  }

  return sessionRows
    .map((session) => {
      const mapped = mapSession(session);
      if (!mapped) return null;
      return {
        ...mapped,
        generations: generationsBySession[session.id] || [],
      };
    })
    .filter((s): s is Session => s !== null);
}

export async function createSession(
  sql: SqlClient,
  data: CreateSessionData,
  userId: string,
  organizationId: string | null,
): Promise<CreateSessionResult> {
  const { topicId, model, prompt, aspectRatio, resolution, referenceImageUrl } = data;

  // Ensure aspectRatio is a plain string
  const aspectRatioStr = String(aspectRatio || "9:16");
  const resolutionStr = String(resolution || "720p");

  // Structured logging is handled by the route layer

  const sessionRows = (await sql`
    INSERT INTO video_generation_sessions (topic_id, user_id, organization_id, model, prompt, aspect_ratio, resolution, reference_image_url)
    VALUES (${topicId}, ${userId}, ${organizationId}, ${model}, ${prompt}, ${aspectRatioStr}, ${resolutionStr}, ${referenceImageUrl || null})
    RETURNING *
  `) as SessionRow[];
  const session = sessionRows[0];

  if (!session) {
    throw new Error("Failed to create session");
  }

  // Create a pending generation record
  const generationRows = (await sql`
    INSERT INTO video_generations (session_id, user_id, status)
    VALUES (${session.id}, ${userId}, 'pending')
    RETURNING *
  `) as GenerationRow[];
  const generation = generationRows[0];

  // Update topic's updated_at
  await sql`UPDATE video_generation_topics SET updated_at = NOW() WHERE id = ${topicId}`;

  const sessionRow = session as SessionRow | undefined;
  const generationRow = generation as GenerationRow | undefined;
  const mappedSession = mapSession(sessionRow);
  const mappedGeneration = mapGeneration(generationRow);

  if (!mappedSession || !mappedGeneration) {
    throw new Error("Failed to create session or generation");
  }

  return {
    session: { ...mappedSession, generations: [mappedGeneration] },
    generation: mappedGeneration,
  };
}

export async function updateGeneration(
  sql: SqlClient,
  generationId: string,
  updates: GenerationUpdates,
  userId: string,
  organizationId: string | null,
): Promise<Generation | null> {
  const { status, videoUrl, duration, errorMessage } = updates;
  const orgId = organizationId || null;

  const rows = (orgId
    ? await sql`
      UPDATE video_generations g
      SET
        status = COALESCE(${status ?? null}, g.status),
        video_url = COALESCE(${videoUrl ?? null}, g.video_url),
        duration = COALESCE(${duration ?? null}, g.duration),
        error_message = COALESCE(${errorMessage ?? null}, g.error_message)
      FROM video_generation_sessions s
      WHERE g.id = ${generationId}
      AND g.session_id = s.id
      AND s.organization_id = ${orgId}
      RETURNING g.*
    `
    : await sql`
      UPDATE video_generations
      SET
        status = COALESCE(${status ?? null}, status),
        video_url = COALESCE(${videoUrl ?? null}, video_url),
        duration = COALESCE(${duration ?? null}, duration),
        error_message = COALESCE(${errorMessage ?? null}, error_message)
      WHERE id = ${generationId} AND user_id = ${userId}
      RETURNING *
    `) as GenerationRow[];
  return mapGeneration(rows[0]);
}

export async function deleteSession(
  sql: SqlClient,
  sessionId: string,
  userId: string,
  organizationId: string | null,
): Promise<void> {
  const orgId = organizationId || null;
  // Cascade deletes will handle generations
  if (orgId) {
    await sql`DELETE FROM video_generation_sessions WHERE id = ${sessionId} AND organization_id = ${orgId}`;
  } else {
    await sql`DELETE FROM video_generation_sessions WHERE id = ${sessionId} AND user_id = ${userId}`;
  }
}

export async function deleteGeneration(
  sql: SqlClient,
  generationId: string,
  userId: string,
  organizationId: string | null,
): Promise<void> {
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

export async function generateTopicTitle(
  prompts: string[],
  genai: GoogleGenAI,
): Promise<string> {
  if (!prompts || prompts.length === 0) {
    return "Novo projeto de vídeo";
  }

  try {
    const promptsText = prompts.slice(0, 3).join("\n- ");

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

    const text = result.text;
    if (text) {
      return text.trim().slice(0, 50);
    }
  } catch {
    // Title generation is best-effort; fallback below handles failure
  }

  // Fallback
  const firstPrompt = prompts[0];
  return firstPrompt ? firstPrompt.split(" ").slice(0, 4).join(" ") : "Novo projeto de vídeo";
}
