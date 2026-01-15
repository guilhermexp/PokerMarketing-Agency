/**
 * ImagePreviewHeader
 */

import React from 'react';
import { Icon } from '../common/Icon';
import { ImageExport } from './ImageExport';
import type { ImagePreviewHeaderProps } from './uiTypes';

export const ImagePreviewHeader: React.FC<ImagePreviewHeaderProps> = ({
  image,
  onClose,
  onQuickPost,
  onPublish,
  onSchedulePost,
  onUseInChat,
  onDownload,
}) => (
  <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#0b0b0b]/80 backdrop-blur">
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-md bg-white/5 border border-white/10 flex items-center justify-center">
        <Icon name="zap" className="w-3.5 h-3.5 text-white/60" />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
          AI Studio
        </p>
        <p className="text-xs text-white/70 truncate max-w-[200px]">
          {image.source || 'Imagem'}
        </p>
      </div>
    </div>

    <div className="hidden lg:flex items-center gap-1.5">
      {onQuickPost && (
        <button
          onClick={() => {
            onQuickPost(image);
            onClose();
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg text-white/70 text-[10px] font-semibold transition-all"
        >
          <Icon name="zap" className="w-3 h-3" />
          QuickPost
        </button>
      )}
      {onSchedulePost && (
        <button
          onClick={() => {
            onSchedulePost(image);
            onClose();
          }}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded-lg text-white/50 hover:text-white/70 font-medium text-[10px] transition-all"
        >
          <Icon name="calendar" className="w-3 h-3" />
          Agendar
        </button>
      )}
      {onPublish && (
        <button
          onClick={() => {
            onPublish(image);
            onClose();
          }}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded-lg text-white/50 hover:text-white/70 font-medium text-[10px] transition-all"
        >
          <Icon name="users" className="w-3 h-3" />
          Campanha
        </button>
      )}
    </div>

    <div className="flex items-center gap-1">
      <button
        onClick={onUseInChat}
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white/60 text-[10px] transition-all"
      >
        <Icon name="paperclip" className="w-3 h-3" />
        Chat
      </button>
      <ImageExport onDownload={onDownload} />
      <button
        onClick={onClose}
        className="w-7 h-7 flex items-center justify-center hover:bg-white/5 rounded-lg text-white/30 hover:text-white/60 transition-all ml-1"
        aria-label="Fechar"
      >
        <Icon name="x" className="w-4 h-4" />
      </button>
    </div>
  </div>
);
