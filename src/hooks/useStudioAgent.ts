import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  answerStudioAgent,
  getStudioAgentHistory,
  resetStudioAgent,
  type StudioAgentAttachment,
  streamStudioAgent,
  type StudioAgentInteraction,
  type StudioAgentMention,
  type StudioAgentEvent,
  type StudioType,
} from '../services/api/studioAgent';

export interface StudioAgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: StudioAgentAttachment[];
  mentions?: StudioAgentMention[];
}

function extractAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const candidate = payload as { message?: { content?: Array<{ type?: string; text?: string }> } };
  const blocks = candidate.message?.content || [];
  return blocks
    .filter((block) => block?.type === 'text' && block.text)
    .map((block) => block.text || '')
    .join('\n');
}

function normalizeHistoryMessage(item: { role: string; payload_json: unknown }, index: number): StudioAgentChatMessage | null {
  const payload = item.payload_json as {
    type?: string;
    text?: string;
    attachments?: StudioAgentAttachment[];
    mentions?: StudioAgentMention[];
  };

  if (item.role === 'user' && payload?.type === 'user_input') {
    return {
      id: `h_user_${index}`,
      role: 'user',
      content: payload.text || '',
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      mentions: Array.isArray(payload.mentions) ? payload.mentions : [],
    };
  }

  if (item.role === 'assistant') {
    const content = extractAssistantText(item.payload_json);
    if (!content.trim()) return null;
    return {
      id: `h_assistant_${index}`,
      role: 'assistant',
      content,
    };
  }

  return null;
}

export function useStudioAgent(studioType: StudioType, topicId: string | null) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StudioAgentChatMessage[]>([]);
  const [toolEvents, setToolEvents] = useState<StudioAgentEvent[]>([]);
  const [pendingInteraction, setPendingInteraction] = useState<StudioAgentInteraction | null>(null);
  const [isAnsweringInteraction, setIsAnsweringInteraction] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assistantBufferRef = useRef<string>('');
  const currentAssistantIdRef = useRef<string | null>(null);

  const applyEvent = useCallback((event: StudioAgentEvent) => {
    if (event.type === 'thread' && typeof event.threadId === 'string') {
      setThreadId(event.threadId);
      return;
    }

    if (event.type === 'text_delta') {
      const delta = typeof event.content === 'string' ? event.content : '';
      if (!delta) return;

      assistantBufferRef.current += delta;
      if (!currentAssistantIdRef.current) {
        currentAssistantIdRef.current = `assistant_${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: currentAssistantIdRef.current!,
            role: 'assistant',
            content: delta,
          },
        ]);
        return;
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === currentAssistantIdRef.current
            ? { ...msg, content: assistantBufferRef.current }
            : msg,
        ),
      );
      return;
    }

    if (event.type === 'ask_user') {
      const rawQuestions = Array.isArray(event.questions) ? event.questions : [];
      const firstQuestion = rawQuestions[0];
      const rawOptions = Array.isArray(firstQuestion?.options)
        ? firstQuestion.options
        : Array.isArray(event.options)
          ? event.options
          : [];

      setPendingInteraction({
        interactionId: String(event.interactionId || ''),
        header: typeof firstQuestion?.header === 'string'
          ? firstQuestion.header
          : typeof event.header === 'string'
            ? event.header
            : 'Confirmação',
        question: String(firstQuestion?.question || event.question || ''),
        options: rawOptions.map((opt, index) => ({
              id: String(opt?.id || `opt_${index + 1}`),
              label: String(opt?.label || `Opção ${index + 1}`),
              description: opt?.description ? String(opt.description) : '',
            })),
        questions: rawQuestions.map((question, qIndex) => ({
          id: String(question?.id || `q_${qIndex + 1}`),
          header: String(question?.header || 'Pergunta'),
          question: String(question?.question || ''),
          multiSelect: Boolean(question?.multiSelect),
          options: Array.isArray(question?.options)
            ? question.options.map((opt, index) => ({
                id: String(opt?.id || `opt_${index + 1}`),
                label: String(opt?.label || `Opção ${index + 1}`),
                description: opt?.description ? String(opt.description) : '',
              }))
            : [],
        })),
        expired: false,
      });
      return;
    }

    if (event.type === 'ask_user_timeout') {
      setPendingInteraction((current) => {
        if (!current) return null;
        return { ...current, expired: true };
      });
      return;
    }

    if (event.type === 'ask_user_result') {
      setPendingInteraction(null);
      return;
    }

    if (event.type === 'response_end') {
      assistantBufferRef.current = '';
      currentAssistantIdRef.current = null;
      return;
    }

    if (event.type === 'tool_started' || event.type === 'tool_completed' || event.type === 'tool_failed') {
      setToolEvents((prev) => [...prev.slice(-19), event]);
      return;
    }

    if (event.type === 'error') {
      setError(typeof event.error === 'string' ? event.error : 'Falha no modo agente.');
    }
  }, []);

  const sendMessage = useCallback(async (
    text: string,
    options?: {
      attachments?: StudioAgentAttachment[];
      mentions?: StudioAgentMention[];
    },
  ) => {
    const cleanText = text.trim();
    const attachments = options?.attachments || [];
    const mentions = options?.mentions || [];
    if (!topicId || isStreaming) return;
    if (!cleanText && attachments.length === 0) return;
    setError(null);
    setPendingInteraction(null);

    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        role: 'user',
        content: cleanText,
        attachments,
        mentions,
      },
    ]);

    setIsStreaming(true);
    try {
      await streamStudioAgent(
        {
          studioType,
          topicId,
          message: cleanText,
          threadId: threadId || undefined,
          attachments,
          mentions,
        },
        applyEvent,
      );
    } catch (streamError) {
      setError(streamError instanceof Error ? streamError.message : 'Falha ao enviar mensagem.');
    } finally {
      setIsStreaming(false);
    }
  }, [applyEvent, isStreaming, studioType, threadId, topicId]);

  const answerInteraction = useCallback(async (
    answer: string | { optionId?: string; text?: string; approved?: boolean; answers?: Record<string, string> },
  ) => {
    if (!threadId || !pendingInteraction || isAnsweringInteraction) return;

    setIsAnsweringInteraction(true);
    setError(null);

    try {
      await answerStudioAgent({
        threadId,
        interactionId: pendingInteraction.interactionId,
        answer,
      });
      setPendingInteraction(null);
    } catch (answerError) {
      setError(answerError instanceof Error ? answerError.message : 'Falha ao responder interação.');
    } finally {
      setIsAnsweringInteraction(false);
    }
  }, [isAnsweringInteraction, pendingInteraction, threadId]);

  const dismissInteraction = useCallback(() => {
    setPendingInteraction(null);
    setIsAnsweringInteraction(false);
  }, []);

  const reset = useCallback(async () => {
    setError(null);
    setPendingInteraction(null);
    setMessages([]);
    setToolEvents([]);
    assistantBufferRef.current = '';
    currentAssistantIdRef.current = null;

    if (!topicId) {
      setThreadId(null);
      return;
    }

    if (threadId) {
      try {
        await resetStudioAgent({ threadId });
      } catch {
        // ignore reset errors for UX
      }
    } else {
      try {
        await resetStudioAgent({ studioType, topicId });
      } catch {
        // ignore
      }
    }

    setThreadId(null);
  }, [studioType, threadId, topicId]);

  useEffect(() => {
    let isMounted = true;

    async function loadHistory() {
      setError(null);
      setPendingInteraction(null);
      setMessages([]);
      setToolEvents([]);
      assistantBufferRef.current = '';
      currentAssistantIdRef.current = null;

      if (!topicId) {
        setThreadId(null);
        return;
      }

      try {
        const result = await getStudioAgentHistory(studioType, topicId);
        if (!isMounted) return;

        setThreadId(result.thread?.id || null);

        const normalized = result.messages
          .map((item, index) => normalizeHistoryMessage(item, index))
          .filter((item): item is StudioAgentChatMessage => Boolean(item));
        setMessages(normalized);
      } catch (historyError) {
        if (!isMounted) return;
        setError(historyError instanceof Error ? historyError.message : 'Falha ao carregar histórico.');
      }
    }

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [studioType, topicId]);

  return useMemo(() => ({
    threadId,
    messages,
    toolEvents,
    pendingInteraction,
    isStreaming,
    isAnsweringInteraction,
    error,
    sendMessage,
    answerInteraction,
    dismissInteraction,
    reset,
  }), [
    threadId,
    messages,
    toolEvents,
    pendingInteraction,
    isStreaming,
    isAnsweringInteraction,
    error,
    sendMessage,
    answerInteraction,
    dismissInteraction,
    reset,
  ]);
}
