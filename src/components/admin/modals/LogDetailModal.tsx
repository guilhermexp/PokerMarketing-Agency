/**
 * LogDetailModal - Modal para visualização detalhada de logs com sugestões de IA
 * Design minimalista com tema dark
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LogDetail {
  id: string;
  request_id: string | null;
  user_id: string | null;
  organization_id: string | null;
  endpoint: string | null;
  operation: string | null;
  provider: string | null;
  model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  image_count: number | null;
  image_size: string | null;
  video_duration_seconds: number | null;
  estimated_cost_cents: number | null;
  latency_ms: number | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface LogDetailModalProps {
  log: LogDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onGenerateSuggestions?: () => void;
  suggestions?: string | null;
  isLoadingSuggestions?: boolean;
  suggestionsError?: string | null;
  isCached?: boolean;
}

export function LogDetailModal({
  log,
  isOpen,
  onClose,
  onGenerateSuggestions,
  suggestions,
  isLoadingSuggestions,
  suggestionsError,
  isCached,
}: LogDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  const handleCopyError = async () => {
    if (!log.error_message) return;
    try {
      await navigator.clipboard.writeText(log.error_message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatCost = (cents: number | null) => {
    if (cents === null || cents === undefined) return 'N/A';
    return `R$ ${(cents / 100).toFixed(4)}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background border-border text-white">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-white/90 text-[16px] font-medium">
            Detalhes do Log
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Header Section */}
          <div className="flex items-start justify-between pb-4 border-b border-border">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground font-mono">ID: {log.id}</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                    log.status === 'failed'
                      ? 'bg-red-500/15 text-red-400'
                      : 'bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  {log.status === 'failed' ? 'ERRO' : 'SUCESSO'}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">{formatDate(log.created_at)}</div>
            </div>
          </div>

          {/* Request Details */}
          <div className="space-y-3">
            <h3 className="text-[13px] font-medium text-white/70">Detalhes da Request</h3>
            <div className="grid grid-cols-2 gap-3 bg-white/[0.02] border border-border rounded-lg p-4">
              <DetailItem label="Endpoint" value={log.endpoint || 'N/A'} />
              <DetailItem label="Operação" value={log.operation || 'N/A'} />
              <DetailItem label="Provider" value={log.provider || 'N/A'} />
              <DetailItem label="Modelo" value={log.model_id || 'N/A'} />
              <DetailItem label="Latência" value={log.latency_ms ? `${log.latency_ms}ms` : 'N/A'} />
              <DetailItem label="Custo Estimado" value={formatCost(log.estimated_cost_cents)} />
            </div>
          </div>

          {/* Tokens Usage */}
          {(log.input_tokens || log.output_tokens || log.total_tokens) && (
            <div className="space-y-3">
              <h3 className="text-[13px] font-medium text-white/70">Uso de Tokens</h3>
              <div className="grid grid-cols-3 gap-3 bg-white/[0.02] border border-border rounded-lg p-4">
                <DetailItem label="Input" value={log.input_tokens?.toLocaleString() || '0'} />
                <DetailItem label="Output" value={log.output_tokens?.toLocaleString() || '0'} />
                <DetailItem label="Total" value={log.total_tokens?.toLocaleString() || '0'} />
              </div>
            </div>
          )}

          {/* Error Message */}
          {log.error_message && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-medium text-white/70">Mensagem de Erro</h3>
                <button
                  onClick={handleCopyError}
                  className="text-[11px] text-amber-500 hover:text-amber-400 transition-colors px-2 py-1 rounded hover:bg-white/[0.03]"
                >
                  {copied ? '✓ Copiado!' : 'Copiar'}
                </button>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                <pre className="text-[11px] text-red-400 font-mono whitespace-pre-wrap break-words">
                  {log.error_message}
                </pre>
              </div>
            </div>
          )}

          {/* Metadata/Payload */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-[13px] font-medium text-white/70">Metadata</h3>
              <div className="bg-white/[0.02] border border-border rounded-lg p-4">
                <pre className="text-[11px] text-muted-foreground font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* AI Suggestions Section */}
          {log.status === 'failed' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-medium text-amber-500">Sugestões de IA</h3>
                {isCached && (
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-amber-500/15 text-amber-500">
                    CACHED
                  </span>
                )}
              </div>

              {!suggestions && !isLoadingSuggestions && !suggestionsError && (
                <button
                  onClick={onGenerateSuggestions}
                  className="w-full px-4 py-3 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 rounded-lg text-[12px] text-amber-500 font-medium transition-colors"
                >
                  Gerar Sugestões de IA
                </button>
              )}

              {isLoadingSuggestions && (
                <div className="bg-white/[0.02] border border-border rounded-lg p-6">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                    <span className="text-[11px] text-muted-foreground">Gerando sugestões...</span>
                  </div>
                </div>
              )}

              {suggestionsError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <p className="text-[12px] text-red-400 mb-3">{suggestionsError}</p>
                  <button
                    onClick={onGenerateSuggestions}
                    className="text-[11px] text-amber-500 hover:text-amber-400 transition-colors"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {suggestions && (
                <div className="bg-white/[0.02] border border-amber-500/20 rounded-lg p-4">
                  <div
                    className="prose prose-invert prose-sm max-w-none text-[12px] text-white/70"
                    dangerouslySetInnerHTML={{
                      __html: formatMarkdown(suggestions),
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* No Error Message */}
          {!log.error_message && log.status !== 'failed' && (
            <div className="bg-white/[0.02] border border-border rounded-lg p-6 text-center">
              <span className="text-[12px] text-muted-foreground">Nenhum erro registrado</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper component for detail items
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className="text-[11px] text-white/70 font-mono break-all">{value}</div>
    </div>
  );
}

// Simple markdown formatter for AI suggestions
function formatMarkdown(text: string): string {
  // First escape HTML
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Then apply markdown formatting
  formatted = formatted
    // Headers (must be done before other formatting)
    .replace(/^### (.*$)/gim, '<h3 class="text-[13px] font-medium text-amber-500 mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-[14px] font-medium text-amber-500 mt-4 mb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-[15px] font-medium text-amber-500 mt-4 mb-2">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white/90 font-medium">$1</strong>')
    // Code blocks (before lists to avoid conflicts)
    .replace(/`([^`]+)`/g, '<code class="bg-white/[0.05] px-1.5 py-0.5 rounded text-[11px] text-amber-400 font-mono">$1</code>')
    // Unordered lists
    .replace(/^\* (.+)$/gim, '<li class="ml-4 mb-1 list-disc">$1</li>')
    .replace(/^- (.+)$/gim, '<li class="ml-4 mb-1 list-disc">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gim, '<li class="ml-6 mb-1 list-decimal">$1</li>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>');

  // Wrap consecutive list items in ul/ol
  formatted = formatted.replace(/((?:<li class="ml-4 mb-1 list-disc">.*?<\/li>\s*)+)/g, '<ul class="space-y-1">$1</ul>');
  formatted = formatted.replace(/((?:<li class="ml-6 mb-1 list-decimal">.*?<\/li>\s*)+)/g, '<ol class="space-y-1">$1</ol>');

  return formatted;
}

export default LogDetailModal;
