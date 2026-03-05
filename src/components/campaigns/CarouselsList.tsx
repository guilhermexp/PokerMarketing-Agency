import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../common/Icon";
import { Loader } from "../common/Loader";
import { CampaignCarouselCard } from "../carousel/CampaignCarouselCard";
import { generateAllCampaignCarouselImages } from "../carousel/services/campaignCarouselGeneration";
import { getCarouselPreviewImages } from "../carousel/utils";
import { getCarousels, type DbCarouselListItem } from "../../services/apiClient";
import type { BrandProfile, CarouselScript, GalleryImage, ImageModel } from "../../types";
import {
  DEFAULT_CAMPAIGN_IMAGE_MODEL,
  IMAGE_GENERATION_MODEL_OPTIONS,
} from "../../config/imageGenerationModelOptions";

interface CarouselsListProps {
  userId: string;
  organizationId?: string | null;
  brandProfile: BrandProfile;
  galleryImages?: GalleryImage[];
  onCreateCarouselFromPrompt?: (
    prompt: string,
    slidesPerCarousel: number,
    imageModel?: ImageModel,
  ) => Promise<void>;
  onSelectCampaign?: (campaignId: string) => void;
}

export function CarouselsList({
  userId,
  organizationId,
  brandProfile,
  onCreateCarouselFromPrompt,
  onSelectCampaign,
}: CarouselsListProps) {
  const [items, setItems] = useState<DbCarouselListItem[]>([]);
  const [localCarousels, setLocalCarousels] = useState<CarouselScript[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [slidesPerCarousel, setSlidesPerCarousel] = useState(5);
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>(
    DEFAULT_CAMPAIGN_IMAGE_MODEL,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [generatingCarousel, setGeneratingCarousel] = useState<
    Record<string, boolean>
  >({});
  const [pausedGenerations, setPausedGenerations] = useState<
    Record<string, boolean>
  >({});
  const pausedRef = useRef<Record<string, boolean>>({});
  const localCarouselsRef = useRef<CarouselScript[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});

  useEffect(() => {
    localCarouselsRef.current = localCarousels;
  }, [localCarousels]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getCarousels(userId, organizationId);
        if (cancelled) return;
        setItems(result);

        const mapped = result.map(
          (item): CarouselScript => ({
            id: item.id,
            title: item.title,
            hook: item.hook,
            cover_prompt:
              item.cover_prompt ||
              `CAPA DE CARROSSEL INSTAGRAM 4:5, estilo cinematográfico premium, usando as cores da marca, tema: ${item.title}.`,
            cover_url: item.cover_url,
            caption: item.caption || undefined,
            slides: item.slides || [],
          }),
        );
        setLocalCarousels(mapped);
        localCarouselsRef.current = mapped;
        setCaptions(
          Object.fromEntries(
            mapped.map((carousel) => [carousel.id || "", carousel.caption || ""]),
          ),
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao carregar carrosséis",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, userId, reloadToken]);

  const metaById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const total = localCarousels.length;

  const setPauseState = (key: string, value: boolean) => {
    pausedRef.current = { ...pausedRef.current, [key]: value };
    setPausedGenerations((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerateAll = async (carousel: CarouselScript, key: string) => {
    setPauseState(key, false);
    await generateAllCampaignCarouselImages(carousel, {
      brandProfile,
      imageModel: selectedImageModel,
      shouldPause: () => !!pausedRef.current[key],
      setGeneratingCarousel,
      setLocalCarousels,
      localCarouselsRef,
    });
    setReloadToken((prev) => prev + 1);
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  if (isLoading) {
    return (
      <div className="min-h-[220px] flex items-center justify-center">
        <Loader size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Carrosséis</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {total} {total === 1 ? "carrossel criado" : "carrosséis criados"}
          </p>
        </div>
      </div>

      {onCreateCarouselFromPrompt && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const value = prompt.trim();
            if (!value || isCreating) return;
            setIsCreating(true);
            setError(null);
            try {
              await onCreateCarouselFromPrompt(
                value,
                slidesPerCarousel,
                selectedImageModel,
              );
              setPrompt("");
              setReloadToken((prev) => prev + 1);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Falha ao criar carrossel",
              );
            } finally {
              setIsCreating(false);
            }
          }}
          className="w-full max-w-4xl mx-auto flex flex-col sm:flex-row gap-2 rounded-2xl border border-white/10 bg-black/20 px-2 py-1.5 transition-colors focus-within:border-white/20"
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva o carrossel que deseja criar..."
            className="flex-1 h-10 rounded-xl border border-transparent bg-transparent px-3 text-sm text-white/90 placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center gap-1 sm:gap-1.5 sm:pl-2 sm:ml-1 sm:border-l sm:border-white/10">
            <select
              value={slidesPerCarousel}
              onChange={(e) => setSlidesPerCarousel(Number(e.target.value))}
              className="h-9 rounded-lg border border-transparent bg-transparent px-2.5 text-sm text-white/80 focus:outline-none focus:border-white/10"
            >
              <option value={2}>2 imagens</option>
              <option value={3}>3 imagens</option>
              <option value={4}>4 imagens</option>
              <option value={5}>5 imagens</option>
              <option value={6}>6 imagens</option>
              <option value={7}>7 imagens</option>
              <option value={8}>8 imagens</option>
            </select>
            <select
              value={selectedImageModel}
              onChange={(e) => setSelectedImageModel(e.target.value as ImageModel)}
              className="h-9 rounded-lg border border-transparent bg-transparent px-2.5 text-sm text-white/80 focus:outline-none focus:border-white/10"
              title="Modelo para gerar imagens do carrossel"
            >
              {IMAGE_GENERATION_MODEL_OPTIONS.map((option) => (
                <option key={option.model} value={option.model}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!prompt.trim() || isCreating}
              className="h-9 px-3 rounded-lg border border-white/10 bg-transparent text-sm text-white/85 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              {isCreating ? (
                <>
                  <Loader size={14} />
                  Criando...
                </>
              ) : (
                <>
                  <Icon name="zap" className="w-3.5 h-3.5" />
                  Criar
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!error && localCarousels.length === 0 && (
        <div className="rounded-xl border border-border bg-background p-6 text-center">
          <Icon name="layers" className="w-8 h-8 text-white/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhum carrossel criado ainda.
          </p>
        </div>
      )}

      <div className="space-y-3 mt-4 sm:mt-6">
        {localCarousels.map((carousel, index) => {
          const carouselId = carousel.id || `carousel-${index}`;
          const carouselKey = `carousel-${carouselId}`;
          const meta = metaById.get(carouselId);
          const previewImages = getCarouselPreviewImages(carousel);
          const orderedImages = previewImages;
          const totalSlides = carousel.slides.length;
          const slidesWithImages = carousel.slides.filter(
            (slide) => !!slide.image_url,
          ).length;
          const hasCover = !!carousel.cover_url;
          const allGenerated = hasCover && slidesWithImages === totalSlides;
          const generatingSlides = Object.fromEntries(
            Object.entries(generatingCarousel).filter(
              ([k, v]) => v && k.startsWith(`${carousel.id}-slide-`),
            ),
          );
          const isGeneratingAny = Object.entries(generatingCarousel).some(
            ([k, v]) => v && k.startsWith(`${carousel.id}-`),
          );
          const isPaused = pausedGenerations[carouselKey] || false;
          const isExpanded = !collapsed.has(carouselKey);

          return (
            <div key={carouselId}>
              <CampaignCarouselCard
                carousel={carousel}
                index={index}
                isExpanded={isExpanded}
                onToggle={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(carouselKey)) next.delete(carouselKey);
                    else next.add(carouselKey);
                    return next;
                  })
                }
                previewImages={previewImages}
                orderedImages={orderedImages}
                totalSlides={totalSlides}
                slidesWithImages={slidesWithImages}
                hasCover={hasCover}
                allGenerated={allGenerated}
                isGeneratingAny={isGeneratingAny}
                isPaused={isPaused}
                publishing={false}
                captions={captions}
                onGenerateAll={() => handleGenerateAll(carousel, carouselKey)}
                onTogglePause={() =>
                  setPauseState(carouselKey, !pausedRef.current[carouselKey])
                }
                onReorder={() => {}}
                onOpenEditor={() => {}}
                onCaptionChange={(newCaption) =>
                  setCaptions((prev) => ({ ...prev, [carousel.id || ""]: newCaption }))
                }
                generatingSlides={generatingSlides}
                totalExpectedSlides={totalSlides + 1}
              />
              <div className="px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
                <span>Campanha: {meta?.campaign_name || "Sem nome"}</span>
                <span>{meta?.created_at ? formatDate(meta.created_at) : ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CarouselsList;
