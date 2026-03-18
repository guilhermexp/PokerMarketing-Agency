/**
 * ToolResultViewer - Renderiza tool results pendentes de aprovação
 *
 * Exibe a lista de tools aguardando aprovação do usuário,
 * usando o componente ToolWithApproval para cada item.
 */

import React, { memo } from 'react';
import { isToolUIPart, type ToolUIPart, type UIMessage } from 'ai';
import { ToolWithApproval } from './ToolWithApproval';
import type { ToolDisplayMetadata } from './ToolWithApproval';
import { clientLogger } from '@/lib/client-logger';

export function isToolDisplayMetadata(value: unknown): value is ToolDisplayMetadata {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as Record<string, unknown>;

  return (
    (metadata.title === undefined || typeof metadata.title === 'string') &&
    (metadata.description === undefined || typeof metadata.description === 'string') &&
    (metadata.estimatedTime === undefined || typeof metadata.estimatedTime === 'string') &&
    (metadata.cost === undefined || typeof metadata.cost === 'string') &&
    (metadata.icon === undefined || typeof metadata.icon === 'string') &&
    (
      metadata.willDo === undefined ||
      (Array.isArray(metadata.willDo) && metadata.willDo.every((item) => typeof item === 'string'))
    )
  );
}

export type ToolState = 'approval-requested' | 'approved' | 'denied' | 'executing' | 'complete';

export function mapToolState(state: ToolUIPart['state']): ToolState {
  switch (state) {
    case 'approval-requested':
      return 'approval-requested';
    case 'output-denied':
      return 'denied';
    case 'output-available':
    case 'approval-responded':
      return 'complete';
    default:
      return 'executing';
  }
}

interface ToolResultViewerProps {
  pendingApprovals: UIMessage['parts'];
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
}

export const ToolResultViewer: React.FC<ToolResultViewerProps> = memo(function ToolResultViewer({
  pendingApprovals,
  onApprove,
  onDeny,
}) {
  const toolParts = pendingApprovals.filter(isToolUIPart);
  if (toolParts.length === 0) return null;

  return (
    <div className="mb-3 space-y-2 animate-fade-in-up">
      {toolParts.map((toolPart) => {
        const toolArgs = (
          ('rawInput' in toolPart
            ? (toolPart as { rawInput?: unknown }).rawInput
            : toolPart.input) || {}
        ) as Record<string, unknown>;
        return (
          <ToolWithApproval
            key={toolPart.toolCallId}
            toolCallId={toolPart.toolCallId}
            toolName={toolPart.type.replace('tool-', '')}
            args={toolArgs}
            metadata={
              'metadata' in toolPart &&
              isToolDisplayMetadata(
                (toolPart as { metadata?: { preview?: unknown } }).metadata?.preview,
              )
                ? (toolPart as { metadata?: { preview?: ToolDisplayMetadata } }).metadata?.preview
                : undefined
            }
            state={mapToolState(toolPart.state)}
            approvalId={toolPart.approval?.id}
            onApprove={onApprove}
            onDeny={onDeny}
            onAlwaysAllow={(toolName) => clientLogger.info('Always allow:', toolName)}
          />
        );
      })}
    </div>
  );
});
