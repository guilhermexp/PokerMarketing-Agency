/**
 * PlaygroundView Component
 * Main view for video generation playground with TikTok-style feed
 */

import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useState } from 'react';
import { Clapperboard, Video, ImageIcon } from 'lucide-react';
import { ApiKeyDialog } from './ApiKeyDialog';
import { BottomPromptBar } from './BottomPromptBar';
import { VideoCard } from './VideoCard';
import {
  FeedPost,
  GenerateVideoParams,
  PostStatus,
  GenerationMode,
  MediaType,
  PlaygroundAspectRatio,
} from './types';
import { queueVideoJob, queueImageJob, type ApiVideoModel, type VideoJobConfig, type ImageJobConfig } from '../../services/apiClient';
import { generateImage } from '../../services/geminiService';
import { urlToBase64 } from '../../utils/imageHelpers';
import { useBackgroundJobs } from '../../hooks/useBackgroundJobs';
import type { ActiveJob } from '../../hooks/useBackgroundJobs';
import type { BrandProfile } from '../../types';

// Check if we're in development mode
const isDevMode = import.meta.env.DEV || (typeof window !== 'undefined' && window.location.hostname === 'localhost');

// Sample video URLs for the feed
const sampleVideos: FeedPost[] = [
  {
    id: 's1',
    videoUrl: 'https://storage.googleapis.com/sideprojects-asronline/veo-cameos/cameo-alisa.mp4',
    mediaType: MediaType.VIDEO,
    username: 'alisa_fortin',
    avatarUrl: 'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Maria',
    description: 'Tomando um cafe em um charmoso cafe parisiense',
    modelTag: 'Veo Fast',
    status: PostStatus.SUCCESS,
    aspectRatio: PlaygroundAspectRatio.PORTRAIT,
  },
  {
    id: 's2',
    videoUrl: 'https://storage.googleapis.com/sideprojects-asronline/veo-cameos/cameo-omar.mp4',
    mediaType: MediaType.VIDEO,
    username: 'osanseviero',
    avatarUrl: 'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Emery',
    description: 'Em um zoologico de lhamas',
    modelTag: 'Veo Fast',
    status: PostStatus.SUCCESS,
    aspectRatio: PlaygroundAspectRatio.PORTRAIT,
  },
  {
    id: 's3',
    videoUrl: 'https://storage.googleapis.com/sideprojects-asronline/veo-cameos/cameo-ammaar.mp4',
    mediaType: MediaType.VIDEO,
    username: 'ammaar',
    avatarUrl: 'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Kimberly',
    description: 'Caminhando no tapete vermelho de uma cerimonia',
    modelTag: 'Veo',
    status: PostStatus.SUCCESS,
    aspectRatio: PlaygroundAspectRatio.PORTRAIT,
  },
];

interface PlaygroundViewProps {
  brandProfile: BrandProfile;
  userId?: string;
}

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({ brandProfile, userId }) => {
  const [feed, setFeed] = useState<FeedPost[]>(sampleVideos);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>(MediaType.VIDEO);
  // Image to edit (passed from VideoCard when clicking "Add to prompt")
  const [editingImage, setEditingImage] = useState<{ url: string; base64: string; mimeType: string } | null>(null);

  // Background jobs for video generation
  const { onJobComplete, onJobFailed } = useBackgroundJobs();

  // Track pending video jobs (jobContext -> postId mapping)
  const pendingVideoJobs = React.useRef<Map<string, string>>(new Map());
  // Track pending image jobs
  const pendingImageJobs = React.useRef<Map<string, string>>(new Map());

  // Auto-dismiss error toast
  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  const updateFeedPost = useCallback((id: string, updates: Partial<FeedPost>) => {
    setFeed(prevFeed =>
      prevFeed.map(post =>
        post.id === id ? { ...post, ...updates } : post
      )
    );
  }, []);

  // Handle clearing editing image after generation
  const handleClearEditingImage = useCallback(() => {
    setEditingImage(null);
  }, []);

  // Handle background job completion
  useEffect(() => {
    const handleComplete = (job: ActiveJob) => {
      const jobContext = job.context;
      if (!jobContext) return;

      // Check for video jobs
      const videoPostId = pendingVideoJobs.current.get(jobContext);
      if (videoPostId) {
        const resultUrl = job.result_url || "";
        console.debug(`[PlaygroundView] Video job completed for post ${videoPostId}:`, resultUrl);
        updateFeedPost(videoPostId, { videoUrl: resultUrl, status: PostStatus.SUCCESS });
        pendingVideoJobs.current.delete(jobContext);
        return;
      }

      // Check for image jobs
      const imagePostId = pendingImageJobs.current.get(jobContext);
      if (imagePostId) {
        const resultUrl = job.result_url || "";
        console.debug(`[PlaygroundView] Image job completed for post ${imagePostId}:`, resultUrl);
        updateFeedPost(imagePostId, { imageUrl: resultUrl, status: PostStatus.SUCCESS });
        pendingImageJobs.current.delete(jobContext);
      }
    };

    const handleFailed = (job: ActiveJob) => {
      const jobContext = job.context;
      if (!jobContext) return;

      const errorMessage = job.error_message || "Erro na geracao";

      // Check for video jobs
      const videoPostId = pendingVideoJobs.current.get(jobContext);
      if (videoPostId) {
        console.error(`[PlaygroundView] Video job failed for post ${videoPostId}:`, errorMessage);
        updateFeedPost(videoPostId, { status: PostStatus.ERROR, errorMessage });
        pendingVideoJobs.current.delete(jobContext);
        return;
      }

      // Check for image jobs
      const imagePostId = pendingImageJobs.current.get(jobContext);
      if (imagePostId) {
        console.error(`[PlaygroundView] Image job failed for post ${imagePostId}:`, errorMessage);
        updateFeedPost(imagePostId, { status: PostStatus.ERROR, errorMessage });
        pendingImageJobs.current.delete(jobContext);
      }
    };

    onJobComplete(handleComplete);
    onJobFailed(handleFailed);
  }, [onJobComplete, onJobFailed, updateFeedPost]);



  const processGeneration = useCallback(async (postId: string, params: GenerateVideoParams) => {
    try {
      const isImageGeneration = params.mediaType === MediaType.IMAGE;
      const aspectRatio: "16:9" | "9:16" = params.aspectRatio === '16:9' ? '16:9' : '9:16';

      // Build productImages array with logo if brand profile is enabled + user-added assets
      const allProductImages: { base64: string; mimeType: string }[] = [];
      if (params.useBrandProfile && brandProfile.logo) {
        const logoData = await urlToBase64(brandProfile.logo);
        if (logoData?.base64) {
          allProductImages.push({ base64: logoData.base64, mimeType: logoData.mimeType });
        }
      }
      if (params.productImages && params.productImages.length > 0) {
        allProductImages.push(...params.productImages);
      }

      if (isImageGeneration) {
        // Use background job if userId is available AND we're not in dev mode
        if (userId && !isDevMode) {
          let styleRef: string | undefined;
          if (params.styleReference) {
            styleRef = `data:${params.styleReference.mimeType || 'image/png'};base64,${params.styleReference.base64}`;
          }

          let personReferenceImage: { base64: string; mimeType: string } | undefined;
          if (params.referenceImages && params.referenceImages.length > 0) {
            personReferenceImage = {
              base64: params.referenceImages[0].base64,
              mimeType: 'image/png',
            };
          }

          const config: ImageJobConfig = {
            aspectRatio: params.aspectRatio,
            model: 'gemini-3-pro-image-preview',
            imageSize: params.imageSize as '1K' | '2K' | '4K' | undefined,
            style: styleRef,
            referenceImage: personReferenceImage ? `data:image/png;base64,${personReferenceImage.base64}` : undefined,
            source: 'playground',
          };

          const jobContext = `playground-image-${postId}`;
          pendingImageJobs.current.set(jobContext, postId);
          await queueImageJob(userId, params.prompt, config, jobContext);
          console.debug(`[PlaygroundView] Image job queued for post ${postId}`);
          return;
        }

        // Local generation fallback
        const profileToUse = params.useBrandProfile ? brandProfile : {
          name: brandProfile.name,
          description: '',
          logo: null,
          primaryColor: '',
          secondaryColor: '',
          tertiaryColor: '',
          toneOfVoice: brandProfile.toneOfVoice,
        } as BrandProfile;

        let personReferenceImage: { base64: string; mimeType: string } | undefined;
        if (params.referenceImages && params.referenceImages.length > 0) {
          personReferenceImage = {
            base64: params.referenceImages[0].base64,
            mimeType: 'image/png',
          };
        }

        const imageDataUrl = await generateImage(
          params.prompt,
          profileToUse,
          {
            aspectRatio: params.aspectRatio,
            model: 'gemini-3-pro-image-preview',
            imageSize: params.imageSize as '1K' | '2K' | '4K' | undefined,
            productImages: allProductImages.length > 0 ? allProductImages : undefined,
            styleReferenceImage: params.styleReference,
            personReferenceImage,
          }
        );
        updateFeedPost(postId, { imageUrl: imageDataUrl, status: PostStatus.SUCCESS });
      } else {
        // Video Generation
        if (!userId) {
          throw new Error('Usuário não autenticado. Faça login para gerar vídeos.');
        }

        const apiModel: ApiVideoModel = 'veo-3.1';
        let imageUrl: string | undefined;
        if (params.referenceImages && params.referenceImages.length > 0) {
          imageUrl = `data:image/png;base64,${params.referenceImages[0].base64}`;
        }

        const jobConfig: VideoJobConfig = {
          model: apiModel,
          aspectRatio,
          imageUrl,
        };

        const jobContext = `playground-video-${postId}`;
        pendingVideoJobs.current.set(jobContext, postId);
        await queueVideoJob(userId, params.prompt, jobConfig, jobContext);
        console.debug(`[PlaygroundView] Video job queued for post ${postId}`);
      }
    } catch (error) {
      console.error('Generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido.';
      updateFeedPost(postId, { status: PostStatus.ERROR, errorMessage });

      if (typeof errorMessage === 'string' && (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('permission denied') ||
        errorMessage.includes('Requested entity was not found')
      )) {
        setErrorToast('Chave de API inválida ou sem permissões. Verifique o faturamento no Google Cloud.');
      }
    }
  }, [brandProfile, updateFeedPost, userId]);

  // Handle adding an image to the prompt for editing
  const handleAddToPrompt = useCallback(async (imageUrl: string) => {
    try {
      // Fetch the image and convert to base64
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      const base64Data = base64.split(',')[1];

      setEditingImage({
        url: imageUrl,
        base64: base64Data,
        mimeType: blob.type || 'image/png',
      });
    } catch (error) {
      console.error('Failed to load image for editing:', error);
      setErrorToast('Falha ao carregar imagem para edição');
    }
  }, []);

  const handleGenerate = useCallback(async (params: GenerateVideoParams) => {
    const newPostId = Date.now().toString();
    const refImage = params.referenceImages?.[0]?.base64;
    const isImage = params.mediaType === MediaType.IMAGE;

    // Determine model tag based on media type and generation mode
    let modelTag: string;
    if (isImage) {
      modelTag = 'Gemini';
    } else {
      modelTag = params.mode === GenerationMode.REFERENCES_TO_VIDEO ? 'Veo' : 'Veo Fast';
    }

    // Create new post object with GENERATING status
    const newPost: FeedPost = {
      id: newPostId,
      mediaType: params.mediaType,
      username: brandProfile.name || 'voce',
      avatarUrl: brandProfile.logo || 'https://api.dicebear.com/7.x/avataaars/svg?seed=voce',
      description: params.prompt,
      modelTag,
      status: PostStatus.GENERATING,
      aspectRatio: params.aspectRatio,
      referenceImageBase64: refImage,
    };

    // Prepend to feed immediately
    setFeed(prev => [newPost, ...prev]);

    // Start generation in background
    processGeneration(newPostId, params);
  }, [brandProfile, processGeneration]);

  const handleApiKeyDialogContinue = () => {
    setShowApiKeyDialog(false);
  };

  return (
    <div className="h-full w-full bg-[#000000] text-white flex flex-col font-sans selection:bg-white/20 selection:text-white">
      {showApiKeyDialog && (
        <ApiKeyDialog onContinue={handleApiKeyDialogContinue} />
      )}

      {/* Error Toast */}
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 24, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] bg-[#000000]/95 border border-white/10 text-white px-5 py-3 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-2xl max-w-md text-center text-sm font-medium flex items-center gap-3"
          >
            <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse"></div>
            {errorToast}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 relative overflow-y-auto overflow-x-hidden no-scrollbar bg-[#000000]">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 w-full px-6 py-4 pointer-events-none">
          <div className="absolute inset-0 bg-[#000000]/80 backdrop-blur-2xl border-b border-white/10" style={{ maskImage: 'linear-gradient(to bottom, black, transparent)' }} />

          <div className="relative flex items-center justify-between text-white pointer-events-auto max-w-[1600px] mx-auto w-full">
            <h1 className="text-3xl font-semibold text-white tracking-tight">Playground</h1>

            {/* Media Type Toggle */}
            <div className="flex items-center bg-black/40 rounded-full p-1 border border-white/10 backdrop-blur-2xl">
              <button
                onClick={() => setMediaType(MediaType.VIDEO)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                  mediaType === MediaType.VIDEO
                    ? 'bg-primary/20 border border-primary/40 text-primary'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                Video
              </button>
              <button
                onClick={() => setMediaType(MediaType.IMAGE)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                  mediaType === MediaType.IMAGE
                    ? 'bg-primary/20 border border-primary/40 text-primary'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Imagem
              </button>
            </div>
          </div>
        </header>

        {/* Video Grid */}
        <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 pt-2 md:pt-3 pb-48 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            <AnimatePresence initial={false}>
              {feed.map((post) => (
                <VideoCard key={post.id} post={post} onAddToPrompt={handleAddToPrompt} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <BottomPromptBar
        onGenerate={handleGenerate}
        editingImage={editingImage}
        onClearEditingImage={handleClearEditingImage}
        setFeed={setFeed}
        setErrorToast={setErrorToast}
        brandProfile={brandProfile}
        mediaType={mediaType}
        setMediaType={setMediaType}
      />
    </div>
  );
};

export default PlaygroundView;
