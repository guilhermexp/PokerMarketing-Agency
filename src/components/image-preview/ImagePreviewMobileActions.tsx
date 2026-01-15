/**
 * ImagePreviewMobileActions
 */

import React from 'react';
import { Icon } from '../common/Icon';
import type { ImagePreviewMobileActionsProps } from './uiTypes';

export const ImagePreviewMobileActions: React.FC<ImagePreviewMobileActionsProps> = ({
  image,
  onQuickPost,
  onSchedulePost,
  onClose,
}) => (
  <div className="lg:hidden flex gap-1.5 p-4 pt-0">
    {onQuickPost && (
      <button
        onClick={() => {
          onQuickPost(image);
          onClose();
        }}
        className="flex-1 h-7 bg-primary/10 hover:bg-primary/20 rounded-md text-[9px] font-semibold text-primary transition-all flex items-center justify-center gap-1"
      >
        <Icon name="zap" className="w-2.5 h-2.5" />
        Post
      </button>
    )}
    {onSchedulePost && (
      <button
        onClick={() => {
          onSchedulePost(image);
          onClose();
        }}
        className="flex-1 h-7 bg-white/[0.03] hover:bg-white/[0.06] rounded-md text-[9px] font-medium text-white/40 transition-all flex items-center justify-center gap-1"
      >
        <Icon name="calendar" className="w-2.5 h-2.5" />
        Agendar
      </button>
    )}
  </div>
);
