/**
 * Campaign Handlers Hook
 *
 * Manages all campaign-related operations:
 * - Generating new campaigns
 * - Creating carousels from prompts
 * - Loading existing campaigns
 * - Publishing flyers to campaigns
 * - Resetting campaign state
 * - Updating carousels
 */

import { useCallback } from "react";
import type {
  BrandProfile,
  MarketingCampaign,
  ContentInput,
  GenerationOptions,
  GalleryImage,
  CarouselScript,
} from "@/types";
import type { DbCampaign } from "@/services/apiClient";
import {
  getCampaignById,
  createCampaign as createCampaignApi,
} from "@/services/apiClient";
import { generateCampaign } from "@/services/geminiService";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize platform names to match database enum values
 */
export function normalizeSocialPlatform(platform: string): string {
  const normalized = platform.toLowerCase().trim();
  if (normalized.includes("twitter") || normalized.includes("x.com")) {
    return "Twitter";
  }
  if (normalized.includes("instagram")) return "Instagram";
  if (normalized.includes("linkedin")) return "LinkedIn";
  if (normalized.includes("facebook")) return "Facebook";
  return platform; // Return original if no match
}

export function normalizeAdPlatform(platform: string): string {
  const normalized = platform.toLowerCase().trim();
  if (normalized.includes("facebook") || normalized.includes("meta")) {
    return "Facebook";
  }
  if (normalized.includes("google")) return "Google";
  return platform;
}

/**
 * Save productImages to localStorage
 */
export function saveProductImagesToStorage(
  campaignId: string,
  images: { base64: string; mimeType: string }[] | null
): void {
  if (images && images.length > 0) {
    try {
      localStorage.setItem(
        `productImages_${campaignId}`,
        JSON.stringify(images)
      );
      console.debug(
        "[Campaign] Saved productImages to localStorage for campaign:",
        campaignId
      );
    } catch (e) {
      console.warn("[Campaign] Failed to save productImages to localStorage:", e);
    }
  }
}

/**
 * Load productImages from localStorage
 */
export function loadProductImagesFromStorage(
  campaignId: string
): { base64: string; mimeType: string }[] | null {
  try {
    const stored = localStorage.getItem(`productImages_${campaignId}`);
    if (stored) {
      const images = JSON.parse(stored);
      console.debug(
        "[Campaign] Loaded productImages from localStorage for campaign:",
        campaignId
      );
      return images;
    }
  } catch (e) {
    console.warn("[Campaign] Failed to load productImages from localStorage:", e);
  }
  return null;
}

// =============================================================================
// Types
// =============================================================================

type ViewType = "campaign" | "flyer";

interface UseCampaignHandlersParams {
  userId: string | null;
  organizationId: string | null;
  brandProfile: BrandProfile | null;
  campaign: MarketingCampaign | null;
  setCampaign: (campaign: MarketingCampaign | null) => void;
  setCampaignProductImages: (
    images: { base64: string; mimeType: string }[] | null
  ) => void;
  setCampaignCompositionAssets: (
    assets: { base64: string; mimeType: string }[] | null
  ) => void;
  setIsGenerating: (generating: boolean) => void;
  setError: (error: string | null) => void;
  swrAddCampaign: (campaign: DbCampaign) => void;
  onViewChange: (view: ViewType) => void;
}

interface CampaignHandlers {
  handleGenerateCampaign: (
    input: ContentInput,
    options: GenerationOptions
  ) => Promise<void>;
  handleCreateCarouselFromPrompt: (
    prompt: string,
    requestedImages: number
  ) => Promise<void>;
  handleLoadCampaign: (campaignId: string) => Promise<void>;
  handlePublishFlyerToCampaign: (text: string, flyer: GalleryImage) => void;
  handleResetCampaign: () => void;
  handleCarouselUpdate: (updatedCarousel: CarouselScript) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useCampaignHandlers({
  userId,
  organizationId,
  brandProfile,
  campaign,
  setCampaign,
  setCampaignProductImages,
  setCampaignCompositionAssets,
  setIsGenerating,
  setError,
  swrAddCampaign,
  onViewChange,
}: UseCampaignHandlersParams): CampaignHandlers {
  const handleGenerateCampaign = useCallback(
    async (input: ContentInput, options: GenerationOptions) => {
      setIsGenerating(true);
      setError(null);
      onViewChange("campaign");
      // Store product images for use in PostsTab and AdCreativesTab
      console.debug(
        "[Campaign] Storing productImages:",
        input.productImages ? `${input.productImages.length} image(s)` : "null"
      );
      setCampaignProductImages(input.productImages);
      // Store composition assets for use in image generation
      console.debug(
        "[Campaign] Storing compositionAssets:",
        input.compositionAssets
          ? `${input.compositionAssets.length} asset(s)`
          : "null"
      );
      setCampaignCompositionAssets(input.compositionAssets || null);
      try {
        const r = await generateCampaign(brandProfile!, input, options);
        const toneUsed = input.toneOfVoiceOverride || brandProfile!.toneOfVoice;
        r.toneOfVoiceUsed = toneUsed;

        // Save campaign to database if authenticated
        if (userId) {
          try {
            // Generate a name from the transcript (first 50 chars)
            const campaignName = input.transcript
              ? input.transcript.substring(0, 50) +
                (input.transcript.length > 50 ? "..." : "")
              : `Campanha ${new Date().toLocaleDateString("pt-BR")}`;

            const savedCampaign = await createCampaignApi(userId, {
              name: campaignName,
              input_transcript: input.transcript,
              generation_options: {
                ...options,
                toneOfVoiceOverride: input.toneOfVoiceOverride || null,
                toneOfVoiceUsed:
                  input.toneOfVoiceOverride || brandProfile!.toneOfVoice,
              } as unknown as Record<string, unknown>,
              status: "completed",
              organization_id: organizationId,
              video_clip_scripts: (r.videoClipScripts || []).map((v) => ({
                title: v.title,
                hook: v.hook,
                image_prompt: v.image_prompt,
                audio_script: v.audio_script,
                scenes: v.scenes,
              })),
              posts: (r.posts || []).map((p) => ({
                platform: normalizeSocialPlatform(p.platform),
                content: p.content,
                hashtags: p.hashtags,
                image_prompt: p.image_prompt,
              })),
              ad_creatives: (r.adCreatives || []).map((a) => ({
                platform: normalizeAdPlatform(a.platform),
                headline: a.headline,
                body: a.body,
                cta: a.cta,
                image_prompt: a.image_prompt,
              })),
              carousel_scripts: (r.carousels || [])
                .filter((c) => c && c.title && c.hook && c.cover_prompt) // Filter out invalid carousels
                .map((c) => ({
                  title: c.title,
                  hook: c.hook,
                  cover_prompt: c.cover_prompt,
                  caption: c.caption ?? undefined,
                  slides: c.slides || [],
                })),
            });

            // Update campaign with database IDs (including clip/post/ad IDs for image linking)
            r.id = savedCampaign.id;
            r.name = campaignName;
            r.inputTranscript = input.transcript;
            r.createdAt = savedCampaign.created_at;

            // Map database IDs to local state for video_script_id linking
            if (
              savedCampaign.video_clip_scripts &&
              savedCampaign.video_clip_scripts.length > 0 &&
              r.videoClipScripts
            ) {
              r.videoClipScripts = r.videoClipScripts.map((clip, index) => ({
                ...clip,
                id: savedCampaign.video_clip_scripts[index]?.id,
              }));
            }
            if (
              savedCampaign.posts &&
              savedCampaign.posts.length > 0 &&
              r.posts
            ) {
              r.posts = r.posts.map((post, index) => ({
                ...post,
                id: savedCampaign.posts[index]?.id,
              }));
            }
            if (
              savedCampaign.ad_creatives &&
              savedCampaign.ad_creatives.length > 0 &&
              r.adCreatives
            ) {
              r.adCreatives = r.adCreatives.map((ad, index) => ({
                ...ad,
                id: savedCampaign.ad_creatives[index]?.id,
              }));
            }
            if (
              savedCampaign.carousel_scripts &&
              savedCampaign.carousel_scripts.length > 0 &&
              r.carousels
            ) {
              r.carousels = r.carousels.map((carousel, index) => ({
                ...carousel,
                id: savedCampaign.carousel_scripts[index]?.id,
              }));
            }

            // Update SWR cache for campaigns list
            swrAddCampaign(savedCampaign);

            console.debug(
              "[Campaign] Saved to database with IDs:",
              savedCampaign.id,
              "clips:",
              (r.videoClipScripts || []).map((c) => c.id),
              "posts:",
              (r.posts || []).map((p) => p.id),
              "ads:",
              (r.adCreatives || []).map((a) => a.id)
            );

            // Persist productImages to localStorage for this campaign
            if (input.productImages && input.productImages.length > 0) {
              saveProductImagesToStorage(savedCampaign.id, input.productImages);
            }
          } catch (saveError) {
            console.error("[Campaign] Failed to save to database:", saveError);
            // Continue even if save fails - campaign is still in memory
          }
        }

        setCampaign(r);
        // Keep loader visible for a minimum time to allow content to load
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsGenerating(false);
      }
    },
    [
      brandProfile,
      userId,
      organizationId,
      setCampaign,
      setCampaignProductImages,
      setCampaignCompositionAssets,
      setIsGenerating,
      setError,
      swrAddCampaign,
      onViewChange,
    ]
  );

  const handleCreateCarouselFromPrompt = useCallback(
    async (prompt: string, requestedImages: number) => {
      if (!brandProfile) {
        throw new Error("Perfil da marca não configurado");
      }
      if (!userId) {
        throw new Error("Usuário não autenticado");
      }

      const input: ContentInput = {
        transcript: prompt,
        productImages: null,
        inspirationImages: null,
        collabLogo: null,
        compositionAssets: null,
        toneOfVoiceOverride: null,
      };

      const options: GenerationOptions = {
        videoClipScripts: { generate: false, count: 0 },
        carousels: { generate: true, count: 1 },
        posts: {
          instagram: { generate: false, count: 0 },
          facebook: { generate: false, count: 0 },
          twitter: { generate: false, count: 0 },
          linkedin: { generate: false, count: 0 },
        },
        adCreatives: {
          facebook: { generate: false, count: 0 },
          google: { generate: false, count: 0 },
        },
      };
      // No standalone "Carrosséis" page, o usuário escolhe TOTAL de imagens.
      // O pipeline interno usa "capa + slides", então convertemos para slides internos.
      const totalImages = Math.max(2, Math.min(8, requestedImages));
      const internalSlides = Math.max(1, totalImages - 1);
      options.carousels.slidesPerCarousel = internalSlides;

      setIsGenerating(true);
      setError(null);

      try {
        const generated = await generateCampaign(brandProfile, input, options);
        const validCarousels = (generated.carousels || []).filter(
          (c) => c && c.title && c.hook && c.cover_prompt
        );

        if (validCarousels.length === 0) {
          throw new Error("Nenhum carrossel foi gerado");
        }

        const campaignName =
          prompt.substring(0, 50) + (prompt.length > 50 ? "..." : "");
        const savedCampaign = await createCampaignApi(userId, {
          name: campaignName,
          input_transcript: prompt,
          generation_options: {
            ...options,
            toneOfVoiceOverride: null,
            toneOfVoiceUsed: brandProfile.toneOfVoice,
            source: "carousels-page",
          } as unknown as Record<string, unknown>,
          status: "completed",
          organization_id: organizationId,
          video_clip_scripts: [],
          posts: [],
          ad_creatives: [],
          carousel_scripts: validCarousels.map((c) => ({
            title: c.title,
            hook: c.hook,
            cover_prompt: c.cover_prompt,
            caption: c.caption ?? undefined,
            slides: c.slides || [],
          })),
        });

        swrAddCampaign(savedCampaign);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [
      brandProfile,
      userId,
      organizationId,
      setIsGenerating,
      setError,
      swrAddCampaign,
    ]
  );

  const handleLoadCampaign = useCallback(
    async (campaignId: string) => {
      if (!userId) {
        console.error("Cannot load campaign: user not authenticated");
        return;
      }
      try {
        console.debug("[Campaign] Loading campaign:", campaignId);
        const fullCampaign = await getCampaignById(
          campaignId,
          userId,
          organizationId
        );
        console.debug("[Campaign] API response:", fullCampaign);

        if (fullCampaign) {
          const toneOverride = (
            fullCampaign.generation_options as {
              toneOfVoiceOverride?: string;
            } | null
          )?.toneOfVoiceOverride;
          const toneOfVoiceUsed =
            typeof toneOverride === "string"
              ? toneOverride
              : brandProfile?.toneOfVoice;

          const loadedCampaign: MarketingCampaign = {
            id: fullCampaign.id,
            name: fullCampaign.name || undefined,
            inputTranscript: fullCampaign.input_transcript || undefined,
            createdAt: fullCampaign.created_at,
            updatedAt: fullCampaign.updated_at,
            videoClipScripts: (fullCampaign.video_clip_scripts || []).map(
              (v) => ({
                id: v.id, // Include database ID for gallery image linking
                title: v.title,
                hook: v.hook,
                image_prompt: v.image_prompt || "",
                audio_script: v.audio_script || "",
                scenes: v.scenes || [],
                thumbnail_url: v.thumbnail_url || null, // Include saved thumbnail URL
              })
            ),
            posts: (fullCampaign.posts || []).map((p) => ({
              id: p.id, // Include database ID for image updates
              platform: p.platform as
                | "Instagram"
                | "LinkedIn"
                | "Twitter"
                | "Facebook",
              content: p.content,
              hashtags: p.hashtags || [],
              image_prompt: p.image_prompt || "",
              image_url: p.image_url || null, // Include saved image URL
            })),
            adCreatives: (fullCampaign.ad_creatives || []).map((a) => ({
              id: a.id, // Include database ID for image updates
              platform: a.platform as "Facebook" | "Google",
              headline: a.headline,
              body: a.body,
              cta: a.cta,
              image_prompt: a.image_prompt || "",
              image_url: a.image_url || null, // Include saved image URL
            })),
            carousels: (fullCampaign.carousel_scripts || []).map((c) => ({
              id: c.id,
              title: c.title,
              hook: c.hook,
              cover_prompt: c.cover_prompt || "",
              cover_url: c.cover_url || null,
              caption: c.caption || "",
              slides: c.slides || [],
            })),
            toneOfVoiceUsed:
              toneOfVoiceUsed as MarketingCampaign["toneOfVoiceUsed"],
          };
          console.debug(
            "[Campaign] Loaded:",
            loadedCampaign.videoClipScripts.length,
            "clips,",
            loadedCampaign.posts.length,
            "posts,",
            loadedCampaign.adCreatives.length,
            "ads,",
            loadedCampaign.carousels.length,
            "carousels"
          );
          setCampaign(loadedCampaign);
          onViewChange("campaign");

          // Restore productImages from localStorage for this campaign
          const storedProductImages = loadProductImagesFromStorage(campaignId);
          setCampaignProductImages(storedProductImages);
        } else {
          console.error(
            "[Campaign] API returned null for campaign:",
            campaignId
          );
          setError("Campanha não encontrada");
        }
      } catch (error: unknown) {
        console.error("Failed to load campaign:", error);
        setError("Falha ao carregar campanha");
      }
    },
    [
      userId,
      organizationId,
      brandProfile?.toneOfVoice,
      setCampaign,
      setCampaignProductImages,
      setError,
      onViewChange,
    ]
  );

  const handlePublishFlyerToCampaign = useCallback(
    (text: string, flyer: GalleryImage) => {
      const input: ContentInput = {
        transcript: text,
        productImages: [
          {
            base64: flyer.src.split(",")[1],
            mimeType: flyer.src.match(/:(.*?);/)?.[1] || "image/png",
          },
        ],
        inspirationImages: null,
      };
      const options: GenerationOptions = {
        videoClipScripts: { generate: true, count: 1 },
        carousels: { generate: true, count: 1 },
        posts: {
          instagram: { generate: true, count: 1 },
          facebook: { generate: true, count: 1 },
          twitter: { generate: true, count: 1 },
          linkedin: { generate: false, count: 0 },
        },
        adCreatives: {
          facebook: { generate: true, count: 1 },
          google: { generate: false, count: 0 },
        },
      };
      setCampaign(null);
      handleGenerateCampaign(input, options);
    },
    [handleGenerateCampaign, setCampaign]
  );

  const handleResetCampaign = useCallback(() => {
    setCampaign(null);
    setCampaignProductImages(null);
    setCampaignCompositionAssets(null);
  }, [setCampaign, setCampaignProductImages, setCampaignCompositionAssets]);

  const handleCarouselUpdate = useCallback(
    (updatedCarousel: CarouselScript) => {
      if (!campaign) {
        return;
      }

      setCampaign({
        ...campaign,
        carousels:
          campaign.carousels?.map((carousel) =>
            carousel.id === updatedCarousel.id ? updatedCarousel : carousel
          ) || [],
      });
    },
    [campaign, setCampaign]
  );

  return {
    handleGenerateCampaign,
    handleCreateCarouselFromPrompt,
    handleLoadCampaign,
    handlePublishFlyerToCampaign,
    handleResetCampaign,
    handleCarouselUpdate,
  };
}
