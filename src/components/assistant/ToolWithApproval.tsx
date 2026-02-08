/**
 * ToolWithApproval - Componente composto que combina ToolDisplay + ToolApproval
 *
 * Fornece o fluxo completo de aprovação de tools:
 * 1. Mostra preview da tool (ToolDisplay)
 * 2. Mostra UI de aprovação quando necessário (ToolApproval)
 * 3. Mostra indicadores de status (executing, complete, denied)
 */

import React from 'react';
import { ToolDisplay, type ToolDisplayMetadata } from './ToolDisplay';
import { ToolApproval } from './ToolApproval';
import { Icon } from '../common/Icon';

export interface ToolWithApprovalProps {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  metadata?: ToolDisplayMetadata;
  state?: 'approval-requested' | 'approved' | 'denied' | 'executing' | 'complete';
  approvalId?: string;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onAlwaysAllow?: (toolName: string) => void;
}

/**
 * ToolWithApproval Component
 *
 * Combina ToolDisplay e ToolApproval para fornecer o fluxo completo de aprovação.
 *
 * @example
 * ```tsx
 * <ToolWithApproval
 *   toolCallId="abc123"
 *   toolName="createImage"
 *   args={{ description: "...", aspectRatio: "16:9" }}
 *   metadata={{
 *     title: "Criar Imagem",
 *     estimatedTime: "15-30 segundos"
 *   }}
 *   state="approval-requested"
 *   approvalId="approval-123"
 *   onApprove={handleApprove}
 *   onDeny={handleDeny}
 * />
 * ```
 */
export function ToolWithApproval({
  toolCallId: _toolCallId,
  toolName,
  args,
  metadata,
  state = 'approval-requested',
  approvalId,
  onApprove,
  onDeny,
  onAlwaysAllow
}: ToolWithApprovalProps) {
  const needsApproval = state === 'approval-requested' && approvalId;

  return (
    <div className="space-y-2 animate-fade-in-up">
      {/* Preview da tool */}
      <ToolDisplay
        toolName={toolName}
        args={args}
        metadata={metadata}
        state={state}
      />

      {/* Aprovação (se necessário) */}
      {needsApproval && (
        <ToolApproval
          approvalId={approvalId}
          toolName={toolName}
          state={state}
          onApprove={onApprove}
          onDeny={onDeny}
          onAlwaysAllow={onAlwaysAllow}
        />
      )}

      {/* Status indicators */}
      {state === 'executing' && (
        <div className="flex items-center gap-2 text-[11px] text-white/50 px-3 py-2 bg-black/40 rounded-lg border border-white/10">
          <Icon name="loader" className="w-3 h-3 animate-spin" />
          <span>Executando...</span>
        </div>
      )}

      {state === 'complete' && (
        <div className="flex items-center gap-2 text-[11px] text-green-400 px-3 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
          <Icon name="check-circle" className="w-3 h-3" />
          <span>Concluído</span>
        </div>
      )}

      {state === 'denied' && !needsApproval && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
          <Icon name="x-circle" className="w-3 h-3" />
          <span>Negado pelo usuário</span>
        </div>
      )}
    </div>
  );
}
