/**
 * AssistantPanelNew - Versão com Vercel AI SDK
 *
 * Mantém a MESMA UI do painel lateral original,
 * mas usando useChat hook do Vercel AI SDK internamente
 */

import React, { useState, useEffect, useRef } from 'react';
import { useChat, type UseChatOptions } from '@ai-sdk/react';
import {
  isFileUIPart,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type CreateUIMessage,
  type ToolUIPart,
  type UIMessage,
} from 'ai';
import type { ChatReferenceImage, BrandProfile, GalleryImage, PendingToolEdit } from '../../types';
import { useChatImageSync } from '../../hooks/useChatImageSync';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { DataStreamProvider } from './DataStreamProvider';
import { DataStreamHandler } from './DataStreamHandler';
import type { DataUIPart } from './DataStreamProvider';
import { MessageResponse } from './MessageResponse';
import { MessageActionsEnhanced } from './MessageActionsEnhanced';
import { ToolWithApproval } from './ToolWithApproval';
import { LoadingIndicatorEnhanced } from './LoadingIndicatorEnhanced';
import { uploadDataUrlToBlob } from '../../services/blobService';

interface AssistantPanelNewProps {
  isOpen: boolean;
  onClose: () => void;
  referenceImage: ChatReferenceImage | null;
  onClearReference: () => void;
  onUpdateReference: (ref: ChatReferenceImage) => void;
  galleryImages: GalleryImage[];
  brandProfile?: BrandProfile;
  // Tool edit approval
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

// Helper: converter File para base64
const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });

// Helper: inferir mediaType da URL da imagem
const getImageMediaType = (url: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif' => {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.startsWith('data:image/')) {
    if (lowerUrl.includes('image/jpeg')) return 'image/jpeg';
    if (lowerUrl.includes('image/webp')) return 'image/webp';
    if (lowerUrl.includes('image/heic')) return 'image/heic';
    if (lowerUrl.includes('image/heif')) return 'image/heif';
    return 'image/png';
  }
  if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) return 'image/jpeg';
  if (lowerUrl.includes('.webp')) return 'image/webp';
  if (lowerUrl.includes('.heic')) return 'image/heic';
  if (lowerUrl.includes('.heif')) return 'image/heif';
  return 'image/png'; // default
};

// ChatBubble component - Apenas renderiza mensagens (approvals são mostrados acima do input)
const ChatBubble: React.FC<{ message: UIMessage }> = ({ message }) => {
  const isAssistant = message.role === 'assistant';

  const textParts = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join(' ');

  // Extrair imagens/arquivos
  const fileParts = message.parts.filter(isFileUIPart);

  return (
    <div className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'} space-y-2 animate-fade-in-up`}>
      {/* Renderizar imagens (se houver) */}
      {fileParts.length > 0 && (
        <div className={`max-w-[90%] ${isAssistant ? '' : 'flex justify-end'}`}>
          <div className="space-y-2">
            {fileParts.map((file, idx) => (
              <div
                key={idx}
                className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-black/20 animate-fade-in-up"
              >
                <img
                  src={file.url}
                  alt={file.filename || 'Arquivo'}
                  className="max-w-full max-h-[300px] object-contain"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-[10px] text-white/70 truncate">{file.filename || 'Arquivo'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Renderizar texto (se houver) */}
      {textParts && (
        <div className="group max-w-[90%]">
          {/* Conteúdo da mensagem */}
          <div
            className={`${
              isAssistant
                ? 'px-1 text-white/90'
                : 'bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/[0.08] rounded-2xl px-5 py-3.5 text-white/95'
            }`}
          >
            <MessageResponse className="text-[13px] leading-relaxed prose prose-invert">
              {textParts}
            </MessageResponse>
          </div>

          {/* Ações (aparecem no hover, embaixo do texto) */}
          {isAssistant && (
            <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <MessageActionsEnhanced
                messageId={message.id}
                content={textParts}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const AssistantPanelNew: React.FC<AssistantPanelNewProps> = (props) => {
  const {
    isOpen,
    onClose,
    referenceImage,
    onClearReference,
    onUpdateReference,
    galleryImages,
    brandProfile,
    pendingToolEdit,
    onShowToolEditPreview
  } = props;
  const [input, setInput] = useState('');
  const [dataStream, setDataStream] = useState<DataUIPart[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [chatId] = useState(() => crypto.randomUUID());
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false); // Estado local para feedback imediato
  const handledEditResultsRef = useRef<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // useChat hook do Vercel AI SDK
  const chatOptions: UseChatOptions<UIMessage> = {
    id: chatId,
    body: {
      brandProfile: brandProfile,
      chatReferenceImage: referenceImage,
      selectedChatModel: brandProfile?.creativeModel || 'x-ai/grok-4.1-fast'
    },
    sendAutomaticallyWhen: ({ messages }: { messages: UIMessage[] }) =>
      lastAssistantMessageIsCompleteWithToolCalls({ messages }) ||
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages }),
    onResponse: (response: Response) => {
      console.info('[AssistantPanel] Response received', response.status);
    },
    onError: (error: Error) => {
      console.error('[AssistantPanel] Error:', error);
      setErrorMessage(error.message || 'Erro ao processar mensagem. Tente novamente.');
      // Auto-limpar erro após 5 segundos
      setTimeout(() => setErrorMessage(null), 5000);
    },
    onFinish: (message: UIMessage) => {
      console.info('[AssistantPanel] Message finished:', {
        role: message.role,
        partsCount: message.parts?.length || 0
      });
    }
  };

  const { messages, sendMessage, status, addToolApprovalResponse, setMessages } = useChat<UIMessage>(chatOptions);

  const isLoading = status === 'streaming' || status === 'submitted';

  // Helper para mapear estado da tool
  const mapToolState = (state: ToolUIPart['state']): 'approval-requested' | 'approved' | 'denied' | 'executing' | 'complete' => {
    switch (state) {
      case 'approval-requested':
        return 'approval-requested';
      case 'output-denied':
        return 'denied';
      case 'output-available':
      case 'approval-responded':
        return 'complete';
      default:
        return 'executing';
    }
  };

  // Extrair todos os pending approvals de todas as mensagens
  const pendingApprovals = messages.flatMap((msg) =>
    msg.parts
      .filter(isToolUIPart)
      .filter((part) => part.state === 'approval-requested' && part.approval?.id)
  );

  // Mostrar loading quando:
  // 1. Usuário acabou de enviar mensagem (isSending)
  // 2. Está carregando E não há approvals pendentes (processando após aprovação)
  const shouldShowLoading = isSending || (isLoading && pendingApprovals.length === 0);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // ========================================================================
  // SINCRONIZAÇÃO AUTOMÁTICA DE IMAGENS
  // ========================================================================
  // Hook para atualizar URLs de imagens quando editadas
  useChatImageSync({
    galleryImages,
    chatReferenceImage: referenceImage,
    setChatReferenceImage: (ref) => {
      if (ref) {
        onUpdateReference(ref);
      } else {
        onClearReference();
      }
    },
    messages,
    setMessages
  });

  // ========================================================================
  // TOOL EDIT APPROVAL FLOW
  // ========================================================================
  // Monitora pendingToolEdit e notifica o agente quando aprovado/rejeitado
  useEffect(() => {
    if (!pendingToolEdit) {
      // Limpar cache quando pendingToolEdit for null (reset)
      // Mas mantém por um tempo para evitar processar múltiplas vezes durante transições
      return;
    }

    const { toolCallId, result, imageUrl, error } = pendingToolEdit;

    // Evitar processar o mesmo resultado múltiplas vezes
    if (handledEditResultsRef.current.has(toolCallId)) {
      return;
    }

    // Verificar se a tool call existe nas mensagens antes de aprovar/rejeitar
    const allToolCalls = messages.flatMap(msg =>
      msg.parts.filter(isToolUIPart).map(part => ({
        id: part.id,
        toolName: part.type.replace('tool-', ''),
        state: part.state
      }))
    );

    console.log('🔍 [AssistantPanel] All tool calls in messages:', allToolCalls);
    console.log('🔍 [AssistantPanel] Looking for toolCallId:', toolCallId);

    const toolCallExists = allToolCalls.some(tc => tc.id === toolCallId);

    if (!toolCallExists) {
      console.warn('❌ [AssistantPanel] Tool call not found in messages:', {
        toolCallId,
        availableToolCalls: allToolCalls.map(tc => tc.id),
        totalMessages: messages.length,
        totalToolCalls: allToolCalls.length,
      });
      // Não processar - a tool call pode ter sido removida ou ainda não carregada
      return;
    }

    console.log('✅ [AssistantPanel] Tool call found! Proceeding with approval/rejection');

    if (result === 'approved' && imageUrl) {
      console.log('✅ [AssistantPanel] Auto-approving tool edit:', {
        toolCallId,
        imageUrl,
        imageUrlType: typeof imageUrl,
        imageUrlLength: imageUrl?.length,
      });

      // Marcar como processado antes de chamar addToolApprovalResponse
      handledEditResultsRef.current.add(toolCallId);

      // Notificar o agente que a edição foi aprovada
      console.log('✅ [AssistantPanel] Calling addToolApprovalResponse with:', {
        id: toolCallId,
        approved: true,
        result: imageUrl
      });

      addToolApprovalResponse({
        id: toolCallId,
        approved: true,
        result: imageUrl
      });

      console.log('✅ [AssistantPanel] addToolApprovalResponse completed');
    } else if (result === 'rejected') {
      console.debug('[AssistantPanel] Auto-denying tool edit:', { toolCallId, error });

      // Marcar como processado antes de chamar addToolApprovalResponse
      handledEditResultsRef.current.add(toolCallId);

      // Notificar o agente que a edição foi rejeitada
      addToolApprovalResponse({
        id: toolCallId,
        approved: false,
        reason: error || 'Edição rejeitada pelo usuário'
      });
    }
  }, [pendingToolEdit, addToolApprovalResponse, messages]);

  // ========================================================================
  // Debug: monitorar tool parts
  useEffect(() => {
    messages.forEach((msg, idx) => {
      const toolParts = msg.parts.filter(isToolUIPart);
      if (toolParts.length > 0) {
        console.debug(`[Chat] Message ${idx} has tool parts:`, toolParts.map((part) => ({
          toolName: part.type.replace('tool-', ''),
          state: part.state,
          toolCallId: part.toolCallId
        })));
      }
    });
  }, [messages]);

  useEffect(() => {
    if (!onShowToolEditPreview) return;

    for (const msg of messages) {
      const toolParts = msg.parts
        .filter(isToolUIPart)
        .filter((part) => part.type === 'tool-editImage');
      for (const part of toolParts) {
        if (part.state !== 'output-available' || !part.toolCallId) continue;
        if (handledEditResultsRef.current.has(part.toolCallId)) continue;
        const output = part.output as {
          imageUrl?: string;
          prompt?: string;
          referenceImageId?: string;
          referenceImageUrl?: string;
        } | undefined;
        if (!output?.imageUrl) continue;
        handledEditResultsRef.current.add(part.toolCallId);
        onShowToolEditPreview({
          toolCallId: part.toolCallId,
          imageUrl: output.imageUrl,
          prompt: output.prompt,
          referenceImageId: output.referenceImageId,
          referenceImageUrl: output.referenceImageUrl
        });
      }
    }
  }, [messages, onShowToolEditPreview]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Enviar mensagem
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !referenceImage) return;
    if (status === 'streaming' || status === 'submitted' || isSending) return;

    // Limpar erro anterior
    setErrorMessage(null);

    // Ativar estado de envio IMEDIATAMENTE (feedback visual instantâneo)
    setIsSending(true);

    // Salvar valor antes de limpar
    const messageText = input || (referenceImage ? 'Veja a imagem anexada' : '');

    // Limpar input IMEDIATAMENTE
    setInput('');

    try {
      // Construir mensagem com parts
      const messageParts: UIMessage['parts'] = [];

      // Adicionar texto (se houver)
      if (messageText.trim()) {
        messageParts.push({
          type: 'text',
          text: messageText
        });
      }

      // Adicionar imagem de referência (se houver)
      if (referenceImage) {
        messageParts.push({
          type: 'file',
          mediaType: getImageMediaType(referenceImage.src),
          filename: referenceImage.id,
          url: referenceImage.src
        });
      }

      // Enviar mensagem com parts
      const message: CreateUIMessage<UIMessage> = {
        role: 'user',
        parts: messageParts
      };
      await sendMessage(message);

      // Limpar referência de imagem após enviar (agora está no chat)
      if (referenceImage) {
        onClearReference();
      }
    } finally {
      // Desativar estado de envio após enviar
      // (o isLoading do SDK assume o controle)
      setTimeout(() => setIsSending(false), 500);
    }
  };

  // Upload de arquivo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const dataUrl = await fileToDataUrl(file);
        const uploadedUrl = await uploadDataUrlToBlob(dataUrl);

        // Limpar input
        setInput('');

        // Enviar mensagem com a imagem nos parts
        const message: CreateUIMessage<UIMessage> = {
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Carreguei esta referência para usarmos.'
            },
            {
              type: 'file',
              mediaType: file.type || 'image/png',
              filename: file.name,
              url: uploadedUrl
            }
          ]
        };
        await sendMessage(message);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Falha ao enviar a imagem. Tente novamente.';
        setErrorMessage(errorMessage);
        setTimeout(() => setErrorMessage(null), 5000);
      }

      // Limpar file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Drag-and-Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      setErrorMessage('Apenas imagens são suportadas');
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    // Upload do primeiro arquivo
    const file = imageFiles[0];
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploadedUrl = await uploadDataUrlToBlob(dataUrl);

      // Limpar input
      setInput('');

      // Enviar mensagem com a imagem nos parts
      const message: CreateUIMessage<UIMessage> = {
        role: 'user',
        parts: [
          {
            type: 'text',
            text: `Carreguei esta imagem via drag-and-drop: ${file.name}`
          },
          {
            type: 'file',
            mediaType: file.type || 'image/png',
            filename: file.name,
            url: uploadedUrl
          }
        ]
      };
      await sendMessage(message);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Falha ao enviar a imagem. Tente novamente.';
      setErrorMessage(errorMessage);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  // Aprovar tool
  const handleApprove = (approvalId: string) => {
    addToolApprovalResponse({
      id: approvalId,
      approved: true
    });
  };

  // Negar tool
  const handleDeny = (approvalId: string) => {
    addToolApprovalResponse({
      id: approvalId,
      approved: false,
      reason: 'Rejeitado pelo usuário'
    });
  };

  if (!isOpen) return null;

  return (
    <DataStreamProvider dataStream={dataStream} setDataStream={setDataStream}>
      <DataStreamHandler />

      <aside className="assistant-panel w-full h-full bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-white/[0.08] flex flex-col flex-shrink-0">
        {/* Header minimalista */}
        <div className="flex-shrink-0 h-14 flex items-center justify-between px-4">
          <img src="/icon.png" alt="Socialab" className="w-9 h-9 rounded-xl" />
          <div className="flex items-center gap-1">
            <button className="p-2 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/5">
              <Icon name="clock" className="w-4 h-4" />
            </button>
            <button className="p-2 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/5">
              <Icon name="plus" className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white/40 hover:text-white/80 transition-colors rounded-lg hover:bg-white/5"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chat Flow */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto scroll-smooth custom-scrollbar relative">
          {toast && (
            <div className="sticky top-0 z-10 flex justify-center">
              <div className={`px-3 py-2 rounded-md border text-[11px] backdrop-blur-sm ${toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                {toast.message}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}

          {/* Erro */}
          {errorMessage && (
            <div className="flex justify-center animate-fade-in">
              <div className="rounded-lg px-4 py-3 bg-red-500/10 border border-red-500/20 flex items-center gap-2 max-w-sm">
                <Icon name="alert-circle" className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-400">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Indicador de loading/processamento */}
          {shouldShowLoading && (
            <LoadingIndicatorEnhanced
              stage={isSending ? 'thinking' : 'generating'}
              showSkeleton={false}
            />
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 p-4">
          {/* Pending Tool Approvals - Fixo acima do input */}
          {pendingApprovals.length > 0 && (
            <div className="mb-3 space-y-2 animate-fade-in-up">
              {pendingApprovals.map((toolPart) => {
                const toolArgs = (
                  ('rawInput' in toolPart
                    ? (toolPart as { rawInput?: unknown }).rawInput
                    : toolPart.input) || {}
                ) as Record<string, unknown>;
                return (
                  <ToolWithApproval
                    key={toolPart.toolCallId}
                    toolCallId={toolPart.toolCallId}
                    toolName={toolPart.type.replace('tool-', '')}
                    args={toolArgs}
                    metadata={
                      'metadata' in toolPart
                        ? (toolPart as { metadata?: { preview?: unknown } }).metadata?.preview
                        : undefined
                    }
                    state={mapToolState(toolPart.state)}
                    approvalId={toolPart.approval?.id}
                    onApprove={handleApprove}
                    onDeny={handleDeny}
                    onAlwaysAllow={(toolName) => console.info('Always allow:', toolName)}
                  />
                );
              })}
            </div>
          )}

          {referenceImage && (
            <div className="relative mb-3 p-2 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3 animate-fade-in-up">
              <img
                src={referenceImage.src}
                alt="Reference"
                className="w-10 h-10 object-cover rounded-md border border-white/[0.08]"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-primary">
                  📎 Imagem anexada
                </p>
                <p className="text-[9px] text-white/40">
                  Será enviada junto com a mensagem
                </p>
              </div>
              <button
                onClick={onClearReference}
                className="w-6 h-6 rounded-md bg-black/40 text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-all flex items-center justify-center"
                title="Remover anexo"
              >
                <Icon name="x" className="w-3 h-3" />
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*"
            />

            <div
              className="bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/[0.08] rounded-xl overflow-hidden focus-within:border-white/30 transition-colors relative"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Drag-and-Drop Overlay */}
              {isDragging && (
                <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm z-50 rounded-xl flex items-center justify-center border-2 border-primary border-dashed">
                  <div className="text-center">
                    <Icon name="upload" className="w-12 h-12 text-primary mx-auto mb-2" />
                    <p className="text-sm text-primary font-medium">Solte a imagem para anexar</p>
                  </div>
                </div>
              )}
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Pergunte, pesquise ou converse..."
                className="w-full bg-transparent px-4 pt-3 pb-10 text-sm text-white placeholder:text-white/30 outline-none resize-none min-h-[80px] max-h-[200px] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                disabled={isLoading || isSending}
                rows={2}
              />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-7 h-7 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all flex items-center justify-center"
                >
                  <Icon name="plus" className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  className={`w-7 h-7 rounded-lg transition-all flex items-center justify-center ${
                    (isLoading || isSending)
                      ? 'bg-primary/20 text-primary/60 cursor-not-allowed'
                      : input.trim() || referenceImage
                      ? 'bg-primary text-white hover:bg-primary/90'
                      : 'text-white/30 hover:text-white/60 disabled:text-white/10'
                  }`}
                  disabled={(isLoading || isSending) || (!input.trim() && !referenceImage)}
                  title={(isLoading || isSending) ? 'Aguardando resposta...' : 'Enviar mensagem'}
                >
                  {(isLoading || isSending) ? (
                    <Loader size={16} className="text-white/60" />
                  ) : (
                    <Icon name="arrow-up" className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </aside>
    </DataStreamProvider>
  );
};
