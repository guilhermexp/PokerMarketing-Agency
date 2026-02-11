import React from 'react';
import { Icon } from './Icon';
import { Button } from './Button';
import type { ExportProgress } from '../../services/ffmpegService';

interface ExportVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: ExportProgress | null;
}

export const ExportVideoModal: React.FC<ExportVideoModalProps> = ({
  isOpen,
  onClose,
  progress,
}) => {
  if (!isOpen) return null;

  const isComplete = progress?.phase === 'complete';
  const isError = progress?.phase === 'error';
  const canClose = isComplete || isError;

  const getPhaseIcon = (): 'download' | 'upload' | 'play' | 'zap' | 'x' | 'clock' => {
    switch (progress?.phase) {
      case 'loading': return 'download';
      case 'preparing': return 'upload';
      case 'concatenating': return 'play';
      case 'finalizing': return 'zap';
      case 'complete': return 'download';
      case 'error': return 'x';
      default: return 'clock';
    }
  };

  const getPhaseColor = () => {
    switch (progress?.phase) {
      case 'complete': return 'text-green-400';
      case 'error': return 'text-red-400';
      default: return 'text-primary';
    }
  };

  const getBarColor = () => {
    if (isError) return 'bg-red-500';
    if (isComplete) return 'bg-green-500';
    return 'bg-primary';
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${getPhaseColor()}`}>
              <Icon name={getPhaseIcon()} className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wide">
                Exportar Video
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {progress?.phase === 'loading' ? 'Carregando FFmpeg' :
                 progress?.phase === 'complete' ? 'Concluido' :
                 progress?.phase === 'error' ? 'Erro' : 'Processando'}
              </p>
            </div>
          </div>
          {canClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-white transition-colors">
              <Icon name="x" className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-8">
          {/* Progress message */}
          <p className={`text-center text-sm mb-4 ${isError ? 'text-red-400' : 'text-white/70'}`}>
            {progress?.message || 'Iniciando...'}
          </p>

          {/* File counter */}
          {progress?.currentFile && progress?.totalFiles && !isComplete && !isError && (
            <p className="text-center text-xs text-muted-foreground mb-4">
              Cena {progress.currentFile} de {progress.totalFiles}
            </p>
          )}

          {/* Progress bar */}
          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`}
              style={{ width: `${progress?.progress || 0}%` }}
            />
          </div>

          {/* Percentage */}
          <p className="text-center text-xs text-muted-foreground mt-2">
            {progress?.progress || 0}%
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-card flex justify-end">
          {canClose && (
            <Button variant={isComplete ? 'primary' : 'secondary'} size="small" onClick={onClose}>
              {isComplete ? 'Fechar' : 'OK'}
            </Button>
          )}
          {!canClose && (
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Aguarde...</p>
          )}
        </div>
      </div>
    </div>
  );
};
