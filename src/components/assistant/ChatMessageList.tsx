/**
 * ChatMessageList - Lista de mensagens do chat
 *
 * Renderiza todas as mensagens (user + assistant), incluindo
 * toast notifications, erros e indicador de loading.
 */

import React, { memo } from 'react';
import {
  isFileUIPart,
  isTextUIPart,
  type UIMessage,
} from 'ai';
import { Icon } from '../common/Icon';
import { MessageResponse } from './MessageResponse';
import { MessageActionsEnhanced } from './MessageActionsEnhanced';
import { LoadingIndicatorEnhanced } from './LoadingIndicatorEnhanced';

// ========================================================================
// ChatBubble - Renderiza uma mensagem individual
// ========================================================================
const ChatBubble: React.FC<{ message: UIMessage }> = memo(function ChatBubble({ message }) {
  const isAssistant = message.role === 'assistant';

  const textParts = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join(' ');

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
                className="relative rounded-xl overflow-hidden border border-border bg-black/20 animate-fade-in-up"
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
          <div
            className={`${
              isAssistant
                ? 'px-1 text-white/90'
                : 'bg-[#0a0a0a]/60 backdrop-blur-xl border border-border rounded-2xl px-5 py-3.5 text-white/95'
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
});

// ========================================================================
// ChatMessageList
// ========================================================================
interface ChatMessageListProps {
  messages: UIMessage[];
  toast: { message: string; type: 'success' | 'error' } | null;
  errorMessage: string | null;
  shouldShowLoading: boolean;
  isSending: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = memo(function ChatMessageList({
  messages,
  toast,
  errorMessage,
  shouldShowLoading,
  isSending,
  chatEndRef,
}) {
  return (
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
  );
});
