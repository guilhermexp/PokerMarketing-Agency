/**
 * ImageEditor
 */

import React from 'react';
import { ImagePreviewSidebar } from './ImagePreviewSidebar';
import { ImagePreviewFooter } from './ImagePreviewFooter';
import { ImagePreviewMobileActions } from './ImagePreviewMobileActions';
import type { ImageEditorProps } from './uiTypes';

export const ImageEditor: React.FC<ImageEditorProps> = ({
  sidebar,
  footer,
  mobileActions,
}) => (
  <div className="flex flex-col h-full overflow-hidden">
    <div className="flex-1 overflow-hidden">
      <ImagePreviewSidebar {...sidebar} />
    </div>
    <ImagePreviewFooter {...footer} />
    <ImagePreviewMobileActions {...mobileActions} />
  </div>
);
