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
    <div className="bg-black/70 border border-white/10 rounded-lg p-3 animate-fade-in-up">
      {/* Header com ícone e título */}
      <div className="flex items-start gap-2 mb-2">
        <div className="w-7 h-7 rounded-md bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
          <Icon name={icon as any} className="w-3.5 h-3.5 text-white/70" />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-[11px] font-semibold text-white/90">{title}</h4>
          {description && (
            <p className="text-[11px] text-white/50 mt-0.5">{description}</p>
          )}
        </div>
      </div>

      {/* Parâmetros */}
      <div className="bg-black/40 border border-white/5 rounded-md p-2 mb-2">
        <p className="text-[10px] text-white/40 mb-1">Parâmetros</p>
        <pre className="text-[10px] text-white/70 overflow-x-auto">
          {JSON.stringify(args, null, 2)}
        </pre>
      </div>

      {/* O que a tool vai fazer */}
      {metadata?.willDo && metadata.willDo.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] text-white/40 mb-1">Ações</p>
          <ul className="space-y-0.5">
            {metadata.willDo.map((item, index) => (
              <li
                key={index}
                className="text-[10px] text-white/60 flex items-start gap-1.5"
              >
                <Icon name="check" className="w-3 h-3 text-white/40 mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Estimativas (tempo e custo) */}
      {(metadata?.estimatedTime || metadata?.cost) && (
        <div className="flex gap-2 mb-3 text-[10px] text-white/40">
          {metadata.estimatedTime && (
            <div className="flex items-center gap-1">
              <Icon name="clock" className="w-3 h-3 text-white/30" />
              <span>{metadata.estimatedTime}</span>
            </div>
          )}
          {metadata.cost && (
            <div className="flex items-center gap-1">
              <Icon name="dollar-sign" className="w-3 h-3 text-white/30" />
              <span>{metadata.cost}</span>
            </div>
          )}
        </div>
      )}

      {/* Ações de aprovação */}
      <div className="flex gap-1.5">
        <button
          onClick={() => onApprove(toolCallId)}
          className="flex-1 h-8 bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium rounded-md transition-colors"
        >
          Aprovar
        </button>

        <button
          onClick={() => onDeny(toolCallId)}
          className="h-8 px-3 bg-transparent border border-white/10 hover:border-white/20 text-white/60 text-[11px] font-medium rounded-md transition-colors"
        >
          Negar
        </button>

        {onAlwaysAllow && (
          <button
            onClick={() => onAlwaysAllow(toolName)}
            className="h-8 px-3 bg-white/5 hover:bg-white/10 text-white/50 text-[10px] rounded-md transition-colors whitespace-nowrap"
            title="Sempre permitir esta ferramenta sem pedir aprovação"
          >
            Sempre permitir
          </button>
        )}
      </div>
    </div>
  );
}
