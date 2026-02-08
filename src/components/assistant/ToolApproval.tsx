/**
 * ToolApproval - Componente focado em aprovação/negação de tools
 *
 * Usa ai-elements oficiais (Confirmation) para mostrar:
 * - Botões de Aprovar/Negar
 * - Opção "Sempre permitir" (opcional)
 * - Feedback visual de aprovação/rejeição
 */

import React from 'react';
import {
  Confirmation,
  ConfirmationRequest,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationAccepted,
  ConfirmationRejected,
  type ConfirmationProps
} from '@/components/ai-elements/confirmation';
import type { ToolUIPart } from 'ai';

export interface ToolApprovalProps {
  approvalId: string;
  toolName: string;
  state?: 'approval-requested' | 'approved' | 'denied' | 'executing' | 'complete';
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onAlwaysAllow?: (toolName: string) => void;
}

/**
 * ToolApproval Component
 *
 * Renderiza UI de aprovação/negação usando componentes ai-elements oficiais.
 *
 * @example
 * ```tsx
 * <ToolApproval
 *   approvalId="abc123"
 *   toolName="createImage"
 *   onApprove={handleApprove}
 *   onDeny={handleDeny}
 *   onAlwaysAllow={(toolName) => console.log('Always allow:', toolName)}
 * />
 * ```
 */
export function ToolApproval({
  approvalId,
  toolName,
  state = 'approval-requested',
  onApprove,
  onDeny,
  onAlwaysAllow
}: ToolApprovalProps) {
  // Criar objeto approval compatível com Confirmation
  let approval: ConfirmationProps['approval'];
  if (state === 'approved') {
    approval = { id: approvalId, approved: true };
  } else if (state === 'denied') {
    approval = { id: approvalId, approved: false, reason: 'Rejeitado pelo usuário' };
  } else {
    approval = { id: approvalId };
  }

  // Mapear state para ai-elements state
  const aiElementsState: ToolUIPart['state'] = state === 'approval-requested'
    ? 'approval-requested'
    : state === 'approved'
    ? 'approval-responded'
    : state === 'denied'
    ? 'output-denied'
    : 'input-available';

  return (
    <Confirmation
      approval={approval}
      state={aiElementsState}
      className="bg-black/40 border-white/10 mt-2"
    >
      {/* Solicitação de aprovação */}
      <ConfirmationRequest>
        <p className="text-[11px] text-white/70">
          Deseja permitir que esta ferramenta seja executada?
        </p>
      </ConfirmationRequest>

      {/* Ações de aprovação */}
      <ConfirmationActions className="gap-1.5">
        <ConfirmationAction
          onClick={() => onApprove(approvalId)}
          className="flex-1 h-8 bg-white/10 hover:bg-white/15 text-white text-[11px]"
        >
          Aprovar
        </ConfirmationAction>

        <ConfirmationAction
          onClick={() => onDeny(approvalId)}
          variant="outline"
          className="h-8 px-3 border-white/10 hover:border-white/20 text-white/60 text-[11px]"
        >
          Negar
        </ConfirmationAction>

        {onAlwaysAllow && (
          <ConfirmationAction
            onClick={() => onAlwaysAllow(toolName)}
            variant="ghost"
            className="h-8 px-3 bg-white/5 hover:bg-white/10 text-white/50 text-[10px]"
            title="Sempre permitir esta ferramenta sem pedir aprovação"
          >
            Sempre permitir
          </ConfirmationAction>
        )}
      </ConfirmationActions>

      {/* Feedback de aprovação */}
      <ConfirmationAccepted>
        <p className="text-[11px] text-green-400">✓ Aprovado</p>
      </ConfirmationAccepted>

      {/* Feedback de rejeição */}
      <ConfirmationRejected>
        <p className="text-[11px] text-red-400">✗ Negado</p>
      </ConfirmationRejected>
    </Confirmation>
  );
}
