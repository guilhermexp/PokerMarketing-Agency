/**
 * MessageActionsEnhanced - Extensão de MessageActions com ações customizadas
 *
 * Usa ai-elements oficiais como base e adiciona:
 * - Copiar texto
 * - Copiar como código
 * - Compartilhar mensagem
 * - Fixar mensagem
 * - Fork da conversa
 */

import React, { useState } from 'react';
import { MessageActions, MessageAction } from '@/components/ai-elements/message';
import { Icon } from '../common/Icon';

export interface MessageActionsEnhancedProps {
  messageId: string;
  content: string;
  chatId?: string;
  onPin?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
}

/**
 * MessageActionsEnhanced Component
 *
 * Estende MessageActions oficial com ações customizadas.
 *
 * @example
 * ```tsx
 * <MessageActionsEnhanced
 *   messageId="msg-123"
 *   content="Texto da mensagem..."
 *   chatId="chat-456"
 *   onPin={(id) => console.log('Pin:', id)}
 *   onFork={(id) => console.log('Fork:', id)}
 * />
 * ```
 */
export function MessageActionsEnhanced({
  messageId,
  content,
  chatId,
  onPin,
  onFork
}: MessageActionsEnhancedProps) {
  const [toast, setToast] = useState<{ message: string } | null>(null);

  // Helper para mostrar toast
  const showToast = (message: string) => {
    setToast({ message });
    setTimeout(() => setToast(null), 2000);
  };

  // Copiar texto simples
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      showToast('Copiado!');
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  };

  // Copiar como código
  const handleCopyAsCode = async () => {
    try {
      await navigator.clipboard.writeText('```\n' + content + '\n```');
      showToast('Código copiado!');
    } catch (err) {
      console.error('Erro ao copiar código:', err);
    }
  };

  // Compartilhar mensagem
  const handleShare = async () => {
    try {
      const url = chatId
        ? `${window.location.origin}/chat/${chatId}?message=${messageId}`
        : `${window.location.origin}?message=${messageId}`;
      await navigator.clipboard.writeText(url);
      showToast('Link copiado!');
    } catch (err) {
      console.error('Erro ao compartilhar:', err);
    }
  };

  // Fixar mensagem
  const handlePin = () => {
    onPin?.(messageId);
    showToast('Mensagem fixada!');
  };

  // Fork da conversa
  const handleFork = () => {
    onFork?.(messageId);
    showToast('Conversa bifurcada!');
  };

  return (
    <>
      {/* Ações usando ai-elements oficiais */}
      <MessageActions className="opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Copiar texto */}
        <MessageAction
          onClick={handleCopy}
          tooltip="Copiar"
          variant="ghost"
          size="icon-sm"
          className="hover:bg-white/5"
        >
          <Icon name="copy" className="w-4 h-4" />
        </MessageAction>

        {/* Copiar como código */}
        <MessageAction
          onClick={handleCopyAsCode}
          tooltip="Copiar como código"
          variant="ghost"
          size="icon-sm"
          className="hover:bg-white/5"
        >
          <Icon name="code" className="w-4 h-4" />
        </MessageAction>

        {/* Compartilhar */}
        <MessageAction
          onClick={handleShare}
          tooltip="Compartilhar"
          variant="ghost"
          size="icon-sm"
          className="hover:bg-white/5"
        >
          <Icon name="share" className="w-4 h-4" />
        </MessageAction>

        {/* Fixar (se callback fornecido) */}
        {onPin && (
          <MessageAction
            onClick={handlePin}
            tooltip="Fixar mensagem"
            variant="ghost"
            size="icon-sm"
            className="hover:bg-white/5"
          >
            <Icon name="pin" className="w-4 h-4" />
          </MessageAction>
        )}

        {/* Fork (se callback fornecido) */}
        {onFork && (
          <MessageAction
            onClick={handleFork}
            tooltip="Fork daqui"
            variant="ghost"
            size="icon-sm"
            className="hover:bg-white/5"
          >
            <Icon name="git-branch" className="w-4 h-4" />
          </MessageAction>
        )}
      </MessageActions>

      {/* Toast de sucesso */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-green-500/90 text-white px-4 py-2 rounded-lg shadow-lg z-[100] animate-fade-in">
          <div className="flex items-center gap-2">
            <Icon name="check" className="w-4 h-4" />
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </>
  );
}
