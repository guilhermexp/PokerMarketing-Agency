/**
 * SendToChatButton - Botão reutilizável para enviar imagem ao chat
 *
 * Estilo visual baseado em GalleryView.tsx (botões de ação em hover):
 * - w-7 h-7
 * - bg-black/60 backdrop-blur-sm
 * - hover:bg-black/80 hover:text-primary
 * - Ícone paperclip 3.5x3.5
 *
 * Uso:
 * <SendToChatButton image={galleryImage} />
 */

import React from 'react';
import { useChatContext } from '../../contexts/ChatContext';
import { Icon } from './Icon';
import type { GalleryImage } from '../../types';

interface SendToChatButtonProps {
  image: GalleryImage;
  className?: string;
}

export const SendToChatButton: React.FC<SendToChatButtonProps> = ({
  image,
  className = ''
}) => {
  const { onSetChatReference, setIsAssistantOpen } = useChatContext();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Evita click no parent (card de imagem)
    onSetChatReference(image);
    setIsAssistantOpen(true);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/80 hover:text-primary transition-all ${className}`}
      title="Enviar para Chat"
    >
      <Icon name="paperclip" className="w-3.5 h-3.5" />
    </button>
  );
};
