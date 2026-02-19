import { getSql } from '../lib/db.mjs';
import { getRequestAuthContext } from '../lib/auth.mjs';
import { resolveUserId } from '../lib/user-resolver.mjs';
import logger from '../lib/logger.mjs';
import { runStudioAgentStream, getPendingInteraction, resolvePendingInteraction } from '../lib/agent/claude/runner.mjs';
import { promisify } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';
import {
  ensureThread,
  getThreadById,
  getThreadByTopic,
  listThreadMessages,
  resetThread,
} from '../lib/agent/claude/session-store.mjs';
const execFile = promisify(execFileCb);

const CONTENT_MENTION_REGEX = /(?:^|\s)@(gallery|campaign|clip|carousel):([^\s]+)/g;

async function resolveContentMentions(sql, userId, organizationId, text) {
  const matches = [...text.matchAll(CONTENT_MENTION_REGEX)];
  if (matches.length === 0) return null;

  const ownerCondition = organizationId
    ? sql`organization_id = ${organizationId}`
    : sql`user_id = ${userId} AND organization_id IS NULL`;

  const resolved = [];
  for (const match of matches) {
    const type = match[1];
    const idOrQuery = match[2];

    try {
      if (type === 'gallery') {
        const rows = await sql`
          SELECT id, src_url, prompt, model FROM gallery_images
          WHERE id::text = ${idOrQuery} AND ${ownerCondition} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (rows[0]) {
          resolved.push(`Imagem da galeria (id: ${rows[0].id}): URL: ${rows[0].src_url}, prompt original: "${rows[0].prompt || 'N/A'}", modelo: ${rows[0].model}`);
        }
      } else if (type === 'campaign') {
        const rows = await sql`
          SELECT id, name, description FROM campaigns
          WHERE id::text = ${idOrQuery} AND ${ownerCondition} AND deleted_at IS NULL
          LIMIT 1
        `;
        if (rows[0]) {
          resolved.push(`Campanha (id: ${rows[0].id}): nome: "${rows[0].name}", descrição: "${rows[0].description || 'N/A'}"`);
        }
      } else if (type === 'clip') {
        const rows = await sql`
          SELECT id, title, hook FROM video_clip_scripts
          WHERE id::text = ${idOrQuery} AND ${ownerCondition}
          LIMIT 1
        `;
        if (rows[0]) {
          resolved.push(`Video clip (id: ${rows[0].id}): título: "${rows[0].title}", hook: "${rows[0].hook}"`);
        }
      } else if (type === 'carousel') {
        const rows = await sql`
          SELECT id, title, caption FROM carousel_scripts
          WHERE id::text = ${idOrQuery} AND ${ownerCondition}
          LIMIT 1
        `;
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

function setSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}

export function registerAgentStudioRoutes(app) {
  app.post('/api/agent/studio/stream', async (req, res) => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { studioType, topicId, message, threadId, attachments, mentions } = req.body || {};

    if (!studioType || !['image', 'video'].includes(studioType)) {
      return res.status(400).json({ error: 'studioType inválido. Use image|video.' });
    }

    if (!topicId || typeof topicId !== 'string') {
      return res.status(400).json({ error: 'topicId é obrigatório.' });
    }

    const safeMessage = typeof message === 'string' ? message.trim() : '';
    const safeAttachments = Array.isArray(attachments)
      ? attachments
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            type: ['image', 'video', 'file'].includes(String(item.type)) ? String(item.type) : 'file',
            url: typeof item.url === 'string' ? item.url : '',
            name: typeof item.name === 'string' ? item.name : '',
            mimeType: typeof item.mimeType === 'string' ? item.mimeType : '',
          }))
          .filter((item) => Boolean(item.url))
      : [];
    const safeMentions = Array.isArray(mentions)
      ? mentions
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            path: typeof item.path === 'string' ? item.path : '',
          }))
          .filter((item) => Boolean(item.path))
      : [];

    if (!safeMessage && safeAttachments.length === 0) {
      return res.status(400).json({ error: 'message ou attachments é obrigatório.' });
    }

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);

    if (!userId) {
      return res.status(404).json({ error: 'Usuário não encontrado no banco.' });
    }

    let thread = null;
    if (threadId) {
      thread = await getThreadById({ threadId, userId, organizationId });
    }

    if (!thread) {
      thread = await ensureThread({ userId, organizationId, studioType, topicId });
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

    await runStudioAgentStream({
      res,
      sql,
      logger,
      userId,
      organizationId,
      thread,
      message: resolvedMessage,
      attachments: safeAttachments,
      mentions: safeMentions,
      signal: abortController.signal,
    });

    if (!res.writableEnded) res.end();
  });

  app.post('/api/agent/studio/answer', async (req, res) => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { threadId, interactionId, answer } = req.body || {};

    if (!threadId || typeof threadId !== 'string') {
      return res.status(400).json({ error: 'threadId é obrigatório.' });
    }

    if (!interactionId || typeof interactionId !== 'string') {
      return res.status(400).json({ error: 'interactionId é obrigatório.' });
    }

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);

    if (!userId) {
      return res.status(404).json({ error: 'Usuário não encontrado no banco.' });
    }

    const thread = await getThreadById({ threadId, userId, organizationId });
    if (!thread) {
      return res.status(404).json({ error: 'Thread não encontrada.' });
    }

    const pending = getPendingInteraction(threadId, interactionId);
    if (!pending) {
      return res.status(409).json({ error: 'Interação pendente não encontrada ou já respondida.' });
    }

    const approved = !(answer && typeof answer === 'object' && answer.approved === false);
    const directAnswers = answer && typeof answer === 'object' && answer.answers && typeof answer.answers === 'object'
      ? answer.answers
      : null;
    const normalizedAnswer = typeof answer === 'string'
      ? { optionId: '', text: answer.trim() }
      : {
          optionId: answer?.optionId ? String(answer.optionId) : '',
          text: answer?.text ? String(answer.text).trim() : '',
        };

    const questions = Array.isArray(pending.questions) ? pending.questions : [];
    const answers = directAnswers ? { ...directAnswers } : {};

    if (!directAnswers) {
      for (const question of questions) {
        const questionText = String(question?.question || '');
        if (!questionText) continue;

        const options = Array.isArray(question?.options) ? question.options : [];
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
      return res.status(409).json({ error: 'Interação já foi resolvida.' });
    }

    return res.json({ ok: true });
  });

  app.get('/api/agent/studio/history', async (req, res) => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const studioType = String(req.query.studioType || '');
    const topicId = String(req.query.topicId || '');

    if (!studioType || !['image', 'video'].includes(studioType)) {
      return res.status(400).json({ error: 'studioType inválido. Use image|video.' });
    }

    if (!topicId) {
      return res.status(400).json({ error: 'topicId é obrigatório.' });
    }

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);

    if (!userId) {
      return res.status(404).json({ error: 'Usuário não encontrado no banco.' });
    }

    const thread = await getThreadByTopic({
      userId,
      organizationId,
      studioType,
      topicId,
    });

    if (!thread) {
      return res.json({ thread: null, messages: [] });
    }

    const messages = await listThreadMessages({ threadId: thread.id, limit: 500 });
    return res.json({ thread, messages });
  });

  app.get('/api/agent/studio/content-search', async (req, res) => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const type = String(req.query.type || '').trim();
    const query = String(req.query.query || '').trim();
    const rawLimit = Number(req.query.limit || 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 30)) : 10;

    const validTypes = ['gallery', 'campaign', 'post', 'clip', 'carousel'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type inválido. Use: ${validTypes.join(', ')}` });
    }

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);
    if (!userId) {
      return res.status(404).json({ error: 'Usuário não encontrado no banco.' });
    }

    try {
      const userCondition = organizationId
        ? sql`organization_id = ${organizationId}`
        : sql`user_id = ${userId} AND organization_id IS NULL`;
      const pattern = query ? `%${query}%` : '%';
      let results = [];

      if (type === 'gallery') {
        const rows = await sql`
          SELECT id, prompt AS label, thumbnail_url, src_url
          FROM gallery_images
          WHERE ${userCondition} AND deleted_at IS NULL
            AND (prompt ILIKE ${pattern} OR source ILIKE ${pattern})
          ORDER BY created_at DESC LIMIT ${limit}
        `;
        results = rows.map((r) => ({
          id: r.id,
          label: r.label || 'Sem descrição',
          thumbnailUrl: r.thumbnail_url || r.src_url,
          type: 'gallery',
        }));
      } else if (type === 'campaign') {
        const rows = await sql`
          SELECT id, name AS label
          FROM campaigns
          WHERE ${userCondition} AND deleted_at IS NULL AND name ILIKE ${pattern}
          ORDER BY created_at DESC LIMIT ${limit}
        `;
        results = rows.map((r) => ({ id: r.id, label: r.label || 'Campanha', type: 'campaign' }));
      } else if (type === 'post') {
        const rows = await sql`
          SELECT p.id, CONCAT(p.platform, ': ', LEFT(p.content, 60)) AS label, p.image_url AS thumbnail_url
          FROM posts p
          WHERE p.user_id = ${userId} AND p.content ILIKE ${pattern}
          ORDER BY p.created_at DESC LIMIT ${limit}
        `;
        results = rows.map((r) => ({ id: r.id, label: r.label, thumbnailUrl: r.thumbnail_url, type: 'post' }));
      } else if (type === 'clip') {
        const rows = await sql`
          SELECT v.id, v.title AS label, v.thumbnail_url
          FROM video_clip_scripts v
          WHERE v.user_id = ${userId} AND v.title ILIKE ${pattern}
          ORDER BY v.created_at DESC LIMIT ${limit}
        `;
        results = rows.map((r) => ({ id: r.id, label: r.label, thumbnailUrl: r.thumbnail_url, type: 'clip' }));
      } else if (type === 'carousel') {
        const rows = await sql`
          SELECT c.id, c.title AS label, c.cover_url AS thumbnail_url
          FROM carousel_scripts c
          WHERE c.user_id = ${userId} AND c.title ILIKE ${pattern}
          ORDER BY c.created_at DESC LIMIT ${limit}
        `;
        results = rows.map((r) => ({ id: r.id, label: r.label, thumbnailUrl: r.thumbnail_url, type: 'carousel' }));
      }

      return res.json({ results });
    } catch (error) {
      logger.warn({ err: error }, '[StudioAgent] content-search failed');
      return res.json({ results: [] });
    }
  });

  app.get('/api/agent/studio/files', async (req, res) => {
    const auth = getRequestAuthContext(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const query = String(req.query.query || '').trim().toLowerCase();
    const rawLimit = Number(req.query.limit || 20);
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
        .filter((file) => (query ? file.toLowerCase().includes(query) : true))
        .slice(0, limit);

      return res.json({ files });
    } catch (error) {
      logger.warn({ err: error }, '[StudioAgent] Failed to list files for mentions');
      return res.json({ files: [] });
    }
  });

  app.post('/api/agent/studio/reset', async (req, res) => {
    const auth = getRequestAuthContext(req);
    const clerkUserId = auth?.userId || null;
    const organizationId = auth?.orgId || null;

    if (!clerkUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { threadId, studioType, topicId } = req.body || {};

    const sql = getSql();
    const userId = await resolveUserId(sql, clerkUserId);

    if (!userId) {
      return res.status(404).json({ error: 'Usuário não encontrado no banco.' });
    }

    let thread = null;

    if (threadId) {
      thread = await getThreadById({ threadId, userId, organizationId });
    } else if (studioType && topicId) {
      thread = await getThreadByTopic({
        userId,
        organizationId,
        studioType,
        topicId,
      });
    }

    if (!thread) {
      return res.status(404).json({ error: 'Thread não encontrada.' });
    }

    await resetThread({
      threadId: thread.id,
      userId,
      organizationId,
    });

    return res.json({ success: true, threadId: thread.id });
  });
}
