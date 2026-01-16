/**
 * LoadingIndicator - Indicador de carregamento com skeleton placeholders
 *
 * Mostra um estado de loading mais natural e informativo:
 * - Skeleton placeholders (mostra onde conteúdo vai aparecer)
 * - Stage awareness (thinking → generating → processing)
 * - Animated dots para indicar atividade
 * - Reduz ansiedade do usuário mostrando progresso
 */

import React from 'react';

export interface LoadingIndicatorProps {
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
 * LoadingIndicator Component
 *
 * Renderiza um indicador de loading com skeleton placeholders e stage awareness.
 *
 * @example
 * ```tsx
 * // Loading básico
 * <LoadingIndicator />
 *
 * // Com stage específico
 * <LoadingIndicator stage="thinking" />
 *
 * // Com mensagem customizada
 * <LoadingIndicator message="Analisando imagem..." />
 *
 * // Sem skeleton
 * <LoadingIndicator stage="processing" showSkeleton={false} />
 * ```
 */
export function LoadingIndicator({
  stage,
  message,
  showSkeleton = true
}: LoadingIndicatorProps) {
  // Determinar mensagem baseada no stage
  const stageMessage = message || getStageMessage(stage);

  return (
    <div className="flex justify-start animate-fade-in px-1">
      <div className="max-w-[90%] space-y-2">
        {/* Stage indicator com dots animados */}
        <div className="flex items-center gap-2 mb-3">
          {/* Animated dots */}
          <div className="flex gap-1.5">
            <span
              className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>

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
 * LoadingDots - Componente auxiliar apenas com dots (sem skeleton)
 *
 * Útil para loading em áreas menores.
 */
export function LoadingDots({ message = 'Carregando...' }: { message?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5">
        <span
          className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="w-2 h-2 bg-primary/60 rounded-full animate-bounce"
          style={{ animationDelay: '300ms' }}
        />
      </div>
      <span className="text-xs text-white/40">{message}</span>
    </div>
  );
}
