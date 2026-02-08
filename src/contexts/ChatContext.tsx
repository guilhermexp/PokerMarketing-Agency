/**
 * Context para propagar funções do chat sem prop drilling
 *
 * Fornece:
 * - onSetChatReference: função para definir imagem de referência no chat
 * - isAssistantOpen: estado do painel do assistente
 * - setIsAssistantOpen: função para abrir/fechar o assistente
 */

import React, { createContext, useContext } from 'react';
import type { GalleryImage } from '../types';

interface ChatContextValue {
  onSetChatReference: (image: GalleryImage) => void;
  isAssistantOpen: boolean;
  setIsAssistantOpen: (open: boolean) => void;
  renderPreviewChatPanel?: () => React.ReactNode;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * Hook para acessar o ChatContext
 * Lança erro se usado fora do Provider
 */
export function useChatContext() {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error('useChatContext must be used within ChatContext.Provider');
  }

  return context;
}

/**
 * Provider do ChatContext
 * Deve envolver os componentes que precisam acesso às funções do chat
 */
export const ChatProvider = ChatContext.Provider;
