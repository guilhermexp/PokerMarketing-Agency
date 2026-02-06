/**
 * PlaygroundView Component
 * Video Studio workspace with 3-panel layout inspired by Image Studio
 */

import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Clapperboard,
  Film,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { OverlayPortal } from '../common/OverlayPortal';
import { VideoCard } from './VideoCard';
import {
  FeedPost,
  MediaType,
  PlaygroundAspectRatio,
  PlaygroundResolution,
  PostStatus,
} from './types';
import { generateVideo as generateVideoDirect, type ApiVideoModel } from '../../services/apiClient';
import type { BrandProfile } from '../../types';

interface PlaygroundViewProps {
  brandProfile: BrandProfile;
  userId?: string;
}

interface ReferenceImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
  fileName: string;
}

const MODEL_OPTIONS: Array<{ value: ApiVideoModel; label: string; color: string }> = [
  { value: 'veo-3.1', label: 'Veo 3.1', color: '#3B82F6' },
  { value: 'sora-2', label: 'Sora 2', color: '#10B981' },
];

const ASPECT_RATIO_OPTIONS: Array<{ value: PlaygroundAspectRatio; label: string }> = [
  { value: PlaygroundAspectRatio.PORTRAIT, label: '9:16' },
  { value: PlaygroundAspectRatio.LANDSCAPE, label: '16:9' },
];

const RESOLUTION_OPTIONS: Array<{ value: PlaygroundResolution; label: string }> = [
  { value: PlaygroundResolution.P720, label: '720p' },
  { value: PlaygroundResolution.P1080, label: '1080p' },
];

const fileToReferenceImage = (file: File): Promise<ReferenceImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Falha ao ler a imagem de referencia.'));
        return;
      }

      const base64 = reader.result.split(',')[1];
      if (!base64) {
        reject(new Error('Falha ao converter a imagem de referencia.'));
        return;
      }

      resolve({
        base64,
        mimeType: file.type || 'image/png',
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
      });
    };
    reader.onerror = () => reject(new Error('Erro ao processar a imagem de referencia.'));
    reader.readAsDataURL(file);
  });
};

const modelToLabel = (model: ApiVideoModel): string => {
  return model === 'sora-2' ? 'Sora 2' : 'Veo 3.1';
};

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({ brandProfile, userId }) => {
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<ApiVideoModel>('veo-3.1');
  const [aspectRatio, setAspectRatio] = useState<PlaygroundAspectRatio>(PlaygroundAspectRatio.PORTRAIT);
  const [resolution, setResolution] = useState<PlaygroundResolution>(PlaygroundResolution.P720);
  const [useBrandProfile, setUseBrandProfile] = useState(false);
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Auto-dismiss error toast
  useEffect(() => {
    if (!errorToast) return;
    const timer = setTimeout(() => setErrorToast(null), 5000);
    return () => clearTimeout(timer);
  }, [errorToast]);

  // Keep active card in sync with feed
  useEffect(() => {
    if (feed.length === 0) {
      setActivePostId(null);
      return;
    }

    if (!activePostId || !feed.some((post) => post.id === activePostId)) {
      setActivePostId(feed[0].id);
    }
  }, [feed, activePostId]);

  // Release object URL when reference image changes/unmounts
  useEffect(() => {
    return () => {
      if (referenceImage?.previewUrl) {
        URL.revokeObjectURL(referenceImage.previewUrl);
      }
    };
  }, [referenceImage]);

  const updateFeedPost = useCallback((id: string, updates: Partial<FeedPost>) => {
    setFeed((prevFeed) =>
      prevFeed.map((post) => (post.id === id ? { ...post, ...updates } : post)),
    );
  }, []);

  const buildPrompt = useCallback((basePrompt: string) => {
    const additions: string[] = [];

    if (useBrandProfile) {
      additions.push(`Marca: ${brandProfile.name}`);
      if (brandProfile.description) {
        additions.push(`Descricao da marca: ${brandProfile.description}`);
      }
      additions.push(`Tom de voz: ${brandProfile.toneOfVoice}`);
    }

    additions.push(`Qualidade visual alvo: ${resolution}`);

    if (additions.length === 0) return basePrompt.trim();

    return `${basePrompt.trim()}\n\nDiretrizes adicionais:\n- ${additions.join('\n- ')}`;
  }, [brandProfile, resolution, useBrandProfile]);

  const handleGenerate = useCallback(async () => {
    const promptValue = prompt.trim();
    if (!promptValue || isSubmitting) return;

    if (!userId) {
      setErrorToast('Usuario nao autenticado. Faça login para gerar videos.');
      return;
    }

    const newPostId = Date.now().toString();
    const modelLabel = modelToLabel(selectedModel);

    const newPost: FeedPost = {
      id: newPostId,
      mediaType: MediaType.VIDEO,
      username: brandProfile.name || 'voce',
      avatarUrl: brandProfile.logo || 'https://api.dicebear.com/7.x/avataaars/svg?seed=voce',
      description: promptValue,
      modelTag: `${modelLabel} • ${resolution}`,
      status: PostStatus.GENERATING,
      aspectRatio,
      referenceImageBase64: referenceImage?.base64,
    };

    setFeed((prev) => [newPost, ...prev]);
    setActivePostId(newPostId);
    setPrompt('');
    if (promptRef.current) {
      promptRef.current.style.height = 'auto';
    }

    setIsSubmitting(true);

    try {
      const promptWithContext = buildPrompt(promptValue);
      const apiAspectRatio: '16:9' | '9:16' =
        aspectRatio === PlaygroundAspectRatio.LANDSCAPE ? '16:9' : '9:16';
      const videoUrl = await generateVideoDirect({
        prompt: promptWithContext,
        model: selectedModel,
        aspectRatio: apiAspectRatio,
        generateAudio: true,
        imageUrl: referenceImage
          ? `data:${referenceImage.mimeType};base64,${referenceImage.base64}`
          : undefined,
      });
      updateFeedPost(newPostId, { status: PostStatus.SUCCESS, videoUrl });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      updateFeedPost(newPostId, { status: PostStatus.ERROR, errorMessage });
      setErrorToast(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    aspectRatio,
    brandProfile.logo,
    brandProfile.name,
    buildPrompt,
    isSubmitting,
    prompt,
    referenceImage,
    resolution,
    selectedModel,
    updateFeedPost,
    userId,
  ]);

  const handlePromptKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  }, [handleGenerate]);

  const handleReferenceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorToast('Selecione um arquivo de imagem para referencia.');
      return;
    }

    try {
      const parsed = await fileToReferenceImage(file);
      setReferenceImage((previous) => {
        if (previous?.previewUrl) {
          URL.revokeObjectURL(previous.previewUrl);
        }
        return parsed;
      });
    } catch (error) {
      console.error('Failed to load reference image:', error);
      setErrorToast('Falha ao carregar imagem de referencia.');
    } finally {
      if (referenceInputRef.current) {
        referenceInputRef.current.value = '';
      }
    }
  }, []);

  const clearReferenceImage = useCallback(() => {
    setReferenceImage((previous) => {
      if (previous?.previewUrl) {
        URL.revokeObjectURL(previous.previewUrl);
      }
      return null;
    });
  }, []);

  const handleClearSession = useCallback(() => {
    setFeed([]);
    setActivePostId(null);
  }, []);

  const handleSelectPost = useCallback((postId: string) => {
    setActivePostId(postId);
    const element = postRefs.current[postId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const showEmptyState = feed.length === 0;
  const activePost = useMemo(() => {
    if (!activePostId) return null;
    return feed.find((post) => post.id === activePostId) || null;
  }, [activePostId, feed]);

  return (
    <div className="h-full w-full bg-[#0a0a0a] text-white flex overflow-hidden">
      {/* Error Toast */}
      <OverlayPortal>
        <AnimatePresence>
          {errorToast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 24, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 left-1/2 -translate-x-1/2 z-[2147483645] bg-[#000000]/95 border border-white/10 text-white px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-2xl max-w-md text-center text-sm font-medium flex items-center gap-3"
            >
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              {errorToast}
            </motion.div>
          )}
        </AnimatePresence>
      </OverlayPortal>

      {/* Left Panel: Config */}
      <div className="w-80 shrink-0 border-r border-white/10 overflow-y-auto no-scrollbar">
        <div className="h-full flex flex-col bg-black/40 backdrop-blur-xl">
          <div className="px-4 py-5 border-b border-white/10">
            <h1 className="text-2xl font-bold text-white">Studio Video</h1>
            <p className="text-xs text-white/50 mt-1">Defina parametros e gere videos em segundos</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Model Selection */}
            <div className="relative">
              <label className="text-sm font-medium text-white/80 block mb-2">Modelo</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as ApiVideoModel)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-10 text-sm text-white focus:outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
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
                  backgroundColor:
                    MODEL_OPTIONS.find((option) => option.value === selectedModel)?.color || '#3B82F6',
                }}
              />
            </div>

            {/* Brand Profile Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-white/80">Usar perfil da marca</label>
              <button
                onClick={() => setUseBrandProfile((prev) => !prev)}
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
                  useBrandProfile
                    ? 'bg-white text-black shadow-md'
                    : 'bg-white/5 text-white/60 border border-white/10 hover:text-white hover:border-white/20'
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
                    className="text-xs text-white/50 hover:text-white transition-colors"
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
                <div className="relative rounded-xl overflow-hidden border border-white/10 bg-white/5">
                  <img
                    src={referenceImage.previewUrl}
                    alt={referenceImage.fileName}
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
                  className="w-full border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 hover:border-white/20 hover:bg-white/5 transition-colors"
                >
                  <Upload className="w-6 h-6 text-white/35" />
                  <span className="text-xs text-white/45">Adicionar imagem para guiar o video</span>
                </button>
              )}
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Proporcao</label>
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_RATIO_OPTIONS.map((ratio) => (
                  <button
                    key={ratio.value}
                    onClick={() => setAspectRatio(ratio.value)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                      aspectRatio === ratio.value
                        ? 'bg-white/15 border border-white/20 text-white'
                        : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
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
                        ? 'bg-white/15 border border-white/20 text-white'
                        : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleClearSession}
              disabled={feed.length === 0}
              className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Limpar sessao
            </button>
          </div>
        </div>
      </div>

      {/* Center Panel: Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0a0a0a]">
        {!showEmptyState && (
          <div className="px-6 py-4 border-b border-white/10">
            <h1 className="text-xl font-semibold text-white">Studio Video</h1>
            <p className="text-xs text-white/50 mt-1">
              {activePost ? `Selecionado: ${activePost.modelTag}` : 'Gerencie suas geracoes de video'}
            </p>
          </div>
        )}

        {showEmptyState ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Video className="w-8 h-8 text-white/75" />
              </div>
              <h1 className="text-4xl font-semibold text-white">Studio Video</h1>
            </div>

            <div className="w-full max-w-2xl">
              <div className="relative bg-white/5 border border-white/10 rounded-2xl overflow-hidden focus-within:border-white/20 transition-colors">
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
                  className="w-full bg-transparent px-5 py-4 pr-16 text-sm text-white placeholder:text-white/40 resize-none focus:outline-none"
                  placeholder="Descreva a cena do video que deseja gerar"
                  style={{ minHeight: '56px', maxHeight: '180px' }}
                />

                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isSubmitting}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    prompt.trim() && !isSubmitting
                      ? 'bg-white/10 text-white hover:bg-white/20 active:scale-95'
                      : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }`}
                  title="Gerar video (Ctrl/Cmd + Enter)"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <div className="p-6 grid grid-cols-[repeat(auto-fill,minmax(240px,340px))] gap-6 justify-center xl:justify-start">
                <AnimatePresence initial={false}>
                  {feed.map((post) => (
                    <motion.div
                      key={post.id}
                      ref={(el) => {
                        postRefs.current[post.id] = el;
                      }}
                      className={`w-full max-w-[340px] rounded-2xl transition-all ${
                        activePostId === post.id ? 'ring-2 ring-primary/60' : 'ring-1 ring-transparent'
                      }`}
                      layout
                    >
                      <VideoCard post={post} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="border-t border-white/10 p-4 bg-black/40 backdrop-blur-xl">
              <div className="relative bg-white/5 border border-white/10 rounded-2xl overflow-hidden focus-within:border-white/20 transition-colors">
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
                  className="w-full bg-transparent px-5 py-4 pr-16 text-sm text-white placeholder:text-white/40 resize-none focus:outline-none"
                  placeholder="Descreva o proximo video"
                  style={{ minHeight: '56px', maxHeight: '180px' }}
                />

                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isSubmitting}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    prompt.trim() && !isSubmitting
                      ? 'bg-white/10 text-white hover:bg-white/20 active:scale-95'
                      : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }`}
                  title="Gerar video (Ctrl/Cmd + Enter)"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right Panel: Mini Gallery */}
      <div className="w-20 shrink-0 border-l border-white/10 overflow-y-auto no-scrollbar">
        <div className="h-full flex flex-col bg-black/40 backdrop-blur-xl">
          <div className="px-3 py-3 border-b border-white/10 flex items-center justify-center">
            <button
              onClick={handleClearSession}
              disabled={feed.length === 0}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center"
              title="Nova sessao"
            >
              <Plus className="w-5 h-5 text-white/60 shrink-0" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 px-3">
            {feed.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center mx-auto">
                  <Film className="w-7 h-7 text-white/30" />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {feed.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => handleSelectPost(post.id)}
                    className={`relative w-full aspect-square rounded-xl overflow-hidden transition-colors ${
                      activePostId === post.id
                        ? 'ring-2 ring-primary/60'
                        : 'ring-1 ring-transparent hover:ring-white/20'
                    }`}
                    title={post.description}
                  >
                    {post.status === PostStatus.SUCCESS && post.videoUrl ? (
                      <video
                        src={post.videoUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        loop
                        autoPlay
                      />
                    ) : post.referenceImageBase64 ? (
                      <img
                        src={`data:image/png;base64,${post.referenceImageBase64}`}
                        alt="Referencia"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        {post.status === PostStatus.GENERATING ? (
                          <Loader2 className="w-5 h-5 text-white/40 animate-spin" />
                        ) : post.status === PostStatus.ERROR ? (
                          <AlertCircle className="w-5 h-5 text-red-400" />
                        ) : (
                          <Clapperboard className="w-5 h-5 text-white/35" />
                        )}
                      </div>
                    )}

                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider bg-black/60 text-white/75">
                      {post.status === PostStatus.GENERATING ? '...' : post.modelTag.split('•')[0].trim()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaygroundView;
