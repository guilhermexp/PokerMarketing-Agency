/**
 * GenerationItem
 * Displays a single generation with loading/success/error states
 * Professional design matching Video Studio
 */

import React, { useCallback, useState, useEffect } from 'react';
import {
  Download,
  Hash,
  Trash2,
  AlertCircle,
  AlertTriangle,
  ZoomIn,
  ImagePlus,
  Pause,
  Play,
  RotateCw,
} from 'lucide-react';
import { useGenerationPolling, useImagePlaygroundBatches } from '../../hooks/useImagePlayground';
import { useImagePlaygroundStore } from '../../stores/imagePlaygroundStore';
import { ImagePreviewModal } from '../image-preview/ImagePreviewModal';
import { ImageGenerationLoader } from '../ui/ai-chat-image-generation-1';
import type { Generation } from '../../stores/imagePlaygroundStore';
import type { GalleryImage } from '../../types';
import * as api from '../../services/api/imagePlayground';
import { getImageModelDisplayLabel } from './imageModelLabels';

interface GenerationItemProps {
  generation: Generation;
  topicId: string;
  fallbackModel?: string;
}

export const GenerationItem: React.FC<GenerationItemProps> = ({
  generation,
  topicId,
  fallbackModel,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [previewImage, setPreviewImage] = useState<GalleryImage | null>(null);
  const [imageError, setImageError] = useState(false);
  const [isPollingPaused, setIsPollingPaused] = useState(false);
  const { deleteGeneration } = useImagePlaygroundBatches(topicId);
  const { updateGeneration, topics, updateTopic: updateTopicStore } = useImagePlaygroundStore();

  const currentTopic = topics.find(t => t.id === topicId);
  const generationModelId = generation.asset?.model || fallbackModel || null;
  const generationModelLabel = getImageModelDisplayLabel(generationModelId);

  const needsPolling = !generation.asset && !!generation.asyncTaskId;

  const { status, generation: _updatedGen, error: pollingError } = useGenerationPolling(
    generation.id,
    generation.asyncTaskId,
    {
      enabled: needsPolling,
      paused: isPollingPaused,
      onSuccess: async (gen) => {
        if (gen) {
          updateGeneration(topicId, generation.id, gen);

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
      const response = await fetch(generation.asset.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `generation_${generation.id}${generation.seed ? `_seed${generation.seed}` : ''}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Failed to download image:', error);
      window.open(generation.asset.url, '_blank');
    }
  }, [generation]);

  const handleUseAsReference = useCallback(async () => {
    if (!generation.asset?.url) return;

    try {
      const response = await fetch(generation.asset.url);
      const blob = await response.blob();
      const mimeType = blob.type || 'image/png';

      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const {
          addReferenceImage,
          useBrandIdentityMode,
          toggleBrandIdentityMode,
          useBrandProfile,
          toggleBrandProfile,
        } = useImagePlaygroundStore.getState();
        addReferenceImage({
          id: crypto.randomUUID(),
          dataUrl,
          mimeType,
        });

        // If the user is reusing an existing generation as reference, switch off
        // style-driven modes so the next action behaves like an edit workflow.
        if (useBrandIdentityMode) {
          toggleBrandIdentityMode();
        }
        if (useBrandProfile) {
          toggleBrandProfile();
        }
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Failed to add reference image:', error);
    }
  }, [generation.asset?.url]);

  const handleOpenPreview = useCallback(() => {
    if (!generation.asset?.url) return;

    const galleryImage: GalleryImage = {
      id: generation.id,
      src: generation.asset.url,
      prompt: '',
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

  const handleRetry = useCallback(async () => {
    const { batchesMap, addBatch } = useImagePlaygroundStore.getState();
    const batches = batchesMap[topicId] || [];
    const batch = batches.find(b => b.generations.some(g => g.id === generation.id));
    if (!batch) return;

    // Delete the failed generation first
    await deleteGeneration(generation.id);

    // Re-create with the same config, imageNum=1
    const result = await api.createImage({
      topicId,
      provider: batch.provider,
      model: batch.model,
      imageNum: 1,
      params: {
        prompt: batch.prompt,
        ...(batch.config as Record<string, unknown>),
      },
    });

    addBatch(topicId, result.data.batch);
  }, [generation.id, topicId, deleteGeneration]);

  // Loading State
  if (!generation.asset) {
    return (
      <div className="aspect-square rounded-xl border border-white/[0.06] overflow-hidden relative bg-white/[0.02]">
        {generationModelLabel && (
          <div
            className="absolute top-2 right-2 max-w-[75%] px-2 py-1 bg-black/45 backdrop-blur-sm rounded-lg text-[10px] text-white/60 truncate z-30"
            title={generationModelId || undefined}
          >
            {generationModelLabel}
          </div>
        )}
        {status === 'error' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <GenerationError error={pollingError} onDelete={handleDelete} onRetry={handleRetry} />
          </div>
        ) : (
          <>
            <ImageGenerationLoader
              isGenerating={!isPollingPaused}
              showLabel={true}
            />
            <div className="absolute bottom-3 left-0 right-0 flex flex-col items-center gap-2 z-30">
              <span className="text-[10px] text-white/30 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full">
                {formatTime(elapsedTime)}
              </span>
              {needsPolling && (
                <button
                  onClick={() => setIsPollingPaused((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur-sm text-white/60 text-xs hover:bg-black/60 transition-colors"
                  title={isPollingPaused ? 'Retomar atualizacao do status' : 'Pausar atualizacao do status'}
                >
                  {isPollingPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  {isPollingPaused ? 'Retomar' : 'Pausar'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // Success State
  return (
    <div
      className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer border border-white/[0.06]"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Image */}
      {imageError ? (
        <div className="w-full h-full bg-white/[0.03] flex flex-col items-center justify-center gap-3">
          <AlertCircle className="w-8 h-8 text-white/20" />
          <p className="text-xs text-white/30 font-medium">Imagem indisponivel</p>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400/80 text-xs hover:bg-red-500/20 transition-colors"
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
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-lg text-[10px] text-white/60 flex items-center gap-1">
          <Hash className="w-3 h-3" />
          {generation.seed}
        </div>
      )}
      {generationModelLabel && (
        <div
          className="absolute top-2 right-2 max-w-[75%] px-2 py-1 bg-black/50 backdrop-blur-sm rounded-lg text-[10px] text-white/70 truncate"
          title={generationModelId || undefined}
        >
          {generationModelLabel}
        </div>
      )}

      {/* Hover Overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent transition-opacity duration-200 ${
          showActions ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Action Buttons */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleUseAsReference}
              className="p-2 bg-white/10 backdrop-blur-xl rounded-lg hover:bg-white/20 transition-colors"
              title="Usar como referencia"
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

// =============================================================================
// Error Display Component
// =============================================================================

interface GenerationErrorProps {
  error: unknown;
  onDelete: () => void;
  onRetry?: () => void;
}

function GenerationError({ error, onDelete, onRetry }: GenerationErrorProps) {
  const errorObj = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const code = errorObj?.code as string | undefined;
  const message = errorObj?.message as string | undefined;

  const lowerMessage = message?.toLowerCase() ?? '';
  const isQuota = code === 'QUOTA_EXCEEDED'
    || code === 'RATE_LIMITED'
    || lowerMessage.includes('quota')
    || lowerMessage.includes('rate limit')
    || lowerMessage.includes('too many requests')
    || message?.includes('429') === true;

  const isSafety = code === 'SAFETY'
    || (message?.toLowerCase().includes('segurança') ?? false)
    || (message?.toLowerCase().includes('safety') ?? false);

  let Icon = AlertCircle;
  let title = 'Falha na geracao';
  let description = (message && message.length < 200 && !message.startsWith('{'))
    ? message
    : 'Erro desconhecido. Tente novamente.';
  let accentColor = 'red';

  if (isQuota) {
    Icon = AlertTriangle;
    title = 'Limite de uso atingido';
    description = 'O limite de geracao de imagens foi excedido. Tente novamente mais tarde.';
    accentColor = 'amber';
  } else if (isSafety) {
    title = 'Conteudo bloqueado';
    description = 'O prompt foi bloqueado por politicas de seguranca. Tente reformular.';
  }

  const colorMap: Record<string, { icon: string; text: string; bg: string }> = {
    red: {
      icon: 'text-red-400/80',
      text: 'text-red-400/80',
      bg: 'bg-red-500/10',
    },
    amber: {
      icon: 'text-amber-400/80',
      text: 'text-amber-400/80',
      bg: 'bg-amber-500/10',
    },
  };

  const colors = colorMap[accentColor] || colorMap.red;

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4">
      <div className={`w-10 h-10 rounded-full ${colors.bg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${colors.icon}`} />
      </div>
      <p className={`text-xs ${colors.text} text-center font-medium`}>
        {title}
      </p>
      <p className="text-[11px] text-white/30 text-center leading-snug max-w-[200px]">
        {description}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/50 text-xs hover:bg-white/[0.12] transition-colors"
          >
            <RotateCw className="w-3 h-3" />
            Tentar novamente
          </button>
        )}
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] text-white/30 text-xs hover:bg-white/[0.08] transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default GenerationItem;
