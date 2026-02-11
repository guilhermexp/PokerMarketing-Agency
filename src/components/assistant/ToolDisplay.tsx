/**
 * ToolDisplay - Componente focado em exibir informações da tool
 *
 * Usa ai-elements oficiais para mostrar:
 * - Nome e descrição da tool
 * - Parâmetros que serão usados
 * - O que a tool vai fazer (lista de ações)
 * - Tempo estimado e custo (se disponível)
 */

import React from 'react';
import type { ToolUIPart } from 'ai';
import { Tool, ToolHeader, ToolContent, ToolInput } from '@/components/ai-elements/tool';
import { Icon } from '../common/Icon';

export interface ToolDisplayMetadata {
  title?: string;
  description?: string;
  estimatedTime?: string;
  cost?: string;
  willDo?: string[];
  icon?: string;
}

export interface ToolDisplayProps {
  toolName: string;
  args: Record<string, unknown>;
  metadata?: ToolDisplayMetadata;
  state?: 'approval-requested' | 'approved' | 'denied' | 'executing' | 'complete';
}

/**
 * ToolDisplay Component
 *
 * Renderiza preview da tool usando componentes ai-elements oficiais.
 *
 * @example
 * ```tsx
 * <ToolDisplay
 *   toolName="createImage"
 *   args={{ description: "...", aspectRatio: "16:9" }}
 *   metadata={{
 *     title: "Criar Imagem",
 *     estimatedTime: "15-30 segundos",
 *     willDo: ["Gerar imagem com IA", "Salvar na galeria"]
 *   }}
 * />
 * ```
 */
export function ToolDisplay({
  toolName,
  args,
  metadata,
  state = 'approval-requested'
}: ToolDisplayProps) {
  const title = metadata?.title || toolName;
  const description = metadata?.description;

  // Mapear state interno para state do ai-elements
  const aiElementsState: ToolUIPart['state'] =
    state === 'approval-requested' ? 'input-available' : 'output-available';

  return (
    <Tool className="bg-black/70 border-border">
      <ToolHeader
        title={title}
        type={`tool-${toolName}`}
        state={aiElementsState}
        className="p-3"
      />

      <ToolContent>
        {/* Descrição */}
        {description && (
          <div className="px-4 pt-2">
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        )}

        {/* Parâmetros usando ToolInput oficial */}
        <ToolInput input={args} className="pt-2" />

        {/* O que a tool vai fazer */}
        {metadata?.willDo && metadata.willDo.length > 0 && (
          <div className="px-4 pb-2">
            <h4 className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">
              Ações
            </h4>
            <ul className="space-y-0.5">
              {metadata.willDo.map((item, index) => (
                <li
                  key={index}
                  className="text-[10px] text-muted-foreground flex items-start gap-1.5"
                >
                  <Icon name="check" className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Estimativas (tempo e custo) */}
        {(metadata?.estimatedTime || metadata?.cost) && (
          <div className="px-4 pb-3 flex gap-2 text-[10px] text-muted-foreground">
            {metadata.estimatedTime && (
              <div className="flex items-center gap-1">
                <Icon name="clock" className="w-3 h-3 text-muted-foreground" />
                <span>{metadata.estimatedTime}</span>
              </div>
            )}
            {metadata.cost && (
              <div className="flex items-center gap-1">
                <Icon name="dollar-sign" className="w-3 h-3 text-muted-foreground" />
                <span>{metadata.cost}</span>
              </div>
            )}
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}
