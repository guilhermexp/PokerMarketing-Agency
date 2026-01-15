/**
 * PreviewReadyNote
 */

import React from 'react';
import type { PreviewReadyNoteProps } from './uiTypes';

export const PreviewReadyNote: React.FC<PreviewReadyNoteProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="px-4 pb-4">
      <p className="text-[9px] text-white/30">Pré-visualização pronta.</p>
    </div>
  );
};
