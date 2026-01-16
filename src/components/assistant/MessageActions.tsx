/**
 * MessageActions - Menu de ações para mensagens do chat
 *
 * Fornece ações contextuais para cada mensagem:
 * - Copiar texto
 * - Copiar como código
 * - Compartilhar mensagem
 * - Fixar mensagem
 * - Fork da conversa
 *
 * O menu aparece apenas no hover (design minimalista)
 */

import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../common/Icon';

export interface MessageActionsProps {
  messageId: string;
  content: string;
  chatId?: string;
  onPin?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
}

export function MessageActions({
  messageId,
  content,
  chatId,
  onPin,
  onFork
}: MessageActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Helper para mostrar toast
  const showSuccessToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // Copiar texto simples
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      showSuccessToast('Copiado!');
      setIsOpen(false);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  };

  // Copiar como código
  const handleCopyAsCode = async () => {
    try {
      await navigator.clipboard.writeText('```\n' + content + '\n```');
      showSuccessToast('Código copiado!');
      setIsOpen(false);
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
      showSuccessToast('Link copiado!');
      setIsOpen(false);
    } catch (err) {
      console.error('Erro ao compartilhar:', err);
    }
  };

  // Fixar mensagem
  const handlePin = () => {
    onPin?.(messageId);
    showSuccessToast('Mensagem fixada!');
    setIsOpen(false);
  };

  // Fork da conversa
  const handleFork = () => {
    onFork?.(messageId);
    showSuccessToast('Conversa bifurcada!');
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Botão de ações (aparece no hover) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/5 rounded-lg transition-all"
        aria-label="Mais ações"
      >
        <Icon name="more-vertical" className="w-4 h-4 text-white/40 hover:text-white/80" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-50 py-1 animate-fade-in">
          {/* Copiar */}
          <button
            onClick={handleCopy}
            className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <Icon name="copy" className="w-4 h-4" />
            Copiar
          </button>

          {/* Copiar como código */}
          <button
            onClick={handleCopyAsCode}
            className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <Icon name="code" className="w-4 h-4" />
            Copiar como código
          </button>

          {/* Separador */}
          <div className="h-px bg-white/10 my-1" />

          {/* Compartilhar */}
          <button
            onClick={handleShare}
            className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <Icon name="share" className="w-4 h-4" />
            Compartilhar
          </button>

          {/* Fixar (se callback fornecido) */}
          {onPin && (
            <button
              onClick={handlePin}
              className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 transition-colors flex items-center gap-2"
            >
              <Icon name="pin" className="w-4 h-4" />
              Fixar mensagem
            </button>
          )}

          {/* Separador */}
          {onFork && <div className="h-px bg-white/10 my-1" />}

          {/* Fork (se callback fornecido) */}
          {onFork && (
            <button
              onClick={handleFork}
              className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 transition-colors flex items-center gap-2"
            >
              <Icon name="git-branch" className="w-4 h-4" />
              Fork daqui
            </button>
          )}
        </div>
      )}

      {/* Toast de sucesso */}
      {showToast && (
        <div className="fixed bottom-4 right-4 bg-green-500/90 text-white px-4 py-2 rounded-lg shadow-lg z-[100] animate-fade-in">
          <div className="flex items-center gap-2">
            <Icon name="check" className="w-4 h-4" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
