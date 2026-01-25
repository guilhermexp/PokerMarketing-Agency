import React from "react";
import type {
  BrandProfile,
  TournamentEvent,
  GalleryImage,
  ImageModel,
  ImageSize,
  WeekScheduleInfo,
  StyleReference,
} from "../../types";
import type { InstagramContext } from "../../services/rubeService";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { Icon } from "../common/Icon";
import { EmptyState } from "../common/EmptyState";
import type {
  WeekScheduleWithCount,
} from "../../services/apiClient";

// Check if we're in development mode (QStash won't work locally)
// Imported from utils now

import type { TimePeriod, Currency } from "@/types/flyer.types";
export type { TimePeriod, Currency };

// Helper to download flyer
// const handleDownloadFlyer = (src: string, filename: string) => {
//   downloadImage(src, filename);
// };

import { PeriodCardRow } from "./PeriodCardRow";
import { ManualEventModal } from "./ManualEventModal";
import { fileToBase64, formatCurrencyValue, DAY_TRANSLATIONS, PERIOD_LABELS } from "./utils";
import { TournamentEventCard } from "./TournamentEventCard";
import { useFlyerGenerator } from "./useFlyerGenerator";
import { FlyerGallery } from "./FlyerGallery";

interface FlyerGeneratorProps {
  brandProfile: BrandProfile;
  events: TournamentEvent[];
  weekScheduleInfo: WeekScheduleInfo | null;
  onFileUpload: (file: File) => Promise<void>;
  onAddEvent: (event: TournamentEvent) => void;
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  flyerState: Record<string, (GalleryImage | "loading")[]>;
  setFlyerState: React.Dispatch<
    React.SetStateAction<Record<string, (GalleryImage | "loading")[]>>
  >;
  dailyFlyerState: Record<
    string,
    Record<TimePeriod, (GalleryImage | "loading")[]>
  >;
  setDailyFlyerState: React.Dispatch<
    React.SetStateAction<
      Record<string, Record<TimePeriod, (GalleryImage | "loading")[]>>
    >
  >;
  // Selected flyer per day/period
  selectedDailyFlyerIds?: Record<string, Record<TimePeriod, string | null>>;
  setSelectedDailyFlyerIds?: React.Dispatch<
    React.SetStateAction<Record<string, Record<TimePeriod, string | null>>>
  >;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  onPublishToCampaign: (text: string, flyer: GalleryImage) => void;
  selectedStyleReference?: StyleReference | null;
  onClearSelectedStyleReference?: () => void;
  userId?: string | null;
  styleReferences?: StyleReference[];
  onSelectStyleReference?: (ref: StyleReference) => void;
  isWeekExpired?: boolean;
  onClearExpiredSchedule?: () => void;
  // All schedules list
  allSchedules?: WeekScheduleWithCount[];
  currentScheduleId?: string | null;
  onSelectSchedule?: (schedule: WeekScheduleWithCount) => void;
  // Instagram Multi-tenant
  instagramContext?: InstagramContext;
  // Scheduling
  galleryImages?: GalleryImage[];
  onSchedulePost?: (
    post: Omit<
      import("../../types").ScheduledPost,
      "id" | "createdAt" | "updatedAt"
    >,
  ) => void;
}

export const FlyerGenerator: React.FC<FlyerGeneratorProps> = ({
  brandProfile,
  events,
  weekScheduleInfo,
  onFileUpload,
  onAddEvent,
  onAddImageToGallery,
  flyerState,
  setFlyerState,
  dailyFlyerState,
  setDailyFlyerState,
  selectedDailyFlyerIds = {},
  setSelectedDailyFlyerIds,
  onUpdateGalleryImage,
  onSetChatReference,
  onPublishToCampaign,
  selectedStyleReference,
  onClearSelectedStyleReference,
  styleReferences = [],
  onSelectStyleReference,
  isWeekExpired,
  onClearExpiredSchedule,
  userId,
  allSchedules = [],
  currentScheduleId,
  onSelectSchedule,
  instagramContext,
  galleryImages = [],
  onSchedulePost,
}) => {
  const { state, setters, data, methods } = useFlyerGenerator(events, weekScheduleInfo, setDailyFlyerState);

  const {
    selectedDay, selectedAspectRatio, selectedImageSize, selectedCurrency,
    selectedLanguage, selectedImageModel, showIndividualTournaments,
    showPastTournaments, enabledPeriods, isSettingsModalOpen,
    showOnlyWithGtd, sortBy, collabLogo, manualStyleRef, isStylePanelOpen,
    batchTrigger, isBatchGenerating, globalStyleReference, isManualModalOpen,
    isSchedulesPanelOpen, compositionAssets, isMobilePanelOpen
  } = state;

  const {
    setSelectedDay, setSelectedAspectRatio, setSelectedImageSize,
    setSelectedCurrency, setSelectedLanguage, setSelectedImageModel,
    setShowIndividualTournaments, setShowPastTournaments, setEnabledPeriods,
    setIsSettingsModalOpen, setShowOnlyWithGtd, setSortBy,
    setCollabLogo, setManualStyleRef, setIsStylePanelOpen, setIsManualModalOpen,
    setIsSchedulesPanelOpen, setCompositionAssets, setBatchTrigger, setIsBatchGenerating,
    setGlobalStyleReference, setIsMobilePanelOpen
  } = setters;

  const { currentEvents, dayStats, weekStats, currentDayName, pastEvents, upcomingEvents } = data;

  const { getEventsForPeriod, getDayDate, getScheduleDate } = methods;

  const handleSetStyleReference = (image: GalleryImage) => {
    if (onSelectStyleReference) {
      onSelectStyleReference({
        id: image.id,
        src: image.src,
        prompt: image.prompt,
        source: "Historic",
        name: `Estilo ${new Date().toLocaleTimeString()}`,
        createdAt: Date.now(),
        model: image.model as ImageModel,
        aspectRatio: image.aspectRatio,
        imageSize: image.imageSize,
      });
    }
  };

  // Sync selectedStyleReference to globalStyleReference
  React.useEffect(() => {
    if (selectedStyleReference) {
      setGlobalStyleReference({
        id: selectedStyleReference.id,
        src: selectedStyleReference.src,
        prompt: selectedStyleReference.prompt || selectedStyleReference.name,
        source: selectedStyleReference.source || "Favorito",
        model: (selectedStyleReference.model as ImageModel) || selectedImageModel,
        aspectRatio: selectedStyleReference.aspectRatio,
        imageSize: selectedStyleReference.imageSize,
      });
    } else {
      // Clear globalStyleReference when selectedStyleReference is removed
      setGlobalStyleReference(null);
    }
  }, [selectedStyleReference, selectedImageModel, setGlobalStyleReference]);

  // Download all images as a ZIP file
  const handleDownloadAllImages = async (images: GalleryImage[], title: string) => {
    if (images.length === 0) return;

    try {
      const loadJSZip = async () => {
        try {
          const JSZip = await import('jszip');
          return JSZip.default;
        } catch {
          return null;
        }
      };

      const JSZip = await loadJSZip();

      if (JSZip && images.length > 1) {
        // Create ZIP with all images
        const zip = new JSZip();
        const folder = zip.folder(title.replace(/[^a-zA-Z0-9]/g, '_')) || zip;

        await Promise.all(
          images.map(async (img, idx) => {
            try {
              const response = await fetch(img.src);
              const blob = await response.blob();
              const extension = blob.type.includes('png') ? 'png' : 'jpg';
              const filename = `flyer-${idx + 1}.${extension}`;
              folder.file(filename, blob);
            } catch (err) {
              console.error(`Failed to fetch image ${idx}:`, err);
            }
          })
        );

        const content = await zip.generateAsync({ type: 'blob' });

        // Trigger download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}-flyers.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      } else {
        // Fallback: download images individually
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          try {
            const response = await fetch(img.src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const extension = blob.type.includes('png') ? 'png' : 'jpg';
            link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}-flyer-${i + 1}.${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            // Small delay between downloads
            if (i < images.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (err) {
            console.error(`Failed to download image ${i}:`, err);
          }
        }
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const hasNoData = events.length === 0 && !weekScheduleInfo;
  const showEmptyState = hasNoData || isWeekExpired;

  if (showEmptyState) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isWeekExpired ? (
          <EmptyState
            title="Semana Expirada"
            description={`A planilha de torneios da semana anterior venceu. Insira uma nova planilha para continuar gerando flyers.${weekScheduleInfo ? ` Última planilha: ${weekScheduleInfo.startDate} a ${weekScheduleInfo.endDate}` : ""}`}
            size="large"
            className="w-full"
          >
            <label className="cursor-pointer group inline-block">
              <div className="bg-black/40 backdrop-blur-2xl border border-white/10 text-white/90 font-medium px-6 py-3 rounded-full flex items-center justify-center gap-3 transition-all hover:border-white/30 hover:text-white active:scale-95 shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
                <Icon name="upload" className="w-4 h-4" />
                <span className="text-sm">
                  Carregar Nova Planilha
                </span>
              </div>
              <input
                type="file"
                className="hidden outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                accept=".xlsx,.xls"
                onChange={(e) =>
                  e.target.files?.[0] && onFileUpload(e.target.files[0])
                }
              />
            </label>
            {onClearExpiredSchedule && (
              <button
                onClick={onClearExpiredSchedule}
                className="bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 font-medium px-6 py-3 rounded-full transition-all hover:border-white/30 hover:text-white/90 active:scale-95 shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                Limpar dados antigos
              </button>
            )}
          </EmptyState>
        ) : (
          <EmptyState
            title="Nenhuma Planilha"
            description="Carregue a planilha de torneios da semana para começar a gerar flyers automaticamente."
            subtitle="Formatos suportados: .xlsx, .xls"
            size="large"
            className="w-full"
          >
            <label className="cursor-pointer group inline-block">
              <div className="bg-black/40 backdrop-blur-2xl border border-white/10 text-white/90 font-medium px-6 py-3 rounded-full flex items-center justify-center gap-3 transition-all hover:border-white/30 hover:text-white active:scale-95 shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
                <Icon name="upload" className="w-4 h-4" />
                <span className="text-sm">
                  Carregar Planilha Excel
                </span>
              </div>
              <input
                type="file"
                className="hidden outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                accept=".xlsx,.xls"
                onChange={(e) =>
                  e.target.files?.[0] && onFileUpload(e.target.files[0])
                }
              />
            </label>
            <button
              onClick={() => setIsManualModalOpen(true)}
              className="flex items-center gap-2 bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 font-medium px-6 py-3 rounded-full transition-all hover:border-white/30 hover:text-white/90 active:scale-95 shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <Icon name="edit" className="w-4 h-4" />
              Adicionar Torneio Manual
            </button>
          </EmptyState>
        )}

        {/* Manual modal still needs to be available */}
        <ManualEventModal
          isOpen={isManualModalOpen}
          onClose={() => setIsManualModalOpen(false)}
          onSave={(ev) => onAddEvent(ev)}
          day={currentDayName}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full relative">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 sm:space-y-6 animate-fade-in-up px-4 sm:px-6 py-4 sm:py-5">
          {/* Header */}
          <div className="flex flex-col gap-4">
            {/* Title row */}
            <div className="flex justify-between items-start gap-3">
              <div className="text-left min-w-0 flex-1">
                <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                  Daily Protocol
                </h2>
                <p className="text-[10px] sm:text-[11px] text-white/30 uppercase tracking-wider mt-1">
                  {events.length > 0 && weekScheduleInfo ? (
                    <>
                      <span className="hidden sm:inline">Semana </span>{weekScheduleInfo.startDate} a {weekScheduleInfo.endDate}
                      {" • "}
                      {weekStats.totalTournaments} torneios
                      <span className="hidden sm:inline">
                        {" • "}
                        {formatCurrencyValue(String(weekStats.totalGtd), selectedCurrency)}
                      </span>
                    </>
                  ) : (
                    "Agrupamento Inteligente"
                  )}
                </p>
              </div>
              {/* Mobile action buttons */}
              <div className="flex items-center gap-2 lg:hidden">
                <button
                  onClick={() => setIsMobilePanelOpen(true)}
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 flex items-center justify-center transition-all active:scale-95"
                  title="Galeria"
                >
                  <Icon name="image" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 flex items-center justify-center transition-all active:scale-95"
                  title="Configurações"
                >
                  <Icon name="settings" className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  setShowIndividualTournaments(!showIndividualTournaments)
                }
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all backdrop-blur-2xl border shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${showIndividualTournaments
                  ? "bg-black/40 border-white/10 text-white/90"
                  : "bg-black/40 border-white/10 text-white/60 hover:text-white/90 hover:border-white/30"
                  }`}
              >
                <Icon
                  name={showIndividualTournaments ? "zap" : "calendar"}
                  className="w-3 h-3"
                />
                <span className="hidden sm:inline">
                  {showIndividualTournaments ? "Grades de Período" : "Torneios Individuais"}
                </span>
                <span className="sm:hidden">
                  {showIndividualTournaments ? "Grades" : "Torneios"}
                </span>
              </button>
              {showIndividualTournaments && (
                <>
                  <button
                    onClick={() => setShowOnlyWithGtd(!showOnlyWithGtd)}
                    className={`px-3 py-2 rounded-full text-xs font-medium transition-all backdrop-blur-2xl border shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${showOnlyWithGtd
                      ? "bg-black/40 border-white/10 text-white/90"
                      : "bg-black/40 border-white/10 text-white/60 hover:text-white/90 hover:border-white/30"
                      }`}
                  >
                    {showOnlyWithGtd
                      ? `GTD (${dayStats.withGtd})`
                      : "Só GTD"}
                  </button>
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as "time" | "gtd")
                    }
                    className="px-3 py-2 rounded-full text-xs bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 outline-none cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.5)] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <option value="time">Horário</option>
                    <option value="gtd">GTD ↓</option>
                  </select>
                </>
              )}
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-xs sm:text-sm font-medium text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                <Icon name="edit" className="w-4 h-4" />
                <span className="hidden sm:inline">Add Manual</span>
              </button>
              {/* Upload Spreadsheet - only show when no schedule is loaded */}
              {!weekScheduleInfo && (
                <label className="cursor-pointer group">
                  <div className="bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 hover:text-white/90 hover:border-white/30 font-medium px-3 sm:px-4 py-2 rounded-full flex items-center gap-2 transition-all active:scale-95 text-xs sm:text-sm shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
                    <Icon name="upload" className="w-4 h-4" />
                    <span className="hidden sm:inline">Nova Planilha</span>
                  </div>
                  <input
                    type="file"
                    className="hidden outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    accept=".xlsx,.xls"
                    onChange={(e) =>
                      e.target.files?.[0] && onFileUpload(e.target.files[0])
                    }
                  />
                </label>
              )}

              {/* Settings button - hidden on mobile (shown in header) */}
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="hidden lg:flex w-10 h-10 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 items-center justify-center transition-all active:scale-95 hover:border-white/30 hover:text-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                title="Configurações"
              >
                <Icon name="settings" className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Indicador de referência selecionada */}
          {selectedStyleReference && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white/5 border border-white/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/20 flex-shrink-0">
                  <img
                    src={selectedStyleReference.src}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/90 uppercase tracking-wide">
                    Referência Ativa
                  </p>
                  <p className="text-[9px] text-white/50">
                    {selectedStyleReference.name}
                  </p>
                </div>
              </div>
              <Button
                size="small"
                variant="secondary"
                onClick={onClearSelectedStyleReference}
                icon="x"
              >
                Remover
              </Button>
            </div>
          )}

          {/* Lista de planilhas salvas */}
          {isSchedulesPanelOpen && allSchedules.length > 0 && (
            <div className="bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 space-y-2 animate-fade-in-up shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-white/70">
                  Planilhas Salvas
                </h4>
                <button
                  onClick={() => setIsSchedulesPanelOpen(false)}
                  className="text-white/30 hover:text-white/50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded"
                >
                  <Icon name="x" className="w-3 h-3" />
                </button>
              </div>
              <div className="grid gap-2 max-h-48 overflow-y-auto">
                {allSchedules.map((schedule) => {
                  const startDate = new Date(schedule.start_date);
                  const endDate = new Date(schedule.end_date);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isCurrentWeek = today >= startDate && today <= endDate;
                  const isExpired = today > endDate;
                  const isSelected = currentScheduleId === schedule.id;

                  const formatDate = (date: Date) => {
                    const day = String(date.getDate()).padStart(2, "0");
                    const month = String(date.getMonth() + 1).padStart(2, "0");
                    return `${day}/${month}`;
                  };

                  return (
                    <button
                      key={schedule.id}
                      onClick={() => onSelectSchedule?.(schedule)}
                      className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-all text-left outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${isSelected
                        ? "bg-white/5 border-white/20"
                        : isCurrentWeek
                          ? "bg-green-500/10 border-green-500/20 hover:border-green-500/40"
                          : isExpired
                            ? "bg-black/20 border-white/5 hover:border-white/10 opacity-60"
                            : "bg-black/20 border-white/5 hover:border-white/10"
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isCurrentWeek
                            ? "bg-green-500/20"
                            : isExpired
                              ? "bg-white/5"
                              : "bg-white/5"
                            }`}
                        >
                          <Icon
                            name="calendar"
                            className={`w-4 h-4 ${isCurrentWeek ? "text-green-500" : "text-white/30"
                              }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <p
                            className={`text-[10px] font-bold truncate ${isSelected
                              ? "text-white/90"
                              : isCurrentWeek
                                ? "text-green-400"
                                : "text-white/70"
                              }`}
                          >
                            {formatDate(startDate)} - {formatDate(endDate)}
                          </p>
                          <p className="text-[8px] text-white/30 truncate">
                            {schedule.filename || "Planilha"} •{" "}
                            {schedule.event_count} torneios
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isCurrentWeek && (
                          <span className="text-[7px] font-black text-green-400 bg-green-500/20 px-1.5 py-0.5 rounded uppercase">
                            Atual
                          </span>
                        )}
                        {isExpired && !isCurrentWeek && (
                          <span className="text-[7px] font-black text-white/30 bg-white/5 px-1.5 py-0.5 rounded uppercase">
                            Expirada
                          </span>
                        )}
                        {isSelected && (
                          <Icon name="check" className="w-3 h-3 text-white/90" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Linha de controles simplificada */}
            <div className="flex flex-wrap items-end gap-2 sm:gap-3">
              <div className="space-y-1.5 flex-1 min-w-[140px] max-w-[200px]">
                <label className="text-[9px] sm:text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                  Dia Ativo
                </label>
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="w-full bg-black/40 backdrop-blur-2xl border border-white/10 rounded-xl px-3 sm:px-4 py-2 text-xs text-white outline-none appearance-none cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.5)] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  {Object.keys(DAY_TRANSLATIONS).map((d) => (
                    <option key={d} value={d}>
                      {DAY_TRANSLATIONS[d]}{" "}
                      {weekScheduleInfo ? `(${getDayDate(d)})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Logo Colab button */}
                <label className="relative cursor-pointer group" title="Logo Colaborador">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 flex items-center justify-center transition-all active:scale-95 hover:border-white/30 hover:text-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
                    {collabLogo ? (
                      <img src={collabLogo} className="w-4 h-4 sm:w-5 sm:h-5 object-contain rounded" />
                    ) : (
                      <Icon name="briefcase" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const { dataUrl } = await fileToBase64(f);
                        setCollabLogo(dataUrl);
                      }
                    }}
                  />
                  {collabLogo && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setCollabLogo(null);
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      ×
                    </button>
                  )}
                </label>

                {/* Referência button */}
                <label className="relative cursor-pointer group" title="Referência de Estilo">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 flex items-center justify-center transition-all active:scale-95 hover:border-white/30 hover:text-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
                    {manualStyleRef ? (
                      <img src={manualStyleRef} className="w-4 h-4 sm:w-5 sm:h-5 object-cover rounded" />
                    ) : (
                      <Icon name="image" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const { dataUrl } = await fileToBase64(f);
                        setManualStyleRef(dataUrl);
                        setGlobalStyleReference({
                          id: "manual-ref",
                          src: dataUrl,
                          prompt: "Estilo Manual",
                          source: "Edição",
                          model: selectedImageModel,
                        });
                      }
                    }}
                  />
                  {manualStyleRef && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setManualStyleRef(null);
                        setGlobalStyleReference(null);
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      ×
                    </button>
                  )}
                </label>

                {/* Ativos button */}
                <label className="relative cursor-pointer group" title="Ativos de Composição">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/40 backdrop-blur-2xl border border-white/10 text-white/60 flex items-center justify-center transition-all active:scale-95 hover:border-white/30 hover:text-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
                    {compositionAssets.length > 0 ? (
                      <span className="text-[9px] sm:text-[10px] font-bold text-white/90">{compositionAssets.length}</span>
                    ) : (
                      <Icon name="layers" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const { base64, mimeType, dataUrl } = await fileToBase64(f);
                        setCompositionAssets((prev) => [
                          ...prev,
                          { base64, mimeType, preview: dataUrl } as unknown as import("@/types").ImageFile,
                        ]);
                      }
                    }}
                  />
                  {compositionAssets.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setCompositionAssets([]);
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      ×
                    </button>
                  )}
                </label>

                <button
                  onClick={() => {
                    setIsBatchGenerating(true);
                    // Clear only the current day's flyers
                    setDailyFlyerState((prev) => ({
                      ...prev,
                      [selectedDay]: {
                        ALL: [],
                        MORNING: [],
                        AFTERNOON: [],
                        NIGHT: [],
                        HIGHLIGHTS: [],
                      },
                    }));
                    setBatchTrigger(true);
                    setTimeout(() => {
                      setBatchTrigger(false);
                      setIsBatchGenerating(false);
                    }, 1500);
                  }}
                  disabled={isBatchGenerating}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-xs sm:text-sm font-medium text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  <Icon name="zap" className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                  <span className="hidden sm:inline">{isBatchGenerating ? "Gerando..." : "Gerar Grade"}</span>
                  <span className="sm:hidden">{isBatchGenerating ? "..." : "Grade"}</span>
                </button>
              </div>
            </div>
          </div>

          {!showIndividualTournaments ? (
            <div className="space-y-2">
              {(
                [
                  "ALL",
                  "MORNING",
                  "AFTERNOON",
                  "NIGHT",
                  "HIGHLIGHTS",
                ] as TimePeriod[]
              )
                .filter((p) => enabledPeriods[p])
                .map((p) => (
                  <PeriodCardRow
                    key={p}
                    period={p}
                    label={PERIOD_LABELS[selectedLanguage][p]}
                    dayInfo={`${DAY_TRANSLATIONS[selectedDay]} ${getDayDate(selectedDay)}`}
                    selectedDay={selectedDay}
                    scheduleDate={getScheduleDate(selectedDay)}
                    events={getEventsForPeriod(p)}
                    brandProfile={brandProfile}
                    aspectRatio={selectedAspectRatio}
                    currency={selectedCurrency}
                    model={selectedImageModel}
                    imageSize={selectedImageSize}
                    language={selectedLanguage}
                    scheduleId={weekScheduleInfo?.id}
                    onAddImageToGallery={onAddImageToGallery}
                    onUpdateGalleryImage={onUpdateGalleryImage}
                    onSetChatReference={onSetChatReference}
                    generatedFlyers={dailyFlyerState[selectedDay]?.[p] || []}
                    setGeneratedFlyers={(u) =>
                      setDailyFlyerState((prev) => ({
                        ...prev,
                        [selectedDay]: {
                          ...(prev[selectedDay] || {
                            ALL: [],
                            MORNING: [],
                            AFTERNOON: [],
                            NIGHT: [],
                            HIGHLIGHTS: [],
                          }),
                          [p]: u(prev[selectedDay]?.[p] || []),
                        },
                      }))
                    }
                    triggerBatch={batchTrigger}
                    styleReference={globalStyleReference}
                    onCloneStyle={handleSetStyleReference}
                    collabLogo={collabLogo}
                    compositionAssets={compositionAssets}
                    onPublishToCampaign={onPublishToCampaign}
                    userId={userId}
                    instagramContext={instagramContext}
                    galleryImages={galleryImages}
                    onSchedulePost={onSchedulePost}
                    onDownloadAll={handleDownloadAllImages}
                    externalSelectedFlyerId={selectedDailyFlyerIds[selectedDay]?.[p] || null}
                    onExternalSelectFlyer={setSelectedDailyFlyerIds ? (flyerId) => {
                      setSelectedDailyFlyerIds(prev => ({
                        ...prev,
                        [selectedDay]: {
                          ...(prev[selectedDay] || { ALL: null, MORNING: null, AFTERNOON: null, NIGHT: null, HIGHLIGHTS: null }),
                          [p]: flyerId,
                        },
                      }));
                    } : undefined}
                  />
                ))}
            </div>
          ) : (
            <div className="space-y-2">
              {currentEvents.length > 0 ? (
                <>
                  {/* Past tournaments - collapsible */}
                  {pastEvents.length > 0 && (
                    <div className="mb-4">
                      <button
                        onClick={() =>
                          setShowPastTournaments(!showPastTournaments)
                        }
                        className="w-full flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            name="clock"
                            className="w-3.5 h-3.5 text-white/30"
                          />
                          <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            {pastEvents.length} torneio
                            {pastEvents.length > 1 ? "s" : ""} já iniciado
                            {pastEvents.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        <Icon
                          name={
                            showPastTournaments ? "chevron-up" : "chevron-down"
                          }
                          className="w-4 h-4 text-white/30"
                        />
                      </button>
                      {showPastTournaments && (
                        <div className="mt-2 space-y-2 opacity-60">
                          {pastEvents.map((e) => (
                            <TournamentEventCard
                              key={e.id}
                              event={e}
                              brandProfile={brandProfile}
                              aspectRatio={selectedAspectRatio}
                              currency={selectedCurrency}
                              language={selectedLanguage}
                              model={selectedImageModel}
                              imageSize={selectedImageSize}
                              onAddImageToGallery={onAddImageToGallery}
                              onUpdateGalleryImage={onUpdateGalleryImage}
                              onSetChatReference={onSetChatReference}
                              generatedFlyers={flyerState[e.id] || []}
                              setGeneratedFlyers={(u) =>
                                setFlyerState((prev) => ({
                                  ...prev,
                                  [e.id]: u(prev[e.id] || []),
                                }))
                              }
                              collabLogo={collabLogo}
                              styleReference={globalStyleReference}
                              compositionAssets={compositionAssets}
                              onPublishToCampaign={onPublishToCampaign}
                              userId={userId}
                              instagramContext={instagramContext}
                              galleryImages={galleryImages}
                              onSchedulePost={onSchedulePost}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Upcoming tournaments */}
                  {upcomingEvents.length > 0 ? (
                    upcomingEvents.map((e) => (
                      <TournamentEventCard
                        key={e.id}
                        event={e}
                        brandProfile={brandProfile}
                        aspectRatio={selectedAspectRatio}
                        currency={selectedCurrency}
                        language={selectedLanguage}
                        model={selectedImageModel}
                        imageSize={selectedImageSize}
                        onAddImageToGallery={onAddImageToGallery}
                        onUpdateGalleryImage={onUpdateGalleryImage}
                        onSetChatReference={onSetChatReference}
                        generatedFlyers={flyerState[e.id] || []}
                        setGeneratedFlyers={(u) =>
                          setFlyerState((prev) => ({
                            ...prev,
                            [e.id]: u(prev[e.id] || []),
                          }))
                        }
                        collabLogo={collabLogo}
                        styleReference={globalStyleReference}
                        compositionAssets={compositionAssets}
                        onPublishToCampaign={onPublishToCampaign}
                        userId={userId}
                        instagramContext={instagramContext}
                        galleryImages={galleryImages}
                        onSchedulePost={onSchedulePost}
                      />
                    ))
                  ) : pastEvents.length > 0 ? (
                    <p className="text-white/20 text-xs font-bold uppercase tracking-wide text-center py-8">
                      Todos os torneios de hoje já iniciaram.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-white/20 text-xs font-bold uppercase tracking-wide text-center py-12">
                  Nenhum torneio detectado para este dia.
                </p>
              )}
            </div>
          )}
          <ManualEventModal
            isOpen={isManualModalOpen}
            onClose={() => setIsManualModalOpen(false)}
            onSave={(ev) => onAddEvent(ev)}
            day={selectedDay}
          />

          {/* Settings Modal */}
          {isSettingsModalOpen && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
              <Card className="w-full max-w-md border-white/10 bg-black/60 backdrop-blur-2xl overflow-hidden shadow-[0_25px_90px_rgba(0,0,0,0.7)]">
                <div className="px-6 py-5 border-b border-white/10 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Configurações de Geração
                  </h3>
                  <button
                    onClick={() => setIsSettingsModalOpen(false)}
                    className="text-white/40 hover:text-white/80 transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded"
                  >
                    <Icon name="x" className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-6">
                  {/* Grades a Gerar */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                      Grades a Gerar
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      {(
                        [
                          "ALL",
                          "MORNING",
                          "AFTERNOON",
                          "NIGHT",
                          "HIGHLIGHTS",
                        ] as TimePeriod[]
                      ).map((period) => (
                        <label
                          key={period}
                          className={`flex items-center gap-2.5 px-4 py-3 rounded-xl cursor-pointer transition-all border ${enabledPeriods[period]
                            ? "bg-white/[0.08] border-white/30 text-white"
                            : "bg-white/[0.02] border-white/10 text-white/50 hover:border-white/20 hover:bg-white/[0.04]"
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={enabledPeriods[period]}
                            onChange={(e) =>
                              setEnabledPeriods((prev) => ({
                                ...prev,
                                [period]: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 rounded border-white/30 bg-transparent text-white outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                          />
                          <span className="text-sm font-semibold">
                            {PERIOD_LABELS[selectedLanguage][period]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Configurações de Imagem */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                      Configurações de Imagem
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                          Aspect Ratio
                        </label>
                        <select
                          value={selectedAspectRatio}
                          onChange={(e) =>
                            setSelectedAspectRatio(e.target.value)
                          }
                          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none appearance-none cursor-pointer hover:border-white/20 hover:bg-white/[0.05] transition-all focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        >
                          <option value="9:16">Vertical (9:16)</option>
                          <option value="1:1">Quadrado (1:1)</option>
                          <option value="16:9">Widescreen (16:9)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                          Resolução
                        </label>
                        <select
                          value={selectedImageSize}
                          onChange={(e) =>
                            setSelectedImageSize(e.target.value as ImageSize)
                          }
                          disabled={false}
                          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none appearance-none cursor-pointer hover:border-white/20 hover:bg-white/[0.05] transition-all disabled:opacity-20 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        >
                          <option value="1K">HD (1K)</option>
                          <option value="2K">QuadHD (2K)</option>
                          <option value="4K">UltraHD (4K)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                          Engine IA
                        </label>
                        <select
                          value={selectedImageModel}
                          onChange={(e) =>
                            setSelectedImageModel(e.target.value as ImageModel)
                          }
                          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none appearance-none cursor-pointer hover:border-white/20 hover:bg-white/[0.05] transition-all focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        >
                          <option value="gemini-3-pro-image-preview">
                            Gemini 3 Pro
                          </option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                          Moeda
                        </label>
                        <select
                          value={selectedCurrency}
                          onChange={(e) =>
                            setSelectedCurrency(e.target.value as Currency)
                          }
                          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none appearance-none cursor-pointer hover:border-white/20 hover:bg-white/[0.05] transition-all focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        >
                          <option value="BRL">Real (R$)</option>
                          <option value="USD">Dólar ($)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Idioma */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                      Idioma do Texto
                    </label>
                    <select
                      value={selectedLanguage}
                      onChange={(e) =>
                        setSelectedLanguage(e.target.value as "pt" | "en")
                      }
                      className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 outline-none appearance-none cursor-pointer hover:border-white/20 hover:bg-white/[0.05] transition-all focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    >
                      <option value="pt">Português (BR)</option>
                      <option value="en">English (US)</option>
                    </select>
                  </div>

                  {/* Fechar */}
                  <button
                    onClick={() => setIsSettingsModalOpen(false)}
                    className="w-full bg-white/[0.08] hover:bg-white/[0.12] border border-white/20 text-white font-bold text-sm py-3 rounded-xl transition-all active:scale-[0.98] hover:border-white/30 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    Salvar Configurações
                  </button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobilePanelOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsMobilePanelOpen(false)}
        />
      )}

      {/* Painel Lateral Integrado */}
      <div className={`
        fixed lg:relative inset-y-0 right-0 z-50 lg:z-auto
        w-[85%] sm:w-80 bg-black/95 lg:bg-black/60 backdrop-blur-2xl border-l border-white/10
        flex flex-col flex-shrink-0
        transform transition-transform duration-300 ease-in-out
        ${isMobilePanelOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Tab Switcher */}
        <div className="px-4 sm:px-6 py-3 border-b border-white/10 bg-black/40">
          {/* Mobile close button */}
          <div className="flex items-center justify-between mb-2 lg:hidden">
            <h3 className="text-sm font-semibold text-white">Painel</h3>
            <button
              onClick={() => setIsMobilePanelOpen(false)}
              className="w-8 h-8 rounded-full bg-white/10 text-white/60 flex items-center justify-center"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsStylePanelOpen(true)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${
                isStylePanelOpen
                  ? "bg-white/10 text-white/90"
                  : "text-white/40 hover:text-white/60 hover:bg-white/5"
              }`}
            >
              <Icon name="heart" className="w-3.5 h-3.5" />
              Favoritos
            </button>
            <button
              onClick={() => setIsStylePanelOpen(false)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${
                !isStylePanelOpen
                  ? "bg-white/10 text-white/90"
                  : "text-white/40 hover:text-white/60 hover:bg-white/5"
              }`}
            >
              <Icon name="image" className="w-3.5 h-3.5" />
              Galeria
            </button>
          </div>
        </div>

        {isStylePanelOpen ? (
          <>
            {/* Favoritos Header */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-white/10 bg-black/40">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Favoritos
                </h3>
                <p className="text-xs text-white/40 mt-0.5">
                  {styleReferences.length} Estilos
                </p>
              </div>
              <p className="text-[10px] text-white/50 mt-3 leading-relaxed">
                Para garantir melhor qualidade e padrão use sempre um favorito como referência
              </p>
            </div>

            {/* Info Banner */}
            {selectedStyleReference && (
              <div className="px-4 sm:px-6 py-2 sm:py-3 bg-white/5 border-b border-white/10 flex items-center gap-3">
                <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon name="check" className="w-3 h-3 text-white/90" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-white/90 uppercase tracking-wider">
                    Estilo Ativo
                  </p>
                  <p className="text-xs text-white/70 truncate font-medium">
                    {selectedStyleReference.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (onClearSelectedStyleReference)
                      onClearSelectedStyleReference();
                  }}
                  className="text-white/50 hover:text-white/90 transition-colors outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
              {styleReferences.length > 0 ? (
                <div className="space-y-2 sm:space-y-3">
                  {styleReferences.map((ref) => {
                    const isSelected = selectedStyleReference?.id === ref.id;
                    return (
                      <button
                        key={ref.id}
                        onClick={() => {
                          if (onSelectStyleReference) {
                            onSelectStyleReference(ref);
                          }
                        }}
                        className={`group relative w-full aspect-[4/3] rounded-xl overflow-hidden transition-all cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ${isSelected
                          ? "ring-2 ring-white/30 ring-offset-2 ring-offset-[#070707] scale-[1.02]"
                          : "border border-white/[0.06] hover:border-white/10 hover:scale-[1.01]"
                          }`}
                      >
                        <img
                          src={ref.src}
                          className="w-full h-full object-cover"
                          alt={ref.name}
                        />

                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                        {/* Info */}
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-[10px] font-semibold text-white truncate">
                            {ref.name}
                          </p>
                          <p className="text-[9px] text-white/50 mt-0.5 font-medium">
                            {new Date(ref.createdAt).toLocaleDateString(
                              "pt-BR",
                              { day: "2-digit", month: "short" },
                            )}
                          </p>
                        </div>

                        {/* Selected Badge */}
                        {isSelected && (
                          <div className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/10 shadow-lg shadow-white/50 flex items-center justify-center">
                            <Icon name="check" className="w-4 h-4 text-black" />
                          </div>
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="Nenhum Favorito"
                  description="Salve estilos de imagens na galeria para usar aqui como referência visual."
                  size="small"
                />
              )}
            </div>
          </>
        ) : (
          <FlyerGallery
            flyerState={flyerState}
            dailyFlyerState={dailyFlyerState}
            galleryImages={galleryImages}
            onUpdateGalleryImage={onUpdateGalleryImage}
            onSetChatReference={onSetChatReference}
            selectedDay={selectedDay}
            weekScheduleInfo={weekScheduleInfo}
            selectedDailyFlyerIds={selectedDailyFlyerIds}
          />
        )}
      </div>
    </div>
  );
};
