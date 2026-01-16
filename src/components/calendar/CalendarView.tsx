import React, { useState, useMemo, useEffect } from "react";
import type {
  ScheduledPost,
  CalendarViewType,
  GalleryImage,
  InstagramPublishState,
} from "../../types";
import type { DbCampaign } from "../../services/apiClient";
import { Icon } from "../common/Icon";
import { Button } from "../common/Button";
import { MonthlyCalendar } from "./MonthlyCalendar";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { SchedulePostModal } from "./SchedulePostModal";
import { isRubeConfigured } from "../../services/rubeService";

interface CalendarViewProps {
  scheduledPosts: ScheduledPost[];
  onSchedulePost: (
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
  ) => void;
  onUpdateScheduledPost: (
    postId: string,
    updates: Partial<ScheduledPost>,
  ) => void;
  onDeleteScheduledPost: (postId: string) => void;
  galleryImages: GalleryImage[];
  campaigns?: DbCampaign[];
  onPublishToInstagram: (post: ScheduledPost) => void;
  publishingStates: Record<string, InstagramPublishState>;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  scheduledPosts,
  onSchedulePost,
  onUpdateScheduledPost,
  onDeleteScheduledPost,
  galleryImages,
  campaigns = [],
  onPublishToInstagram,
  publishingStates,
}) => {
  const [viewType, setViewType] = useState<CalendarViewType>("weekly");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedPostForEdit, setSelectedPostForEdit] = useState<ScheduledPost | null>(null);
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [pendingPosts, setPendingPosts] = useState<ScheduledPost[]>([]);

  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayClick = (date: string, hour?: number) => {
    setSelectedDate(date);
    // Format hour as HH:00 if provided
    setSelectedTime(hour !== undefined ? `${String(hour).padStart(2, "0")}:00` : null);
    setIsScheduleModalOpen(true);
  };

  const handleSchedulePost = (
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
  ) => {
    onSchedulePost(post);
    setIsScheduleModalOpen(false);
    setSelectedDate(null);
    setSelectedTime(null);
  };

  // Stats
  const stats = useMemo(() => {
    const scheduled = scheduledPosts.filter(
      (p) => p.status === "scheduled",
    ).length;
    const published = scheduledPosts.filter(
      (p) => p.status === "published",
    ).length;
    const failed = scheduledPosts.filter((p) => p.status === "failed").length;
    return { scheduled, published, failed, total: scheduledPosts.length };
  }, [scheduledPosts]);

  // Notification system - check for pending/overdue posts
  useEffect(() => {
    const checkNotifications = () => {
      const now = Date.now();
      const fifteenMinutes = 15 * 60 * 1000;

      // Find posts due in next 15 minutes or overdue
      const pending = scheduledPosts.filter((post) => {
        if (post.status !== "scheduled") return false;
        const timeUntil = post.scheduledTimestamp - now;
        // Due in next 15 minutes OR overdue
        return timeUntil <= fifteenMinutes;
      });

      if (pending.length > 0) {
        setPendingPosts(pending);
        setShowNotificationBanner(true);

        // Browser notification if permitted
        if ("Notification" in window && Notification.permission === "granted") {
          const overdue = pending.filter((p) => p.scheduledTimestamp < now);
          if (overdue.length > 0) {
            new Notification("Posts Pendentes!", {
              body: `${overdue.length} post(s) aguardando publicacao`,
              icon: "/favicon.ico",
            });
          }
        }
      } else {
        setPendingPosts([]);
        setShowNotificationBanner(false);
      }
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [scheduledPosts]);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const handlePublishAll = async () => {
    const instagramPosts = pendingPosts.filter(
      (p) => p.platforms === "instagram" || p.platforms === "both",
    );
    for (const post of instagramPosts) {
      onPublishToInstagram(post);
      // Small delay between publications to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex justify-between items-start">
          <div className="text-left">
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
              Agenda
            </h2>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">
              Agendamento de Publicações
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedDate(null);
              setIsScheduleModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 bg-transparent border border-white/[0.06] rounded-lg text-[10px] font-bold text-white/50 uppercase tracking-wide hover:border-white/[0.1] hover:text-white/70 transition-all active:scale-95"
          >
            <Icon name="plus" className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
            <span className="hidden sm:inline">Agendar Post</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>
        {/* Stats - scrollable on mobile */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 -mx-1 px-1">
          <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 bg-[#0a0a0a] border border-white/10 rounded-lg flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[9px] font-black text-white/40 uppercase whitespace-nowrap">
                {stats.scheduled} agendados
              </span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-[9px] font-black text-white/40 uppercase whitespace-nowrap">
                {stats.published} publicados
              </span>
            </div>
            {stats.failed > 0 && (
              <>
                <div className="h-3 w-px bg-white/10" />
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[9px] font-black text-red-400 uppercase whitespace-nowrap">
                    {stats.failed} falhas
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Notification Banner */}
      {showNotificationBanner && pendingPosts.length > 0 && (
        <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Icon name="bell" className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-400">
                {pendingPosts.length} post{pendingPosts.length > 1 ? "s" : ""}{" "}
                pendente{pendingPosts.length > 1 ? "s" : ""}
              </p>
              <p className="text-[9px] text-amber-400/60">
                {pendingPosts.some((p) => p.scheduledTimestamp < Date.now())
                  ? "Alguns posts estao atrasados!"
                  : "Pronto para publicar"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRubeConfigured() &&
              pendingPosts.some(
                (p) => p.platforms === "instagram" || p.platforms === "both",
              ) && (
                <Button
                  onClick={handlePublishAll}
                  variant="primary"
                  size="small"
                  icon="send"
                >
                  Publicar Todos
                </Button>
              )}
            <button
              onClick={() => setShowNotificationBanner(false)}
              className="p-1.5 text-amber-400/40 hover:text-amber-400 transition-colors"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Calendar Controls */}
      <div className="flex flex-col gap-2 px-3 py-2 bg-[#0a0a0a] border border-white/[0.03] rounded-lg">
        {/* Top row: Navigation + Period */}
        <div className="flex items-center gap-2">
          <button
            onClick={
              viewType === "monthly" ? goToPreviousMonth : goToPreviousWeek
            }
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5 rounded transition-colors"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
          </button>
          <button
            onClick={viewType === "monthly" ? goToNextMonth : goToNextWeek}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/5 rounded transition-colors"
          >
            <Icon name="chevron-right" className="w-4 h-4" />
          </button>
          <h3 className="text-xs font-medium text-white/60 uppercase tracking-wide">
            {viewType === "monthly"
              ? `${monthNames[currentMonth]} ${currentYear}`
              : `Semana de ${currentDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`}
          </h3>
        </div>

        {/* Bottom row: View Toggle (full width on mobile) */}
        <div className="flex items-center gap-1 p-0.5 bg-black/20 rounded w-full sm:w-auto sm:self-end">
          <button
            onClick={() => setViewType("monthly")}
            className={`flex-1 sm:flex-none px-3 py-1 text-[9px] font-medium uppercase tracking-wide rounded transition-all ${
              viewType === "monthly"
                ? "bg-white text-black"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setViewType("weekly")}
            className={`flex-1 sm:flex-none px-3 py-1 text-[9px] font-medium uppercase tracking-wide rounded transition-all ${
              viewType === "weekly"
                ? "bg-white text-black"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            Semanal
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 bg-[#111111] border border-white/5 rounded-xl overflow-hidden">
        {viewType === "monthly" ? (
          <MonthlyCalendar
            currentDate={currentDate}
            scheduledPosts={scheduledPosts}
            onDayClick={handleDayClick}
            onUpdatePost={onUpdateScheduledPost}
            onDeletePost={onDeleteScheduledPost}
            onPublishToInstagram={onPublishToInstagram}
            publishingStates={publishingStates}
          />
        ) : (
          <WeeklyCalendar
            currentDate={currentDate}
            scheduledPosts={scheduledPosts}
            onDayClick={handleDayClick}
            onUpdatePost={onUpdateScheduledPost}
            onDeletePost={onDeleteScheduledPost}
            onPostClick={(post) => {
              setSelectedPostForEdit(post);
              setSelectedDate(post.scheduledDate);
              setSelectedTime(post.scheduledTime);
              setIsScheduleModalOpen(true);
            }}
            onPublishToInstagram={onPublishToInstagram}
            publishingStates={publishingStates}
          />
        )}
      </div>

      {/* Schedule Modal */}
      {isScheduleModalOpen && (
        <SchedulePostModal
          isOpen={isScheduleModalOpen}
          onClose={() => {
            setIsScheduleModalOpen(false);
            setSelectedDate(null);
            setSelectedTime(null);
            setSelectedPostForEdit(null);
          }}
          onSchedule={(newPost) => {
            // If editing, delete old post first then create new
            if (selectedPostForEdit) {
              onDeleteScheduledPost(selectedPostForEdit.id);
            }
            handleSchedulePost(newPost);
          }}
          galleryImages={galleryImages}
          campaigns={campaigns}
          initialDate={selectedDate}
          initialTime={selectedTime}
          initialCaption={selectedPostForEdit?.caption}
        />
      )}
    </div>
  );
};
