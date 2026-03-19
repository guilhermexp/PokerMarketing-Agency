import React, { useState, useMemo, useEffect, useCallback } from "react";
import type {
  ScheduledPost,
  GalleryImage,
  InstagramPublishState,
} from "../../types";
import type { DbCampaign } from "../../services/apiClient";
import { Icon } from "../common/Icon";
import { SchedulePostModal } from "./SchedulePostModal";
import { isRubeConfigured } from "../../services/rubeService";
import { DayCell } from "./DayCell";
import { DayViewDialog } from "./DayViewDialog";
import { PostDetailDialog } from "./PostDetailDialog";
import { TodayView } from "./TodayView";

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
  onRetryScheduledPost?: (postId: string) => void;
  publishingStates: Record<string, InstagramPublishState>;
}

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

const dayNames = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const dayNamesShort = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export const CalendarView = React.memo<CalendarViewProps>(function CalendarView({
  scheduledPosts,
  onSchedulePost,
  onUpdateScheduledPost,
  onDeleteScheduledPost,
  galleryImages,
  campaigns = [],
  onPublishToInstagram,
  onRetryScheduledPost,
  publishingStates: _publishingStates,
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedPostForEdit, setSelectedPostForEdit] = useState<ScheduledPost | null>(null);
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [pendingPosts, setPendingPosts] = useState<ScheduledPost[]>([]);
  const [dayViewDialogOpen, setDayViewDialogOpen] = useState(false);
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [showTodayView, setShowTodayView] = useState(false);

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  const goToPreviousMonth = useCallback(() => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  }, [currentMonth, currentYear]);

  const goToNextMonth = useCallback(() => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  }, [currentMonth, currentYear]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleDayClick = useCallback((date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setIsScheduleModalOpen(true);
  }, []);

  const handleDayViewClick = useCallback((date: string) => {
    setSelectedDayDate(date);
    setDayViewDialogOpen(true);
  }, []);

  const handleSchedulePost = useCallback((
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
  ) => {
    onSchedulePost(post);
    setIsScheduleModalOpen(false);
    setSelectedDate(null);
    setSelectedTime(null);
  }, [onSchedulePost]);

  const handlePostClick = useCallback((post: ScheduledPost) => {
    setSelectedPost(post);
    setPostDialogOpen(true);
  }, []);

  const handleEditPost = useCallback((post: ScheduledPost) => {
    setSelectedPostForEdit(post);
    setSelectedDate(post.scheduledDate);
    setSelectedTime(post.scheduledTime);
    setPostDialogOpen(false);
    setIsScheduleModalOpen(true);
  }, []);

  const scheduledPostsByDate = useMemo(() => {
    const grouped = new Map<string, ScheduledPost[]>();

    scheduledPosts.forEach((post) => {
      const items = grouped.get(post.scheduledDate) ?? [];
      items.push(post);
      grouped.set(post.scheduledDate, items);
    });

    return grouped;
  }, [scheduledPosts]);

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

  // Generate month calendar (filtered to show only current week and forward)
  const monthCalendar = useMemo(() => {
    const year = currentYear;
    const month = currentMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Adjust for Monday as first day of week (getDay: 0=Sun, 1=Mon... → we want: 0=Mon, 6=Sun)
    const startDay = (firstDay.getDay() + 6) % 7;

    const fullCalendar: { date: number | null; dateStr: string | null; posts: ScheduledPost[] }[] = [];

    // Empty cells before first day
    for (let i = 0; i < startDay; i++) {
      fullCalendar.push({ date: null, dateStr: null, posts: [] });
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayPosts = scheduledPostsByDate.get(dateStr) ?? [];
      fullCalendar.push({ date: day, dateStr, posts: dayPosts });
    }

    // Fill remaining cells
    const remainingCells = (7 - (fullCalendar.length % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      fullCalendar.push({ date: null, dateStr: null, posts: [] });
    }

    // Calculate start of current week (Monday)
    const today = new Date();
    const todayDayOfWeek = (today.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    const currentWeekMonday = new Date(today);
    currentWeekMonday.setDate(today.getDate() - todayDayOfWeek);
    currentWeekMonday.setHours(0, 0, 0, 0);

    // Split calendar into weeks and filter out past weeks
    const weeks: typeof fullCalendar[] = [];
    for (let i = 0; i < fullCalendar.length; i += 7) {
      weeks.push(fullCalendar.slice(i, i + 7));
    }

    // Filter weeks: keep only weeks that contain today or future dates
    const filteredWeeks = weeks.filter((week) => {
      // Check if any day in this week is today or in the future
      return week.some((day) => {
        if (!day.date) return false;
        const dayDate = new Date(year, month, day.date);
        dayDate.setHours(0, 0, 0, 0);
        return dayDate >= currentWeekMonday;
      });
    });

    return filteredWeeks.flat();
  }, [currentMonth, currentYear, scheduledPostsByDate]);

  const isToday = (date: number | null) => {
    if (!date) return false;
    const today = new Date();
    return (
      date === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    );
  };

  // Notification system
  useEffect(() => {
    const checkNotifications = () => {
      const now = Date.now();
      const fifteenMinutes = 15 * 60 * 1000;

      const pending = scheduledPosts.filter((post) => {
        if (post.status !== "scheduled") return false;
        const timeUntil = post.scheduledTimestamp - now;
        return timeUntil <= fifteenMinutes;
      });

      if (pending.length > 0) {
        setPendingPosts(pending);
        setShowNotificationBanner(true);

        if ("Notification" in window && Notification.permission === "granted") {
          const overdue = pending.filter((p) => p.scheduledTimestamp < now);
          if (overdue.length > 0) {
            new Notification("Posts Pendentes!", {
              body: `${overdue.length} post(s) aguardando publicação`,
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
    const interval = setInterval(checkNotifications, 60000);
    return () => clearInterval(interval);
  }, [scheduledPosts]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const handlePublishAll = useCallback(async () => {
    const instagramPosts = pendingPosts.filter(
      (p) => p.platforms === "instagram" || p.platforms === "both",
    );
    for (const post of instagramPosts) {
      onPublishToInstagram(post);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }, [onPublishToInstagram, pendingPosts]);

  return (
    <div className="min-h-screen flex flex-col bg-[#060606]">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-[#060606]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="px-4 md:px-8 py-4 md:py-5">
          {/* Row 1: Navigation + Title + Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={goToPreviousMonth}
                  className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/[0.06] rounded-lg transition-colors"
                >
                  <Icon name="chevron-left" className="w-4 h-4" />
                </button>
                <button
                  onClick={goToNextMonth}
                  className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/[0.06] rounded-lg transition-colors"
                >
                  <Icon name="chevron-right" className="w-4 h-4" />
                </button>
              </div>
              <h1 className="text-lg font-medium text-white tracking-tight">
                {monthNames[currentMonth]} <span className="text-white/40">{currentYear}</span>
              </h1>
              <button
                onClick={() => {
                  goToToday();
                  setShowTodayView(true);
                }}
                className="px-2.5 py-1 text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04] rounded-md transition-colors"
              >
                Hoje
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Stats */}
              <div className="hidden sm:flex items-center gap-4 text-[11px] font-medium text-white/30">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                  {stats.scheduled} agendado{stats.scheduled !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                  {stats.published} publicado{stats.published !== 1 ? "s" : ""}
                </span>
                {stats.failed > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
                    {stats.failed}
                  </span>
                )}
              </div>

              <button
                onClick={() => {
                  setSelectedDate(null);
                  setIsScheduleModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-[11px] font-medium text-white/60 hover:bg-white/[0.1] hover:text-white transition-all"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Agendar</span>
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mt-5 border-b border-white/[0.04] pb-2">
            {dayNamesShort.map((day, idx) => (
              <div key={day} className="text-center text-[10px] font-medium text-white/25 uppercase tracking-widest">
                <span className="md:hidden">{day}</span>
                <span className="hidden md:inline">{dayNames[idx]}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Notification Banner */}
      {showNotificationBanner && pendingPosts.length > 0 && (
        <div className="px-4 md:px-8 py-2.5 border-b border-white/[0.04] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 flex-shrink-0" />
            <p className="text-[11px] font-medium text-white/40 truncate">
              {pendingPosts.length} post{pendingPosts.length > 1 ? "s" : ""} pendente{pendingPosts.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isRubeConfigured() && (
              <button
                onClick={handlePublishAll}
                className="text-[11px] font-medium text-white/40 hover:text-white/70 transition-colors"
              >
                Publicar
              </button>
            )}
            <button
              onClick={() => setShowNotificationBanner(false)}
              className="p-1 text-white/20 hover:text-white/50 transition-colors"
            >
              <Icon name="x" className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Post Detail Dialog */}
      {postDialogOpen && selectedPost && (
        <PostDetailDialog
          post={selectedPost}
          onClose={() => setPostDialogOpen(false)}
          onPublishToInstagram={onPublishToInstagram}
          onRetryScheduledPost={onRetryScheduledPost}
          onDeleteScheduledPost={onDeleteScheduledPost}
          onEditPost={handleEditPost}
        />
      )}

      {/* Day View Dialog */}
      {dayViewDialogOpen && selectedDayDate && (
        <DayViewDialog
          date={selectedDayDate}
          scheduledPosts={scheduledPosts}
          onClose={() => setDayViewDialogOpen(false)}
          onPostClick={handlePostClick}
          onPublishToInstagram={onPublishToInstagram}
          onRetryScheduledPost={onRetryScheduledPost}
          onDeleteScheduledPost={onDeleteScheduledPost}
          onUpdateScheduledPost={onUpdateScheduledPost}
          onEditPost={handleEditPost}
          onNewSchedule={handleDayClick}
        />
      )}

      {/* Today View */}
      {showTodayView && (
        <TodayView
          scheduledPosts={scheduledPosts}
          onBack={() => setShowTodayView(false)}
          onPostClick={handlePostClick}
          onPublishToInstagram={onPublishToInstagram}
          onRetryScheduledPost={onRetryScheduledPost}
          onDeleteScheduledPost={onDeleteScheduledPost}
          onEditPost={handleEditPost}
          onScheduleNew={() => {
            setSelectedDate(null);
            setIsScheduleModalOpen(true);
          }}
        />
      )}

      {/* Regular Calendar View */}
      {!showTodayView && (
        <main className="flex-1 px-3 md:px-8 py-2 md:py-4 flex flex-col">
          <div className="grid grid-cols-7 flex-1">
            {monthCalendar.map((day, index) => (
              <DayCell
                key={index}
                day={day}
                index={index}
                isToday={isToday(day.date)}
                onDayClick={handleDayClick}
                onDayViewClick={handleDayViewClick}
                onPostClick={handlePostClick}
              />
            ))}
          </div>
        </main>
      )}

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
            if (selectedPostForEdit) {
              onDeleteScheduledPost(selectedPostForEdit.id);
            }
            handleSchedulePost(newPost);
          }}
          galleryImages={galleryImages}
          campaigns={campaigns}
          initialDate={selectedDate}
          initialTime={selectedTime}
          initialCaption={
            // Only pass caption if it doesn't look like a technical AI prompt
            selectedPostForEdit?.caption &&
            !selectedPostForEdit.caption.includes('TIPO:') &&
            !selectedPostForEdit.caption.includes('TORNEIO PRINCIPAL') &&
            !selectedPostForEdit.caption.includes('ESTRUTURA') &&
            !selectedPostForEdit.caption.includes('REGRA') &&
            !selectedPostForEdit.caption.includes('SEÇÃO')
              ? selectedPostForEdit.caption
              : undefined
          }
        />
      )}
    </div>
  );
});
