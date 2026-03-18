import { clientLogger } from "@/lib/client-logger";
/**
 * AssistantPanelNew - Versão com Vercel AI SDK (Orchestrator)
 *
 * Delega renderização para sub-componentes:
 * ChatMessageList, ChatInputArea, ToolResultViewer.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useChat } from '@ai-sdk/react';
import {
  isFileUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type CreateUIMessage,
  type UIMessage,
} from 'ai';
import type { ChatReferenceImage, BrandProfile, GalleryImage, PendingToolEdit } from '../../types';
import { useChatImageSync } from '../../hooks/useChatImageSync';
import { Icon } from '../common/Icon';
import { DataStreamProvider } from './DataStreamProvider';
import { DataStreamHandler } from './DataStreamHandler';
import type { DataUIPart } from './DataStreamProvider';
import { ChatMessageList } from './ChatMessageList';
import { ChatInputArea } from './ChatInputArea';

interface AssistantPanelNewProps {
  isOpen: boolean;
  onClose: () => void;
  referenceImage: ChatReferenceImage | null;
  onClearReference: () => void;
  onUpdateReference: (ref: ChatReferenceImage) => void;
  galleryImages: GalleryImage[];
  brandProfile?: BrandProfile;
  pendingToolEdit?: PendingToolEdit | null;
  onRequestImageEdit?: (request: {
    toolCallId: string;
    toolName: string;
    prompt: string;
    imageId: string;
  }) => void;
  onToolEditApproved?: (toolCallId: string, imageUrl: string) => void;
  onToolEditRejected?: (toolCallId: string, reason?: string) => void;
  onShowToolEditPreview?: (payload: {
    toolCallId: string;
    imageUrl: string;
    prompt?: string;
    referenceImageId?: string;
    referenceImageUrl?: string;
  }) => void;
}

const getImageMediaType = (url: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif' => {
  const l = url.toLowerCase();
  if (l.startsWith('data:image/')) {
    if (l.includes('image/jpeg')) return 'image/jpeg';
    if (l.includes('image/webp')) return 'image/webp';
    if (l.includes('image/heic')) return 'image/heic';
    if (l.includes('image/heif')) return 'image/heif';
    return 'image/png';
  }
  if (l.includes('.jpg') || l.includes('.jpeg')) return 'image/jpeg';
  if (l.includes('.webp')) return 'image/webp';
  if (l.includes('.heic')) return 'image/heic';
  if (l.includes('.heif')) return 'image/heif';
  return 'image/png';
};

const MAX_MESSAGES = 12;

export const AssistantPanelNew: React.FC<AssistantPanelNewProps> = (props) => {
  const {
    isOpen, onClose, referenceImage, onClearReference, onUpdateReference,
    galleryImages, brandProfile, pendingToolEdit, onShowToolEditPreview
  } = props;

  const [input, setInput] = useState('');
  const [dataStream, setDataStream] = useState<DataUIPart[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [chatId] = useState(() => crypto.randomUUID());
  const [isSending, setIsSending] = useState(false);
  const [includeBrandLogo, setIncludeBrandLogo] = useState(true);
  const handledEditResultsRef = useRef<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTrimmedLengthRef = useRef(0);

  // Memoized: brandProfile efetivo
  const effectiveBrandProfile = useMemo(
    () => includeBrandLogo ? brandProfile : brandProfile ? { ...brandProfile, logo: null } : null,
    [includeBrandLogo, brandProfile]
  );

  const chatOptions = useMemo(() => ({
    id: chatId,
    body: {
      brandProfile: effectiveBrandProfile,
      chatReferenceImage: referenceImage,
      selectedChatModel: brandProfile?.creativeModel || 'gemini-3-flash-preview',
    },
    sendAutomaticallyWhen: ({ messages: msgs }: { messages: UIMessage[] }) =>
      lastAssistantMessageIsCompleteWithToolCalls({ messages: msgs }) ||
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages: msgs }),
    onResponse: (response: Response) => {
      clientLogger.info('[AssistantPanel] Response received', response.status);
    },
    onError: (error: Error) => {
      clientLogger.error('[AssistantPanel] Error:', error);
      const isTokenLimit = error.message?.includes('tokens limit exceeded') || error.message?.includes('context_length_exceeded');
      setErrorMessage(isTokenLimit
        ? 'Conversa muito longa. Por favor, inicie uma nova conversa clicando em "Limpar chat".'
        : error.message || 'Erro ao processar mensagem. Tente novamente.');
      setTimeout(() => setErrorMessage(null), isTokenLimit ? 10000 : 5000);
    },
    onFinish: ({ message }: { message: UIMessage }) => {
      clientLogger.info('[AssistantPanel] Message finished:', { role: message.role, partsCount: message.parts?.length || 0 });
    },
  }), [chatId, effectiveBrandProfile, referenceImage, brandProfile?.creativeModel]) as unknown as Parameters<typeof useChat>[0];

  const { messages, sendMessage, status, addToolApprovalResponse, setMessages } = useChat<UIMessage>(chatOptions);
  const isLoading = status === 'streaming' || status === 'submitted';

  // Memoized derived data
  const pendingApprovals = useMemo(
    () => messages.flatMap((msg) =>
      msg.parts.filter(isToolUIPart).filter((part) => part.state === 'approval-requested' && part.approval?.id)
    ),
    [messages]
  );

  const shouldShowLoading = useMemo(
    () => isSending || (isLoading && pendingApprovals.length === 0),
    [isSending, isLoading, pendingApprovals.length]
  );

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Message trimming
  useEffect(() => {
    if (messages.length <= MAX_MESSAGES) { lastTrimmedLengthRef.current = messages.length; return; }
    if (messages.length === lastTrimmedLengthRef.current) return;
    clientLogger.debug(`[AssistantPanel] Trimming messages: ${messages.length} -> ${MAX_MESSAGES}`);
    const trimmed = messages.slice(-MAX_MESSAGES).map((msg, i, arr) => {
      if (i < arr.length / 2) {
        const cleaned = msg.parts.map(p => isFileUIPart(p) && p.url?.startsWith('data:') ? { ...p, url: 'data:image/png;base64,removed' } : p);
        return { ...msg, parts: cleaned };
      }
      return msg;
    });
    lastTrimmedLengthRef.current = trimmed.length;
    setMessages(trimmed);
  }, [messages, setMessages]);

  // Image sync
  useChatImageSync({
    galleryImages, chatReferenceImage: referenceImage,
    setChatReferenceImage: (ref) => { if (ref) { onUpdateReference(ref); } else { onClearReference(); } },
    messages, setMessages
  });

  // Tool edit approval flow
  useEffect(() => {
    if (!pendingToolEdit) return;
    const { toolCallId, result, imageUrl, error } = pendingToolEdit;
    if (handledEditResultsRef.current.has(toolCallId)) return;
    const toolCallExists = messages.some(msg => msg.parts.filter(isToolUIPart).some(p => p.toolCallId === toolCallId));
    if (!toolCallExists) {
      if (messages.length === 0 && result === 'approved' && imageUrl) handledEditResultsRef.current.add(toolCallId);
      return;
    }
    handledEditResultsRef.current.add(toolCallId);
    if (result === 'approved' && imageUrl) {
      addToolApprovalResponse({ id: toolCallId, approved: true, reason: imageUrl });
    } else if (result === 'rejected') {
      addToolApprovalResponse({ id: toolCallId, approved: false, reason: error || 'Edição rejeitada pelo usuário' });
    }
  }, [pendingToolEdit, addToolApprovalResponse, messages]);

  // Tool edit preview dispatch
  useEffect(() => {
    if (!onShowToolEditPreview) return;
    for (const msg of messages) {
      for (const part of msg.parts.filter(isToolUIPart).filter(p => p.type === 'tool-editImage')) {
        if (part.state !== 'output-available' || !part.toolCallId) continue;
        if (handledEditResultsRef.current.has(part.toolCallId)) continue;
        const output = part.output as { imageUrl?: string; prompt?: string; referenceImageId?: string; referenceImageUrl?: string } | undefined;
        if (!output?.imageUrl) continue;
        handledEditResultsRef.current.add(part.toolCallId);
        onShowToolEditPreview({ toolCallId: part.toolCallId, imageUrl: output.imageUrl, prompt: output.prompt, referenceImageId: output.referenceImageId, referenceImageUrl: output.referenceImageUrl });
      }
    }
  }, [messages, onShowToolEditPreview]);

  // Auto-scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  // ========================================================================
  // CALLBACKS
  // ========================================================================

  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !referenceImage) return;
    if (status === 'streaming' || status === 'submitted' || isSending) return;
    setErrorMessage(null);
    setIsSending(true);
    const messageText = input || (referenceImage ? 'Veja a imagem anexada' : '');
    setInput('');
    try {
      const parts: UIMessage['parts'] = [];
      if (messageText.trim()) parts.push({ type: 'text', text: messageText });
      if (referenceImage) parts.push({ type: 'file', mediaType: getImageMediaType(referenceImage.src), filename: referenceImage.id, url: referenceImage.src });
      await sendMessage({ role: 'user', parts } as CreateUIMessage<UIMessage>);
      if (referenceImage) onClearReference();
    } finally {
      setTimeout(() => setIsSending(false), 500);
    }
  }, [input, referenceImage, status, isSending, sendMessage, onClearReference]);

  const handleSendFileMessage = useCallback(async (message: CreateUIMessage<UIMessage>) => {
    await sendMessage(message);
  }, [sendMessage]);

  const handleError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  }, []);

  const handleApprove = useCallback((id: string) => {
    addToolApprovalResponse({ id, approved: true });
  }, [addToolApprovalResponse]);

  const handleDeny = useCallback((id: string) => {
    addToolApprovalResponse({ id, approved: false, reason: 'Rejeitado pelo usuário' });
  }, [addToolApprovalResponse]);

  const handleInputChange = useCallback((value: string) => setInput(value), []);
  const handleToggleBrandLogo = useCallback(() => setIncludeBrandLogo(prev => !prev), []);

  if (!isOpen) return null;

  return (
    <ErrorBoundary>
    <DataStreamProvider dataStream={dataStream} setDataStream={setDataStream}>
      <DataStreamHandler />
      <aside className="assistant-panel w-full h-full bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-border flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="flex-shrink-0 h-14 flex items-center justify-between px-4">
          <img src="/icon.png" alt="Socialab" className="w-9 h-9 rounded-xl" />
          <div className="flex items-center gap-1">
            <button className="p-2 text-muted-foreground hover:text-white/80 transition-colors rounded-lg hover:bg-white/5">
              <Icon name="clock" className="w-4 h-4" />
            </button>
            <button className="p-2 text-muted-foreground hover:text-white/80 transition-colors rounded-lg hover:bg-white/5">
              <Icon name="plus" className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-white/80 transition-colors rounded-lg hover:bg-white/5">
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>

        <ChatMessageList
          messages={messages}
          toast={toast}
          errorMessage={errorMessage}
          shouldShowLoading={shouldShowLoading}
          isSending={isSending}
          chatEndRef={chatEndRef}
        />

        <ChatInputArea
          input={input}
          onInputChange={handleInputChange}
          onSubmit={handleSend}
          onSendFileMessage={handleSendFileMessage}
          isLoading={isLoading}
          isSending={isSending}
          referenceImage={referenceImage}
          onClearReference={onClearReference}
          brandProfile={brandProfile}
          includeBrandLogo={includeBrandLogo}
          onToggleBrandLogo={handleToggleBrandLogo}
          onError={handleError}
          pendingApprovals={pendingApprovals}
          onApprove={handleApprove}
          onDeny={handleDeny}
          inputRef={inputRef}
        />
      </aside>
    </DataStreamProvider>
    </ErrorBoundary>
  );
};
