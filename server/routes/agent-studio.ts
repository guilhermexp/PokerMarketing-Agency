import type { Application, Request, Response } from 'express';
import type { SqlClient } from '../lib/db.js';
import { getSql } from '../lib/db.js';
import { getRequestAuthContext } from '../lib/auth.js';
import { resolveUserId } from '../lib/user-resolver.js';
import logger from '../lib/logger.js';
import { runStudioAgentStream, getPendingInteraction, resolvePendingInteraction } from '../lib/agent/claude/runner.js';
import { promisify } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';
import {
  ensureThread,
  getThreadById,
  getThreadByTopic,
  listThreadMessages,
  resetThread,
} from '../lib/agent/claude/session-store.js';

const execFile = promisify(execFileCb);

// ============================================================================
// TYPES
// ============================================================================

type StudioType = 'image' | 'video';
type ContentType = 'gallery' | 'campaign' | 'post' | 'clip' | 'carousel';
type AttachmentType = 'image' | 'video' | 'file';

interface Attachment {
  type: AttachmentType;
  url: string;
  name: string;
  mimeType: string;
}

interface Mention {
  path: string;
}

interface StreamRequestBody {
  studioType?: string;
  topicId?: string;
  message?: string;
  threadId?: string;
  attachments?: unknown[];
  mentions?: unknown[];
}

interface AnswerRequestBody {
  threadId?: string;
  interactionId?: string;
  answer?: string | {
    approved?: boolean;
    optionId?: string;
    text?: string;
    answers?: Record<string, string>;
  };
}

interface ResetRequestBody {
  threadId?: string;
  studioType?: string;
  topicId?: string;
}

interface HistoryQuery {
  studioType?: string;
  topicId?: string;
}

interface ContentSearchQuery {
  type?: string;
  query?: string;
  limit?: string | number;
}

interface FilesQuery {
  query?: string;
  limit?: string | number;
}

interface ContentSearchResult {
  id: string;
  label: string;
  thumbnailUrl?: string;
  type: ContentType;
}

interface ThreadRow {
  id: string;
  claude_session_id: string | null;
  [key: string]: unknown;
}

interface MessageRow {
  id: string;
  role: string;
  payload_json: unknown;
  [key: string]: unknown;
}

// Database row interfaces for content mentions
interface GalleryRow {
  id: string;
  src_url: string;
  prompt: string | null;
  model: string;
}

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
}

interface ClipRow {
  id: string;
  title: string;
  hook: string;
}

interface CarouselRow {
  id: string;
  title: string;
  caption: string | null;
}

// Content search result rows
interface GallerySearchRow {
  id: string;
  label: string | null;
  thumbnail_url: string | null;
  src_url: string;
}

interface CampaignSearchRow {
  id: string;
  label: string | null;
}

interface PostSearchRow {
  id: string;
  label: string;
  thumbnail_url: string | null;
}

interface ClipSearchRow {
  id: string;
  label: string;
  thumbnail_url: string | null;
}

interface CarouselSearchRow {
  id: string;
  label: string;
  thumbnail_url: string | null;
}

// ============================================================================
// HELPERS
// ============================================================================

const CONTENT_MENTION_REGEX = /(?:^|\s)@(gallery|campaign|clip|carousel):([^\s]+)/g;

async function resolveContentMentions(
  sql: SqlClient,
  userId: string,
  organizationId: string | null,
  text: string
): Promise<string | null> {
  const matches = [...text.matchAll(CONTENT_MENTION_REGEX)];
  if (matches.length === 0) return null;

  const ownerCondition = organizationId
    ? sql`organization_id = ${organizationId}`
    : sql`user_id = ${userId} AND organization_id IS NULL`;

  const resolved: string[] = [];
  for (const match of matches) {
    const type = match[1];
    const idOrQuery = match[2];

    try {
      if (type === 'gallery') {
        const rows = await sql`
          SELECT id, src_url, prompt, model FROM gallery_images
          WHERE id::text = ${idOrQuery} AND ${ownerCondition} AND deleted_at IS NULL
          LIMIT 1
        ` as GalleryRow[];
        if (rows[0]) {
          resolved.push(`Imagem da galeria (id: ${rows[0].id}): URL: ${rows[0].src_url}, prompt original: "${rows[0].prompt || 'N/A'}", modelo: ${rows[0].model}`);
        }
      } else if (type === 'campaign') {
        const rows = await sql`
          SELECT id, name, description FROM campaigns
          WHERE id::text = ${idOrQuery} AND ${ownerCondition} AND deleted_at IS NULL
          LIMIT 1
        ` as CampaignRow[];
        if (rows[0]) {
          resolved.push(`Campanha (id: ${rows[0].id}): nome: "${rows[0].name}", descrição: "${rows[0].description || 'N/A'}"`);
        }
      } else if (type === 'clip') {
        const rows = await sql`
          SELECT id, title, hook FROM video_clip_scripts
          WHERE id::text = ${idOrQuery} AND ${ownerCondition}
          LIMIT 1
        ` as ClipRow[];
        if (rows[0]) {
          resolved.push(`Video clip (id: ${rows[0].id}): título: "${rows[0].title}", hook: "${rows[0].hook}"`);
        }
      } else if (type === 'carousel') {
        const rows = await sql`
          SELECT id, title, caption FROM carousel_scripts
          WHERE id::text = ${idOrQuery} AND ${ownerCondition}
          LIMIT 1
        ` as CarouselRow[];
        if (rows[0]) {
          resolved.push(`Carrossel (id: ${rows[0].id}): título: "${rows[0].title}", caption: "${rows[0].caption || 'N/A'}"`);
        }
      }
    } catch {
      // skip unresolvable mentions
    }
  }

  if (resolved.length === 0) return null;
  return `Conteúdo referenciado pelo usuário:\n${resolved.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}

function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}

function isValidStudioType(value: unknown): value is StudioType {
  return typeof value === 'string' && (value === 'image' || value === 'video');
}

function isValidContentType(value: unknown): value is ContentType {
  return typeof value === 'string' && ['gallery', 'campaign', 'post', 'clip', 'carousel'].includes(value);
}

function normalizeAttachment(item: unknown): Attachment | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  const url = typeof obj.url === 'string' ? obj.url : '';
  if (!url) return null;

  let type: AttachmentType = 'file';
  if (typeof obj.type === 'string' && ['image', 'video', 'file'].includes(obj.type)) {
    type = obj.type as AttachmentType;
  }

  return {
    type,
    url,
    name: typeof obj.name === 'string' ? obj.name : '',
    mimeType: typeof obj.mimeType === 'string' ? obj.mimeType : '',
  };
}

function normalizeMention(item: unknown): Mention | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  const path = typeof obj.path === 'string' ? obj.path : '';
  if (!path) return null;

  return { path };
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

export function registerAgentStudioRoutes(app: Application): void {
  // POST /api/agent/studio/stream - Main streaming endpoint for agent interactions
  app.post('/api/agent/studio/stream', async (req: Request, res: Response): Promise<void> => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = (req.body || {}) as StreamRequestBody;
    const { studioType, topicId, message, threadId, attachments, mentions } = body;

    if (!isValidStudioType(studioType)) {
      res.status(400).json({ error: 'studioType inválido. Use image|video.' });
      return;
    }

    if (!topicId || typeof topicId !== 'string') {
      res.status(400).json({ error: 'topicId é obrigatório.' });
      return;
    }

    const safeMessage = typeof message === 'string' ? message.trim() : '';
    const safeAttachments: Attachment[] = Array.isArray(attachments)
      ? attachments
          .map(normalizeAttachment)
          .filter((item): item is Attachment => item !== null)
      : [];
    const safeMentions: Mention[] = Array.isArray(mentions)
      ? mentions
          .map(normalizeMention)
          .filter((item): item is Mention => item !== null)
      : [];

    if (!safeMessage && safeAttachments.length === 0) {
      res.status(400).json({ error: 'message ou attachments é obrigatório.' });
      return;
    }

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);

    if (!userId) {
      res.status(404).json({ error: 'Usuário não encontrado no banco.' });
      return;
    }

    let thread: ThreadRow | null = null;
    if (threadId) {
      thread = await getThreadById({ threadId, userId, organizationId }) as ThreadRow | null;
    }

    if (!thread) {
      thread = await ensureThread({ userId, organizationId, studioType, topicId }) as ThreadRow | null;
    }

    if (!thread) {
      res.status(500).json({ error: 'Falha ao criar/obter thread.' });
      return;
    }

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    // Resolve content mentions (e.g. @gallery:uuid, @campaign:uuid)
    let resolvedMessage = safeMessage;
    if (safeMessage) {
      const contentContext = await resolveContentMentions(sql, userId, organizationId, safeMessage).catch(() => null);
      if (contentContext) {
        resolvedMessage = `${safeMessage}\n\n${contentContext}`;
      }
    }

    setSseHeaders(res);
    res.write(`data: ${JSON.stringify({ type: 'thread', threadId: thread.id, studioType, topicId })}\n\n`);

    // Cast attachments/mentions to match the expected types from runner.ts
    await runStudioAgentStream({
      res,
      sql,
      logger,
      userId,
      organizationId,
      thread,
      message: resolvedMessage,
      attachments: safeAttachments as Parameters<typeof runStudioAgentStream>[0]['attachments'],
      mentions: safeMentions as Parameters<typeof runStudioAgentStream>[0]['mentions'],
      signal: abortController.signal,
      abortController,
    });

    if (!res.writableEnded) res.end();
  });

  // POST /api/agent/studio/answer - Respond to pending agent questions
  app.post('/api/agent/studio/answer', async (req: Request, res: Response): Promise<void> => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = (req.body || {}) as AnswerRequestBody;
    const { threadId, interactionId, answer } = body;

    if (!threadId || typeof threadId !== 'string') {
      res.status(400).json({ error: 'threadId é obrigatório.' });
      return;
    }

    if (!interactionId || typeof interactionId !== 'string') {
      res.status(400).json({ error: 'interactionId é obrigatório.' });
      return;
    }

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);

    if (!userId) {
      res.status(404).json({ error: 'Usuário não encontrado no banco.' });
      return;
    }

    const thread = await getThreadById({ threadId, userId, organizationId });
    if (!thread) {
      res.status(404).json({ error: 'Thread não encontrada.' });
      return;
    }

    const pending = getPendingInteraction(threadId, interactionId);
    if (!pending) {
      res.status(409).json({ error: 'Interação pendente não encontrada ou já respondida.' });
      return;
    }

    const answerObj = typeof answer === 'object' && answer !== null ? answer : null;
    const approved = !(answerObj && answerObj.approved === false);
    const directAnswers = answerObj?.answers && typeof answerObj.answers === 'object'
      ? answerObj.answers
      : null;
    const normalizedAnswer = typeof answer === 'string'
      ? { optionId: '', text: answer.trim() }
      : {
          optionId: answerObj?.optionId ? String(answerObj.optionId) : '',
          text: answerObj?.text ? String(answerObj.text).trim() : '',
        };

    interface QuestionOption {
      id?: string;
      label?: string;
      title?: string;
      description?: string;
    }

    interface Question {
      question?: string;
      options?: QuestionOption[];
    }

    const pendingData = pending as { questions?: Question[] };
    const questions: Question[] = Array.isArray(pendingData.questions) ? pendingData.questions : [];
    const answers: Record<string, string> = directAnswers ? { ...directAnswers } : {};

    if (!directAnswers) {
      for (const question of questions) {
        const questionText = String(question?.question || '');
        if (!questionText) continue;

        const options: QuestionOption[] = Array.isArray(question?.options) ? question.options : [];
        const selected = options.find((opt) => String(opt?.id || '') === normalizedAnswer.optionId);
        const fallbackLabel = normalizedAnswer.optionId || normalizedAnswer.text || 'Confirmado';

        let value = selected?.label ? String(selected.label) : fallbackLabel;
        if (normalizedAnswer.text) {
          value = value && value !== normalizedAnswer.text
            ? `${value}, Other: ${normalizedAnswer.text}`
            : normalizedAnswer.text;
        }

        answers[questionText] = value;
      }
    }

    const resolved = resolvePendingInteraction(threadId, interactionId, approved
      ? {
          approved: true,
          updatedInput: {
            questions,
            answers,
          },
        }
      : {
          approved: false,
          message: 'User skipped questions - proceed with defaults',
        });

    if (!resolved) {
      res.status(409).json({ error: 'Interação já foi resolvida.' });
      return;
    }

    res.json({ ok: true });
  });

  // GET /api/agent/studio/history - Retrieve conversation history for a thread
  app.get('/api/agent/studio/history', async (req: Request, res: Response): Promise<void> => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const query = req.query as HistoryQuery;
    const studioType = String(query.studioType || '');
    const topicId = String(query.topicId || '');

    if (!isValidStudioType(studioType)) {
      res.status(400).json({ error: 'studioType inválido. Use image|video.' });
      return;
    }

    if (!topicId) {
      res.status(400).json({ error: 'topicId é obrigatório.' });
      return;
    }

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);

    if (!userId) {
      res.status(404).json({ error: 'Usuário não encontrado no banco.' });
      return;
    }

    const thread = await getThreadByTopic({
      userId,
      organizationId,
      studioType,
      topicId,
    });

    if (!thread) {
      res.json({ thread: null, messages: [] });
      return;
    }

    const messages = await listThreadMessages({ threadId: thread.id as string, limit: 500 }) as MessageRow[];
    res.json({ thread, messages });
  });

  // GET /api/agent/studio/content-search - Search for content by type
  app.get('/api/agent/studio/content-search', async (req: Request, res: Response): Promise<void> => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const queryParams = req.query as ContentSearchQuery;
    const type = String(queryParams.type || '').trim();
    const searchQuery = String(queryParams.query || '').trim();
    const rawLimit = Number(queryParams.limit || 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 30)) : 10;

    if (!isValidContentType(type)) {
      res.status(400).json({ error: `type inválido. Use: gallery, campaign, post, clip, carousel` });
      return;
    }

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);
    if (!userId) {
      res.status(404).json({ error: 'Usuário não encontrado no banco.' });
      return;
    }

    try {
      const userCondition = organizationId
        ? sql`organization_id = ${organizationId}`
        : sql`user_id = ${userId} AND organization_id IS NULL`;
      const escaped = searchQuery ? searchQuery.replace(/[%_\\]/g, '\\$&') : '';
      const pattern = escaped ? `%${escaped}%` : '%';
      let results: ContentSearchResult[] = [];

      if (type === 'gallery') {
        const rows = await sql`
          SELECT id, prompt AS label, thumbnail_url, src_url
          FROM gallery_images
          WHERE ${userCondition} AND deleted_at IS NULL
            AND (prompt ILIKE ${pattern} OR source ILIKE ${pattern})
          ORDER BY created_at DESC LIMIT ${limit}
        ` as GallerySearchRow[];
        results = rows.map((r) => ({
          id: r.id,
          label: r.label || 'Sem descrição',
          thumbnailUrl: r.thumbnail_url || r.src_url,
          type: 'gallery' as const,
        }));
      } else if (type === 'campaign') {
        const rows = await sql`
          SELECT id, name AS label
          FROM campaigns
          WHERE ${userCondition} AND deleted_at IS NULL AND name ILIKE ${pattern}
          ORDER BY created_at DESC LIMIT ${limit}
        ` as CampaignSearchRow[];
        results = rows.map((r) => ({ id: r.id, label: r.label || 'Campanha', type: 'campaign' as const }));
      } else if (type === 'post') {
        const rows = await sql`
          SELECT p.id, CONCAT(p.platform, ': ', LEFT(p.content, 60)) AS label, p.image_url AS thumbnail_url
          FROM posts p
          WHERE p.user_id = ${userId} AND p.content ILIKE ${pattern}
          ORDER BY p.created_at DESC LIMIT ${limit}
        ` as PostSearchRow[];
        results = rows.map((r) => ({ id: r.id, label: r.label, thumbnailUrl: r.thumbnail_url || undefined, type: 'post' as const }));
      } else if (type === 'clip') {
        const rows = await sql`
          SELECT v.id, v.title AS label, v.thumbnail_url
          FROM video_clip_scripts v
          WHERE v.user_id = ${userId} AND v.title ILIKE ${pattern}
          ORDER BY v.created_at DESC LIMIT ${limit}
        ` as ClipSearchRow[];
        results = rows.map((r) => ({ id: r.id, label: r.label, thumbnailUrl: r.thumbnail_url || undefined, type: 'clip' as const }));
      } else if (type === 'carousel') {
        const rows = await sql`
          SELECT c.id, c.title AS label, c.cover_url AS thumbnail_url
          FROM carousel_scripts c
          WHERE c.user_id = ${userId} AND c.title ILIKE ${pattern}
          ORDER BY c.created_at DESC LIMIT ${limit}
        ` as CarouselSearchRow[];
        results = rows.map((r) => ({ id: r.id, label: r.label, thumbnailUrl: r.thumbnail_url || undefined, type: 'carousel' as const }));
      }

      res.json({ results });
    } catch (error) {
      logger.warn({ err: error }, '[StudioAgent] content-search failed');
      res.json({ results: [] });
    }
  });

  // GET /api/agent/studio/files - List project files for mentions
  app.get('/api/agent/studio/files', async (req: Request, res: Response): Promise<void> => {
    const auth = getRequestAuthContext(req);
    if (!auth?.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const queryParams = req.query as FilesQuery;
    const searchQuery = String(queryParams.query || '').trim().toLowerCase();
    const rawLimit = Number(queryParams.limit || 20);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 50)) : 20;

    try {
      // Try rg first, fall back to find
      let stdout = '';
      try {
        const result = await execFile(
          'rg',
          ['--files', '-g', '!.git', '-g', '!node_modules', '-g', '!dist', '-g', '!build', '-g', '!coverage', '-g', '!tmp'],
          { cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024 },
        );
        stdout = result.stdout;
      } catch {
        const result = await execFile(
          'find',
          ['.', '-type', 'f', '-not', '-path', './.git/*', '-not', '-path', './node_modules/*', '-not', '-path', './dist/*', '-not', '-path', './build/*', '-maxdepth', '4'],
          { cwd: process.cwd(), maxBuffer: 8 * 1024 * 1024 },
        );
        stdout = result.stdout;
      }

      const files = stdout
        .split('\n')
        .map((line) => line.trim().replace(/^\.\//, ''))
        .filter(Boolean)
        .filter((file) => (searchQuery ? file.toLowerCase().includes(searchQuery) : true))
        .slice(0, limit);

      res.json({ files });
    } catch (error) {
      logger.warn({ err: error }, '[StudioAgent] Failed to list files for mentions');
      res.json({ files: [] });
    }
  });

  // POST /api/agent/studio/reset - Reset a thread conversation
  app.post('/api/agent/studio/reset', async (req: Request, res: Response): Promise<void> => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = (req.body || {}) as ResetRequestBody;
    const { threadId, studioType, topicId } = body;

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);

    if (!userId) {
      res.status(404).json({ error: 'Usuário não encontrado no banco.' });
      return;
    }

    let thread: ThreadRow | null = null;

    if (threadId) {
      thread = await getThreadById({ threadId, userId, organizationId }) as ThreadRow | null;
    } else if (studioType && topicId && isValidStudioType(studioType)) {
      thread = await getThreadByTopic({
        userId,
        organizationId,
        studioType,
        topicId,
      }) as ThreadRow | null;
    }

    if (!thread) {
      res.status(404).json({ error: 'Thread não encontrada.' });
      return;
    }

    await resetThread({
      threadId: thread.id,
      userId,
      organizationId,
    });

    res.json({ success: true, threadId: thread.id });
  });
}
