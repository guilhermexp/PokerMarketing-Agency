import React, { useState, useEffect, useCallback } from "react";
import type {
    BrandProfile,
    TournamentEvent,
    GalleryImage,
    ImageModel,
    ImageSize,
    ImageFile,
} from "@/types";
import type { InstagramContext } from "@/services/rubeService";
import type { Currency, TimePeriod } from "@/types/flyer.types";
import { Button } from "../common/Button";
import { Icon } from '../common/Icon';
import { generateFlyer } from "../../services/geminiService";
import { buildDailyFlyerPromptDetailed } from "@/ai-prompts";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { QuickPostModal } from "../common/QuickPostModal";
import { SchedulePostModal } from "../calendar/SchedulePostModal";
import { useBackgroundJobs, type ActiveJob } from "../../hooks/useBackgroundJobs";
import type { GenerationJobConfig } from "../../services/apiClient";
import { urlToBase64, downloadImage } from "../../utils/imageHelpers";
import { FlyerThumbStrip } from "./FlyerThumbStrip";
import {
    formatCurrencyValue,
    getInitialTimeForPeriod,
    isDevMode,
    getSortValue,
    parseGtd
} from "./utils";

const handleDownloadFlyer = (src: string, filename: string) => {
    downloadImage(src, filename);
};

export const PeriodCard: React.FC<{
    period: TimePeriod;
    label: string;
    dayInfo: string;
    scheduleDate?: string; // YYYY-MM-DD format for scheduling
    events: TournamentEvent[];
    brandProfile: BrandProfile;
    aspectRatio: string;
    currency: Currency;
    model: ImageModel;
    imageSize: ImageSize;
    compositionAssets: ImageFile[];
    language: "pt" | "en";
    onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
    onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
    onSetChatReference: (image: GalleryImage | null) => void;
    generatedFlyers: (GalleryImage | "loading")[];
    setGeneratedFlyers: (
        updater: (
            prev: (GalleryImage | "loading")[],
        ) => (GalleryImage | "loading")[],
    ) => void;
    triggerBatch: boolean;
    styleReference: GalleryImage | null;
    onCloneStyle: (image: GalleryImage) => void;
    collabLogo: string | null;
    onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
    userId?: string | null;
    instagramContext?: InstagramContext;
    galleryImages?: GalleryImage[];
    onSchedulePost?: (
        post: Omit<
            import("@/types").ScheduledPost,
            "id" | "createdAt" | "updatedAt"
        >,
    ) => void;
}> = ({
    period,
    label,
    dayInfo,
    scheduleDate,
    events,
    brandProfile,
    aspectRatio,
    currency,
    model,
    imageSize,
    compositionAssets,
    language: _language,
    onAddImageToGallery: _onAddImageToGallery,
    onUpdateGalleryImage,
    onSetChatReference,
    generatedFlyers,
    setGeneratedFlyers,
    triggerBatch,
    styleReference,
    collabLogo,
    onCloneStyle,
    onPublishToCampaign,
    userId,
    instagramContext,
    galleryImages = [],
    onSchedulePost,
}) => {
        const [isGenerating, setIsGenerating] = useState(false);
        const [editingFlyer, setEditingFlyer] = useState<GalleryImage | null>(null);
        const [quickPostFlyer, setQuickPostFlyer] = useState<GalleryImage | null>(
            null,
        );
        const [scheduleFlyer, setScheduleFlyer] = useState<GalleryImage | null>(null);
        const [scheduledUrls, setScheduledUrls] = useState<Set<string>>(new Set());

        const { queueJob, onJobComplete, onJobFailed, getJobByContext } =
            useBackgroundJobs();
        const jobContext = `flyer-card-${period}`;
        const pendingJob = getJobByContext(jobContext);

        // Listen for job completion (PeriodCard doesn't have isExpanded, no need to auto-expand)
        useEffect(() => {
            const unsubComplete = onJobComplete((job: ActiveJob) => {
                if (job.context === jobContext && job.result_url) {
                    // Use the gallery ID from the job (already saved by backend) instead of creating new entry
                    const newImage: GalleryImage = {
                        id: job.result_gallery_id || `temp-${Date.now()}`,
                        src: job.result_url,
                        prompt: "",
                        source: "Flyer Diário",
                        model,
                        aspectRatio,
                        imageSize,
                    };
                    setGeneratedFlyers((prev) =>
                        prev.map((f) => (f === "loading" ? newImage : f)),
                    );
                    setIsGenerating(false);
                }
            });

            const unsubFailed = onJobFailed((job: ActiveJob) => {
                if (job.context === jobContext) {
                    setGeneratedFlyers((prev) => prev.filter((f) => f !== "loading"));
                    setIsGenerating(false);
                }
            });

            return () => {
                unsubComplete();
                unsubFailed();
            };
        }, [
            jobContext,
            onJobComplete,
            onJobFailed,
            model,
            aspectRatio,
            imageSize,
            setGeneratedFlyers,
        ]);

        // Restore loading state from pending job
        useEffect(() => {
            if (
                pendingJob &&
                (pendingJob.status === "queued" || pendingJob.status === "processing") &&
                !isGenerating
            ) {
                setIsGenerating(true);
                if (!generatedFlyers.includes("loading")) {
                    setGeneratedFlyers((prev) => ["loading", ...prev]);
                }
            }
        }, [pendingJob, isGenerating, generatedFlyers, setGeneratedFlyers]);

        const handleGenerate = useCallback(
            async (forced: boolean = false) => {
                if (isGenerating || events.length === 0) return;
                if (triggerBatch && !forced && generatedFlyers.length > 0) return;

                // Ordenar eventos por GTD e separar o maior
                const sortedByGtd = [...events].sort(
                    (a, b) => parseGtd(b.gtd) - parseGtd(a.gtd),
                );
                const topEvent = sortedByGtd[0];
                // Outros eventos ordenados por horário
                const otherEvents = sortedByGtd
                    .slice(1)
                    .sort(
                        (a, b) =>
                            getSortValue(a.times?.["-3"] || "") -
                            getSortValue(b.times?.["-3"] || ""),
                    );

                const topEventText = topEvent
                    ? `${topEvent.name} - GTD: ${formatCurrencyValue(topEvent.gtd, currency)} - Horário: ${topEvent.times?.["-3"]} - Buy-in: ${formatCurrencyValue(topEvent.buyIn, currency)}`
                    : "";
                const otherEventsList = otherEvents
                    .map(
                        (e) =>
                            `${e.times?.["-3"]} | ${e.name} | Buy-in: ${formatCurrencyValue(e.buyIn, currency)} | GTD: ${formatCurrencyValue(e.gtd, currency)}`,
                    )
                    .join("\n");

                // Prompt específico para HIGHLIGHTS (apenas 3 torneios)
                const isHighlights = period === "HIGHLIGHTS";

                const labelUpper = label.toUpperCase();
                const secondEventText = otherEvents[0]
                    ? `${otherEvents[0].times?.["-3"]} | ${otherEvents[0].name} | Buy-in: ${formatCurrencyValue(otherEvents[0].buyIn, currency)} | GTD: ${formatCurrencyValue(otherEvents[0].gtd, currency)}`
                    : "";
                const thirdEventText = otherEvents[1]
                    ? `${otherEvents[1].times?.["-3"]} | ${otherEvents[1].name} | Buy-in: ${formatCurrencyValue(otherEvents[1].buyIn, currency)} | GTD: ${formatCurrencyValue(otherEvents[1].gtd, currency)}`
                    : "";
                const topEventGtdValue = topEvent ? formatCurrencyValue(topEvent.gtd, currency) : "";

                const prompt = buildDailyFlyerPromptDetailed({
                    isHighlights,
                    label,
                    labelUpper,
                    dayInfo,
                    topEventText,
                    secondEventText,
                    thirdEventText,
                    otherEventsList,
                    topEventName: topEvent?.name || "",
                    topEventGtdValue,
                    brandPrimaryColor: brandProfile.primaryColor,
                    brandSecondaryColor: brandProfile.secondaryColor,
                });

                // Use background job if userId is available AND we're not in dev mode
                if (userId && !isDevMode) {
                    setIsGenerating(true);
                    setGeneratedFlyers((prev) => ["loading", ...prev]);

                    try {
                        const config: GenerationJobConfig = {
                            brandName: brandProfile.name,
                            brandDescription: brandProfile.description,
                            brandToneOfVoice: brandProfile.toneOfVoice,
                            brandPrimaryColor: brandProfile.primaryColor,
                            brandSecondaryColor: brandProfile.secondaryColor,
                            aspectRatio,
                            model,
                            imageSize,
                            logo: brandProfile.logo || undefined,
                            collabLogo: collabLogo || undefined,
                            styleReference: styleReference?.src || undefined,
                            compositionAssets: compositionAssets.map(
                                (a) => `data:${a.mimeType};base64,${a.base64}`,
                            ),
                            source: "Flyer Diário",
                        };

                        await queueJob(userId, "flyer_daily", prompt, config, jobContext);
                    } catch (err) {
                        console.error("[PeriodCard] Failed to queue job:", err);
                        setGeneratedFlyers((prev) => prev.filter((f) => f !== "loading"));
                        setIsGenerating(false);
                    }
                    return;
                }

                // Local generation (dev mode or no userId)
                setIsGenerating(true);
                setGeneratedFlyers((prev) => ["loading", ...prev]);

                try {
                    // Convert all image sources to base64 (handles both data URLs and HTTP URLs)
                    const [logoToUse, collabLogoToUse, refData] = await Promise.all([
                        brandProfile.logo ? urlToBase64(brandProfile.logo) : null,
                        collabLogo ? urlToBase64(collabLogo) : null,
                        styleReference?.src ? urlToBase64(styleReference.src) : null,
                    ]);
                    const assetsToUse = compositionAssets.map((a) => ({
                        base64: a.base64,
                        mimeType: a.mimeType,
                    }));
                    const imageUrl = await generateFlyer(
                        prompt,
                        brandProfile,
                        logoToUse,
                        refData,
                        aspectRatio,
                        model,
                        collabLogoToUse,
                        imageSize,
                        assetsToUse,
                    );
                    const newImage: GalleryImage = {
                        id: `flyer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        src: imageUrl,
                        prompt,
                        source: "Flyer Diário",
                        model,
                        aspectRatio,
                        imageSize,
                    };
                    setGeneratedFlyers((prev) =>
                        prev.map((f) => (f === "loading" ? newImage : f)),
                    );
                } catch (err) {
                    setGeneratedFlyers((prev) => prev.filter((f) => f !== "loading"));
                } finally {
                    setIsGenerating(false);
                }
            },
            [
                isGenerating,
                events,
                triggerBatch,
                generatedFlyers.length,
                model,
                brandProfile,
                aspectRatio,
                currency,
                styleReference,
                setGeneratedFlyers,
                label,
                collabLogo,
                imageSize,
                compositionAssets,
                userId,
                queueJob,
                jobContext,
                dayInfo,
                period,
            ],
        );

        useEffect(() => {
            if (triggerBatch && events.length > 0) handleGenerate();
        }, [triggerBatch, events.length, handleGenerate]);

        return (
            <>
                <div
                    className={`bg-[#0a0a0a] border rounded-xl overflow-hidden flex flex-col h-full transition-all ${styleReference ? "border-white/10" : "border-white/[0.05]"}`}
                >
                <div className="px-4 py-2.5 flex justify-between items-center">
                    <div className="text-left flex items-center gap-2">
                        {styleReference && (
                            <div className="w-6 h-6 rounded overflow-hidden border border-white/10 flex-shrink-0">
                                <img
                                    src={styleReference.src}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                        <div>
                            <h4 className="text-[11px] font-semibold text-white">{label}</h4>
                            <p
                                className={`text-[9px] ${events.length > 0 ? "text-white/40" : "text-white/20"}`}
                            >
                                {events.length} torneios
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Schedule button - only show if there are generated flyers */}
                        {onSchedulePost &&
                            generatedFlyers.some((f) => f !== "loading") &&
                            (() => {
                                const firstFlyer = generatedFlyers.find(
                                    (f) => f !== "loading",
                                ) as GalleryImage;
                                const isScheduled =
                                    firstFlyer && scheduledUrls.has(firstFlyer.src);
                                return isScheduled ? (
                                    <span className="px-2 py-1 text-[9px] font-bold text-green-400 bg-green-500/10 rounded-lg">
                                        Agendado
                                    </span>
                                ) : (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (firstFlyer) setScheduleFlyer(firstFlyer);
                                        }}
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                                        title="Agendar publicação"
                                    >
                                        <Icon name="calendar" className="w-4 h-4 text-white/60" />
                                    </button>
                                );
                            })()}
                        <Button
                            size="small"
                            variant={events.length > 0 ? "primary" : "secondary"}
                            onClick={() => handleGenerate(true)}
                            isLoading={isGenerating}
                            disabled={events.length === 0}
                            icon="zap"
                        >
                            Gerar
                        </Button>
                    </div>
                </div>
                <div className="flex-1 p-4 relative min-h-[300px] bg-black/40">
                    <FlyerThumbStrip
                        images={generatedFlyers}
                        onEdit={setEditingFlyer}
                        onQuickPost={setQuickPostFlyer}
                        onSchedule={undefined}
                        onPublish={(f) =>
                            onPublishToCampaign(`Campanha para grade ${label}`, f)
                        }
                        onDownload={(f, index) =>
                            handleDownloadFlyer(f.src, `period-${period}-${index}.png`)
                        }
                        onCloneStyle={onCloneStyle}
                        emptyTitle="Nenhum flyer gerado"
                        emptyDescription='Clique em "Gerar" para criar um flyer.'
                    />
                </div>
            </div>

            {/* Modals - Renderizados fora da div principal para evitar problema de overflow */}
            {editingFlyer && (
                <ImagePreviewModal
                    image={editingFlyer}
                    onClose={() => setEditingFlyer(null)}
                    onImageUpdate={(src) => {
                        onUpdateGalleryImage(editingFlyer.id, src);
                        setGeneratedFlyers((prev) =>
                            prev.map((f) =>
                                f !== "loading" && f.id === editingFlyer.id ? { ...f, src } : f,
                            ),
                        );
                    }}
                    onSetChatReference={onSetChatReference}
                    onQuickPost={setQuickPostFlyer}
                    onPublish={(f) =>
                        onPublishToCampaign(`Campanha para grade ${label}`, f)
                    }
                    onCloneStyle={onCloneStyle}
                    downloadFilename={`period-${period}.png`}
                />
            )}
            {quickPostFlyer && (
                <QuickPostModal
                    isOpen={!!quickPostFlyer}
                    onClose={() => setQuickPostFlyer(null)}
                    image={quickPostFlyer}
                    brandProfile={brandProfile}
                    context={`Sessão: ${label}. Grade:\n${events.map((e) => e.name).join(", ")}`}
                    instagramContext={instagramContext}
                />
            )}
            {scheduleFlyer && onSchedulePost && (
                <SchedulePostModal
                    isOpen={!!scheduleFlyer}
                    onClose={() => setScheduleFlyer(null)}
                    galleryImages={galleryImages}
                    onSchedule={(post) => {
                        onSchedulePost(post);
                        // Mark as scheduled
                        if (scheduleFlyer?.src) {
                            setScheduledUrls((prev) => new Set(prev).add(scheduleFlyer.src));
                        }
                    }}
                    initialImage={scheduleFlyer}
                    initialDate={scheduleDate}
                    initialTime={getInitialTimeForPeriod(period)}
                />
            )}
        </>
        );
    };
