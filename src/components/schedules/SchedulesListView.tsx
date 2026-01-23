import React from "react";
import { Icon } from "../common/Icon";
import { ManualEventModal } from "../common/ManualEventModal";
import type { WeekScheduleWithCount } from "../../services/apiClient";
import type { TournamentEvent } from "../../types";

interface SchedulesListViewProps {
  schedules: WeekScheduleWithCount[];
  onSelectSchedule: (schedule: WeekScheduleWithCount) => void;
  onFileUpload: (file: File) => Promise<void>;
  currentScheduleId?: string | null;
  onEnterAfterUpload?: () => void;
  onDeleteSchedule?: (scheduleId: string) => void;
  onAddEvent?: (event: TournamentEvent) => void;
}

export const SchedulesListView: React.FC<SchedulesListViewProps> = ({
  schedules,
  onSelectSchedule,
  onFileUpload,
  currentScheduleId,
  onEnterAfterUpload,
  onDeleteSchedule,
  onAddEvent,
}) => {
  const [isUploading, setIsUploading] = React.useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = React.useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.debug("[SchedulesListView] File selected:", file?.name);
    if (!file) return;

    setIsUploading(true);
    try {
      console.debug("[SchedulesListView] Calling onFileUpload...");
      await onFileUpload(file);
      console.debug("[SchedulesListView] Upload complete, entering schedule...");
      onEnterAfterUpload?.();
    } catch (err) {
      console.error("[SchedulesListView] Failed to upload file:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
  };

  const getWeekStatus = (schedule: WeekScheduleWithCount) => {
    const startDate = new Date(schedule.start_date);
    const endDate = new Date(schedule.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (today >= startDate && today <= endDate) {
      return "current";
    } else if (today > endDate) {
      return "expired";
    }
    return "future";
  };

  // Sort schedules by date descending
  const sortedSchedules = [...schedules].sort((a, b) => {
    return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
  });

  if (schedules.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
          <div>
            <h1 className="text-3xl font-semibold text-white tracking-tight">
              Lista de Torneios
            </h1>
            <p className="text-sm text-white/50 mt-2">
              0 semanas salvas
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onAddEvent && (
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
              >
                <Icon name="edit" className="w-4 h-4" />
                Torneio Manual
              </button>
            )}
            <label
              className={`cursor-pointer ${isUploading ? "pointer-events-none opacity-70" : ""}`}
            >
              <span className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                <Icon name="upload" className="w-4 h-4" />
                {isUploading ? "Carregando..." : "Nova Planilha"}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={isUploading}
              />
            </label>
          </div>
        </div>

        {/* Empty State */}
        <div className="flex items-center justify-center w-full min-h-[60vh]">
          <p className="text-white/30 text-sm">
            Nenhuma planilha ainda
          </p>
        </div>

        {/* Manual Event Modal */}
        {onAddEvent && (
          <ManualEventModal
            isOpen={isManualModalOpen}
            onClose={() => setIsManualModalOpen(false)}
            onSave={(event) => {
              onAddEvent(event);
              setIsManualModalOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="text-left">
          <h2 className="text-3xl font-semibold text-white tracking-tight">
            Lista de Torneios
          </h2>
          <p className="text-sm text-white/50 mt-2">
            {schedules.length} semana{schedules.length !== 1 ? "s" : ""} salva
            {schedules.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onAddEvent && (
            <button
              onClick={() => setIsManualModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            >
              <Icon name="edit" className="w-4 h-4" />
              Torneio Manual
            </button>
          )}
          <label
            className={`cursor-pointer ${isUploading ? "pointer-events-none opacity-70" : ""}`}
          >
            <span className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              <Icon name="upload" className="w-4 h-4" />
              {isUploading ? "Carregando..." : "Nova Planilha"}
            </span>
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      {/* Schedules List - Simple rows */}
      <div className="space-y-2">
        {sortedSchedules.map((schedule) => {
          const status = getWeekStatus(schedule);
          const isSelected = currentScheduleId === schedule.id;

          return (
            <div
              key={schedule.id}
              onClick={() => onSelectSchedule(schedule)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelectSchedule(schedule)}
              className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl border transition-all active:scale-[0.99] text-left cursor-pointer backdrop-blur-2xl shadow-[0_8px_30px_rgba(0,0,0,0.5)] ${isSelected
                ? "bg-black/40 border-white/10"
                : "bg-black/40 border-white/10 hover:border-white/30"
                }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <Icon name="calendar" className="w-5 h-5 text-white/30" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white">
                      {formatDate(schedule.start_date)} -{" "}
                      {formatDate(schedule.end_date)}
                    </p>
                    {status === "current" && (
                      <span className="text-[8px] font-bold text-white/40 bg-white/10 px-1.5 py-0.5 rounded uppercase">
                        Atual
                      </span>
                    )}
                    {status === "expired" && (
                      <span className="text-[8px] font-bold text-white/20 bg-white/5 px-1.5 py-0.5 rounded uppercase">
                        Expirada
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/30 truncate">
                    {schedule.filename || "Planilha sem nome"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <p className="text-xs font-bold text-white">
                    {schedule.event_count}
                  </p>
                  <p className="text-[8px] text-white/30 uppercase">Torneios</p>
                </div>
                {onDeleteSchedule && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        confirm("Tem certeza que deseja excluir esta planilha?")
                      ) {
                        onDeleteSchedule(schedule.id);
                      }
                    }}
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-white/40 hover:text-red-400 transition-all"
                    title="Excluir planilha"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                )}
                <Icon name="chevron-right" className="w-4 h-4 text-white/20" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual Event Modal */}
      {onAddEvent && (
        <ManualEventModal
          isOpen={isManualModalOpen}
          onClose={() => setIsManualModalOpen(false)}
          onSave={(event) => {
            onAddEvent(event);
            setIsManualModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
