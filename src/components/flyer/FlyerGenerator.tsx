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
    showPastTournaments, enabledPeriods, isSettingsModalOpen, activeHelpTooltip,
    showOnlyWithGtd, sortBy, collabLogo, manualStyleRef, isStylePanelOpen,
    batchTrigger, isBatchGenerating, globalStyleReference, isManualModalOpen,
    isSchedulesPanelOpen, compositionAssets
  } = state;

  const {
    setSelectedDay, setSelectedAspectRatio, setSelectedImageSize,
    setSelectedCurrency, setSelectedLanguage, setSelectedImageModel,
    setShowIndividualTournaments, setShowPastTournaments, setEnabledPeriods,
    setIsSettingsModalOpen, setActiveHelpTooltip, setShowOnlyWithGtd, setSortBy,
    setCollabLogo, setManualStyleRef, setIsStylePanelOpen, setIsManualModalOpen,
    setIsSchedulesPanelOpen, setCompositionAssets, setBatchTrigger, setIsBatchGenerating,
    setGlobalStyleReference
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
            icon="calendar"
            title="Semana Expirada"
            description={`A planilha de torneios da semana anterior venceu. Insira uma nova planilha para continuar gerando flyers.${weekScheduleInfo ? ` Última planilha: ${weekScheduleInfo.startDate} a ${weekScheduleInfo.endDate}` : ""}`}
            size="large"
            className="w-full"
          >
            <label className="cursor-pointer group inline-block">
              <div className="bg-primary text-black font-black px-6 py-3 rounded-xl flex items-center justify-center space-x-3 transition-all hover:bg-primary/90 active:scale-95">
                <Icon name="upload" className="w-4 h-4" />
                <span className="text-sm uppercase tracking-wide">
                  Carregar Nova Planilha
                </span>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls"
                onChange={(e) =>
                  e.target.files?.[0] && onFileUpload(e.target.files[0])
                }
              />
            </label>
            {onClearExpiredSchedule && (
              <Button variant="secondary" onClick={onClearExpiredSchedule}>
                Limpar dados antigos
              </Button>
            )}
          </EmptyState>
        ) : (
          <EmptyState
            icon="calendar"
            title="Nenhuma Planilha"
            description="Carregue a planilha de torneios da semana para começar a gerar flyers automaticamente."
            subtitle="Formatos suportados: .xlsx, .xls"
            size="large"
            className="w-full"
          >
            <label className="cursor-pointer group inline-block">
              <div className="bg-primary text-black font-black px-6 py-3 rounded-xl flex items-center justify-center space-x-3 transition-all hover:bg-primary/90 active:scale-95">
                <Icon name="upload" className="w-4 h-4" />
                <span className="text-sm uppercase tracking-wide">
                  Carregar Planilha Excel
                </span>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls"
                onChange={(e) =>
                  e.target.files?.[0] && onFileUpload(e.target.files[0])
                }
              />
            </label>
            <Button
              variant="secondary"
              onClick={() => setIsManualModalOpen(true)}
              icon="edit"
            >
              Adicionar Torneio Manual
            </Button>
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
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 sm:space-y-6 animate-fade-in-up px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="text-left">
                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                  Daily Protocol
                </h2>
                <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">
                  Agrupamento Inteligente
                </p>
              </div>
              {/* Week and day stats inline in header */}
              {events.length > 0 && weekScheduleInfo && (
                <div className="hidden md:flex items-center gap-2">
                  {/* Week stats card */}
                  <button
                    onClick={() =>
                      setIsSchedulesPanelOpen(!isSchedulesPanelOpen)
                    }
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-transparent border border-white/[0.06] rounded-md hover:border-white/[0.1] transition-all"
                  >
                    <Icon
                      name="calendar"
                      className="w-3.5 h-3.5 text-white/30"
                    />
                    <span className="text-[9px] font-bold text-white/50 uppercase">
                      Semana {weekScheduleInfo.startDate} a{" "}
                      {weekScheduleInfo.endDate}
                    </span>
                    <div className="h-3 w-px bg-white/10" />
                    <span className="text-[9px] font-black text-white/50 uppercase">
                      {weekStats.totalTournaments} torneios
                    </span>
                    <span className="text-[9px] font-black text-primary/70 uppercase">
                      {formatCurrencyValue(
                        String(weekStats.totalGtd),
                        selectedCurrency,
                      )}
                    </span>
                    <Icon
                      name={
                        isSchedulesPanelOpen ? "chevron-up" : "chevron-down"
                      }
                      className="w-3 h-3 text-white/30"
                    />
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  setShowIndividualTournaments(!showIndividualTournaments)
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${showIndividualTournaments
                  ? "bg-primary/10 text-primary/80 border border-primary/20"
                  : "bg-transparent border border-white/[0.06] text-white/50 hover:border-white/[0.1] hover:text-white/70"
                  }`}
              >
                <Icon
                  name={showIndividualTournaments ? "zap" : "calendar"}
                  className="w-3 h-3"
                />
                {showIndividualTournaments
                  ? "Grades de Período"
                  : "Torneios Individuais"}
              </button>
              {showIndividualTournaments && (
                <>
                  <button
                    onClick={() => setShowOnlyWithGtd(!showOnlyWithGtd)}
                    className={`px-2.5 py-1.5 rounded-md text-[9px] font-medium transition-all ${showOnlyWithGtd
                      ? "bg-primary/10 text-primary/80 border border-primary/20"
                      : "bg-transparent text-white/40 border border-white/[0.06] hover:text-white/60"
                      }`}
                  >
                    {showOnlyWithGtd
                      ? `Com GTD (${dayStats.withGtd})`
                      : "Só c/ GTD"}
                  </button>
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(e.target.value as "time" | "gtd")
                    }
                    className="px-2.5 py-1.5 rounded-md text-[9px] bg-transparent text-white/50 border border-white/[0.06] outline-none cursor-pointer"
                  >
                    <option value="time">Por Horário</option>
                    <option value="gtd">Por GTD ↓</option>
                  </select>
                </>
              )}
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-transparent border border-white/[0.06] rounded-lg text-[10px] font-bold text-white/50 uppercase tracking-wide hover:border-white/[0.1] hover:text-white/70 transition-all"
              >
                <Icon name="edit" className="w-3 h-3" />
                Add Manual
              </button>
              {/* Upload Spreadsheet - only show when no schedule is loaded */}
              {!weekScheduleInfo && (
                <label className="cursor-pointer group">
                  <div className="bg-transparent border border-white/[0.06] text-white/50 font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-all active:scale-95 text-[10px] tracking-wide uppercase hover:border-white/[0.1] hover:text-white/70">
                    <Icon name="upload" className="w-3 h-3" />
                    <span>Nova Planilha</span>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls"
                    onChange={(e) =>
                      e.target.files?.[0] && onFileUpload(e.target.files[0])
                    }
                  />
                </label>
              )}
              {/* Settings button */}
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="w-9 h-9 rounded-lg bg-transparent border border-white/[0.06] text-white/40 flex items-center justify-center transition-all active:scale-95 hover:border-white/[0.1] hover:text-white/60"
                title="Configurações"
              >
                <Icon name="settings" className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Indicador de referência selecionada */}
          {selectedStyleReference && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-primary/10 border border-primary/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-primary/30 flex-shrink-0">
                  <img
                    src={selectedStyleReference.src}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-wide">
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
            <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 space-y-2 animate-fade-in-up">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-black text-white/50 uppercase tracking-wider">
                  Planilhas Salvas
                </h4>
                <button
                  onClick={() => setIsSchedulesPanelOpen(false)}
                  className="text-white/30 hover:text-white/50"
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
                      className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border transition-all text-left ${isSelected
                        ? "bg-primary/10 border-primary/30"
                        : isCurrentWeek
                          ? "bg-green-500/10 border-green-500/20 hover:border-green-500/40"
                          : isExpired
                            ? "bg-white/[0.02] border-white/[0.05] hover:border-white/[0.08] opacity-60"
                            : "bg-white/[0.02] border-white/[0.05] hover:border-white/[0.08]"
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
                              ? "text-primary"
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
                          <Icon name="check" className="w-3 h-3 text-primary" />
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
            <div className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1 max-w-[200px]">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">
                  Dia Ativo
                </label>
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-primary/30 appearance-none cursor-pointer"
                >
                  {Object.keys(DAY_TRANSLATIONS).map((d) => (
                    <option key={d} value={d}>
                      {DAY_TRANSLATIONS[d]}{" "}
                      {weekScheduleInfo ? `(${getDayDate(d)})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="primary"
                size="small"
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
                isLoading={isBatchGenerating}
                icon="zap"
              >
                Gerar Grade
              </Button>
            </div>
          </div>

          {/* Opções de assets - linha simples igual aos selects */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 -mt-2">
            {/* Logo Colab */}
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">
                  Logo Colab
                </label>
                <button
                  onClick={() =>
                    setActiveHelpTooltip(
                      activeHelpTooltip === "logo" ? null : "logo",
                    )
                  }
                  className="w-4 h-4 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[8px] font-bold text-white/30 hover:text-white/50 transition-all"
                >
                  ?
                </button>
              </div>
              {activeHelpTooltip === "logo" && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setActiveHelpTooltip(null)}
                  />
                  <div className="absolute top-full left-0 mt-1 z-50 bg-[#111] border border-white/[0.06] rounded-lg p-3 w-64 shadow-xl">
                    <p className="text-[10px] font-bold text-white mb-1">
                      Logo de Colaborador
                    </p>
                    <p className="text-[9px] text-white/50 leading-relaxed mb-2">
                      Adicione o logo de um parceiro ou patrocinador que
                      aparecerá junto ao logo principal da marca nos flyers.
                    </p>
                    <p className="text-[8px] text-primary/70 font-medium">
                      Resultado: Logo exibido no canto do flyer, ao lado do logo
                      principal.
                    </p>
                  </div>
                </>
              )}
              <label className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white flex items-center gap-2 cursor-pointer hover:border-white/[0.1] transition-colors group">
                {collabLogo ? (
                  <>
                    <img
                      src={collabLogo}
                      className="w-5 h-5 object-contain rounded"
                    />
                    <span className="flex-1 truncate text-white/60">
                      Logo adicionado
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setCollabLogo(null);
                      }}
                      className="text-white/30 hover:text-red-400 transition-colors"
                    >
                      <Icon name="x" className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <Icon name="upload" className="w-4 h-4 text-white/20" />
                    <span className="text-white/30">Adicionar logo</span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const { dataUrl } = await fileToBase64(f);
                      setCollabLogo(dataUrl);
                    }
                  }}
                />
              </label>
            </div>

            {/* Referência */}
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">
                  Referência
                </label>
                <button
                  onClick={() =>
                    setActiveHelpTooltip(
                      activeHelpTooltip === "ref" ? null : "ref",
                    )
                  }
                  className="w-4 h-4 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[8px] font-bold text-white/30 hover:text-white/50 transition-all"
                >
                  ?
                </button>
              </div>
              {activeHelpTooltip === "ref" && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setActiveHelpTooltip(null)}
                  />
                  <div className="absolute top-full left-0 mt-1 z-50 bg-[#111] border border-white/[0.06] rounded-lg p-3 w-64 shadow-xl">
                    <p className="text-[10px] font-bold text-white mb-1">
                      Imagem de Referência
                    </p>
                    <p className="text-[9px] text-white/50 leading-relaxed mb-2">
                      Envie uma imagem para servir como guia de estilo visual. A
                      IA analisará cores, composição e estética para criar
                      flyers similares.
                    </p>
                    <p className="text-[8px] text-primary/70 font-medium">
                      Resultado: Flyers com visual e estilo inspirados na
                      referência.
                    </p>
                  </div>
                </>
              )}
              <label className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white flex items-center gap-2 cursor-pointer hover:border-white/[0.1] transition-colors group">
                {manualStyleRef ? (
                  <>
                    <img
                      src={manualStyleRef}
                      className="w-5 h-5 object-cover rounded"
                    />
                    <span className="flex-1 truncate text-white/60">
                      Referência ativa
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setManualStyleRef(null);
                        setGlobalStyleReference(null);
                      }}
                      className="text-white/30 hover:text-red-400 transition-colors"
                    >
                      <Icon name="x" className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <Icon name="image" className="w-4 h-4 text-white/20" />
                    <span className="text-white/30">Adicionar estilo</span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
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
              </label>
            </div>

            {/* Ativos */}
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">
                  Ativos
                </label>
                <button
                  onClick={() =>
                    setActiveHelpTooltip(
                      activeHelpTooltip === "assets" ? null : "assets",
                    )
                  }
                  className="w-4 h-4 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[8px] font-bold text-white/30 hover:text-white/50 transition-all"
                >
                  ?
                </button>
              </div>
              {activeHelpTooltip === "assets" && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setActiveHelpTooltip(null)}
                  />
                  <div className="absolute top-full left-0 mt-1 z-50 bg-[#111] border border-white/[0.06] rounded-lg p-3 w-64 shadow-xl">
                    <p className="text-[10px] font-bold text-white mb-1">
                      Ativos de Composição
                    </p>
                    <p className="text-[9px] text-white/50 leading-relaxed mb-2">
                      Adicione elementos visuais como mockups de celular, fotos
                      de pessoas, fichas de poker ou outros assets que serão
                      incorporados na composição do flyer.
                    </p>
                    <p className="text-[8px] text-primary/70 font-medium">
                      Resultado: Elementos integrados harmoniosamente no design
                      final.
                    </p>
                  </div>
                </>
              )}
              <label className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white flex items-center gap-2 cursor-pointer hover:border-white/[0.1] transition-colors">
                {compositionAssets.length > 0 ? (
                  <>
                    <div className="flex -space-x-1">
                      {compositionAssets.slice(0, 3).map((asset, idx) => (
                        <img
                          key={idx}
                          src={(asset as unknown as { preview: string }).preview}
                          className="w-5 h-5 object-cover rounded border border-black"
                        />
                      ))}
                    </div>
                    <span className="flex-1 text-white/60">
                      {compositionAssets.length} ativo
                      {compositionAssets.length > 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setCompositionAssets([]);
                      }}
                      className="text-white/30 hover:text-red-400 transition-colors"
                    >
                      <Icon name="x" className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <Icon name="upload" className="w-4 h-4 text-white/20" />
                    <span className="text-white/30">Mockups, pessoas</span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const { base64, mimeType, dataUrl } =
                        await fileToBase64(f);
                      setCompositionAssets((prev) => [
                        ...prev,
                        { base64, mimeType, preview: dataUrl } as unknown as import("@/types").ImageFile,
                      ]);
                    }
                  }}
                />
              </label>
            </div>

            {/* Favoritos */}
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em]">
                  Favoritos
                </label>
                <button
                  onClick={() =>
                    setActiveHelpTooltip(
                      activeHelpTooltip === "favs" ? null : "favs",
                    )
                  }
                  className="w-4 h-4 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[8px] font-bold text-white/30 hover:text-white/50 transition-all"
                >
                  ?
                </button>
              </div>
              {activeHelpTooltip === "favs" && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setActiveHelpTooltip(null)}
                  />
                  <div className="absolute top-full right-0 mt-1 z-50 bg-[#111] border border-white/[0.06] rounded-lg p-3 w-64 shadow-xl">
                    <p className="text-[10px] font-bold text-white mb-1">
                      Estilos Favoritos
                    </p>
                    <p className="text-[9px] text-white/50 leading-relaxed mb-2">
                      Acesse sua biblioteca de estilos salvos. Favorite flyers
                      da galeria para reutilizar como referência em novas
                      gerações.
                    </p>
                    <p className="text-[8px] text-primary/70 font-medium">
                      Resultado: Aplique estilos consistentes em todas as suas
                      criações.
                    </p>
                  </div>
                </>
              )}
              <button
                onClick={() => setIsStylePanelOpen(!isStylePanelOpen)}
                className={`w-full bg-[#0a0a0a] border rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 transition-colors ${isStylePanelOpen ? "border-primary/30 text-primary" : "border-white/[0.06] text-white/30 hover:border-white/[0.1]"}`}
              >
                <Icon name="layout" className="w-4 h-4" />
                <span>{styleReferences.length} estilos salvos</span>
              </button>
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
                        className="w-full flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border border-white/[0.05] rounded-lg hover:border-white/[0.08] transition-all"
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
              <Card className="w-full max-w-md border-white/[0.06] bg-[#0a0a0a] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.05] flex justify-between items-center">
                  <h3 className="text-[10px] font-black text-white uppercase tracking-wide">
                    Configurações de Geração
                  </h3>
                  <button
                    onClick={() => setIsSettingsModalOpen(false)}
                    className="text-white/20 hover:text-white transition-colors"
                  >
                    <Icon name="x" className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5 space-y-5">
                  {/* Grades a Gerar */}
                  <div className="space-y-2">
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-wide">
                      Grades a Gerar
                    </p>
                    <div className="grid grid-cols-2 gap-2">
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
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all border ${enabledPeriods[period]
                            ? "bg-primary/10 border-primary/30 text-white"
                            : "bg-[#0a0a0a] border-white/[0.05] text-white/40 hover:border-white/[0.08]"
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
                            className="w-3.5 h-3.5 rounded border-white/20 bg-transparent text-primary focus:ring-primary/50 focus:ring-offset-0"
                          />
                          <span className="text-[10px] font-bold">
                            {PERIOD_LABELS[selectedLanguage][period]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Configurações de Imagem */}
                  <div className="space-y-3">
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-wide">
                      Configurações de Imagem
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-bold text-white/40 uppercase tracking-wide">
                          Aspect Ratio
                        </label>
                        <select
                          value={selectedAspectRatio}
                          onChange={(e) =>
                            setSelectedAspectRatio(e.target.value)
                          }
                          className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white outline-none appearance-none cursor-pointer"
                        >
                          <option value="9:16">Vertical (9:16)</option>
                          <option value="1:1">Quadrado (1:1)</option>
                          <option value="16:9">Widescreen (16:9)</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-bold text-white/40 uppercase tracking-wide">
                          Resolução
                        </label>
                        <select
                          value={selectedImageSize}
                          onChange={(e) =>
                            setSelectedImageSize(e.target.value as ImageSize)
                          }
                          disabled={false}
                          className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white outline-none appearance-none cursor-pointer disabled:opacity-20"
                        >
                          <option value="1K">HD (1K)</option>
                          <option value="2K">QuadHD (2K)</option>
                          <option value="4K">UltraHD (4K)</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-bold text-white/40 uppercase tracking-wide">
                          Engine IA
                        </label>
                        <select
                          value={selectedImageModel}
                          onChange={(e) =>
                            setSelectedImageModel(e.target.value as ImageModel)
                          }
                          className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white outline-none appearance-none cursor-pointer"
                        >
                          <option value="gemini-3-pro-image-preview">
                            Gemini 3 Pro
                          </option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-bold text-white/40 uppercase tracking-wide">
                          Moeda
                        </label>
                        <select
                          value={selectedCurrency}
                          onChange={(e) =>
                            setSelectedCurrency(e.target.value as Currency)
                          }
                          className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white outline-none appearance-none cursor-pointer"
                        >
                          <option value="BRL">Real (R$)</option>
                          <option value="USD">Dólar ($)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Idioma */}
                  <div className="space-y-1.5">
                    <label className="text-[8px] font-bold text-white/40 uppercase tracking-wide">
                      Idioma do Texto
                    </label>
                    <select
                      value={selectedLanguage}
                      onChange={(e) =>
                        setSelectedLanguage(e.target.value as "pt" | "en")
                      }
                      className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-lg px-3 py-2 text-xs text-white outline-none appearance-none cursor-pointer"
                    >
                      <option value="pt">Português (BR)</option>
                      <option value="en">English (US)</option>
                    </select>
                  </div>

                  {/* Fechar */}
                  <Button
                    variant="primary"
                    size="small"
                    className="w-full"
                    onClick={() => setIsSettingsModalOpen(false)}
                  >
                    Salvar Configurações
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Painel Lateral Integrado de Favoritos */}
      <div
        className={`bg-[#070707] border-l border-white/5 flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out ${isStylePanelOpen ? "w-80" : "w-0 opacity-0 pointer-events-none"
          }`}
      >
        {isStylePanelOpen && (
          <>
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-gradient-to-b from-[#0d0d0d] to-[#070707]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                  <Icon name="layout" className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-[11px] font-black text-white uppercase tracking-wider">
                    Favoritos
                  </h3>
                  <p className="text-[8px] text-white/30 font-bold uppercase tracking-wide mt-0.5">
                    {styleReferences.length} Estilos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsStylePanelOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all group"
              >
                <Icon
                  name="chevron-up"
                  className="w-4 h-4 rotate-90 group-hover:translate-x-0.5 transition-transform"
                />
              </button>
            </div>

            {/* Info Banner */}
            {selectedStyleReference && (
              <div className="px-6 py-3 bg-primary/10 border-b border-primary/20 flex items-center gap-3">
                <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Icon name="check" className="w-3 h-3 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] font-black text-primary uppercase tracking-wide">
                    Estilo Ativo
                  </p>
                  <p className="text-[9px] text-white/70 truncate font-bold">
                    {selectedStyleReference.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (onClearSelectedStyleReference)
                      onClearSelectedStyleReference();
                  }}
                  className="text-primary/50 hover:text-primary transition-colors"
                >
                  <Icon name="x" className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {styleReferences.length > 0 ? (
                <div className="space-y-3">
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
                        className={`group relative w-full aspect-[4/3] rounded-xl overflow-hidden transition-all cursor-pointer ${isSelected
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-[#070707] scale-[1.02]"
                          : "border border-white/[0.06] hover:border-primary/20 hover:scale-[1.01]"
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
                          <p className="text-[9px] font-black text-white uppercase tracking-wide truncate">
                            {ref.name}
                          </p>
                          <p className="text-[7px] text-white/50 uppercase tracking-wider mt-0.5 font-bold">
                            {new Date(ref.createdAt).toLocaleDateString(
                              "pt-BR",
                              { day: "2-digit", month: "short" },
                            )}
                          </p>
                        </div>

                        {/* Selected Badge */}
                        {isSelected && (
                          <div className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-primary shadow-lg shadow-primary/50 flex items-center justify-center">
                            <Icon name="check" className="w-4 h-4 text-black" />
                          </div>
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon="heart"
                  title="Nenhum Favorito"
                  description="Salve estilos de imagens na galeria para usar aqui como referência visual."
                  size="small"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
