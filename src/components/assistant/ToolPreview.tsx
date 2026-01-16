/**
 * ToolPreview - Preview visual de tools antes da aprovação
 *
 * Mostra ao usuário o que a tool vai fazer antes de executá-la,
 * incluindo:
 * - Nome e descrição da tool
 * - Parâmetros que serão usados
 * - O que a tool vai fazer (lista de ações)
 * - Tempo estimado e custo (se disponível)
 * - Opção "Sempre permitir" para reduzir friction
 */

import React from 'react';
import { Icon } from '../common/Icon';

export interface ToolPreviewMetadata {
  title?: string;
  description?: string;
  estimatedTime?: string;
  cost?: string;
  willDo?: string[];
  icon?: string;
}

export interface ToolPreviewProps {
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
  metadata?: ToolPreviewMetadata;
  onApprove: (toolCallId: string) => void;
  onDeny: (toolCallId: string) => void;
  onAlwaysAllow?: (toolName: string) => void;
}

/**
 * ToolPreview Component
 *
 * Renderiza um preview completo da tool antes da aprovação.
 *
 * @example
 * ```tsx
 * <ToolPreview
 *   toolCallId="abc123"
 *   toolName="createImage"
 *   args={{ description: "...", aspectRatio: "16:9" }}
 *   metadata={{
 *     title: "Criar Imagem",
 *     estimatedTime: "15-30 segundos",
 *     willDo: ["Gerar imagem com IA", "Salvar na galeria"]
 *   }}
 *   onApprove={handleApprove}
 *   onDeny={handleDeny}
 * />
 * ```
 */
export function ToolPreview({
  toolCallId,
  toolName,
  args,
  metadata,
  onApprove,
  onDeny,
  onAlwaysAllow
}: ToolPreviewProps) {
  const title = metadata?.title || toolName;
  const description = metadata?.description;
  const icon = metadata?.icon || 'zap';

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 animate-fade-in-up">
      {/* Header com ícone e título */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
          <Icon name={icon as any} className="w-5 h-5 text-yellow-400" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-yellow-200">{title}</h4>
          {description && (
            <p className="text-xs text-yellow-300/70 mt-1">{description}</p>
          )}
        </div>
      </div>

      {/* Parâmetros */}
      <div className="bg-black/30 rounded-lg p-3 mb-3">
        <p className="text-xs text-white/50 mb-2">Parâmetros:</p>
        <pre className="text-xs text-white/80 overflow-x-auto">
          {JSON.stringify(args, null, 2)}
        </pre>
      </div>

      {/* O que a tool vai fazer */}
      {metadata?.willDo && metadata.willDo.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-white/50 mb-2">Esta ferramenta irá:</p>
          <ul className="space-y-1">
            {metadata.willDo.map((item, index) => (
              <li
                key={index}
                className="text-xs text-white/70 flex items-start gap-2"
              >
                <Icon name="check" className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Estimativas (tempo e custo) */}
      {(metadata?.estimatedTime || metadata?.cost) && (
        <div className="flex gap-3 mb-4 text-xs">
          {metadata.estimatedTime && (
            <div className="flex items-center gap-1.5 text-white/50">
              <Icon name="clock" className="w-3 h-3" />
              <span>{metadata.estimatedTime}</span>
            </div>
          )}
          {metadata.cost && (
            <div className="flex items-center gap-1.5 text-white/50">
              <Icon name="dollar-sign" className="w-3 h-3" />
              <span>{metadata.cost}</span>
            </div>
          )}
        </div>
      )}

      {/* Ações de aprovação */}
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(toolCallId)}
          className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          ✓ Aprovar
        </button>

        <button
          onClick={() => onDeny(toolCallId)}
          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium rounded-lg transition-colors"
        >
          ✗ Negar
        </button>

        {onAlwaysAllow && (
          <button
            onClick={() => onAlwaysAllow(toolName)}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-xs rounded-lg transition-colors whitespace-nowrap"
            title="Sempre permitir esta ferramenta sem pedir aprovação"
          >
            Sempre permitir
          </button>
        )}
      </div>
    </div>
  );
}
