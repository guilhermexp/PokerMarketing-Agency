/**
 * GenerationItem
 * Displays a single generation with loading/success/error states
 */

import React, { useCallback, useState, useEffect } from 'react';
import {
  Download,
  Hash,
  Trash2,
  AlertCircle,
  Loader2,
  ZoomIn,
  ImagePlus,
} from 'lucide-react';
import { useGenerationPolling, useImagePlaygroundBatches, useImagePlaygroundTopics } from '../../hooks/useImagePlayground';
import { useImagePlaygroundStore } from '../../stores/imagePlaygroundStore';
import { ImagePreviewModal } from '../image-preview/ImagePreviewModal';
import type { Generation } from '../../stores/imagePlaygroundStore';
import type { GalleryImage } from '../../types';
import * as api from '../../services/api/imagePlayground';

interface GenerationItemProps {
  generation: Generation;
  topicId: string;
}

export const GenerationItem: React.FC<GenerationItemProps> = ({
  generation,
  topicId,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [previewImage, setPreviewImage] = useState<GalleryImage | null>(null);
  const [imageError, setImageError] = useState(false);
  const { deleteGeneration } = useImagePlaygroundBatches(topicId);
  const { updateGeneration, topics, updateTopic: updateTopicStore } = useImagePlaygroundStore();

  // Get current topic to check if it needs a coverUrl
  const currentTopic = topics.find(t => t.id === topicId);

  // Determine if we need to poll
  const needsPolling = !generation.asset && !!generation.asyncTaskId;

  // Polling for generation status
  const { status, generation: _updatedGen, error: pollingError } = useGenerationPolling(
    generation.id,
    generation.asyncTaskId,
    {
      enabled: needsPolling,
      onSuccess: async (gen) => {
        if (gen) {
          updateGeneration(topicId, generation.id, gen);

          // Update topic coverUrl if this is the first successful image
          if (gen.asset?.url && currentTopic && !currentTopic.coverUrl) {
            try {
              await api.updateTopic(topicId, { coverUrl: gen.asset.url });
              updateTopicStore(topicId, { coverUrl: gen.asset.url });
            } catch (err) {
              console.error('[GenerationItem] Failed to update topic cover:', err);
            }
          }
        }
      },
    }
  );

  // Elapsed time counter for loading state
  useEffect(() => {
    if (!needsPolling) return;

    const startTime = new Date(generation.createdAt).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      setElapsedTime(Math.floor((now - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [generation.createdAt, needsPolling]);

  const handleDownload = useCallback(async () => {
    if (!generation.asset?.url) return;

    try {
      // Fetch the image as blob to bypass cross-origin download restrictions
      const response = await fetch(generation.asset.url);
      const blob = await response.blob();

      // Create a blob URL and trigger download
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `generation_${generation.id}${generation.seed ? `_seed${generation.seed}` : ''}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Failed to download image:', error);
      // Fallback: open in new tab
      window.open(generation.asset.url, '_blank');
    }
  }, [generation]);

  const handleUseAsReference = useCallback(async () => {
    if (!generation.asset?.url) return;

    try {
      // Fetch the image and convert to base64 data URL
      const response = await fetch(generation.asset.url);
      const blob = await response.blob();
      const mimeType = blob.type || 'image/png';

      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const { addReferenceImage } = useImagePlaygroundStore.getState();
        addReferenceImage({
          id: crypto.randomUUID(),
          dataUrl,
          mimeType,
        });
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Failed to add reference image:', error);
    }
  }, [generation.asset?.url]);

  const handleOpenPreview = useCallback(() => {
    if (!generation.asset?.url) return;

    // Convert generation to GalleryImage format for the preview modal
    const galleryImage: GalleryImage = {
      id: generation.id,
      src: generation.asset.url,
      prompt: '', // We don't have prompt at generation level, it's at batch level
      source: 'playground',
      model: 'gemini-3-pro-image-preview' as any,
      aspectRatio: undefined,
      imageSize: undefined,
      mediaType: 'image',
    };

    setPreviewImage(galleryImage);
  }, [generation]);

  const handleDelete = useCallback(async () => {
    if (confirm('Excluir esta imagem?')) {
      await deleteGeneration(generation.id);
    }
  }, [generation.id, deleteGeneration]);

  // Loading State
  if (!generation.asset) {
    return (
      <div className="aspect-square bg-white/5 rounded-xl border border-white/10 flex flex-col items-center justify-center gap-3">
        {status === 'error' ? (
          <>
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-xs text-red-400 text-center px-4 font-medium">
              Falha na geração
            </p>
            {pollingError && (
              <p className="text-[10px] text-red-400/70 text-center px-4 max-w-full break-words">
                {typeof pollingError === 'object' && 'message' in pollingError
                  ? (pollingError as { message: string }).message
                  : String(pollingError)}
              </p>
            )}
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Remover
            </button>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <div className="text-center">
              <p className="text-xs text-white/60">
                {status === 'processing' ? 'Processando...' : 'Gerando...'}
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">
                {formatTime(elapsedTime)}
              </p>
            </div>
          </>
        )}
      </div>
    );
  }

  // Success State
  return (
    <div
      className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Image */}
      {imageError ? (
        <div className="w-full h-full bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-3">
          <AlertCircle className="w-8 h-8 text-white/40" />
          <p className="text-xs text-white/40 font-medium">Imagem indisponível</p>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Remover
          </button>
        </div>
      ) : (
        <img
          src={generation.asset.thumbnailUrl || generation.asset.url}
          alt="Generated image"
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      )}

      {/* Seed Badge */}
      {generation.seed && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur rounded-lg text-[10px] text-white/80 flex items-center gap-1">
          <Hash className="w-3 h-3" />
          {generation.seed}
        </div>
      )}

      {/* Hover Overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity ${
          showActions ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Action Buttons */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleUseAsReference}
              className="p-2 bg-white/10 backdrop-blur-xl rounded-lg hover:bg-primary/30 transition-colors"
              title="Usar como referência"
            >
              <ImagePlus className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 bg-white/10 backdrop-blur-xl rounded-lg hover:bg-white/20 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4 text-white" />
            </button>
                        <button
              onClick={handleDelete}
              className="p-2 bg-white/10 backdrop-blur-xl rounded-lg hover:bg-red-500/30 transition-colors"
              title="Excluir"
            >
              <Trash2 className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* View Full Size */}
          <button
            onClick={handleOpenPreview}
            className="p-2 bg-white/10 backdrop-blur-xl rounded-lg hover:bg-white/20 transition-colors"
            title="Ver em tamanho real"
          >
            <ZoomIn className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreviewModal
          image={previewImage}
          onClose={() => setPreviewImage(null)}
          onImageUpdate={(newUrl) => {
            // Update the generation asset with the edited image
            updateGeneration(topicId, generation.id, {
              asset: { ...generation.asset!, url: newUrl },
            });
            setPreviewImage(null);
          }}
          downloadFilename={`generation_${generation.id}${generation.seed ? `_seed${generation.seed}` : ''}.png`}
        />
      )}
    </div>
  );
};

// Helper function to format time
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default GenerationItem;
