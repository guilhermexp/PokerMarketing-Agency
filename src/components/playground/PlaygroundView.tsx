/**
 * PlaygroundView Component
 * Video Studio workspace with 3-panel layout inspired by Image Studio
 * Now uses Zustand store + hooks for persistent topics
 */

import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clapperboard,
  Edit3,
  Film,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { OverlayPortal } from '../common/OverlayPortal';
import { VideoCard } from './VideoCard';
import {
  MediaType,
  PostStatus,
  PlaygroundAspectRatio,
} from './types';
import type { BrandProfile, GalleryImage } from '../../types';
import {
  useVideoPlaygroundStore,
  videoPlaygroundSelectors,
  type VideoModel,
  type VideoAspectRatio,
  type VideoResolution,
  type VideoGenerationTopic,
} from '../../stores/videoPlaygroundStore';
import {
  useVideoPlaygroundTopics,
  useVideoPlaygroundSessions,
  useCreateVideo,
} from '../../hooks/useVideoPlayground';

interface PlaygroundViewProps {
  brandProfile: BrandProfile;
  userId?: string;
  onAddImageToGallery?: (image: Omit<GalleryImage, "id">) => GalleryImage;
}

const MODEL_OPTIONS: Array<{ value: VideoModel; label: string; color: string }> = [
  { value: 'veo-3.1', label: 'Veo 3.1', color: '#3B82F6' },
  { value: 'sora-2', label: 'Sora 2', color: '#10B981' },
];

const ASPECT_RATIO_OPTIONS: Array<{ value: VideoAspectRatio; label: string }> = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
];

const RESOLUTION_OPTIONS: Array<{ value: VideoResolution; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
];

// =============================================================================
// Config Panel Component
// =============================================================================

const ConfigPanel: React.FC = () => {
  const referenceInputRef = useRef<HTMLInputElement>(null);

  const {
    model,
    aspectRatio,
    resolution,
    useBrandProfile,
    referenceImage,
    setModel,
    setAspectRatio,
    setResolution,
    toggleBrandProfile,
    setReferenceImage,
  } = useVideoPlaygroundStore();

  const handleReferenceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;

      const base64 = reader.result.split(',')[1];
      if (!base64) return;

      setReferenceImage({
        id: Date.now().toString(),
        dataUrl: base64,
        mimeType: file.type || 'image/png',
      });
    };
    reader.readAsDataURL(file);

    if (referenceInputRef.current) {
      referenceInputRef.current.value = '';
    }
  }, [setReferenceImage]);

  const clearReferenceImage = useCallback(() => {
    setReferenceImage(null);
  }, [setReferenceImage]);

  return (
    <div className="h-full flex flex-col bg-black/40 backdrop-blur-xl">
      <div className="px-4 py-5 border-b border-border">
        <h1 className="text-2xl font-bold text-white">Studio Video</h1>
        <p className="text-xs text-muted-foreground mt-1">Defina parametros e gere videos em segundos</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Model Selection */}
        <div className="relative">
          <label className="text-sm font-medium text-white/80 block mb-2">Modelo</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as VideoModel)}
            className="w-full bg-white/5 border border-border rounded-xl px-4 py-3 pl-10 text-sm text-white focus:outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-black">
                {option.label}
              </option>
            ))}
          </select>
          <div
            className="absolute left-4 top-[54px] -translate-y-1/2 w-3 h-3 rounded-full"
            style={{
              backgroundColor: MODEL_OPTIONS.find((option) => option.value === model)?.color || '#3B82F6',
            }}
          />
        </div>

        {/* Brand Profile Toggle */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-white/80">Usar perfil da marca</label>
          <button
            onClick={toggleBrandProfile}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
              useBrandProfile
                ? 'bg-white text-black shadow-md'
                : 'bg-white/5 text-muted-foreground border border-border hover:text-white'
            }`}
            title={useBrandProfile ? 'Diretrizes da marca ativas' : 'Diretrizes da marca desativadas'}
          >
            <Palette className="w-4 h-4" />
          </button>
        </div>

        {/* Reference Image */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/80">Imagem de referencia</label>
            {referenceImage && (
              <button
                onClick={clearReferenceImage}
                className="text-xs text-muted-foreground hover:text-white transition-colors"
              >
                Remover
              </button>
            )}
          </div>

          <input
            ref={referenceInputRef}
            type="file"
            accept="image/*"
            onChange={handleReferenceUpload}
            className="hidden"
          />

          {referenceImage ? (
            <div className="relative rounded-xl overflow-hidden border border-border bg-white/5">
              <img
                src={`data:${referenceImage.mimeType};base64,${referenceImage.dataUrl}`}
                alt="Referência"
                className="w-full h-36 object-cover"
              />
              <button
                onClick={clearReferenceImage}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 transition-colors"
                title="Remover imagem"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => referenceInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-white/20 hover:bg-white/5 transition-colors"
            >
              <Upload className="w-6 h-6 text-white/35" />
              <span className="text-xs text-white/45">Adicionar imagem para guiar o video</span>
            </button>
          )}
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/80">Proporcao</label>
          <div className="grid grid-cols-2 gap-2">
            {ASPECT_RATIO_OPTIONS.map((ratio) => (
              <button
                key={ratio.value}
                onClick={() => setAspectRatio(ratio.value)}
                className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                  aspectRatio === ratio.value
                    ? 'bg-white/15 border border-border text-white'
                    : 'bg-white/5 border border-border text-muted-foreground hover:bg-white/10 hover:text-white'
                }`}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/80">Resolucao</label>
          <div className="flex gap-2">
            {RESOLUTION_OPTIONS.map((item) => (
              <button
                key={item.value}
                onClick={() => setResolution(item.value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  resolution === item.value
                    ? 'bg-white/15 border border-border text-white'
                    : 'bg-white/5 border border-border text-muted-foreground hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Topics Sidebar Component
// =============================================================================

interface TopicItemProps {
  topic: VideoGenerationTopic;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

const TopicItem: React.FC<TopicItemProps> = ({
  topic,
  isActive,
  onSelect,
  onDelete,
  onRename,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(topic.title || '');
  const [coverError, setCoverError] = useState(false);

  const handleStartEdit = useCallback(() => {
    setEditTitle(topic.title || '');
    setIsEditing(true);
  }, [topic.title]);

  const handleSaveEdit = useCallback(() => {
    if (editTitle.trim()) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  }, [editTitle, onRename]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditTitle(topic.title || '');
  }, [topic.title]);

  const handleDelete = useCallback(() => {
    if (confirm(`Excluir "${topic.title || 'Novo projeto'}" e todos os seus videos?`)) {
      onDelete();
    }
  }, [topic.title, onDelete]);

  if (isEditing) {
    return (
      <div className="p-2 bg-white/5 rounded-xl border border-border">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') handleCancelEdit();
          }}
          autoFocus
          className="w-full bg-transparent text-sm text-white focus:outline-none"
          placeholder="Nome do projeto"
        />
        <div className="flex items-center justify-end gap-1 mt-2">
          <button
            onClick={handleCancelEdit}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={handleSaveEdit}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <Check className="w-3.5 h-3.5 text-primary" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative group rounded-xl transition-colors cursor-pointer overflow-hidden ${
        isActive ? 'ring-2 ring-primary/50' : 'hover:ring-1 hover:ring-ring'
      }`}
    >
      <button
        onClick={onSelect}
        className="w-full aspect-square bg-white/5 overflow-hidden"
      >
        {topic.coverUrl && !coverError ? (
          <img
            src={topic.coverUrl}
            alt={topic.title || 'Projeto'}
            className="w-full h-full object-cover"
            onError={() => setCoverError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
      </button>

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity flex flex-col justify-end p-2 pointer-events-none opacity-0 group-hover:opacity-100">
        <p className="text-xs text-white font-medium truncate mb-1">
          {topic.title || 'Novo projeto'}
        </p>

        <div className="flex items-center gap-1 pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit();
            }}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title="Renomear"
          >
            <Edit3 className="w-3 h-3 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
};

const TopicsSidebar: React.FC = () => {
  const { topics, isLoading: topicsLoading, createTopic, deleteTopic, updateTopic } =
    useVideoPlaygroundTopics();
  const { activeTopicId, switchTopic } = useVideoPlaygroundStore();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTopic = useCallback(async () => {
    setIsCreating(true);
    try {
      await createTopic();
    } catch (err) {
      console.error('Failed to create topic:', err);
    } finally {
      setIsCreating(false);
    }
  }, [createTopic]);

  return (
    <div className="h-full flex flex-col bg-black/40 backdrop-blur-xl">
      <div className="px-3 py-3 border-b border-border flex items-center justify-center">
        <button
          onClick={handleCreateTopic}
          disabled={isCreating}
          className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 inline-flex items-center justify-center"
          title="Novo projeto"
        >
          {isCreating ? (
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin shrink-0" />
          ) : (
            <Plus className="w-5 h-5 text-muted-foreground shrink-0" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-3">
        {topicsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        ) : topics.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center mx-auto">
              <Film className="w-7 h-7 text-muted-foreground" />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {topics.map((topic) => (
              <TopicItem
                key={topic.id}
                topic={topic}
                isActive={topic.id === activeTopicId}
                onSelect={() => switchTopic(topic.id)}
                onDelete={() => deleteTopic(topic.id)}
                onRename={(title) => updateTopic(topic.id, { title })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Workspace Component
// =============================================================================

interface WorkspaceProps {
  brandProfile: BrandProfile;
  onAddImageToGallery?: (image: Omit<GalleryImage, "id">) => GalleryImage;
}

const Workspace: React.FC<WorkspaceProps> = ({ brandProfile, onAddImageToGallery }) => {
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const { prompt, setPrompt, activeTopicId, model, resolution } = useVideoPlaygroundStore();
  const { sessions, isLoading: sessionsLoading } = useVideoPlaygroundSessions(activeTopicId);
  const { createVideo, isCreating, canGenerate } = useCreateVideo(
    onAddImageToGallery
      ? (data) => onAddImageToGallery({ ...data, model: 'video-export' as const })
      : undefined
  );

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;

    try {
      await createVideo();
      if (promptRef.current) {
        promptRef.current.style.height = 'auto';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      setErrorToast(message);
      setTimeout(() => setErrorToast(null), 5000);
    }
  }, [canGenerate, createVideo]);

  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  }, [handleGenerate]);

  const showEmptyState = sessions.length === 0 && !sessionsLoading;

  // Convert sessions to VideoCard format
  const feed = sessions.flatMap((session) =>
    session.generations.map((gen) => ({
      id: gen.id,
      mediaType: MediaType.VIDEO,
      username: brandProfile.name || 'voce',
      avatarUrl: brandProfile.logo || 'https://api.dicebear.com/7.x/avataaars/svg?seed=voce',
      description: session.prompt,
      modelTag: `${session.model === 'sora-2' ? 'Sora 2' : 'Veo 3.1'} • ${session.resolution}`,
      status: gen.status === 'success' ? PostStatus.SUCCESS : gen.status === 'error' ? PostStatus.ERROR : PostStatus.GENERATING,
      aspectRatio: session.aspectRatio === '16:9' ? PlaygroundAspectRatio.LANDSCAPE : PlaygroundAspectRatio.PORTRAIT,
      videoUrl: gen.asset?.url,
      errorMessage: gen.errorMessage,
    }))
  );

  return (
    <>
      {/* Error Toast */}
      <OverlayPortal>
        <AnimatePresence>
          {errorToast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 24, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 left-1/2 -translate-x-1/2 z-[2147483645] bg-[#000000]/95 border border-border text-white px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-2xl max-w-md text-center text-sm font-medium flex items-center gap-3"
            >
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              {errorToast}
            </motion.div>
          )}
        </AnimatePresence>
      </OverlayPortal>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {!showEmptyState && (
          <div className="px-6 py-4 border-b border-border">
            <h1 className="text-xl font-semibold text-white">Studio Video</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Gerencie suas geracoes de video
            </p>
          </div>
        )}

        {showEmptyState ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-border flex items-center justify-center">
                <Video className="w-8 h-8 text-white/75" />
              </div>
              <h1 className="text-4xl font-semibold text-white">Studio Video</h1>
            </div>

            <div className="w-full max-w-2xl">
              <div className="relative bg-white/5 border border-border rounded-2xl overflow-hidden focus-within:border-white/20 transition-colors">
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
                  }}
                  onKeyDown={handlePromptKeyDown}
                  rows={1}
                  className="w-full bg-transparent px-5 py-4 pr-16 text-sm text-white placeholder:text-muted-foreground resize-none focus:outline-none"
                  placeholder="Descreva a cena do video que deseja gerar"
                  style={{ minHeight: '56px', maxHeight: '180px' }}
                />

                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    canGenerate
                      ? 'bg-white/10 text-white hover:bg-white/20 active:scale-95'
                      : 'bg-white/5 text-muted-foreground cursor-not-allowed'
                  }`}
                  title="Gerar video (Ctrl/Cmd + Enter)"
                >
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {sessionsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
              ) : (
                <div className="p-6 grid grid-cols-[repeat(auto-fill,minmax(240px,340px))] gap-6 justify-center xl:justify-start">
                  <AnimatePresence initial={false}>
                    {feed.map((post) => (
                      <motion.div
                        key={post.id}
                        className="w-full max-w-[340px] rounded-2xl"
                        layout
                      >
                        <VideoCard post={post} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            <div className="border-t border-border p-4 bg-black/40 backdrop-blur-xl">
              <div className="relative bg-white/5 border border-border rounded-2xl overflow-hidden focus-within:border-white/20 transition-colors">
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
                  }}
                  onKeyDown={handlePromptKeyDown}
                  rows={1}
                  className="w-full bg-transparent px-5 py-4 pr-16 text-sm text-white placeholder:text-muted-foreground resize-none focus:outline-none"
                  placeholder="Descreva o proximo video"
                  style={{ minHeight: '56px', maxHeight: '180px' }}
                />

                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    canGenerate
                      ? 'bg-white/10 text-white hover:bg-white/20 active:scale-95'
                      : 'bg-white/5 text-muted-foreground cursor-not-allowed'
                  }`}
                  title="Gerar video (Ctrl/Cmd + Enter)"
                >
                  {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({
  brandProfile,
  onAddImageToGallery,
}) => {
  // Initialize hooks (this triggers SWR fetches)
  useVideoPlaygroundTopics();

  return (
    <div className="h-full w-full bg-background text-white flex overflow-hidden">
      {/* Left Panel: Config */}
      <div className="w-80 shrink-0 border-r border-border overflow-y-auto no-scrollbar">
        <ConfigPanel />
      </div>

      {/* Center Panel: Workspace */}
      <Workspace brandProfile={brandProfile} onAddImageToGallery={onAddImageToGallery} />

      {/* Right Panel: Topics Sidebar */}
      <div className="w-20 shrink-0 border-l border-border overflow-y-auto no-scrollbar">
        <TopicsSidebar />
      </div>
    </div>
  );
};

export default PlaygroundView;
