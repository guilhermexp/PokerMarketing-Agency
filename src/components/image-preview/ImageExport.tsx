/**
 * ImageExport
 */

import React from 'react';
import { Icon } from '../common/Icon';
import type { ImageExportProps } from './uiTypes';

export const ImageExport: React.FC<ImageExportProps> = ({ onDownload }) => (
  <button
    onClick={onDownload}
    className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white/60 text-[10px] transition-all"
  >
    <Icon name="download" className="w-3 h-3" />
  </button>
);
