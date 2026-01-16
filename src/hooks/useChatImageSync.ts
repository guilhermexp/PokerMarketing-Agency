/**
 * Hook para sincronizar atualizações de imagens da galeria com o chat
 *
 * Responsabilidades:
 * 1. Caso A: Atualizar chatReferenceImage quando imagem anexada é editada
 * 2. Caso B: Atualizar mensagens no histórico quando imagem já enviada é editada
 *
 * Otimizações:
 * - Map lookup O(1) em vez de nested loops
 * - Deep equality check antes de setMessages
 * - Debounce para evitar updates excessivos
 */

import { useEffect, useRef } from 'react';
import type { Message } from '@ai-sdk/react';
import type { GalleryImage, ChatReferenceImage } from '../types';

interface UseChatImageSyncProps {
  galleryImages: GalleryImage[];
  chatReferenceImage: ChatReferenceImage | null;
  setChatReferenceImage: (ref: ChatReferenceImage | null) => void;
  messages: Message[];
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
}

/**
 * Deep equality check para arrays de mensagens
 */
function deepEqual(a: Message[], b: Message[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const msgA = a[i];
    const msgB = b[i];

    // Comparar IDs
    if (msgA.id !== msgB.id) return false;

    // Comparar parts (se existirem)
    if (msgA.parts && msgB.parts) {
      if (msgA.parts.length !== msgB.parts.length) return false;

      for (let j = 0; j < msgA.parts.length; j++) {
        const partA = msgA.parts[j];
        const partB = msgB.parts[j];

        // Comparar URLs de imagens (o que nos interessa)
        if (partA.type === 'file' && partB.type === 'file') {
          if (partA.url !== partB.url) return false;
        }
      }
    } else if (msgA.parts !== msgB.parts) {
      return false;
    }
  }

  return true;
}

export function useChatImageSync({
  galleryImages,
  chatReferenceImage,
  setChatReferenceImage,
  messages,
  setMessages
}: UseChatImageSyncProps) {
  // Usar ref para evitar re-execução desnecessária do debounce
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Limpar timeout anterior
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce de 300ms para evitar updates excessivos
    timeoutRef.current = setTimeout(() => {
      let hasChanges = false;

      // ========================================================================
      // CASO A: Atualizar referência anexada (não enviada)
      // ========================================================================
      if (chatReferenceImage?.id) {
        const updatedImage = galleryImages.find(
          img => img.id === chatReferenceImage.id
        );

        // Se encontrou a imagem e a URL mudou
        if (updatedImage && updatedImage.src !== chatReferenceImage.src) {
          setChatReferenceImage({ id: updatedImage.id, src: updatedImage.src });
          hasChanges = true;
        }

        // Se a imagem foi deletada (não está mais em galleryImages)
        if (!updatedImage) {
          setChatReferenceImage(null);
          hasChanges = true;
        }
      }

      // ========================================================================
      // CASO B: Atualizar mensagens no histórico
      // ========================================================================

      // Criar Map para lookup O(1)
      const imageIdToUrlMap = new Map(
        galleryImages.map(img => [img.id, img.src])
      );

      // Verificar se alguma mensagem precisa de update
      const updatedMessages = messages.map(msg => {
        if (!msg.parts) return msg;

        let partsNeedUpdate = false;
        const updatedParts = msg.parts.map(part => {
          const fileId = (part as any).filename || (part as any).name;
          if (part.type === 'file' && fileId && imageIdToUrlMap.has(fileId)) {
            const newUrl = imageIdToUrlMap.get(fileId)!;
            if (newUrl !== part.url) {
              partsNeedUpdate = true;
              return { ...part, url: newUrl };
            }
          }
          return part;
        });

        if (partsNeedUpdate) {
          hasChanges = true;
          return { ...msg, parts: updatedParts };
        }

        return msg;
      });

      // Apenas atualizar se houve mudanças (deep equality check)
      if (hasChanges && !deepEqual(updatedMessages, messages)) {
        setMessages(updatedMessages);
      }
    }, 300);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [galleryImages, chatReferenceImage, messages, setChatReferenceImage, setMessages]);
}
