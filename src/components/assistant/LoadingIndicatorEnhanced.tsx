/**
 * LoadingIndicatorEnhanced - Indicador de carregamento com ai-elements
 *
 * Usa Loader oficial do ai-elements mas mantém:
 * - Stage awareness (thinking → generating → processing)
 * - Skeleton placeholders customizados
 * - Animated dots para indicar atividade
 */

import React from 'react';
import { Loader } from '@/components/ai-elements/loader';

export interface LoadingIndicatorEnhancedProps {
  /**
   * Stage atual do processamento
   */
  stage?: 'thinking' | 'generating' | 'processing' | 'streaming';

  /**
   * Mensagem customizada (sobrescreve stage)
   */
  message?: string;

  /**
   * Mostrar skeleton placeholders (padrão: true)
   */
  showSkeleton?: boolean;
}

/**
 * Helper: determina mensagem baseada no stage
 */
function getStageMessage(stage?: string): string {
  switch (stage) {
    case 'thinking':
      return 'Pensando...';
    case 'generating':
      return 'Gerando resposta...';
    case 'processing':
      return 'Processando...';
    case 'streaming':
      return 'Escrevendo...';
    default:
      return 'Carregando...';
  }
}

/**
 * LoadingIndicatorEnhanced Component
 *
 * Renderiza um indicador de loading usando Loader oficial do ai-elements
 * com skeleton placeholders e stage awareness customizados.
 *
 * @example
 * ```tsx
 * // Loading básico
 * <LoadingIndicatorEnhanced />
 *
 * // Com stage específico
 * <LoadingIndicatorEnhanced stage="thinking" />
 *
 * // Com mensagem customizada
 * <LoadingIndicatorEnhanced message="Analisando imagem..." />
 *
 * // Sem skeleton
 * <LoadingIndicatorEnhanced stage="processing" showSkeleton={false} />
 * ```
 */
export function LoadingIndicatorEnhanced({
  stage,
  message,
  showSkeleton = true
}: LoadingIndicatorEnhancedProps) {
  // Determinar mensagem baseada no stage
  const stageMessage = message || getStageMessage(stage);

  return (
    <div className="flex justify-start animate-fade-in px-1">
      <div className="max-w-[90%] space-y-2">
        {/* Stage indicator com Loader oficial */}
        <div className="flex items-center gap-2 mb-3">
          {/* Loader oficial do ai-elements */}
          <Loader size={16} className="text-primary/60" />

          {/* Mensagem do stage */}
          <span className="text-xs text-white/40">{stageMessage}</span>
        </div>

        {/* Skeleton placeholders (mostram onde conteúdo vai aparecer) */}
        {showSkeleton && (
          <div className="space-y-2">
            {/* Linha 1 - 75% width */}
            <div
              className="h-3 bg-white/5 rounded-full animate-pulse"
              style={{ width: '75%' }}
            />

            {/* Linha 2 - 100% width */}
            <div
              className="h-3 bg-white/5 rounded-full animate-pulse"
              style={{ width: '100%', animationDelay: '100ms' }}
            />

            {/* Linha 3 - 66% width */}
            <div
              className="h-3 bg-white/5 rounded-full animate-pulse"
              style={{ width: '66%', animationDelay: '200ms' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * LoadingDots - Componente auxiliar apenas com Loader (sem skeleton)
 *
 * Útil para loading em áreas menores.
 */
export function LoadingDots({ message = 'Carregando...' }: { message?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Loader size={16} className="text-primary/60" />
      <span className="text-xs text-white/40">{message}</span>
    </div>
  );
}
