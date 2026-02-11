import React, { useState, useMemo } from "react";
import type { GalleryImage, WeekScheduleInfo } from "../../types";
import { Icon } from "../common/Icon";
import { ImagePreviewModal } from "../image-preview/ImagePreviewModal";
import { downloadImage } from "../../utils/imageHelpers";
import { DAY_TRANSLATIONS } from "./utils";

interface FlyerGalleryProps {
  flyerState: Record<string, (GalleryImage | "loading")[]>;
  dailyFlyerState: Record<string, Record<string, (GalleryImage | "loading")[]>>;
  galleryImages?: GalleryImage[];
  onUpdateGalleryImage?: (imageId: string, newImageSrc: string) => void;
  onSetChatReference?: (image: GalleryImage | null) => void;
  selectedDay?: string;
  weekScheduleInfo?: WeekScheduleInfo | null;
  // Selected flyer ID per day/period - only these are shown in the day filter
  selectedDailyFlyerIds?: Record<string, Record<string, string | null>>;
}

export const FlyerGallery: React.FC<FlyerGalleryProps> = ({
  flyerState,
  dailyFlyerState,
  galleryImages = [],
  onUpdateGalleryImage,
  onSetChatReference,
  selectedDay = "MONDAY",
  weekScheduleInfo,
  selectedDailyFlyerIds,
}) => {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [filter, setFilter] = useState<"all" | "selectedDay" | "daily" | "individual">("all");
  const [isSharing, setIsSharing] = useState(false);

  // Collect all flyers from both states
  const allFlyers = useMemo(() => {
    const flyers: GalleryImage[] = [];

    // From gallery (persisted flyers)
    galleryImages.forEach((flyer) => {
      if (flyer.source?.startsWith("Flyer")) {
        flyers.push(flyer);
      }
    });

    // From flyerState (individual tournament flyers)
    Object.values(flyerState).forEach((flyerArray) => {
      flyerArray.forEach((flyer) => {
        if (flyer !== "loading") {
          flyers.push(flyer);
        }
      });
    });

    // From dailyFlyerState (period flyers)
    Object.values(dailyFlyerState).forEach((dayData) => {
      Object.values(dayData).forEach((periodArray) => {
        periodArray.forEach((flyer) => {
          if (flyer !== "loading") {
            flyers.push(flyer);
          }
        });
      });
    });

    // Remove duplicates by src (fallback to id) and sort by newest first
    const uniqueFlyers = Array.from(
      new Map(flyers.map(f => [f.src || f.id, f])).values()
    );

    return uniqueFlyers.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;

      // Fallback: Extract timestamp from ID (format: flyer-{timestamp}-{random})
      const getTimestamp = (id: string) => {
        const match = id.match(/flyer-(\d+)-/);
        return match ? parseInt(match[1], 10) : 0;
      };
      return getTimestamp(b.id) - getTimestamp(a.id);
    });
  }, [flyerState, dailyFlyerState, galleryImages]);

  const dailyFlyers = useMemo(() => {
    return allFlyers.filter(f => f.source === "Flyer Diário");
  }, [allFlyers]);

  const individualFlyers = useMemo(() => {
    return allFlyers.filter(f => f.source === "Flyer");
  }, [allFlyers]);

  const selectedDayFlyers = useMemo(() => {
    const flyers: GalleryImage[] = [];

    // Get flyers from the selected day in dailyFlyerState
    const dayData = dailyFlyerState[selectedDay];
    const daySelectedIds = selectedDailyFlyerIds?.[selectedDay];

    if (dayData) {
      Object.entries(dayData).forEach(([period, periodArray]) => {
        // If we have selected IDs, only include the selected flyer from this period
        const selectedIdForPeriod = daySelectedIds?.[period];

        periodArray.forEach((flyer) => {
          if (flyer !== "loading") {
            // If selectedDailyFlyerIds is provided, only include the selected flyer
            if (selectedDailyFlyerIds) {
              if (selectedIdForPeriod && flyer.id === selectedIdForPeriod) {
                flyers.push(flyer);
              }
            } else {
              // Fallback: include all flyers when no selection state is provided
              flyers.push(flyer);
            }
          }
        });
      });
    }

    // Remove duplicates by src
    return Array.from(
      new Map(flyers.map(f => [f.src || f.id, f])).values()
    );
  }, [dailyFlyerState, selectedDay, selectedDailyFlyerIds]);

  const displayedFlyers = useMemo(() => {
    switch (filter) {
      case "selectedDay":
        return selectedDayFlyers;
      case "daily":
        return dailyFlyers;
      case "individual":
        return individualFlyers;
      default:
        return allFlyers;
    }
  }, [filter, allFlyers, selectedDayFlyers, dailyFlyers, individualFlyers]);

  const handleDownloadAll = async () => {
    for (let i = 0; i < displayedFlyers.length; i++) {
      const flyer = displayedFlyers[i];
      try {
        downloadImage(flyer.src, `flyer-${i + 1}.png`);
        // Small delay between downloads
        if (i < displayedFlyers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (err) {
        console.error(`Failed to download flyer ${i}:`, err);
      }
    }
  };

  const handleShareDayWhatsApp = async () => {
    if (selectedDayFlyers.length === 0) return;

    try {
      setIsSharing(true);

      const files: File[] = [];
      for (let i = 0; i < selectedDayFlyers.length; i++) {
        const flyer = selectedDayFlyers[i];
        const response = await fetch(flyer.src);
        const blob = await response.blob();
        const extension = blob.type.includes("png") ? "png" : "jpg";
        files.push(new File([blob], `flyer-${i + 1}.${extension}`, { type: blob.type }));
      }

      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files }));

      const dayLabel = DAY_TRANSLATIONS[selectedDay] || selectedDay;
      if (canShareFiles) {
        await navigator.share({
          title: `Flyers ${dayLabel}`,
          text: `Flyers de ${dayLabel}`,
          files,
        });
        return;
      }

      const links = selectedDayFlyers.map((flyer) => flyer.src).join("\n");
      const message = `Flyers de ${dayLabel}:\n${links}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
    } catch (err) {
      console.error("Failed to share flyers on WhatsApp:", err);
    } finally {
      setIsSharing(false);
    }
  };

  if (allFlyers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Icon name="image" className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-muted-foreground text-center">
          Nenhum flyer gerado ainda
        </p>
        <p className="text-xs text-muted-foreground text-center mt-1">
          Gere seus primeiros flyers para vê-los aqui
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-black/40">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Galeria de Flyers
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {displayedFlyers.length} {displayedFlyers.length === 1 ? 'flyer' : 'flyers'}
            </p>
          </div>
          {displayedFlyers.length > 0 && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={handleShareDayWhatsApp}
                disabled={selectedDayFlyers.length === 0 || isSharing}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-[10px] sm:text-xs font-medium text-muted-foreground hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-40 disabled:cursor-not-allowed "
              >
                <Icon name="send" className="w-3 h-3" />
                <span className="hidden sm:inline">{isSharing ? "Enviando..." : `WhatsApp (${DAY_TRANSLATIONS[selectedDay] || selectedDay})`}</span>
                <span className="sm:hidden">{isSharing ? "..." : DAY_TRANSLATIONS[selectedDay] || selectedDay}</span>
              </button>
              <button
                onClick={handleDownloadAll}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-[10px] sm:text-xs font-medium text-muted-foreground hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
              >
                <Icon name="download" className="w-3 h-3" />
                <span className="hidden sm:inline">Baixar Todos</span>
                <span className="sm:hidden">Todos</span>
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all backdrop-blur-2xl border ${
              filter === "all"
                ? "bg-black/40 border-border text-white/90"
                : "bg-black/20 border-border text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            Todos ({allFlyers.length})
          </button>
          <button
            onClick={() => setFilter("selectedDay")}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all backdrop-blur-2xl border ${
              filter === "selectedDay"
                ? "bg-black/40 border-border text-white/90"
                : "bg-black/20 border-border text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            {DAY_TRANSLATIONS[selectedDay] || selectedDay} ({selectedDayFlyers.length})
          </button>
          <button
            onClick={() => setFilter("daily")}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all backdrop-blur-2xl border ${
              filter === "daily"
                ? "bg-black/40 border-border text-white/90"
                : "bg-black/20 border-border text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            Grades ({dailyFlyers.length})
          </button>
          <button
            onClick={() => setFilter("individual")}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all backdrop-blur-2xl border ${
              filter === "individual"
                ? "bg-black/40 border-border text-white/90"
                : "bg-black/20 border-border text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            <span className="hidden sm:inline">Individuais</span>
            <span className="sm:hidden">Indiv.</span> ({individualFlyers.length})
          </button>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {displayedFlyers.map((flyer) => (
            <div
              key={flyer.id}
              onClick={() => setSelectedImage(flyer)}
              className="group relative aspect-[9/16] rounded-xl border border-border hover:scale-[1.02] transition-all cursor-pointer"
            >
              {/* Image container with overflow hidden */}
              <div className="absolute inset-0 rounded-xl overflow-hidden">
                <img
                  src={flyer.src}
                  className="w-full h-full object-cover"
                  alt="Flyer"
                />

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Hover Actions */}
                <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImage(flyer.src, `flyer-${flyer.id}.png`);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 bg-white/10 backdrop-blur-xl rounded-md text-[10px] font-medium text-white hover:bg-white/20 transition-colors"
                    >
                      <Icon name="download" className="w-2.5 h-2.5" />
                      Baixar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImage(flyer);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 bg-white/10 backdrop-blur-xl rounded-md text-[10px] font-medium text-white hover:bg-white/20 transition-colors"
                    >
                      <Icon name="eye" className="w-2.5 h-2.5" />
                      Ver
                    </button>
                  </div>
                </div>

                {/* Type Badge */}
                <div className="absolute top-1.5 left-1.5">
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xl text-white/70 uppercase tracking-wider">
                    {flyer.source === "Flyer Diário" ? "Grade" : "Individual"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Image Preview Modal */}
      {selectedImage && (
        <ImagePreviewModal
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
          onImageUpdate={
            onUpdateGalleryImage
              ? (newSrc) => onUpdateGalleryImage(selectedImage.id, newSrc)
              : undefined
          }
          onSetChatReference={onSetChatReference}
        />
      )}
    </div>
  );
};
