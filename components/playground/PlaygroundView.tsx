/**
 * PlaygroundView Component
 * Main view for video generation playground with TikTok-style feed
 */

import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { ApiKeyDialog } from './ApiKeyDialog';
import { BottomPromptBar } from './BottomPromptBar';
import { VideoCard } from './VideoCard';
import {
  FeedPost,
  GenerateVideoParams,
  PostStatus,
  GenerationMode,
  MediaType,
} from './types';
import { generateVideo, type ApiVideoModel } from '../../services/apiClient';
import { generateImage } from '../../services/geminiService';
import type { BrandProfile } from '../../types';

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
  },
  {
    id: 's4',
    videoUrl: 'https://storage.googleapis.com/sideprojects-asronline/veo-cameos/cameo-logan.mp4',
    mediaType: MediaType.VIDEO,
    username: 'OfficialLoganK',
    avatarUrl: 'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Jocelyn',
    description: 'Vibe coding no topo de uma montanha.',
    modelTag: 'Veo Fast',
    status: PostStatus.SUCCESS,
  },
  {
    id: 's5',
    videoUrl: 'https://storage.googleapis.com/sideprojects-asronline/veo-cameos/cameo-kat.mp4',
    mediaType: MediaType.VIDEO,
    username: 'kat_kampf',
    avatarUrl: 'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Jameson',
    description: 'Explorando um templo majestoso em uma floresta.',
    modelTag: 'Veo Fast',
    status: PostStatus.SUCCESS,
  },
  {
    id: 's6',
    videoUrl: 'https://storage.googleapis.com/sideprojects-asronline/veo-cameos/cameo-josh.mp4',
    mediaType: MediaType.VIDEO,
    username: 'joshwoodward',
    avatarUrl: 'https://api.dicebear.com/9.x/fun-emoji/svg?seed=Jade',
    description: 'No palco principal de um evento de tecnologia.',
    modelTag: 'Veo Fast',
    status: PostStatus.SUCCESS,
  },
];

interface PlaygroundViewProps {
  brandProfile: BrandProfile;
}

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({ brandProfile }) => {
  const [feed, setFeed] = useState<FeedPost[]>(sampleVideos);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Auto-dismiss error toast
  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  const updateFeedPost = (id: string, updates: Partial<FeedPost>) => {
    setFeed(prevFeed =>
      prevFeed.map(post =>
        post.id === id ? { ...post, ...updates } : post
      )
    );
  };

  const processGeneration = async (postId: string, params: GenerateVideoParams) => {
    try {
      const isImageGeneration = params.mediaType === MediaType.IMAGE;

      // Map aspect ratio
      const aspectRatio: "16:9" | "9:16" = params.aspectRatio === '16:9' ? '16:9' : '9:16';

      if (isImageGeneration) {
        // Generate image using Gemini Image Pro
        // Build productImages array with logo if brand profile is enabled + user-added assets
        const allProductImages: { base64: string; mimeType: string }[] = [];

        // Add brand logo if enabled
        if (params.useBrandProfile && brandProfile.logo) {
          const [header, base64Data] = brandProfile.logo.split(',');
          const mimeType = header?.match(/:(.*?);/)?.[1] || 'image/png';
          if (base64Data) {
            allProductImages.push({ base64: base64Data, mimeType });
          }
        }

        // Add user-uploaded product images/assets
        if (params.productImages && params.productImages.length > 0) {
          allProductImages.push(...params.productImages);
        }

        // Use full brandProfile when toggle is ON, minimal when OFF
        const profileToUse = params.useBrandProfile ? brandProfile : {
          name: brandProfile.name,
          description: '',
          logo: null,
          primaryColor: '',
          secondaryColor: '',
          tertiaryColor: '',
          toneOfVoice: brandProfile.toneOfVoice,
        } as typeof brandProfile;

        // Build person reference from cameo selection (same as video uses referenceImages)
        let personReferenceImage: { base64: string; mimeType: string } | undefined;
        if (params.referenceImages && params.referenceImages.length > 0) {
          const refImage = params.referenceImages[0];
          personReferenceImage = {
            base64: refImage.base64,
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
        // Generate video using existing API
        const apiModel: ApiVideoModel = 'veo-3.1';

        // Build image URL from reference image if available
        let imageUrl: string | undefined;
        if (params.referenceImages && params.referenceImages.length > 0) {
          const refImage = params.referenceImages[0];
          // Convert base64 to data URL format
          imageUrl = `data:image/png;base64,${refImage.base64}`;
        }

        const url = await generateVideo({
          prompt: params.prompt,
          aspectRatio,
          model: apiModel,
          imageUrl,
        });

        updateFeedPost(postId, { videoUrl: url, status: PostStatus.SUCCESS });
      }
    } catch (error) {
      console.error('Generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido.';
      updateFeedPost(postId, { status: PostStatus.ERROR, errorMessage: errorMessage });

      // Global error toast for specific API issues
      if (typeof errorMessage === 'string' && (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('permission denied') ||
        errorMessage.includes('Requested entity was not found')
      )) {
        setErrorToast('Chave de API invalida ou sem permissoes. Verifique o faturamento no Google Cloud.');
      }
    }
  };

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
      referenceImageBase64: refImage,
    };

    // Prepend to feed immediately
    setFeed(prev => [newPost, ...prev]);

    // Start generation in background
    processGeneration(newPostId, params);
  }, [brandProfile]);

  const handleApiKeyDialogContinue = () => {
    setShowApiKeyDialog(false);
  };

  return (
    <div className="h-full w-full bg-black text-white flex flex-col overflow-hidden font-sans selection:bg-white/20 selection:text-white">
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
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[60] bg-neutral-900/80 border border-white/10 text-white px-5 py-3 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl max-w-md text-center text-sm font-medium flex items-center gap-3"
          >
            <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse"></div>
            {errorToast}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 h-full relative overflow-y-auto overflow-x-hidden no-scrollbar bg-black">
        {/* Ambient background light */}
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,_rgba(255,255,255,0.03),_transparent_70%)]"></div>

        {/* Top Bar */}
        <header className="sticky top-0 z-30 w-full px-6 py-6 pointer-events-none">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-xl" style={{ maskImage: 'linear-gradient(to bottom, black, transparent)' }} />

          <div className="relative flex items-center text-white pointer-events-auto max-w-[1600px] mx-auto w-full">
            <div className="flex items-center gap-3.5">
              <Clapperboard className="w-8 h-8 text-white" />
              <h1 className="text-3xl text-white tracking-wide drop-shadow-sm font-bold">PLAYGROUND</h1>
            </div>
          </div>
        </header>

        {/* Video Grid */}
        <div className="w-full max-w-[1600px] mx-auto p-4 md:p-6 pb-48 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            <AnimatePresence initial={false}>
              {feed.map((post) => (
                <VideoCard key={post.id} post={post} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <BottomPromptBar onGenerate={handleGenerate} />
    </div>
  );
};

export default PlaygroundView;
