/**
 * PlaygroundView Component
 * Video Studio workspace with 3-panel layout inspired by Image Studio
 * Now uses Zustand store + hooks for persistent topics
 */

import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Monitor,
  Smartphone,
  ChevronDown,
} from 'lucide-react';
import { OverlayPortal } from '../common/OverlayPortal';
import { VideoCard } from './VideoCard';
import { StudioAgentToggle } from '../studio-agent/StudioAgentToggle';
import { StudioAgentPanel } from '../studio-agent/StudioAgentPanel';
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

const MODEL_OPTIONS: Array<{ value: VideoModel; label: string; color: string; desc: string }> = [
  { value: 'veo-3.1', label: 'Veo 3.1', color: '#3B82F6', desc: 'Google DeepMind' },
  { value: 'sora-2', label: 'Sora 2', color: '#10B981', desc: 'OpenAI' },
];

const ASPECT_RATIO_OPTIONS: Array<{ value: VideoAspectRatio; label: string; icon: React.ReactNode }> = [
  { value: '9:16', label: '9:16', icon: <Smartphone className="w-3.5 h-3.5" /> },
  { value: '16:9', label: '16:9', icon: <Monitor className="w-3.5 h-3.5" /> },
];

const RESOLUTION_OPTIONS: Array<{ value: VideoResolution; label: string; desc: string }> = [
  { value: '720p', label: '720p', desc: 'HD' },
  { value: '1080p', label: '1080p', desc: 'Full HD' },
];

// =============================================================================
// Section wrapper for config panel
// =============================================================================

const ConfigSection: React.FC<{ label: string; children: React.ReactNode; action?: React.ReactNode }> = ({ label, children, action }) => (
  <div className="space-y-2.5">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</span>
      {action}
    </div>
    {children}
  </div>
);

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

  const activeModel = MODEL_OPTIONS.find((o) => o.value === model);

  return (
    <div className="h-full flex flex-col bg-black/30 backdrop-blur-2xl">
      {/* Header */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
              <Video className="w-4.5 h-4.5 text-white/50" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white tracking-tight">Studio Video</h1>
            <p className="text-[11px] text-white/35 mt-0.5">Configuracoes de geracao</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Model Selection */}
        <ConfigSection label="Modelo">
          <div className="space-y-1.5">
            {MODEL_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setModel(option.value)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                  model === option.value
                    ? 'bg-white/[0.08] border border-white/[0.12] shadow-sm'
                    : 'bg-transparent border border-transparent hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all ${
                    model === option.value ? 'scale-110 shadow-lg' : 'opacity-50'
                  }`}
                  style={{
                    backgroundColor: option.color,
                    boxShadow: model === option.value ? `0 0 12px ${option.color}50` : 'none',
                  }}
                />
                <div className="flex-1 text-left">
                  <span className={`text-sm font-medium ${model === option.value ? 'text-white' : 'text-white/60'}`}>
                    {option.label}
                  </span>
                  <span className={`text-[10px] ml-2 ${model === option.value ? 'text-white/40' : 'text-white/25'}`}>
                    {option.desc}
                  </span>
                </div>
                {model === option.value && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                )}
              </button>
            ))}
          </div>
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Brand Profile Toggle */}
        <ConfigSection label="Marca">
          <button
            onClick={toggleBrandProfile}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
              useBrandProfile
                ? 'bg-white/[0.08] border border-white/[0.12]'
                : 'bg-transparent border border-white/[0.06] hover:bg-white/[0.04]'
            }`}
            title={useBrandProfile ? 'Diretrizes da marca ativas' : 'Diretrizes da marca desativadas'}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              useBrandProfile
                ? 'bg-white text-black'
                : 'bg-white/[0.06] text-white/40'
            }`}>
              <Palette className="w-4 h-4" />
            </div>
            <div className="flex-1 text-left">
              <span className={`text-sm font-medium ${useBrandProfile ? 'text-white' : 'text-white/60'}`}>
                Perfil da marca
              </span>
              <p className="text-[10px] text-white/25 mt-0.5">
                {useBrandProfile ? 'Ativo - diretrizes aplicadas' : 'Desativado'}
              </p>
            </div>
            <div className={`w-8 h-[18px] rounded-full transition-all duration-200 relative ${
              useBrandProfile ? 'bg-white/20' : 'bg-white/[0.06]'
            }`}>
              <div className={`absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 ${
                useBrandProfile ? 'left-[17px] bg-white' : 'left-[3px] bg-white/30'
              }`} />
            </div>
          </button>
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Reference Image */}
        <ConfigSection
          label="Referencia"
          action={referenceImage ? (
            <button
              onClick={clearReferenceImage}
              className="text-[10px] font-medium text-white/30 hover:text-white/60 transition-colors uppercase tracking-wider"
            >
              Remover
            </button>
          ) : undefined}
        >
          <input
            ref={referenceInputRef}
            type="file"
            accept="image/*"
            onChange={handleReferenceUpload}
            className="hidden"
          />

          {referenceImage ? (
            <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03] group/ref">
              <img
                src={`data:${referenceImage.mimeType};base64,${referenceImage.dataUrl}`}
                alt="Referência"
                className="w-full h-32 object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/ref:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  onClick={clearReferenceImage}
                  className="p-2 rounded-lg bg-black/60 hover:bg-black/80 transition-colors"
                  title="Remover imagem"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => referenceInputRef.current?.click()}
              className="w-full border border-dashed border-white/[0.1] rounded-xl p-5 flex flex-col items-center justify-center gap-2.5 hover:border-white/[0.2] hover:bg-white/[0.02] transition-all group/upload"
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover/upload:bg-white/[0.08] transition-colors">
                <Upload className="w-4.5 h-4.5 text-white/30 group-hover/upload:text-white/50 transition-colors" />
              </div>
              <span className="text-[11px] text-white/30 group-hover/upload:text-white/50 transition-colors">
                Imagem para guiar o video
              </span>
            </button>
          )}
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Aspect Ratio */}
        <ConfigSection label="Proporcao">
          <div className="grid grid-cols-2 gap-2">
            {ASPECT_RATIO_OPTIONS.map((ratio) => (
              <button
                key={ratio.value}
                onClick={() => setAspectRatio(ratio.value)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  aspectRatio === ratio.value
                    ? 'bg-white/[0.1] border border-white/[0.15] text-white shadow-sm'
                    : 'bg-white/[0.03] border border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                }`}
              >
                <span className={aspectRatio === ratio.value ? 'text-white/70' : 'text-white/25'}>
                  {ratio.icon}
                </span>
                {ratio.label}
              </button>
            ))}
          </div>
        </ConfigSection>

        {/* Resolution */}
        <ConfigSection label="Resolucao">
          <div className="grid grid-cols-2 gap-2">
            {RESOLUTION_OPTIONS.map((item) => (
              <button
                key={item.value}
                onClick={() => setResolution(item.value)}
                className={`flex flex-col items-center py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  resolution === item.value
                    ? 'bg-white/[0.1] border border-white/[0.15] text-white shadow-sm'
                    : 'bg-white/[0.03] border border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                }`}
              >
                {item.label}
                <span className={`text-[10px] mt-0.5 ${resolution === item.value ? 'text-white/40' : 'text-white/20'}`}>
                  {item.desc}
                </span>
              </button>
            ))}
          </div>
        </ConfigSection>
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
      <div className="p-2 bg-white/[0.06] rounded-xl border border-white/[0.1]">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') handleCancelEdit();
          }}
          autoFocus
          className="w-full bg-transparent text-[11px] text-white focus:outline-none"
          placeholder="Nome do projeto"
        />
        <div className="flex items-center justify-end gap-1 mt-1.5">
          <button
            onClick={handleCancelEdit}
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-3 h-3 text-white/40" />
          </button>
          <button
            onClick={handleSaveEdit}
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <Check className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative group rounded-xl transition-all duration-200 cursor-pointer overflow-hidden ${
        isActive
            ? 'ring-2 ring-white/40 shadow-[0_0_12px_rgba(255,255,255,0.08)]'
          : 'hover:ring-1 hover:ring-white/[0.15]'
      }`}
    >
      <button
        onClick={onSelect}
        className="w-full aspect-square bg-white/[0.03] overflow-hidden"
      >
        {topic.coverUrl && !coverError ? (
          <img
            src={topic.coverUrl}
            alt={topic.title || 'Projeto'}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setCoverError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/[0.04] to-white/[0.01]">
            <Video className="w-5 h-5 text-white/20" />
          </div>
        )}
      </button>

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-200 flex flex-col justify-end p-1.5 pointer-events-none opacity-0 group-hover:opacity-100">
        <p className="text-[9px] text-white font-medium truncate mb-1 px-0.5">
          {topic.title || 'Novo projeto'}
        </p>

        <div className="flex items-center gap-0.5 pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit();
            }}
            className="p-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            title="Renomear"
          >
            <Edit3 className="w-2.5 h-2.5 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-1 rounded-md bg-white/10 hover:bg-red-500/40 transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-2.5 h-2.5 text-white" />
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
    <div className="h-full flex flex-col bg-black/30 backdrop-blur-2xl">
      <div className="px-2.5 py-3 border-b border-white/[0.06] flex items-center justify-center">
        <button
          onClick={handleCreateTopic}
          disabled={isCreating}
          className="w-[52px] h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition-all disabled:opacity-50 inline-flex items-center justify-center group/add"
          title="Novo projeto"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 text-white/40 animate-spin shrink-0" />
          ) : (
            <Plus className="w-4 h-4 text-white/40 group-hover/add:text-white/70 transition-colors shrink-0" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2.5 px-2.5">
        {topicsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <Film className="w-4.5 h-4.5 text-white/15" />
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
  const [mode, setMode] = useState<'direct' | 'agent'>('direct');

  const { prompt, setPrompt, activeTopicId, model, resolution } = useVideoPlaygroundStore();
  const { sessions, isLoading: sessionsLoading } = useVideoPlaygroundSessions(activeTopicId);
  const { createTopic } = useVideoPlaygroundTopics();
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

  useEffect(() => {
    let cancelled = false;

    async function ensureTopicForAgent() {
      if (mode !== 'agent' || activeTopicId) return;
      try {
        await createTopic();
      } catch {
        if (!cancelled) {
          setErrorToast('Não foi possível iniciar o tópico do modo agente.');
          setTimeout(() => setErrorToast(null), 5000);
        }
      }
    }

    ensureTopicForAgent();
    return () => {
      cancelled = true;
    };
  }, [activeTopicId, createTopic, mode]);

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

  const PromptInput = ({ placeholder }: { placeholder: string }) => (
    <div className="relative bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden focus-within:border-white/[0.15] focus-within:bg-white/[0.06] transition-all duration-200 group/prompt">
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
        className="w-full bg-transparent px-5 py-4 pr-16 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none"
        placeholder={placeholder}
        style={{ minHeight: '56px', maxHeight: '180px' }}
      />

      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <span className="text-[10px] text-white/20 hidden group-focus-within/prompt:inline">
          {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter
        </span>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
            canGenerate
                ? 'bg-white/[0.1] border border-white/[0.15] text-white hover:bg-white/[0.15] active:scale-95'
              : 'bg-white/[0.04] text-white/20 cursor-not-allowed border border-transparent'
          }`}
          title="Gerar video (Ctrl/Cmd + Enter)"
        >
          {isCreating ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Sparkles className="w-4.5 h-4.5" />}
        </button>
      </div>
    </div>
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
              className="fixed top-0 left-1/2 -translate-x-1/2 z-[2147483645] bg-red-950/90 border border-red-500/30 text-white px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-2xl max-w-md text-center text-sm font-medium flex items-center gap-3"
            >
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              {errorToast}
            </motion.div>
          )}
        </AnimatePresence>
      </OverlayPortal>

      <div className="flex-1 min-h-0 flex overflow-hidden bg-background">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {!showEmptyState && (
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-lg font-semibold text-white tracking-tight">Geracoes</h1>
                    <p className="text-[11px] text-white/35 mt-0.5">
                      {feed.length} {feed.length === 1 ? 'video' : 'videos'} gerados
                    </p>
                  </div>
                </div>
                <StudioAgentToggle mode={mode} onChange={setMode} />
              </div>
            </div>
          )}

          {showEmptyState ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6">
              {/* Hero empty state */}
              <div className="flex flex-col items-center mb-10">
                  <div className="w-20 h-20 rounded-3xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-5">
                    <Video className="w-9 h-9 text-white/40" />
                </div>
                <h1 className="text-3xl font-semibold text-white tracking-tight mb-2">Studio Video</h1>
                <p className="text-sm text-white/35 max-w-sm text-center">
                  Gere videos com IA a partir de prompts de texto ou imagens de referencia
                </p>
              </div>

              <div className="w-full max-w-xl">
                <div className="mb-4 flex justify-center">
                  <StudioAgentToggle mode={mode} onChange={setMode} />
                </div>
                {mode === 'direct' ? (
                  <PromptInput placeholder="Descreva a cena do video que deseja gerar..." />
                ) : (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-6 text-sm text-white/35 text-center">
                    Use o painel lateral do agente para conversar e gerar videos.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto no-scrollbar">
                {sessionsLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
                  </div>
                ) : (
                  <div className="p-6 grid grid-cols-[repeat(auto-fill,minmax(260px,340px))] gap-5 justify-center xl:justify-start">
                    <AnimatePresence initial={false}>
                      {feed.map((post) => (
                        <motion.div
                          key={post.id}
                          className="w-full max-w-[340px]"
                          layout
                        >
                          <VideoCard post={post} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {mode === 'direct' && (
                <div className="border-t border-white/[0.06] p-4 bg-black/30 backdrop-blur-2xl">
                  <div className="max-w-3xl mx-auto">
                    <PromptInput placeholder="Descreva o proximo video..." />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {mode === 'agent' && (
          <StudioAgentPanel studioType="video" topicId={activeTopicId} layout="sidebar" />
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
      <div className="w-72 shrink-0 border-r border-white/[0.06] overflow-y-auto no-scrollbar">
        <ConfigPanel />
      </div>

      {/* Center Panel: Workspace */}
      <Workspace brandProfile={brandProfile} onAddImageToGallery={onAddImageToGallery} />

      {/* Right Panel: Topics Sidebar */}
      <div className="w-[72px] shrink-0 border-l border-white/[0.06] overflow-y-auto no-scrollbar">
        <TopicsSidebar />
      </div>
    </div>
  );
};

export default PlaygroundView;
