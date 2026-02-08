/**
 * VideoMetaSection
 */

import React from 'react';
import type { VideoMetaSectionProps } from '../../uiTypes';

export const VideoMetaSection: React.FC<VideoMetaSectionProps> = ({
  image,
  videoDimensions,
  isVerticalVideo,
}) => (
  <section className="edit-section-card">
    <h4 className="section-title">Informações do Vídeo</h4>
    <div className="space-y-2 text-[11px] text-white/50">
    <div className="flex justify-between">
      <span className="text-white/30">Fonte</span>
      <span>{image.source}</span>
    </div>
    {image.model && (
      <div className="flex justify-between">
        <span className="text-white/30">Modelo</span>
        <span>{image.model}</span>
      </div>
    )}
    {videoDimensions && (
      <>
        <div className="flex justify-between">
          <span className="text-white/30">Dimensões</span>
          <span>
            {videoDimensions.width} × {videoDimensions.height}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/30">Proporção</span>
          <span>{isVerticalVideo ? '9:16' : '16:9'}</span>
        </div>
      </>
    )}
    </div>
  </section>
);
