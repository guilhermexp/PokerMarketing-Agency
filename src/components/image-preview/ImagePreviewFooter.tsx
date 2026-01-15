/**
 * ImagePreviewFooter
 */

import React from 'react';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import type { ImagePreviewFooterProps } from './uiTypes';

export const ImagePreviewFooter: React.FC<ImagePreviewFooterProps> = ({
  isVideo,
  editPreview,
  isEditing,
  isRemovingBackground,
  isActionRunning,
  editPrompt,
  clearMask,
  handleRemoveBackground,
  handleEdit,
  handleDiscardEdit,
  handleSaveEdit,
}) => {
  if (isVideo) return null;

  return (
    <div className="p-4 border-t border-white/[0.06] space-y-2">
      {editPreview ? (
        <div className="flex gap-1.5">
          <button
            onClick={handleDiscardEdit}
            disabled={isEditing}
            className="flex-1 h-9 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg text-[10px] font-medium text-white/40 hover:text-white/60 transition-all disabled:opacity-30 flex items-center justify-center gap-1.5"
          >
            <Icon name="x" className="w-3.5 h-3.5" />
            Descartar
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={isEditing}
            className="flex-1 h-9 bg-primary hover:bg-primary/90 rounded-lg text-[11px] font-bold text-black transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isEditing ? (
              <>
                <Loader className="w-3.5 h-3.5" />
                Salvando...
              </>
            ) : (
              <>
                <Icon name="check" className="w-3.5 h-3.5" />
                Aplicar
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5">
            <button
              onClick={clearMask}
              disabled={isActionRunning}
              title="Limpar máscara"
              className="w-8 h-8 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg text-white/30 hover:text-white/50 transition-all disabled:opacity-30 flex items-center justify-center"
            >
              <Icon name="eraser" className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRemoveBackground}
              disabled={isActionRunning}
              className="flex-1 h-8 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg text-[10px] font-medium text-white/40 hover:text-white/60 transition-all disabled:opacity-30 flex items-center justify-center gap-1.5"
            >
              {isRemovingBackground ? (
                <Loader className="w-3 h-3" />
              ) : (
                <Icon name="scissors" className="w-3 h-3" />
              )}
              Remove BG
            </button>
          </div>

          <button
            onClick={handleEdit}
            disabled={!editPrompt.trim() || isActionRunning}
            className="w-full h-9 bg-primary hover:bg-primary/90 disabled:bg-white/[0.03] disabled:text-white/20 rounded-lg text-[11px] font-bold text-black disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
          >
            {isEditing ? (
              <>
                <Loader className="w-3.5 h-3.5" />
                Processando...
              </>
            ) : (
              <>
                <Icon name="wand-2" className="w-3.5 h-3.5" />
                Editar com IA
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
};
