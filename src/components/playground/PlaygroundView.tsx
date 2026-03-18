import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useState } from 'react';
import { Video } from 'lucide-react';
import { OverlayPortal } from '../common/OverlayPortal';
import { StudioAgentToggle } from '../studio-agent/StudioAgentToggle';
import { StudioAgentPanel } from '../studio-agent/StudioAgentPanel';
import { PlaygroundModelSelector } from './PlaygroundModelSelector';
import { PlaygroundPromptForm } from './PlaygroundPromptForm';
import { PlaygroundResultGrid } from './PlaygroundResultGrid';
import { PlaygroundTopicsSidebar } from './PlaygroundTopicsSidebar';
import {
  MediaType,
  PostStatus,
  PlaygroundAspectRatio,
} from './types';
import type { BrandProfile, GalleryImage } from '../../types';
import { useShallow } from 'zustand/react/shallow';
import { useVideoPlaygroundStore } from '../../stores/videoPlaygroundStore';
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

interface WorkspaceProps {
  brandProfile: BrandProfile;
  onAddImageToGallery?: (image: Omit<GalleryImage, "id">) => GalleryImage;
}

const Workspace: React.FC<WorkspaceProps> = ({ brandProfile, onAddImageToGallery }) => {
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [mode, setMode] = useState<'direct' | 'agent'>('direct');

  const { prompt, setPrompt, activeTopicId } = useVideoPlaygroundStore(useShallow((s) => ({
    prompt: s.prompt,
    setPrompt: s.setPrompt,
    activeTopicId: s.activeTopicId,
  })));
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      setErrorToast(message);
      setTimeout(() => setErrorToast(null), 5000);
    }
  }, [canGenerate, createVideo]);

  const showEmptyState = sessions.length === 0 && !sessionsLoading;

  useEffect(() => {
    let cancelled = false;
    async function ensureTopicForAgent() {
      if (mode !== 'agent' || activeTopicId) return;
      try {
        await createTopic();
      } catch {
        if (!cancelled) {
          setErrorToast('Nao foi possivel iniciar o topico do modo agente.');
          setTimeout(() => setErrorToast(null), 5000);
        }
      }
    }
    ensureTopicForAgent();
    return () => { cancelled = true; };
  }, [activeTopicId, createTopic, mode]);

  const feed = sessions.flatMap((session) =>
    session.generations.map((gen) => ({
      id: gen.id,
      mediaType: MediaType.VIDEO,
      username: brandProfile.name || 'voce',
      avatarUrl: brandProfile.logo || 'https://api.dicebear.com/7.x/avataaars/svg?seed=voce',
      description: session.prompt,
      modelTag: `${session.model === 'sora-2' ? 'Sora 2' : 'Veo 3.1'} \u2022 ${session.resolution}`,
      status: gen.status === 'success' ? PostStatus.SUCCESS : gen.status === 'error' ? PostStatus.ERROR : PostStatus.GENERATING,
      aspectRatio: session.aspectRatio === '16:9' ? PlaygroundAspectRatio.LANDSCAPE : PlaygroundAspectRatio.PORTRAIT,
      videoUrl: gen.asset?.url,
      errorMessage: gen.errorMessage,
    }))
  );

  return (
    <>
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
                  <PlaygroundPromptForm
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    onGenerate={handleGenerate}
                    canGenerate={canGenerate}
                    isCreating={isCreating}
                    placeholder="Descreva a cena do video que deseja gerar..."
                  />
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
                <PlaygroundResultGrid feed={feed} isLoading={sessionsLoading} />
              </div>

              {mode === 'direct' && (
                <div className="border-t border-white/[0.06] p-4 bg-black/30 backdrop-blur-2xl">
                  <div className="max-w-3xl mx-auto">
                    <PlaygroundPromptForm
                      prompt={prompt}
                      onPromptChange={setPrompt}
                      onGenerate={handleGenerate}
                      canGenerate={canGenerate}
                      isCreating={isCreating}
                      placeholder="Descreva o proximo video..."
                    />
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

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({
  brandProfile,
  onAddImageToGallery,
}) => {
  useVideoPlaygroundTopics();

  return (
    <div className="h-full w-full bg-background text-white flex overflow-hidden">
      <div className="w-72 shrink-0 border-r border-white/[0.06] overflow-y-auto no-scrollbar">
        <PlaygroundModelSelector />
      </div>
      <Workspace brandProfile={brandProfile} onAddImageToGallery={onAddImageToGallery} />
      <div className="w-[72px] shrink-0 border-l border-white/[0.06] overflow-y-auto no-scrollbar">
        <PlaygroundTopicsSidebar />
      </div>
    </div>
  );
};
