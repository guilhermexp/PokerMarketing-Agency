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
import { Loader } from "../common/Loader";
import { Icon } from "../common/Icon";
import { generateFlyer } from "../../services/geminiService";
import { buildDailyFlyerPromptCompact } from "@/ai-prompts";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { QuickPostModal } from "../common/QuickPostModal";
import { SchedulePostModal } from "../calendar/SchedulePostModal";
import { useBackgroundJobs, type ActiveJob } from "../../hooks/useBackgroundJobs";
import { urlToBase64, downloadImage } from "../../utils/imageHelpers";
import { addDailyFlyer } from "../../services/apiClient";
import { FlyerThumbStrip } from "./FlyerThumbStrip";
import {
    formatCurrencyValue,
    getInitialTimeForPeriod,
    getSortValue,
    parseGtd
} from "./utils";

const handleDownloadFlyer = (src: string, filename: string) => {
    downloadImage(src, filename);
};

export const PeriodCardRow: React.FC<{
    period: TimePeriod;
    label: string;
    dayInfo: string;
    selectedDay?: string; // Day of week: 'MONDAY', 'TUESDAY', etc. For database persistence
    scheduleDate?: string; // YYYY-MM-DD format for scheduling
    events: TournamentEvent[];
    brandProfile: BrandProfile;
    aspectRatio: string;
    currency: Currency;
    model: ImageModel;
    imageSize: ImageSize;
    compositionAssets: ImageFile[];
    language: "pt" | "en";
    scheduleId?: string; // For saving daily flyers to database
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
    onDownloadAll?: (images: GalleryImage[], title: string) => void;
}> = ({
    period,
    label,
    dayInfo,
    selectedDay,
    scheduleDate,
    events,
    brandProfile,
    aspectRatio,
    currency,
    model,
    imageSize,
    compositionAssets,
    language: _language,
    scheduleId,
    onAddImageToGallery,
    onUpdateGalleryImage,
    onSetChatReference,
    generatedFlyers,
    setGeneratedFlyers,
    triggerBatch,
    styleReference,
    onCloneStyle,
    collabLogo,
    onPublishToCampaign,
    userId,
    instagramContext,
    galleryImages = [],
    onSchedulePost,
    onDownloadAll,
}) => {
        const [isGenerating, setIsGenerating] = useState(false);
        // Auto-expand if there are already generated flyers
        const hasExistingFlyers = generatedFlyers.some((f) => f !== "loading");
        const [isExpanded, setIsExpanded] = useState(hasExistingFlyers);
        const [editingFlyer, setEditingFlyer] = useState<GalleryImage | null>(null);
        const [quickPostFlyer, setQuickPostFlyer] = useState<GalleryImage | null>(
            null,
        );
        const [scheduleFlyer, setScheduleFlyer] = useState<GalleryImage | null>(null);
        const [scheduledUrls, setScheduledUrls] = useState<Set<string>>(new Set());
        // Track selected flyer for actions (defaults to first non-loading flyer)
        const [selectedFlyerId, setSelectedFlyerId] = useState<string | null>(null);

        const { onJobComplete, onJobFailed, getJobByContext } =
            useBackgroundJobs();
        // Include day in context to ensure jobs are unique per day+period
        const jobContext = `flyer-period-${selectedDay}-${period}`;
        const pendingJob = getJobByContext(jobContext);

        // Debug logging for job state issues
        useEffect(() => {
            if (pendingJob) {
                console.debug(`[PeriodCardRow:${period}] Found job:`, {
                    id: pendingJob.id,
                    status: pendingJob.status,
                    context: pendingJob.context,
                    progress: pendingJob.progress,
                    isGenerating,
                    hasFlyers: generatedFlyers.length,
                });
            }
        }, [pendingJob, period, isGenerating, generatedFlyers.length]);

        // Listen for job completion
        useEffect(() => {
            const unsubComplete = onJobComplete(async (job: ActiveJob) => {
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
                    setIsExpanded(true); // Auto-expand when generation completes

                    // Save daily flyer URL reference to week_schedules.daily_flyer_urls
                    // This ensures the flyer is restored when the page is reloaded
                    if (scheduleId && job.result_url && selectedDay) {
                        try {
                            await addDailyFlyer(scheduleId, period, job.result_url, selectedDay);
                            console.debug(
                                `[PeriodCardRow] Saved background job flyer to database: day=${selectedDay}, period=${period}`,
                            );
                        } catch (err) {
                            console.error(
                                "[PeriodCardRow] Failed to save daily flyer URL to database:",
                                err,
                            );
                        }
                    }
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
            selectedDay,
            scheduleId,
            period,
        ]);

        // Restore loading state from pending job (only on initial mount or when starting new generation)
        // Skip if we already have generated flyers - this prevents phantom loading after completion
        useEffect(() => {
            // Don't restore if we already have flyers (job likely already completed)
            const hasGeneratedContent = generatedFlyers.some((f) => f !== "loading");

            if (
                pendingJob &&
                (pendingJob.status === "queued" || pendingJob.status === "processing") &&
                !isGenerating &&
                !hasGeneratedContent // Only restore if we don't have any content yet
            ) {
                console.debug(`[PeriodCardRow] Restoring loading state for ${period}:`, pendingJob.id);
                setIsGenerating(true);
                if (!generatedFlyers.includes("loading")) {
                    setGeneratedFlyers((prev) => ["loading", ...prev]);
                }
            }
        }, [pendingJob, isGenerating, generatedFlyers, setGeneratedFlyers, period]);

        // Auto-expand when flyers are loaded from storage
        useEffect(() => {
            if (hasExistingFlyers && !isExpanded) {
                setIsExpanded(true);
            }
        }, [hasExistingFlyers, isExpanded]);

        // Auto-select first flyer when flyers change
        useEffect(() => {
            const firstFlyer = generatedFlyers.find((f) => f !== "loading") as GalleryImage | undefined;
            if (firstFlyer && (!selectedFlyerId || !generatedFlyers.some(f => f !== "loading" && f.id === selectedFlyerId))) {
                setSelectedFlyerId(firstFlyer.id);
            } else if (!firstFlyer) {
                setSelectedFlyerId(null);
            }
        }, [generatedFlyers, selectedFlyerId]);

        const handleGenerate = useCallback(
            async (forced: boolean = false) => {
                if (isGenerating || events.length === 0) return;
                if (triggerBatch && !forced && generatedFlyers.length > 0) return;

                // Prevent regeneration if this period's image is being used as style reference
                const isReferenceImage = styleReference && generatedFlyers.some(
                    (f) => f !== "loading" && f.id === styleReference.id
                );
                if (isReferenceImage && !forced) {
                    console.debug(`[PeriodCardRow] Skipping generation for ${period} - image is being used as reference`);
                    return;
                }

                const sortedByGtd = [...events].sort(
                    (a, b) => parseGtd(b.gtd) - parseGtd(a.gtd),
                );
                const topEvent = sortedByGtd[0];
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

                const isHighlights = period === "HIGHLIGHTS";

                const labelUpper = label.toUpperCase();
                const secondEventText = otherEvents[0]
                    ? `${otherEvents[0].times?.["-3"]} | ${otherEvents[0].name} | GTD: ${formatCurrencyValue(otherEvents[0].gtd, currency)}`
                    : "";
                const thirdEventText = otherEvents[1]
                    ? `${otherEvents[1].times?.["-3"]} | ${otherEvents[1].name} | GTD: ${formatCurrencyValue(otherEvents[1].gtd, currency)}`
                    : "";

                const prompt = buildDailyFlyerPromptCompact({
                    isHighlights,
                    label,
                    labelUpper,
                    dayInfo,
                    topEventText,
                    secondEventText,
                    thirdEventText,
                    otherEventsList,
                    brandPrimaryColor: brandProfile.primaryColor,
                    brandSecondaryColor: brandProfile.secondaryColor,
                });

                // Synchronous generation (background jobs were removed)
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

                    // CRITICAL: Save to gallery (images table) first to enable persistence across devices
                    const galleryImage = onAddImageToGallery({
                        src: imageUrl,
                        prompt,
                        source: "Flyer Diário",
                        model,
                        aspectRatio,
                        imageSize,
                        week_schedule_id: scheduleId, // Link to schedule for persistence
                        daily_flyer_period: period, // Track which period this flyer is for
                    });

                    console.debug(
                        `[FlyerGenerator] Added flyer to gallery with ID: ${galleryImage.id}`,
                    );

                    setGeneratedFlyers((prev) =>
                        prev.map((f) => (f === "loading" ? galleryImage : f)),
                    );
                    setIsExpanded(true); // Auto-expand when generation completes

                    // Save daily flyer URL reference to week_schedules.daily_flyer_urls
                    if (scheduleId && imageUrl) {
                        try {
                            await addDailyFlyer(scheduleId, period, imageUrl, selectedDay);
                            console.debug(
                                `[FlyerGenerator] Saved daily flyer URL to database: day=${selectedDay}, period=${period}`,
                            );
                        } catch (err) {
                            console.error(
                                "[FlyerGenerator] Failed to save daily flyer URL to database:",
                                err,
                            );
                        }
                    }
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
                generatedFlyers,
                model,
                brandProfile,
                aspectRatio,
                currency,
                scheduleId,
                period,
                styleReference,
                setGeneratedFlyers,
                label,
                collabLogo,
                imageSize,
                compositionAssets,
                userId,
                jobContext,
                dayInfo,
                selectedDay,
                onAddImageToGallery,
            ],
        );

        useEffect(() => {
            if (triggerBatch && events.length > 0) handleGenerate();
        }, [triggerBatch, events.length, handleGenerate]);

        const totalGtd = events.reduce((sum, e) => sum + parseGtd(e.gtd), 0);

        // Check if any generated flyer is being used as style reference
        const isUsingAsReference = styleReference && generatedFlyers.some(
            (f) => f !== "loading" && f.id === styleReference.id
        );

        // Get selected flyer (or first flyer as fallback)
        const selectedFlyer = (generatedFlyers.find(
            (f) => f !== "loading" && f.id === selectedFlyerId
        ) || generatedFlyers.find((f) => f !== "loading")) as GalleryImage | undefined;

        return (
            <div
                className={`bg-black/40 backdrop-blur-2xl border rounded-2xl overflow-hidden transition-all mb-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${isGenerating ? "border-white/20 animate-pulse" : "border-white/10 hover:border-white/20"}`}
            >
                <div
                    className="px-5 py-4 flex items-center justify-between cursor-pointer"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-6 items-center text-left">
                        <div className="flex items-center gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-white tracking-wide">
                                    {label}
                                </h3>
                                <p className="text-[10px] text-white/40 mt-0.5">
                                    {isGenerating
                                        ? "Gerando flyer..."
                                        : `${events.length} torneios neste período`}
                                </p>
                            </div>
                        </div>
                        <div>
                            <span className="text-[9px] font-semibold text-white/40 uppercase tracking-wider block mb-1">
                                Período • <span className="text-white/50">{dayInfo}</span>
                            </span>
                            <span className="text-sm font-semibold text-white/90">
                                {period === "ALL"
                                    ? "Dia Completo"
                                    : period === "MORNING"
                                        ? "06h - 12h"
                                        : period === "AFTERNOON"
                                            ? "12h - 18h"
                                            : period === "NIGHT"
                                                ? "18h - 06h"
                                                : "Top 3"}
                            </span>
                        </div>
                        <div>
                            <span className="text-[9px] font-semibold text-white/40 uppercase tracking-wider block mb-1">
                                GTD Total
                            </span>
                            <span className="text-sm font-bold text-white/90/90">
                                {formatCurrencyValue(String(totalGtd), currency)}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
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
                                        className="p-2 bg-black/40 backdrop-blur-sm hover:bg-white/10 rounded-lg transition-all border border-white/10 hover:border-white/20"
                                        title="Agendar publicação"
                                    >
                                        <Icon name="calendar" className="w-4 h-4 text-white/60" />
                                    </button>
                                );
                            })()}
                        {/* Show reference badge if this period's image is being used as reference */}
                        {isUsingAsReference && (
                            <span className="px-2 py-1 text-[9px] font-bold text-white/60 bg-white/10 rounded-lg flex items-center gap-1">
                                <Icon name="heart" className="w-3 h-3" />
                                Referência
                            </span>
                        )}
                        {/* Action buttons for selected flyer */}
                        {selectedFlyer && (
                            <>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingFlyer(selectedFlyer);
                                    }}
                                    className="p-2 bg-black/40 backdrop-blur-sm hover:bg-white/10 rounded-lg transition-all border border-white/10 hover:border-white/20"
                                    title="Visualizar"
                                >
                                    <Icon name="eye" className="w-4 h-4 text-white/60" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setQuickPostFlyer(selectedFlyer);
                                    }}
                                    className="p-2 bg-black/40 backdrop-blur-sm hover:bg-white/10 rounded-lg transition-all border border-white/10 hover:border-white/20"
                                    title="Publicar agora"
                                >
                                    <Icon name="zap" className="w-4 h-4 text-white/60" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPublishToCampaign(`Campanha para grade ${label}`, selectedFlyer);
                                    }}
                                    className="p-2 bg-black/40 backdrop-blur-sm hover:bg-white/10 rounded-lg transition-all border border-white/10 hover:border-white/20"
                                    title="Adicionar à campanha"
                                >
                                    <Icon name="users" className="w-4 h-4 text-white/60" />
                                </button>
                                {onCloneStyle && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCloneStyle(selectedFlyer);
                                        }}
                                        className="p-2 bg-black/40 backdrop-blur-sm hover:bg-white/10 rounded-lg transition-all border border-white/10 hover:border-white/20"
                                        title="Usar como referência de estilo"
                                    >
                                        <Icon name="copy" className="w-4 h-4 text-white/60" />
                                    </button>
                                )}
                            </>
                        )}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleGenerate(true);
                            }}
                            disabled={events.length === 0 || isUsingAsReference || isGenerating}
                            title={isUsingAsReference ? "Esta imagem está sendo usada como referência e não pode ser regenerada" : undefined}
                            className="px-3 py-1.5 text-[10px] font-medium text-white/70 hover:text-white/90 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader size={12} />
                                    <span>Gerando...</span>
                                </>
                            ) : (
                                <>
                                    <Icon name="zap" className="w-3 h-3" />
                                    <span>Gerar</span>
                                </>
                            )}
                        </button>
                        {/* Download all button */}
                        {onDownloadAll &&
                            generatedFlyers.some((f) => f !== "loading") &&
                            (() => {
                                const flyerImages = generatedFlyers.filter(
                                    (f) => f !== "loading",
                                ) as GalleryImage[];
                                return (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDownloadAll(flyerImages, `${label}-${dayInfo}`);
                                        }}
                                        className="p-2 bg-black/40 backdrop-blur-sm hover:bg-white/10 rounded-lg transition-all border border-white/10 hover:border-white/20"
                                        title="Baixar todas as imagens"
                                    >
                                        <Icon name="download" className="w-4 h-4 text-white/60" />
                                    </button>
                                );
                            })()}
                        <Icon
                            name={isExpanded ? "chevron-up" : "chevron-down"}
                            className="w-4 h-4 text-white/30"
                        />
                    </div>
                </div>
                {isExpanded && (
                    <div className="px-4 pb-4 pt-3 border-t border-white/10 animate-fade-in-up">
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
                            selectedFlyerId={selectedFlyerId}
                            onSelectFlyer={setSelectedFlyerId}
                        />
                    </div>
                )}
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
            </div>
        );
    };
