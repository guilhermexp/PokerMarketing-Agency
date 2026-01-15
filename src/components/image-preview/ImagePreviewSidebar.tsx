/**
 * ImagePreviewSidebar
 */

import React from 'react';
import { ResizeWithProtectionSection } from './ResizeWithProtectionSection';
import { CropAndFilterSection } from './CropAndFilterSection';
import { AiEditSection } from './AiEditSection';
import { ErrorBanner } from './ErrorBanner';
import { VideoMetaSection } from './VideoMetaSection';
import { PreviewReadyNote } from './PreviewReadyNote';
import type { ImagePreviewSidebarProps } from './uiTypes';

const SidebarSection: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({
  title,
  hint,
  children,
}) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
          {title}
        </p>
        {hint && <p className="text-[10px] text-white/30">{hint}</p>}
      </div>
    </div>
    {children}
  </div>
);

export const ImagePreviewSidebar: React.FC<ImagePreviewSidebarProps> = React.memo(({
  image,
  isVideo,
  videoDimensions,
  isVerticalVideo,
  originalDimensions,
  widthPercent,
  heightPercent,
  isResizing,
  resizeProgress,
  resizedPreview,
  handleResize,
  handleSaveResize,
  handleDiscardResize,
  useProtectionMask,
  drawMode,
  setUseProtectionMask,
  setDrawMode,
  handleAutoDetectText,
  isDetectingText,
  detectProgress,
  hasProtectionDrawing,
  clearProtectionMask,
  editPrompt,
  setEditPrompt,
  referenceImage,
  setReferenceImage,
  editPreview,
  error,
  cropAspect,
  setCropAspect,
  isCropping,
  handleApplyCrop,
  handleResetCrop,
  filterPreset,
  setFilterPreset,
  isApplyingFilter,
  handleApplyFilter,
  handleResetFilter,
}) => {
  return (
    <div className="w-full lg:w-[300px] flex-shrink-0 bg-[#0a0a0a] flex flex-col border-t lg:border-t-0 lg:border-l border-white/[0.06] h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {isVideo ? (
          <SidebarSection title="Info do Video">
            <VideoMetaSection
              image={image}
              videoDimensions={videoDimensions}
              isVerticalVideo={isVerticalVideo}
            />
          </SidebarSection>
        ) : (
          <>
            <SidebarSection title="Redimensionar" hint="Protecao inteligente">
              <ResizeWithProtectionSection
                originalDimensions={originalDimensions}
                widthPercent={widthPercent}
                heightPercent={heightPercent}
                isResizing={isResizing}
                resizeProgress={resizeProgress}
                resizedPreview={resizedPreview}
                handleResize={handleResize}
                handleSaveResize={handleSaveResize}
                handleDiscardResize={handleDiscardResize}
                useProtectionMask={useProtectionMask}
                drawMode={drawMode}
                setUseProtectionMask={setUseProtectionMask}
                setDrawMode={setDrawMode}
                handleAutoDetectText={handleAutoDetectText}
                isDetectingText={isDetectingText}
                detectProgress={detectProgress}
                hasProtectionDrawing={hasProtectionDrawing}
                clearProtectionMask={clearProtectionMask}
              />
            </SidebarSection>

            <SidebarSection title="Ajustes" hint="Recorte e filtros">
              <CropAndFilterSection
                cropAspect={cropAspect}
                setCropAspect={setCropAspect}
                isCropping={isCropping}
                handleApplyCrop={handleApplyCrop}
                handleResetCrop={handleResetCrop}
                filterPreset={filterPreset}
                setFilterPreset={setFilterPreset}
                isApplyingFilter={isApplyingFilter}
                handleApplyFilter={handleApplyFilter}
                handleResetFilter={handleResetFilter}
              />
            </SidebarSection>

            <SidebarSection title="IA Editar" hint="Descreva a edicao desejada">
              <AiEditSection
                editPrompt={editPrompt}
                setEditPrompt={setEditPrompt}
                referenceImage={referenceImage}
                setReferenceImage={setReferenceImage}
              />
            </SidebarSection>
          </>
        )}

        <ErrorBanner message={error} />
      </div>

      <PreviewReadyNote visible={!isVideo && !!editPreview} />
    </div>
  );
});
