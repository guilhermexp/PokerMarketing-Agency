import { getCsrfToken, getCurrentCsrfToken, clearCsrfToken } from '../apiClient';

const API_BASE = '/api/agent/studio';

export type StudioType = 'image' | 'video';

export interface StudioAgentEvent {
  type: string;
  [key: string]: unknown;
}

export interface StudioAgentAttachment {
  type: 'image' | 'video' | 'file';
  url: string;
  name?: string;
  mimeType?: string;
}

export interface StudioAgentMention {
  path: string;
}

export interface StudioAgentThread {
  id: string;
  studio_type: StudioType;
  topic_id: string;
  claude_session_id: string | null;
}

export interface StudioAgentInteraction {
  interactionId: string;
  header?: string;
  question: string;
  options: Array<{ id: string; label: string; description?: string }>;
  expired?: boolean;
  questions?: Array<{
    id?: string;
    header?: string;
    question: string;
    options: Array<{ id: string; label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
}

async function buildHeaders(method: string): Promise<Record<string, string>> {
  const requiresCsrf = method !== 'GET' && method !== 'HEAD';

  // Always refresh CSRF before mutating requests to avoid stale header/cookie mismatch.
  if (requiresCsrf) {
    await getCsrfToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const csrf = getCurrentCsrfToken();
  if (requiresCsrf && csrf) {
    headers['X-CSRF-Token'] = csrf;
  }

  return headers;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 403) clearCsrfToken();
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function isCsrfMismatchStatus(response: Response): boolean {
  return response.status === 403;
}

async function consumeSseResponse(
  response: Response,
  onEvent: (event: StudioAgentEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error('Resposta de streaming sem body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const rawBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const line = rawBlock
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('data:'));

        if (line) {
          const payload = line.slice(5).trim();
          if (payload) {
            try {
              const parsed = JSON.parse(payload) as StudioAgentEvent;
              onEvent(parsed);
            } catch {
              // ignore malformed event
            }
          }
        }

        separatorIndex = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamStudioAgent(
  payload: {
    studioType: StudioType;
    topicId: string;
    message: string;
    threadId?: string;
    attachments?: StudioAgentAttachment[];
    mentions?: StudioAgentMention[];
  },
  onEvent: (event: StudioAgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let headers = await buildHeaders('POST');
  let response = await fetch(`${API_BASE}/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
    credentials: 'include',
  });

  if (!response.ok && isCsrfMismatchStatus(response)) {
    clearCsrfToken();
    headers = await buildHeaders('POST');
    response = await fetch(`${API_BASE}/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
      credentials: 'include',
    });
  }

  if (!response.ok) {
    if (isCsrfMismatchStatus(response)) clearCsrfToken();
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Stream failed: ${response.status}`);
  }

  await consumeSseResponse(response, onEvent);
}

export async function answerStudioAgent(
  payload: {
    threadId: string;
    interactionId: string;
    answer: string | { optionId?: string; text?: string; approved?: boolean; answers?: Record<string, string> };
  },
  signal?: AbortSignal,
): Promise<{ ok: boolean }> {
  let headers = await buildHeaders('POST');
  let response = await fetch(`${API_BASE}/answer`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
    credentials: 'include',
  });

  if (!response.ok && isCsrfMismatchStatus(response)) {
    clearCsrfToken();
    headers = await buildHeaders('POST');
    response = await fetch(`${API_BASE}/answer`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
      credentials: 'include',
    });
  }

  if (!response.ok) {
    if (isCsrfMismatchStatus(response)) clearCsrfToken();
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Answer failed: ${response.status}`);
  }

  return parseJsonResponse(response);
}

export async function getStudioAgentHistory(
  studioType: StudioType,
  topicId: string,
): Promise<{ thread: StudioAgentThread | null; messages: Array<{ role: string; payload_json: unknown }> }> {
  const headers = await buildHeaders('GET');
  const query = new URLSearchParams({ studioType, topicId }).toString();
  const response = await fetch(`${API_BASE}/history?${query}`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  return parseJsonResponse(response);
}

export async function searchStudioAgentFiles(
  query: string,
  limit = 20,
): Promise<{ files: string[] }> {
  const headers = await buildHeaders('GET');
  const qs = new URLSearchParams({
    query,
    limit: String(limit),
  }).toString();
  const response = await fetch(`${API_BASE}/files?${qs}`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });
  return parseJsonResponse(response);
}

export type ContentMentionType = 'gallery' | 'campaign' | 'post' | 'clip' | 'carousel';

export interface ContentSearchResult {
  id: string;
  label: string;
  thumbnailUrl?: string;
  type: string;
}

export async function searchStudioAgentContent(
  type: ContentMentionType,
  query: string,
  limit = 10,
): Promise<{ results: ContentSearchResult[] }> {
  const headers = await buildHeaders('GET');
  const qs = new URLSearchParams({
    type,
    query,
    limit: String(limit),
  }).toString();
  const response = await fetch(`${API_BASE}/content-search?${qs}`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });
  return parseJsonResponse(response);
}

export async function resetStudioAgent(payload: {
  threadId?: string;
  studioType?: StudioType;
  topicId?: string;
}): Promise<{ success: boolean; threadId: string }> {
  const headers = await buildHeaders('POST');
  const response = await fetch(`${API_BASE}/reset`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    credentials: 'include',
  });

  return parseJsonResponse(response);
}
