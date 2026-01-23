import React, { useState, useMemo } from "react";
import type { GalleryImage } from "../../types";
import { Icon } from "../common/Icon";
import { ImagePreviewModal } from "../image-preview/ImagePreviewModal";
import { downloadImage } from "../../utils/imageHelpers";

interface FlyerGalleryProps {
  flyerState: Record<string, (GalleryImage | "loading")[]>;
  dailyFlyerState: Record<string, Record<string, (GalleryImage | "loading")[]>>;
  galleryImages?: GalleryImage[];
  onUpdateGalleryImage?: (imageId: string, newImageSrc: string) => void;
  onSetChatReference?: (image: GalleryImage | null) => void;
}

export const FlyerGallery: React.FC<FlyerGalleryProps> = ({
  flyerState,
  dailyFlyerState,
  galleryImages = [],
  onUpdateGalleryImage,
  onSetChatReference,
}) => {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [filter, setFilter] = useState<"all" | "today" | "daily" | "individual">("all");

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

  const todayFlyers = useMemo(() => {
    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // Get tomorrow's date at midnight
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTimestamp = tomorrow.getTime();

    return allFlyers.filter(f => {
      // Extract timestamp from ID (format: flyer-{timestamp}-{random})
      const match = f.id.match(/flyer-(\d+)-/);
      if (!match) return false;

      const flyerTimestamp = parseInt(match[1]);
      // Check if flyer was created today
      return flyerTimestamp >= todayTimestamp && flyerTimestamp < tomorrowTimestamp;
    });
  }, [allFlyers]);

  const displayedFlyers = useMemo(() => {
    switch (filter) {
      case "today":
        return todayFlyers;
      case "daily":
        return dailyFlyers;
      case "individual":
        return individualFlyers;
      default:
        return allFlyers;
    }
  }, [filter, allFlyers, todayFlyers, dailyFlyers, individualFlyers]);

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

  if (allFlyers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Icon name="image" className="w-8 h-8 text-white/20" />
        </div>
        <p className="text-sm font-semibold text-white/40 text-center">
          Nenhum flyer gerado ainda
        </p>
        <p className="text-xs text-white/20 text-center mt-1">
          Gere seus primeiros flyers para vê-los aqui
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 bg-black/40">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Galeria de Flyers
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              {displayedFlyers.length} {displayedFlyers.length === 1 ? 'flyer' : 'flyers'}
            </p>
          </div>
          {displayedFlyers.length > 0 && (
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-xs font-medium text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            >
              <Icon name="download" className="w-3 h-3" />
              Baixar Todos
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-2xl border ${
              filter === "all"
                ? "bg-black/40 border-white/10 text-white/90"
                : "bg-black/20 border-white/5 text-white/40 hover:text-white/60 hover:border-white/10"
            }`}
          >
            Todos ({allFlyers.length})
          </button>
          <button
            onClick={() => setFilter("today")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-2xl border ${
              filter === "today"
                ? "bg-black/40 border-white/10 text-white/90"
                : "bg-black/20 border-white/5 text-white/40 hover:text-white/60 hover:border-white/10"
            }`}
          >
            Hoje ({todayFlyers.length})
          </button>
          <button
            onClick={() => setFilter("daily")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-2xl border ${
              filter === "daily"
                ? "bg-black/40 border-white/10 text-white/90"
                : "bg-black/20 border-white/5 text-white/40 hover:text-white/60 hover:border-white/10"
            }`}
          >
            Grades ({dailyFlyers.length})
          </button>
          <button
            onClick={() => setFilter("individual")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-2xl border ${
              filter === "individual"
                ? "bg-black/40 border-white/10 text-white/90"
                : "bg-black/20 border-white/5 text-white/40 hover:text-white/60 hover:border-white/10"
            }`}
          >
            Individuais ({individualFlyers.length})
          </button>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid grid-cols-2 gap-3">
          {displayedFlyers.map((flyer) => (
            <button
              key={flyer.id}
              onClick={() => setSelectedImage(flyer)}
              className="group relative aspect-[9/16] rounded-xl overflow-hidden border border-white/[0.06] hover:border-white/10 hover:scale-[1.02] transition-all cursor-pointer"
            >
              <img
                src={flyer.src}
                className="w-full h-full object-cover"
                alt="Flyer"
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Hover Actions */}
              <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadImage(flyer.src, `flyer-${flyer.id}.png`);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white/10 backdrop-blur-xl rounded-lg text-xs font-medium text-white hover:bg-white/20 transition-colors"
                  >
                    <Icon name="download" className="w-3 h-3" />
                    Download
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImage(flyer);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white/10 backdrop-blur-xl rounded-lg text-xs font-medium text-white hover:bg-white/20 transition-colors"
                  >
                    <Icon name="eye" className="w-3 h-3" />
                    Ver
                  </button>
                </div>
              </div>

              {/* Type Badge */}
              <div className="absolute top-2 left-2">
                <span className="text-[9px] font-black px-2 py-1 rounded-full bg-black/60 backdrop-blur-xl text-white/70 uppercase tracking-wider">
                  {flyer.source === "Flyer Diário" ? "Grade" : "Individual"}
                </span>
              </div>
            </button>
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
