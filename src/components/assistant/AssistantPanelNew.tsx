/**
 * AssistantPanelNew - Versão com Vercel AI SDK
 *
 * Mantém a MESMA UI do painel lateral original,
 * mas usando useChat hook do Vercel AI SDK internamente
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import type { ChatReferenceImage, BrandProfile, GalleryImage, PendingToolEdit } from '../../types';
import { useChatImageSync } from '../../hooks/useChatImageSync';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { DataStreamProvider } from './DataStreamProvider';
import { DataStreamHandler } from './DataStreamHandler';
import { MessageResponse } from './MessageResponse';
import { MessageActions } from './MessageActions';
import { ToolPreview } from './ToolPreview';
import { LoadingIndicator } from './LoadingIndicator';

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
const getImageMediaType = (url: string): 'image/jpeg' | 'image/png' | 'image/webp' => {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg')) return 'image/jpeg';
  if (lowerUrl.includes('.webp')) return 'image/webp';
  return 'image/png'; // default
};

// ChatBubble component
const ChatBubble: React.FC<{ message: any; onApprove?: (id: string) => void; onDeny?: (id: string) => void }> = ({
  message,
  onApprove,
  onDeny
}) => {
  const isAssistant = message.role === 'assistant';

  // Renderizar conteúdo usando message.parts (v5)
  const textParts = message.parts
    ?.filter((part: any) => part.type === 'text')
    .map((part: any) => part.text)
    .join(' ') || '';

  // Extrair imagens/arquivos
  const fileParts = message.parts
    ?.filter((part: any) => part.type === 'file') || [];

  // Tool calls (aguardando aprovação)
  // IMPORTANTE: Filtrar editImage tool calls (serão tratados via AI Studio)
  const toolCalls = message.toolInvocations?.filter((inv: any) =>
    inv.state === 'call' && inv.toolName !== 'editImage'
  ) || [];

  return (
    <div className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'} space-y-2 animate-fade-in-up`}>
      {/* Renderizar imagens (se houver) */}
      {fileParts.length > 0 && (
        <div className={`max-w-[90%] ${isAssistant ? '' : 'flex justify-end'}`}>
          <div className="space-y-2">
            {fileParts.map((file: any, idx: number) => (
              <div
                key={idx}
                className="relative rounded-xl overflow-hidden border border-white/10 bg-black/20 animate-fade-in-up"
              >
                <img
                  src={file.url}
                  alt={file.name}
                  className="max-w-full max-h-[300px] object-contain"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-[10px] text-white/70 truncate">{file.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Renderizar texto (se houver) */}
      {textParts && (
        <div className="group relative max-w-[90%]">
          {/* Ações (aparecem no hover) */}
          <div className="absolute top-2 right-2 z-10">
            <MessageActions
              messageId={message.id}
              content={textParts}
              onPin={() => console.log('Pin message:', message.id)}
              onFork={() => console.log('Fork from:', message.id)}
            />
          </div>

          {/* Conteúdo da mensagem */}
          <div
            className={`${
              isAssistant
                ? 'px-1 text-white/90'
                : 'bg-[#1a1a1a] rounded-2xl px-5 py-3.5 text-white/95'
            }`}
          >
            <MessageResponse className="text-[13px] leading-relaxed prose prose-invert">
              {textParts}
            </MessageResponse>
          </div>
        </div>
      )}

      {/* Tool Approval UI com ToolPreview */}
      {toolCalls.map((toolCall: any) => (
        <div key={toolCall.toolCallId} className="max-w-[90%]">
          <ToolPreview
            toolCallId={toolCall.toolCallId}
            toolName={toolCall.toolName}
            args={toolCall.args}
            metadata={toolCall.metadata?.preview}
            onApprove={onApprove!}
            onDeny={onDeny!}
            onAlwaysAllow={(toolName) => console.log('Always allow:', toolName)}
          />
        </div>
      ))}
    </div>
  );
};

export const AssistantPanelNew: React.FC<AssistantPanelNewProps> = ({
  isOpen,
  onClose,
  referenceImage,
  onClearReference,
  onUpdateReference,
  galleryImages,
  brandProfile,
  pendingToolEdit,
  onRequestImageEdit,
  onToolEditApproved,
  onToolEditRejected
}) => {
  const [input, setInput] = useState('');
  const [dataStream, setDataStream] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chatId] = useState(() => crypto.randomUUID());
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false); // Estado local para feedback imediato
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // useChat hook do Vercel AI SDK
  const { messages, sendMessage, isLoading, stop, addToolResult, setMessages } = useChat({
    api: '/api/chat',
    id: chatId,
    body: {
      brandProfile: brandProfile,
      chatReferenceImage: referenceImage,
      selectedChatModel: brandProfile?.preferredAIModel || 'x-ai/grok-4.1-fast'
    },
    onResponse: (response) => {
      console.log('[AssistantPanel] Response received', response.status);
    },
    onError: (error) => {
      console.error('[AssistantPanel] Error:', error);
      setErrorMessage(error.message || 'Erro ao processar mensagem. Tente novamente.');
      // Auto-limpar erro após 5 segundos
      setTimeout(() => setErrorMessage(null), 5000);
    },
    onFinish: (message) => {
      console.log('[AssistantPanel] Message finished:', {
        role: message.role,
        content: message.content?.substring(0, 100),
        toolInvocations: message.toolInvocations?.length || 0,
        toolInvocationsDetails: message.toolInvocations?.map(inv => ({
          toolName: inv.toolName,
          state: inv.state,
          toolCallId: inv.toolCallId
        }))
      });
    }
  });

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
  // TOOL EDIT APPROVAL - Detectar editImage tool calls
  // ========================================================================
  const editImageToolCalls = useMemo(() => {
    const allToolInvocations = messages.flatMap(msg => msg.toolInvocations || []);
    const editImageCalls = allToolInvocations.filter(inv => inv.state === 'call' && inv.toolName === 'editImage');

    if (editImageCalls.length > 0) {
      console.log('[AssistantPanel] Found editImage calls:', editImageCalls.length);
    }

    return editImageCalls;
  }, [messages]);

  // Disparar request para abrir AI Studio quando detectar editImage tool call
  useEffect(() => {
    if (editImageToolCalls.length > 0 && !pendingToolEdit && onRequestImageEdit) {
      const toolCall = editImageToolCalls[0]; // Processar primeira da fila

      console.debug('[AssistantPanel] editImage tool call detected:', toolCall);

      // Disparar request para abrir AI Studio
      onRequestImageEdit({
        toolCallId: toolCall.toolCallId,
        toolName: 'editImage',
        prompt: toolCall.args.prompt,
        imageId: referenceImage?.id || '', // Imagem em foco
      });
    }
  }, [editImageToolCalls, pendingToolEdit, referenceImage, onRequestImageEdit]);

  // Processar resultado de aprovação/rejeição do AI Studio
  useEffect(() => {
    if (!pendingToolEdit) return;

    const result = (pendingToolEdit as any).result;
    const imageUrl = (pendingToolEdit as any).imageUrl;
    const error = (pendingToolEdit as any).error;

    if (result === 'approved' && imageUrl && addToolResult) {
      console.debug('[AssistantPanel] Tool edit approved, sending result:', { toolCallId: pendingToolEdit.toolCallId, imageUrl });

      addToolResult({
        toolCallId: pendingToolEdit.toolCallId,
        result: {
          approved: true,
          imageUrl: imageUrl
        }
      });
    } else if (result === 'rejected' && addToolResult) {
      console.debug('[AssistantPanel] Tool edit rejected, sending error:', { toolCallId: pendingToolEdit.toolCallId, error });

      addToolResult({
        toolCallId: pendingToolEdit.toolCallId,
        result: {
          approved: false,
          error: error || 'Edição rejeitada pelo usuário'
        }
      });
    }
  }, [pendingToolEdit, addToolResult]);

  // Debug: monitorar tool invocations
  useEffect(() => {
    messages.forEach((msg, idx) => {
      if (msg.toolInvocations && msg.toolInvocations.length > 0) {
        console.log(`[Chat] Message ${idx} has tool invocations:`, msg.toolInvocations.map(inv => ({
          toolName: inv.toolName,
          state: inv.state,
          toolCallId: inv.toolCallId
        })));
      }
    });
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Enviar mensagem
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !referenceImage) return;
    if (isLoading || isSending) return;

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
      const messageParts: any[] = [];

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
          name: referenceImage.id,
          url: referenceImage.src
        });
      }

      // Enviar mensagem com parts
      await sendMessage({
        role: 'user',
        parts: messageParts
      } as any);

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
      const dataUrl = await fileToDataUrl(file);

      // Limpar input
      setInput('');

      // Enviar mensagem com a imagem nos parts
      await sendMessage({
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Carreguei esta referência para usarmos.'
          },
          {
            type: 'file',
            mediaType: file.type as any,
            name: file.name,
            url: dataUrl
          }
        ]
      } as any);

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
    const dataUrl = await fileToDataUrl(file);

    // Limpar input
    setInput('');

    // Enviar mensagem com a imagem nos parts
    await sendMessage({
      role: 'user',
      parts: [
        {
          type: 'text',
          text: `Carreguei esta imagem via drag-and-drop: ${file.name}`
        },
        {
          type: 'file',
          mediaType: file.type as any,
          name: file.name,
          url: dataUrl
        }
      ]
    } as any);
  };

  // Aprovar tool
  const handleApprove = (toolCallId: string) => {
    addToolResult({
      toolCallId,
      result: { approved: true }
    });
  };

  // Negar tool
  const handleDeny = (toolCallId: string) => {
    addToolResult({
      toolCallId,
      result: { approved: false }
    });
  };

  if (!isOpen) return null;

  return (
    <DataStreamProvider dataStream={dataStream} setDataStream={setDataStream}>
      <DataStreamHandler />

      <aside className="w-full sm:w-[380px] h-full bg-[#080808] border-l border-white/10 flex flex-col flex-shrink-0">
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
        <div className="flex-1 p-4 space-y-4 overflow-y-auto scroll-smooth custom-scrollbar">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} onApprove={handleApprove} onDeny={handleDeny} />
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
          {(isLoading || isSending) && (
            <LoadingIndicator
              stage={isSending ? 'thinking' : 'generating'}
            />
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 p-4">
          {referenceImage && (
            <div className="relative mb-3 p-2 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3 animate-fade-in-up">
              <img
                src={referenceImage.src}
                alt="Reference"
                className="w-10 h-10 object-cover rounded-md border border-white/10"
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
              className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden focus-within:border-white/20 transition-colors relative"
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
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Pergunte, pesquise ou converse..."
                className="w-full bg-transparent px-4 pt-3 pb-10 text-sm text-white placeholder:text-white/30 outline-none resize-none min-h-[80px] max-h-[200px]"
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
                    <Loader className="w-4 h-4" />
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
