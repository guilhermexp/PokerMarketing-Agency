import React from "react";
import type { GalleryImage } from "../../types";
import { Icon } from "../common/Icon";

export type ViewMode = "gallery" | "references";
export type SourceFilter = "all" | "flyer" | "campaign" | "post" | "video";

export const SOURCE_FILTERS: {
  value: SourceFilter;
  label: string;
  sources: string[];
}[] = [
  { value: "all", label: "Todos", sources: [] },
  { value: "flyer", label: "Flyers", sources: ["Flyer", "Flyer Diário"] },
  { value: "campaign", label: "Campanhas", sources: ["Anúncio", "Post"] },
  { value: "video", label: "Vídeos", sources: ["Video Final", "Video-"] }, // Video- is a prefix match
];

interface GalleryHeaderProps {
  viewMode: ViewMode;
  stats: { total: number; favorites: number; videos: number };
  isSelectMode: boolean;
  isRefreshing: boolean;
  onSetViewMode: (mode: ViewMode) => void;
  onToggleSelectMode: () => void;
  onRefresh: (() => void) | undefined;
  onAddReference: (() => void) | undefined;
  hasDeletePermission: boolean;
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
  viewMode,
  stats,
  isSelectMode,
  isRefreshing,
  onSetViewMode,
  onToggleSelectMode,
  onRefresh,
  onAddReference,
  hasDeletePermission,
}) => {
  return (
    <header className="sticky top-0 bg-black border-b border-border z-50 -mx-4 sm:-mx-6 px-4 sm:px-6">
      <div className="py-4">
        <div
          className="flex justify-between items-start gap-3 mb-6"
          style={{ animation: "fadeSlideIn 0.4s ease-out" }}
        >
          <div>
            <h1 className="text-3xl font-semibold text-white tracking-tight">
              {viewMode === "gallery" ? "Galeria" : "Favoritos"}
            </h1>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">
              {stats.total} {stats.total === 1 ? "item" : "itens"}
              {" • "}
              {stats.favorites} favorito{stats.favorites !== 1 ? "s" : ""}
              {stats.videos > 0 && (
                <>
                  {" • "}
                  {stats.videos} vídeo{stats.videos !== 1 ? "s" : ""}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View mode toggles */}
            <div className="flex items-center gap-1 px-2 py-1.5 bg-black/40 backdrop-blur-2xl border border-border rounded-full">
              <button
                onClick={() => onSetViewMode("gallery")}
                className={`px-2.5 py-1 rounded-full text-[9px] font-medium uppercase tracking-wide transition-all ${
                  viewMode === "gallery"
                    ? "bg-white/10 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => onSetViewMode("references")}
                className={`px-2.5 py-1 rounded-full text-[9px] font-medium uppercase tracking-wide transition-all ${
                  viewMode === "references"
                    ? "bg-white/10 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Favoritos
              </button>
            </div>

            {/* Select mode button - only in gallery mode */}
            {viewMode === "gallery" && hasDeletePermission && (
              <button
                onClick={onToggleSelectMode}
                className={`flex items-center justify-center w-9 h-9 border rounded-lg transition-all active:scale-95 flex-shrink-0 ${
                  isSelectMode
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-transparent border-border text-muted-foreground hover:text-white/70"
                }`}
                title={isSelectMode ? "Cancelar seleção" : "Selecionar múltiplos"}
              >
                <Icon name="check-square" className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Refresh button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center justify-center w-9 h-9 bg-transparent border border-border rounded-lg text-muted-foreground hover:text-white/70 transition-all active:scale-95 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Atualizar galeria"
              >
                <Icon
                  name="refresh-cw"
                  className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </button>
            )}

            {/* Add button - only show in references mode */}
            {viewMode === "references" && onAddReference && (
              <button
                onClick={onAddReference}
                className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 bg-transparent border border-border rounded-full text-[10px] font-bold text-muted-foreground uppercase tracking-wide hover:text-white/70 transition-all active:scale-95 flex-shrink-0"
              >
                <Icon name="plus" className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                <span className="hidden sm:inline">Adicionar</span>
                <span className="sm:hidden">+</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

interface SourceFilterTabsProps {
  images: GalleryImage[];
  sourceFilter: SourceFilter;
  onSetSourceFilter: (filter: SourceFilter) => void;
  isVideo: (img: GalleryImage) => boolean;
}

export const SourceFilterTabs: React.FC<SourceFilterTabsProps> = ({
  images,
  sourceFilter,
  onSetSourceFilter,
  isVideo,
}) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {SOURCE_FILTERS.filter((f) => f.value !== "all").map((filter) => {
        const count =
          filter.value === "video"
            ? images.filter((img) => isVideo(img)).length
            : images.filter((img) =>
                filter.sources.some((source) => img.source === source),
              ).length;

        if (count === 0) return null;

        return (
          <button
            key={filter.value}
            onClick={() => onSetSourceFilter(filter.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium backdrop-blur-2xl border shadow-[0_8px_30px_rgba(0,0,0,0.5)] whitespace-nowrap transition-all ${
              sourceFilter === filter.value
                ? "bg-black/40 border-border text-white/90"
                : "bg-black/40 border-border text-muted-foreground hover:text-white/90"
            }`}
          >
            {filter.label}
            <span className="ml-1.5 text-muted-foreground">{count}</span>
          </button>
        );
      })}
    </div>
  );
};

interface SelectionBarProps {
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onCancel: () => void;
}

export const SelectionBar: React.FC<SelectionBarProps> = ({
  selectedCount,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  onCancel,
}) => {
  return (
    <div className="sticky top-[88px] z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-black/90 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/70">
            {selectedCount} {selectedCount === 1 ? "selecionado" : "selecionados"}
          </span>
          <button
            onClick={onSelectAll}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Selecionar todos
          </button>
          {selectedCount > 0 && (
            <button
              onClick={onClearSelection}
              className="text-xs text-muted-foreground hover:text-white/70 transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onBulkDelete}
            disabled={selectedCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
            Excluir
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-white/70 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
