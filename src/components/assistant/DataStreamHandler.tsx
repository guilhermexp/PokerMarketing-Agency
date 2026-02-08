/**
 * Data Stream Handler - Vercel AI SDK
 *
 * Processa eventos customizados do dataStream e atualiza a UI
 */

import { useEffect, useRef } from 'react';
import { useDataStream } from './DataStreamProvider';

/**
 * Handler que processa eventos do dataStream
 *
 * Este componente não renderiza nada, apenas escuta eventos
 * e atualiza outros stores/estados conforme necessário
 */
export function DataStreamHandler() {
  const { dataStream } = useDataStream();
  const processedIndexRef = useRef(0);

  useEffect(() => {
    // Processar apenas novos eventos (não reprocessar)
    const newDeltas = dataStream.slice(processedIndexRef.current);
    processedIndexRef.current = dataStream.length;

    for (const delta of newDeltas) {
      switch (delta.type) {
        // =====================================================================
        // IMAGE GENERATION EVENTS
        // =====================================================================
        case 'data-imageGenerating':
          console.debug('[DataStream] Gerando imagem:', delta.data.description);
          break;

        case 'data-imageCreated':
          console.debug('[DataStream] Imagem criada:', delta.data.url);
          // TODO: Adicionar notificação quando sistema de notificação existir
          // TODO: Recarregar galeria
          break;

        // =====================================================================
        // IMAGE EDITING EVENTS
        // =====================================================================
        case 'data-imageEditing':
          console.debug('[DataStream] Editando imagem:', delta.data.prompt);
          break;

        case 'data-imageEdited':
          console.debug('[DataStream] Imagem editada:', delta.data.url);
          // TODO: Adicionar notificação e recarregar galeria
          break;

        // =====================================================================
        // LOGO GENERATION EVENTS
        // =====================================================================
        case 'data-logoGenerating':
          console.debug('[DataStream] Gerando logo:', delta.data.prompt);
          break;

        case 'data-logoCreated':
          console.debug('[DataStream] Logo criado:', delta.data.url);
          // TODO: Adicionar notificação e recarregar galeria
          break;

        // =====================================================================
        // ERROR EVENTS
        // =====================================================================
        case 'data-imageError':
        case 'data-logoError':
          console.error('[DataStream] Erro:', delta.data.error);
          // TODO: Adicionar notificação de erro
          break;

        // =====================================================================
        // UNKNOWN EVENT
        // =====================================================================
        default:
          console.warn('[DataStream] Evento desconhecido:', delta);
      }
    }
  }, [dataStream]);

  // Componente sem UI
  return null;
}
