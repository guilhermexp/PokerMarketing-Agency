
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { BrandProfileSetup } from './components/BrandProfileSetup';
import { Dashboard } from './components/Dashboard';
import { Loader } from './components/common/Loader';
import { generateCampaign, editImage, generateLogo, generateImage } from './services/geminiService';
import { runAssistantConversationStream } from './services/assistantService';
import { publishToInstagram, uploadImageForInstagram, type InstagramContentType } from './services/rubeService';
import type { BrandProfile, MarketingCampaign, ContentInput, ChatMessage, Theme, TournamentEvent, GalleryImage, ChatReferenceImage, ChatPart, GenerationOptions, WeekScheduleInfo, StyleReference, ScheduledPost, InstagramPublishState } from './types';
import { Icon } from './components/common/Icon';
import { AuthWrapper, UserProfileButton, useAuth, useCurrentUser } from './components/auth/AuthWrapper';
import {
  getBrandProfile,
  createBrandProfile,
  updateBrandProfile,
  getGalleryImages,
  createGalleryImage,
  getScheduledPosts,
  createScheduledPost,
  updateScheduledPost as updateScheduledPostApi,
  deleteScheduledPost as deleteScheduledPostApi,
  getCampaigns,
  getCampaignById,
  createCampaign as createCampaignApi,
  getTournamentData,
  createWeekSchedule,
  deleteWeekSchedule,
  schedulePostWithQStash,
  type DbCampaign,
  type DbWeekSchedule,
} from './services/apiClient';
import type { CampaignSummary } from './types';

export type TimePeriod = 'ALL' | 'MORNING' | 'AFTERNOON' | 'NIGHT' | 'HIGHLIGHTS';
export type ViewType = 'campaign' | 'campaigns' | 'flyer' | 'gallery' | 'calendar';

const MAX_GALLERY_SIZE = 12; 
const MAX_CHAT_HISTORY_MESSAGES = 10;

const excelTimeToStr = (val: any): string => {
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  return String(val || '');
};

const resizeImageForChat = (dataUrl: string, maxWidth: number, maxHeight: number): Promise<{ base64: string; mimeType: 'image/jpeg' }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > height) {
        if (width > maxWidth) { height = Math.round(height * (maxWidth / width)); width = maxWidth; }
      } else {
        if (height > maxHeight) { width = Math.round(width * (maxHeight / height)); height = maxHeight; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context error'));
      ctx.drawImage(img, 0, 0, width, height);
      const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.6); 
      resolve({ base64: resizedDataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
};

const getTruncatedHistory = (history: ChatMessage[], maxLength: number = MAX_CHAT_HISTORY_MESSAGES): ChatMessage[] => {
    const truncated = history.length <= maxLength ? [...history] : history.slice(-maxLength);
    return truncated.map((msg, index) => {
        if (index < truncated.length - 2) {
            return {
                ...msg,
                parts: msg.parts.map(part => part.inlineData ? { text: "[Imagem de referência anterior]" } : part)
            };
        }
        return msg;
    });
};

function AppContent() {
  const { userId, isLoading: authLoading } = useAuth();
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [activeView, setActiveView] = useState<ViewType>('campaign');

  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [chatReferenceImage, setChatReferenceImage] = useState<ChatReferenceImage | null>(null);
  const [toolImageReference, setToolImageReference] = useState<ChatReferenceImage | null>(null);
  const [lastUploadedImage, setLastUploadedImage] = useState<ChatReferenceImage | null>(null);

  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [tournamentEvents, setTournamentEvents] = useState<TournamentEvent[]>([]);
  const [weekScheduleInfo, setWeekScheduleInfo] = useState<WeekScheduleInfo | null>(null);
  const [currentScheduleId, setCurrentScheduleId] = useState<string | null>(null);
  const [isWeekExpired, setIsWeekExpired] = useState(false);
  const [flyerState, setFlyerState] = useState<Record<string, (GalleryImage | 'loading')[]>>({});
  const [dailyFlyerState, setDailyFlyerState] = useState<Record<TimePeriod, (GalleryImage | 'loading')[]>>({
    ALL: [], MORNING: [], AFTERNOON: [], NIGHT: [], HIGHLIGHTS: []
  });

  const [theme, setTheme] = useState<Theme>('dark');
  const [styleReferences, setStyleReferences] = useState<StyleReference[]>([]);
  const [selectedStyleReference, setSelectedStyleReference] = useState<StyleReference | null>(null);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [publishingStates, setPublishingStates] = useState<Record<string, InstagramPublishState>>({});
  const [campaignsList, setCampaignsList] = useState<CampaignSummary[]>([]);

  // Load data from database when user is authenticated
  useEffect(() => {
    const initAppData = async () => {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      try {
        // Load brand profile from database
        const dbBrandProfile = await getBrandProfile(userId);
        if (dbBrandProfile) {
          setBrandProfile({
            name: dbBrandProfile.name,
            description: dbBrandProfile.description || '',
            logo: dbBrandProfile.logo_url || null,
            primaryColor: dbBrandProfile.primary_color,
            secondaryColor: dbBrandProfile.secondary_color,
            toneOfVoice: dbBrandProfile.tone_of_voice as BrandProfile['toneOfVoice'],
          });
        }

        // Load style references from localStorage (will migrate later)
        const savedRefs = localStorage.getItem('styleReferences');
        if (savedRefs) setStyleReferences(JSON.parse(savedRefs));

        // Load gallery images from database
        const dbImages = await getGalleryImages(userId);
        const mappedImages: GalleryImage[] = dbImages.map(img => ({
          id: img.id,
          src: img.src_url,
          prompt: img.prompt || undefined,
          source: img.source as GalleryImage['source'],
          model: img.model as GalleryImage['model'],
        }));
        setGalleryImages(mappedImages);

        // Load scheduled posts from database
        const dbScheduled = await getScheduledPosts(userId);
        const mappedPosts: ScheduledPost[] = dbScheduled.map(post => ({
          id: post.id,
          type: post.content_type as ScheduledPost['type'],
          contentId: post.content_id || '',
          imageUrl: post.image_url,
          caption: post.caption,
          hashtags: post.hashtags || [],
          scheduledDate: post.scheduled_date,
          scheduledTime: post.scheduled_time,
          scheduledTimestamp: new Date(post.scheduled_timestamp).getTime(),
          timezone: post.timezone,
          platforms: post.platforms as ScheduledPost['platforms'],
          instagramContentType: post.instagram_content_type as ScheduledPost['instagramContentType'],
          status: post.status as ScheduledPost['status'],
          publishedAt: post.published_at ? new Date(post.published_at).getTime() : undefined,
          errorMessage: post.error_message || undefined,
          createdAt: new Date(post.created_at).getTime(),
          updatedAt: new Date(post.updated_at || post.created_at).getTime(),
          createdFrom: (post.created_from || 'gallery') as ScheduledPost['createdFrom'],
        }));
        setScheduledPosts(mappedPosts.sort((a, b) => a.scheduledTimestamp - b.scheduledTimestamp));

        // Load campaigns list from database
        const dbCampaigns = await getCampaigns(userId);
        const mappedCampaigns: CampaignSummary[] = dbCampaigns.map((c: DbCampaign) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          createdAt: c.created_at,
        }));
        setCampaignsList(mappedCampaigns);

        // Load tournament data from database
        try {
          const tournamentData = await getTournamentData(userId);
          if (tournamentData.schedule) {
            const schedule = tournamentData.schedule;
            setCurrentScheduleId(schedule.id);

            // Check if week is expired
            const endDate = new Date(schedule.end_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            if (today > endDate) {
              setIsWeekExpired(true);
              console.log('[Tournaments] Week schedule expired');
            } else {
              setIsWeekExpired(false);

              // Load events
              const mappedEvents: TournamentEvent[] = tournamentData.events.map(e => ({
                id: e.id,
                day: e.day_of_week,
                name: e.name,
                game: e.game || '',
                gtd: e.gtd || '',
                buyIn: e.buy_in || '',
                rebuy: e.rebuy || '',
                addOn: e.add_on || '',
                stack: e.stack || '',
                players: e.players || '',
                lateReg: e.late_reg || '',
                minutes: e.minutes || '',
                structure: e.structure || '',
                times: e.times || {},
              }));
              setTournamentEvents(mappedEvents);

              // Set week schedule info
              const startParts = schedule.start_date.split('-');
              const endParts = schedule.end_date.split('-');
              setWeekScheduleInfo({
                startDate: `${startParts[2]}/${startParts[1]}`,
                endDate: `${endParts[2]}/${endParts[1]}`,
                filename: schedule.filename || 'Planilha carregada',
              });

              console.log(`[Tournaments] Loaded ${mappedEvents.length} events for week ${schedule.start_date} to ${schedule.end_date}`);
            }
          }
        } catch (tournamentError) {
          console.error('[Tournaments] Failed to load tournament data:', tournamentError);
        }
      } catch (e) {
        console.error('Failed to load data from database:', e);
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading) {
      initAppData();
    }
  }, [userId, authLoading]);
  
  useEffect(() => {
    if (brandProfile && chatHistory.length === 0) {
      setChatHistory([{
        role: 'model',
        parts: [{ text: `Sistema Online. Olá Diretor! Sou o seu Agente Criativo de Elite. O que vamos forjar hoje?` }]
      }]);
    }
  }, [brandProfile]);

  const handleAddImageToGallery = (image: Omit<GalleryImage, 'id'>): GalleryImage => {
    // Create image with temporary ID immediately for UI responsiveness
    const tempId = Date.now().toString();
    const newImage: GalleryImage = { ...image, id: tempId };

    // Update state immediately
    setGalleryImages(prev => [newImage, ...prev].slice(0, MAX_GALLERY_SIZE));

    // Save to database in background (don't block UI)
    if (userId) {
      createGalleryImage(userId, {
        src_url: image.src,
        prompt: image.prompt,
        source: image.source,
        model: image.model,
      }).then(dbImage => {
        // Update the ID with the real database ID
        setGalleryImages(prev => prev.map(img =>
          img.id === tempId
            ? { ...img, id: dbImage.id }
            : img
        ));
      }).catch(e => {
        console.error('Failed to save image to database:', e);
      });
    }

    return newImage;
  };

  const handleUpdateGalleryImage = (imageId: string, newImageSrc: string) => {
    setGalleryImages(prev => {
      const updatedGallery = prev.map(img => img.id === imageId ? { ...img, src: newImageSrc } : img);
      return updatedGallery;
    });
    if (toolImageReference?.id === imageId) setToolImageReference({ id: imageId, src: newImageSrc });
    // TODO: Add API call to update image in database when endpoint is available
  };

  const handleAddStyleReference = (ref: Omit<StyleReference, 'id' | 'createdAt'>) => {
    const newRef: StyleReference = { ...ref, id: Date.now().toString(), createdAt: Date.now() };
    setStyleReferences(prev => {
      const updated = [newRef, ...prev];
      try {
        localStorage.setItem('styleReferences', JSON.stringify(updated));
      } catch (e) {
        console.warn('Não foi possível salvar no localStorage (limite excedido)');
      }
      return updated;
    });
  };

  const handleRemoveStyleReference = (id: string) => {
    setStyleReferences(prev => {
      const updated = prev.filter(r => r.id !== id);
      try {
        localStorage.setItem('styleReferences', JSON.stringify(updated));
      } catch (e) {
        console.warn('Não foi possível salvar no localStorage');
      }
      return updated;
    });
    if (selectedStyleReference?.id === id) setSelectedStyleReference(null);
  };

  const handleSelectStyleReference = (ref: StyleReference) => {
    setSelectedStyleReference(ref);
    setActiveView('flyer');
  };

  // Scheduled Posts Handlers
  const handleSchedulePost = async (post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!userId) {
      console.error('Cannot schedule post without userId');
      return;
    }

    try {
      // 1. Create post in database
      const dbPost = await createScheduledPost(userId, {
        content_type: post.type,
        content_id: post.contentId,
        image_url: post.imageUrl,
        caption: post.caption,
        hashtags: post.hashtags,
        scheduled_date: post.scheduledDate,
        scheduled_time: post.scheduledTime,
        scheduled_timestamp: new Date(post.scheduledTimestamp).toISOString(),
        timezone: post.timezone,
        platforms: post.platforms,
        instagram_content_type: post.instagramContentType,
        created_from: post.createdFrom,
      });

      // 2. Schedule with QStash for automatic publication
      try {
        const qstashResult = await schedulePostWithQStash(
          dbPost.id,
          userId,
          post.scheduledTimestamp
        );
        console.log(`[QStash] Post ${dbPost.id} scheduled for ${qstashResult.scheduledFor}`);
      } catch (qstashError) {
        console.warn('[QStash] Failed to schedule, will rely on manual publish:', qstashError);
        // Don't fail the whole operation - post is saved, just won't auto-publish
      }

      const newPost: ScheduledPost = {
        id: dbPost.id,
        type: dbPost.content_type as ScheduledPost['type'],
        contentId: dbPost.content_id || '',
        imageUrl: dbPost.image_url,
        caption: dbPost.caption,
        hashtags: dbPost.hashtags || [],
        scheduledDate: dbPost.scheduled_date,
        scheduledTime: dbPost.scheduled_time,
        scheduledTimestamp: new Date(dbPost.scheduled_timestamp).getTime(),
        timezone: dbPost.timezone,
        platforms: dbPost.platforms as ScheduledPost['platforms'],
        instagramContentType: dbPost.instagram_content_type as ScheduledPost['instagramContentType'],
        status: dbPost.status as ScheduledPost['status'],
        createdAt: new Date(dbPost.created_at).getTime(),
        updatedAt: Date.now(),
        createdFrom: (dbPost.created_from || 'gallery') as ScheduledPost['createdFrom'],
      };

      setScheduledPosts(prev => [...prev, newPost].sort((a, b) => a.scheduledTimestamp - b.scheduledTimestamp));
    } catch (e) {
      console.error('Failed to schedule post:', e);
    }
  };

  const handleUpdateScheduledPost = async (postId: string, updates: Partial<ScheduledPost>) => {
    try {
      // Map frontend field names to database field names
      const dbUpdates: Record<string, unknown> = {};
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.publishedAt !== undefined) dbUpdates.published_at = new Date(updates.publishedAt).toISOString();
      if (updates.errorMessage !== undefined) dbUpdates.error_message = updates.errorMessage;
      if (updates.instagramMediaId !== undefined) dbUpdates.instagram_media_id = updates.instagramMediaId;
      if (updates.publishAttempts !== undefined) dbUpdates.publish_attempts = updates.publishAttempts;
      if (updates.lastPublishAttempt !== undefined) dbUpdates.last_publish_attempt = new Date(updates.lastPublishAttempt).toISOString();

      await updateScheduledPostApi(postId, dbUpdates);
      setScheduledPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updates } : p));
    } catch (e) {
      console.error('Failed to update scheduled post:', e);
    }
  };

  const handleDeleteScheduledPost = async (postId: string) => {
    try {
      await deleteScheduledPostApi(postId);
      setScheduledPosts(prev => prev.filter(p => p.id !== postId));
    } catch (e) {
      console.error('Failed to delete scheduled post:', e);
    }
  };

  const handlePublishToInstagram = async (post: ScheduledPost) => {
    const postId = post.id;

    // Initialize publishing state
    setPublishingStates(prev => ({
      ...prev,
      [postId]: { step: 'uploading_image', message: 'Preparando imagem...', progress: 10 }
    }));

    try {
      // Update post status to publishing
      await handleUpdateScheduledPost(postId, { status: 'publishing' });

      // Step 1: Upload image to get HTTP URL (Instagram requires HTTP URLs, not data URLs)
      setPublishingStates(prev => ({
        ...prev,
        [postId]: { step: 'uploading_image', message: 'Fazendo upload da imagem...', progress: 15 }
      }));

      const imageUrl = await uploadImageForInstagram(post.imageUrl);

      // Step 2: Prepare caption with hashtags
      const fullCaption = `${post.caption}\n\n${post.hashtags.join(' ')}`;

      // Step 3: Determine content type (default to photo)
      const contentType: InstagramContentType = post.instagramContentType || 'photo';

      // Step 4: Publish to Instagram with progress tracking
      const result = await publishToInstagram(imageUrl, fullCaption, contentType, (progress) => {
        setPublishingStates(prev => ({
          ...prev,
          [postId]: progress
        }));
      });

      if (result.success) {
        await handleUpdateScheduledPost(postId, {
          status: 'published',
          publishedAt: Date.now(),
          instagramMediaId: result.mediaId
        });

        setPublishingStates(prev => ({
          ...prev,
          [postId]: { step: 'completed', message: 'Publicado!', progress: 100, postId: result.mediaId }
        }));

        // Clear state after 3 seconds
        setTimeout(() => {
          setPublishingStates(prev => {
            const { [postId]: _, ...rest } = prev;
            return rest;
          });
        }, 3000);
      } else {
        throw new Error(result.errorMessage || 'Falha na publicacao');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      await handleUpdateScheduledPost(postId, {
        status: 'failed',
        errorMessage,
        publishAttempts: (post.publishAttempts || 0) + 1,
        lastPublishAttempt: Date.now()
      });

      setPublishingStates(prev => ({
        ...prev,
        [postId]: { step: 'failed', message: errorMessage, progress: 0 }
      }));
    }
  };

  const handleGenerateCampaign = async (input: ContentInput, options: GenerationOptions) => {
      setIsGenerating(true);
      setError(null);
      setActiveView('campaign');
      try {
          const r = await generateCampaign(brandProfile!, input, options);

          // Save campaign to database if authenticated
          if (userId) {
            try {
              // Generate a name from the transcript (first 50 chars)
              const campaignName = input.transcript
                ? input.transcript.substring(0, 50) + (input.transcript.length > 50 ? '...' : '')
                : `Campanha ${new Date().toLocaleDateString('pt-BR')}`;

              const savedCampaign = await createCampaignApi(userId, {
                name: campaignName,
                input_transcript: input.transcript,
                generation_options: options as unknown as Record<string, unknown>,
                status: 'completed',
                video_clip_scripts: r.videoClipScripts.map(v => ({
                  title: v.title,
                  hook: v.hook,
                  image_prompt: v.image_prompt,
                  audio_script: v.audio_script,
                  scenes: v.scenes,
                })),
                posts: r.posts.map(p => ({
                  platform: p.platform,
                  content: p.content,
                  hashtags: p.hashtags,
                  image_prompt: p.image_prompt,
                })),
                ad_creatives: r.adCreatives.map(a => ({
                  platform: a.platform,
                  headline: a.headline,
                  body: a.body,
                  cta: a.cta,
                  image_prompt: a.image_prompt,
                })),
              });

              // Update campaign with database ID
              r.id = savedCampaign.id;
              r.name = campaignName;
              r.inputTranscript = input.transcript;
              r.createdAt = savedCampaign.created_at;

              // Update campaigns list
              setCampaignsList(prev => [{
                id: savedCampaign.id,
                name: campaignName,
                status: 'completed',
                createdAt: savedCampaign.created_at,
              }, ...prev]);

              console.log('[Campaign] Saved to database:', savedCampaign.id);
            } catch (saveError) {
              console.error('[Campaign] Failed to save to database:', saveError);
              // Continue even if save fails - campaign is still in memory
            }
          }

          setCampaign(r);
      } catch (e: any) {
          setError(e.message);
      } finally {
          setIsGenerating(false);
      }
  };

  const handleLoadCampaign = async (campaignId: string) => {
    if (!userId) {
      console.error('Cannot load campaign: user not authenticated');
      return;
    }
    try {
      const fullCampaign = await getCampaignById(campaignId, userId);
      if (fullCampaign) {
        const loadedCampaign: MarketingCampaign = {
          id: fullCampaign.id,
          name: fullCampaign.name || undefined,
          inputTranscript: fullCampaign.input_transcript || undefined,
          createdAt: fullCampaign.created_at,
          updatedAt: fullCampaign.updated_at,
          videoClipScripts: (fullCampaign.video_clip_scripts || []).map(v => ({
            title: v.title,
            hook: v.hook,
            image_prompt: v.image_prompt || '',
            audio_script: v.audio_script || '',
            scenes: v.scenes || [],
          })),
          posts: (fullCampaign.posts || []).map(p => ({
            platform: p.platform as 'Instagram' | 'LinkedIn' | 'Twitter' | 'Facebook',
            content: p.content,
            hashtags: p.hashtags || [],
            image_prompt: p.image_prompt || '',
          })),
          adCreatives: (fullCampaign.ad_creatives || []).map(a => ({
            platform: a.platform as 'Facebook' | 'Google',
            headline: a.headline,
            body: a.body,
            cta: a.cta,
            image_prompt: a.image_prompt || '',
          })),
        };
        setCampaign(loadedCampaign);
        setActiveView('campaign');
      }
    } catch (error) {
      console.error('Failed to load campaign:', error);
      setError('Falha ao carregar campanha');
    }
  };

  const handlePublishFlyerToCampaign = (text: string, flyer: GalleryImage) => {
      const input: ContentInput = {
          transcript: text,
          productImages: [{
              base64: flyer.src.split(',')[1],
              mimeType: flyer.src.match(/:(.*?);/)?.[1] || 'image/png'
          }],
          inspirationImages: null
      };
      const options: GenerationOptions = {
          videoClipScripts: { generate: true, count: 1 },
          posts: { instagram: { generate: true, count: 1 }, facebook: { generate: true, count: 1 }, twitter: { generate: true, count: 1 }, linkedin: { generate: false, count: 0 } },
          adCreatives: { facebook: { generate: true, count: 1 }, google: { generate: false, count: 0 } }
      };
      setCampaign(null);
      handleGenerateCampaign(input, options);
  };

  const executeTool = async (toolCall: any): Promise<any> => {
      const { name, args } = toolCall;
      if (name === 'create_image') {
          try {
              const productImages = lastUploadedImage ? [{ base64: lastUploadedImage.src.split(',')[1], mimeType: lastUploadedImage.src.match(/:(.*?);/)?.[1] || 'image/png' }] : undefined;
              const imageUrl = await generateImage(args.description, brandProfile!, { aspectRatio: args.aspect_ratio || '1:1', model: 'gemini-3-pro-image-preview', productImages });
              const newImg = handleAddImageToGallery({ src: imageUrl, prompt: args.description, source: 'Edição', model: 'gemini-3-pro-image-preview' });
              setToolImageReference({ id: newImg.id, src: newImg.src });
              return { success: true, image_data: imageUrl, message: "Asset visual forjado com sucesso." };
          } catch (e: any) { return { error: e.message }; }
      }
      if (name === 'edit_referenced_image') {
        if (!toolImageReference) return { error: "Nenhuma imagem em foco." };
        try {
          const [h, b64] = toolImageReference.src.split(',');
          const m = h.match(/:(.*?);/)?.[1] || 'image/png';
          const newUrl = await editImage(b64, m, args.prompt);
          handleUpdateGalleryImage(toolImageReference.id, newUrl);
          return { success: true, image_data: newUrl, message: "Ajuste aplicado." };
        } catch (e: any) { return { error: e.message }; }
      }
      if (name === 'add_collab_logo_to_image') {
        if (!toolImageReference) return { error: "Nenhuma imagem de arte em foco para adicionar o logo." };
        if (!lastUploadedImage) return { error: "Nenhum logo foi enviado no chat. Peça ao usuário para anexar o logo." };
        try {
          const [h, b64] = toolImageReference.src.split(',');
          const m = h.match(/:(.*?);/)?.[1] || 'image/png';
          const editPrompt = `Adicione um logotipo de parceiro na imagem. ${args.style_instruction || 'Posicione no canto inferior direito de forma harmoniosa.'}`;
          const newUrl = await editImage(b64, m, editPrompt);
          handleUpdateGalleryImage(toolImageReference.id, newUrl);
          return { success: true, image_data: newUrl, message: "Logo de parceria adicionado com sucesso." };
        } catch (e: any) { return { error: e.message }; }
      }
      if (name === 'create_brand_logo') {
        try {
          const logoUrl = await generateLogo(args.prompt);
          const newImg = handleAddImageToGallery({ src: logoUrl, prompt: args.prompt, source: 'Logo', model: 'imagen-3.0-generate-002' });
          setToolImageReference({ id: newImg.id, src: newImg.src });
          return { success: true, image_data: logoUrl, message: "Logo criado com sucesso." };
        } catch (e: any) { return { error: e.message }; }
      }
      return { error: `Comando não reconhecido: ${name}` };
  };

  const handleAssistantSendMessage = async (message: string, image: ChatReferenceImage | null) => {
      setIsAssistantLoading(true);
      const userMessageParts: ChatPart[] = [];
      if (image) {
        setLastUploadedImage(image);
        if (!image.id.startsWith('local-')) setToolImageReference(image);
        const { base64, mimeType } = await resizeImageForChat(image.src, 384, 384);
        userMessageParts.push({ inlineData: { data: base64, mimeType } });
      }
      if (message.trim()) userMessageParts.push({ text: message });
      const userMessage: ChatMessage = { role: 'user', parts: userMessageParts };
      setChatReferenceImage(null);
      const history = [...chatHistory, userMessage];
      setChatHistory(history);
      try {
          setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);
          const streamResponse = await runAssistantConversationStream(getTruncatedHistory(history), brandProfile);
          let accumulatedText = '';
          let functionCall: any;
          for await (const chunk of streamResponse) {
              if (chunk.text) {
                  accumulatedText += chunk.text;
                  setChatHistory(prev => {
                      const next = [...prev];
                      if (next[next.length - 1].role === 'model') next[next.length - 1] = { ...next[next.length - 1], parts: [{ text: accumulatedText }] };
                      return next;
                  });
              }
              const fc = chunk.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
              if (fc) functionCall = fc;
          }
          if (functionCall) {
              const modelMsg: ChatMessage = { role: 'model', parts: [{ functionCall }] };
              setChatHistory(prev => { const next = [...prev]; next[next.length - 1] = modelMsg; return next; });
              const result = await executeTool(functionCall);
              const toolMsg: ChatMessage = { role: 'user', parts: [{ functionResponse: { name: functionCall.name, response: result } }] };
              setChatHistory(prev => [...prev, toolMsg]);
              if (result.image_data) {
                  const [header, base64] = result.image_data.split(',');
                  setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: "Gerei uma prévia:", inlineData: { data: base64, mimeType: header.match(/:(.*?);/)?.[1] || 'image/png' } }] }]);
              }
              setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);
              const finalStream = await runAssistantConversationStream(getTruncatedHistory([...history, modelMsg, toolMsg]), brandProfile);
              let finalAcc = '';
              for await (const chunk of finalStream) {
                   if (chunk.text) {
                      finalAcc += chunk.text;
                      setChatHistory(prev => {
                          const next = [...prev];
                          if (next[next.length - 1].role === 'model') next[next.length - 1] = { ...next[next.length - 1], parts: [{ text: finalAcc }] };
                          return next;
                      });
                  }
              }
          } 
      } catch (err: any) {
           setChatHistory(prev => {
              const next = [...prev];
              if (next[next.length - 1].role === 'model') next[next.length - 1] = { ...next[next.length - 1], parts: [{ text: `Erro: ${err.message}` }] };
              return next;
           });
      } finally { setIsAssistantLoading(false); }
  };

  const parseWeekFromFilename = (filename: string): WeekScheduleInfo | null => {
    // Padrão: "PPST 16 18 al 21 18" ou "PPST_16_18_al_21_18"
    const match = filename.match(/(\d{1,2})[\s_](\d{1,2})[\s_]al[\s_](\d{1,2})[\s_](\d{1,2})/i);
    if (match) {
      const [, startDay, startMonth, endDay, endMonth] = match;
      return {
        startDate: `${startDay.padStart(2, '0')}/${startMonth.padStart(2, '0')}`,
        endDate: `${endDay.padStart(2, '0')}/${endMonth.padStart(2, '0')}`,
        filename
      };
    }
    return null;
  };

  const handleTournamentFileUpload = (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          const events: TournamentEvent[] = [];
          let currentDay = "";
          const dayMap: any = { 'MONDAY': 'MONDAY', 'SEGUNDA': 'MONDAY', 'TUESDAY': 'TUESDAY', 'TERÇA': 'TUESDAY', 'WEDNESDAY': 'WEDNESDAY', 'QUARTA': 'WEDNESDAY', 'THURSDAY': 'THURSDAY', 'QUINTA': 'THURSDAY', 'FRIDAY': 'FRIDAY', 'SEXTA': 'FRIDAY', 'SATURDAY': 'SATURDAY', 'SÁBADO': 'SATURDAY', 'SUNDAY': 'SUNDAY', 'DOMINGO': 'SUNDAY' };
          json.forEach((row, i) => {
            const raw = String(row[1] || '').trim().toUpperCase();
            if (dayMap[raw]) currentDay = dayMap[raw];
            else if (row[9] && i > 2 && row[9] !== "NAME" && currentDay) {
              events.push({
                id: `${currentDay}-${i}`, day: currentDay, name: String(row[9]), game: String(row[10]), gtd: String(row[8]), buyIn: String(row[11]), rebuy: String(row[12]), addOn: String(row[13]), stack: String(row[15]), players: String(row[16]), lateReg: String(row[17]), minutes: String(row[18]), structure: String(row[19]), times: { '-3': excelTimeToStr(row[2]) }
              });
            }
          });
          setTournamentEvents(events);

          // Extrair info da semana do nome do arquivo ou da aba
          const weekInfo = parseWeekFromFilename(file.name) || parseWeekFromFilename(wb.SheetNames[0]);
          if (weekInfo) setWeekScheduleInfo(weekInfo);

          // Save to database if authenticated
          if (userId && weekInfo) {
            try {
              // Delete existing schedule if any
              if (currentScheduleId) {
                await deleteWeekSchedule(userId, currentScheduleId);
              }

              // Parse dates for database (convert DD/MM to YYYY-MM-DD)
              const year = new Date().getFullYear();
              const [startDay, startMonth] = weekInfo.startDate.split('/');
              const [endDay, endMonth] = weekInfo.endDate.split('/');

              // Handle year rollover (if end month < start month, end is next year)
              let endYear = year;
              if (parseInt(endMonth) < parseInt(startMonth)) {
                endYear = year + 1;
              }

              const startDateISO = `${year}-${startMonth.padStart(2, '0')}-${startDay.padStart(2, '0')}`;
              const endDateISO = `${endYear}-${endMonth.padStart(2, '0')}-${endDay.padStart(2, '0')}`;

              const result = await createWeekSchedule(userId, {
                start_date: startDateISO,
                end_date: endDateISO,
                filename: file.name,
                events: events.map(ev => ({
                  day: ev.day,
                  name: ev.name,
                  game: ev.game,
                  gtd: ev.gtd,
                  buyIn: ev.buyIn,
                  rebuy: ev.rebuy,
                  addOn: ev.addOn,
                  stack: ev.stack,
                  players: ev.players,
                  lateReg: ev.lateReg,
                  minutes: ev.minutes,
                  structure: ev.structure,
                  times: ev.times,
                })),
              });

              setCurrentScheduleId(result.schedule.id);
              setIsWeekExpired(false);
              console.log(`[Tournaments] Saved ${result.eventsCount} events to database`);
            } catch (dbErr) {
              console.error('[Tournaments] Failed to save to database:', dbErr);
              // Continue anyway - data is still in local state
            }
          }

          resolve();
        } catch (err) { reject(err); }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader className="h-16 w-16" /></div>;

  return (
    <>
      {error && (
        <div className="fixed bottom-6 right-6 bg-surface border border-red-500/50 rounded-xl z-[100] max-w-sm p-4 flex items-start space-x-4 animate-fade-in-up">
            <Icon name="x" className="w-4 h-4 text-red-400" />
            <div className="flex-1"><p className="font-bold text-sm">Erro</p><p className="text-sm opacity-50">{error}</p></div>
        </div>
      )}
      {!brandProfile || isEditingProfile ? (
        <BrandProfileSetup onProfileSubmit={async (p) => {
          console.log('[BrandProfile] onProfileSubmit called, userId:', userId);
          setBrandProfile(p);
          setIsEditingProfile(false);
          // Save to database if authenticated
          if (userId) {
            console.log('[BrandProfile] Saving to database with userId:', userId);
            try {
              const existingProfile = await getBrandProfile(userId);
              console.log('[BrandProfile] Existing profile:', existingProfile);
              if (existingProfile) {
                await updateBrandProfile(existingProfile.id, {
                  name: p.name,
                  description: p.description,
                  logo_url: p.logo || undefined,
                  primary_color: p.primaryColor,
                  secondary_color: p.secondaryColor,
                  tone_of_voice: p.toneOfVoice,
                });
              } else {
                console.log('[BrandProfile] Creating new profile...');
                const created = await createBrandProfile(userId, {
                  name: p.name,
                  description: p.description,
                  logo_url: p.logo || undefined,
                  primary_color: p.primaryColor,
                  secondary_color: p.secondaryColor,
                  tone_of_voice: p.toneOfVoice,
                });
                console.log('[BrandProfile] Created:', created);
              }
            } catch (e) {
              console.error('Failed to save brand profile:', e);
            }
          } else {
            console.log('[BrandProfile] userId is null/undefined, skipping save');
          }
        }} existingProfile={brandProfile} />
      ) : (
        <Dashboard
          brandProfile={brandProfile!}
          campaign={campaign}
          onGenerate={handleGenerateCampaign}
          isGenerating={isGenerating}
          onEditProfile={() => setIsEditingProfile(true)}
          onResetCampaign={() => setCampaign(null)}
          isAssistantOpen={isAssistantOpen}
          onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
          assistantHistory={chatHistory}
          isAssistantLoading={isAssistantLoading}
          onAssistantSendMessage={handleAssistantSendMessage}
          chatReferenceImage={chatReferenceImage}
          onSetChatReference={(img) => { setChatReferenceImage(img ? { id: img.id, src: img.src } : null); if (img && !isAssistantOpen) setIsAssistantOpen(true); }}
          theme={theme}
          onThemeToggle={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          galleryImages={galleryImages}
          onAddImageToGallery={handleAddImageToGallery}
          onUpdateGalleryImage={handleUpdateGalleryImage}
          tournamentEvents={tournamentEvents}
          weekScheduleInfo={weekScheduleInfo}
          onTournamentFileUpload={handleTournamentFileUpload}
          onAddTournamentEvent={(ev) => setTournamentEvents(p => [ev, ...p])}
          flyerState={flyerState}
          setFlyerState={setFlyerState}
          dailyFlyerState={dailyFlyerState}
          setDailyFlyerState={setDailyFlyerState}
          activeView={activeView}
          onViewChange={setActiveView}
          onPublishToCampaign={handlePublishFlyerToCampaign}
          styleReferences={styleReferences}
          onAddStyleReference={handleAddStyleReference}
          onRemoveStyleReference={handleRemoveStyleReference}
          onSelectStyleReference={handleSelectStyleReference}
          selectedStyleReference={selectedStyleReference}
          onClearSelectedStyleReference={() => setSelectedStyleReference(null)}
          scheduledPosts={scheduledPosts}
          onSchedulePost={handleSchedulePost}
          onUpdateScheduledPost={handleUpdateScheduledPost}
          onDeleteScheduledPost={handleDeleteScheduledPost}
          onPublishToInstagram={handlePublishToInstagram}
          publishingStates={publishingStates}
          campaignsList={campaignsList}
          onLoadCampaign={handleLoadCampaign}
          userId={userId}
          isWeekExpired={isWeekExpired}
          onClearExpiredSchedule={async () => {
            if (userId && currentScheduleId) {
              try {
                await deleteWeekSchedule(userId, currentScheduleId);
                setCurrentScheduleId(null);
                setTournamentEvents([]);
                setWeekScheduleInfo(null);
                setIsWeekExpired(false);
              } catch (e) {
                console.error('[Tournaments] Failed to clear expired schedule:', e);
              }
            }
          }}
        />
      )}
    </>
  );
}

function App() {
  return (
    <AuthWrapper>
      <AppContent />
    </AuthWrapper>
  );
}

export default App;
