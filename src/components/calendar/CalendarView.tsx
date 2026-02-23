import React, { useState, useMemo, useEffect } from "react";
import type {
  ScheduledPost,
  GalleryImage,
  InstagramPublishState,
} from "../../types";
import type { DbCampaign } from "../../services/apiClient";
import { Icon } from "../common/Icon";
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

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayClick = (date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setIsScheduleModalOpen(true);
  };

  const handleDayViewClick = (date: string) => {
    setSelectedDayDate(date);
    setDayViewDialogOpen(true);
  };

  const handleSchedulePost = (
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
  ) => {
    onSchedulePost(post);
    setIsScheduleModalOpen(false);
    setSelectedDate(null);
    setSelectedTime(null);
  };

  const handlePostClick = (post: ScheduledPost) => {
    setSelectedPost(post);
    setPostDialogOpen(true);
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
      const dayPosts = scheduledPosts.filter((post) => post.scheduledDate === dateStr);
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
  }, [currentMonth, currentYear, scheduledPosts]);

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
    const interval = setInterval(checkNotifications, 60000);
    return () => clearInterval(interval);
  }, [scheduledPosts]);

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
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };

  const formatDateRange = (post: ScheduledPost) => {
    const date = new Date(post.scheduledDate);
    const options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
    return date.toLocaleDateString("pt-BR", options);
  };

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
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4"
          onClick={() => setPostDialogOpen(false)}
        >
          <div
            className="bg-[#0a0a0a] border border-white/[0.08] rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-white">{formatDateRange(selectedPost)}</h3>
                  <p className="text-sm text-white/40 mt-1">{selectedPost.scheduledTime}</p>
                </div>
                <button
                  onClick={() => setPostDialogOpen(false)}
                  className="p-2 text-white/30 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Image Preview */}
              {selectedPost.imageUrl && (
                <div className="px-6 py-4">
                  <img
                    src={selectedPost.imageUrl}
                    alt=""
                    className="w-full h-auto rounded-xl border border-white/[0.06]"
                  />
                </div>
              )}

              {/* Content Details */}
              <div className="px-6 py-4 space-y-4">
              {/* Caption */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-2">Legenda</p>
                <p className="text-sm text-white/70 leading-relaxed">
                  {selectedPost.caption || <span className="italic text-white/30">Sem legenda</span>}
                </p>
              </div>

              {/* Hashtags */}
              {selectedPost.hashtags && selectedPost.hashtags.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-2">Hashtags</p>
                  <p className="text-sm text-white/40">{selectedPost.hashtags.join(" ")}</p>
                </div>
              )}

              {/* Status & Platform */}
              <div className="flex items-center gap-2 pt-2">
                <span className={`text-[9px] font-medium px-2.5 py-1 rounded-lg border ${
                  selectedPost.status === "published"
                    ? "text-emerald-400/80 bg-emerald-500/[0.08] border-emerald-500/[0.15]"
                    : selectedPost.status === "failed"
                      ? "text-red-400/80 bg-red-500/[0.08] border-red-500/[0.15]"
                      : "text-white/50 bg-white/[0.04] border-white/[0.08]"
                }`}>
                  {selectedPost.status === "scheduled"
                    ? "Agendado"
                    : selectedPost.status === "published"
                      ? "Publicado"
                      : "Falhou"}
                </span>
                {selectedPost.instagramContentType && (
                  <span className="text-[9px] font-medium text-white/40 px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                    {selectedPost.instagramContentType === "story"
                      ? "Story"
                      : selectedPost.instagramContentType === "carousel"
                        ? "Carousel"
                        : selectedPost.instagramContentType === "reel"
                          ? "Reel"
                          : "Photo"}
                  </span>
                )}
                <span className="text-[9px] font-medium text-white/40 px-2.5 py-1 bg-white/[0.03] border border-white/[0.06] rounded-lg uppercase">
                  {selectedPost.platforms}
                </span>
              </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] flex gap-2 flex-shrink-0">
              {selectedPost.status === "scheduled" && (
                <>
                  {isRubeConfigured() && (
                    <button
                      onClick={() => {
                        onPublishToInstagram(selectedPost);
                        setPostDialogOpen(false);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-medium text-white/80 hover:bg-white/[0.1] transition-all"
                    >
                      <Icon name="send" className="w-4 h-4" />
                      Publicar Agora
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedPostForEdit(selectedPost);
                      setSelectedDate(selectedPost.scheduledDate);
                      setSelectedTime(selectedPost.scheduledTime);
                      setPostDialogOpen(false);
                      setIsScheduleModalOpen(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm font-medium text-white/80 hover:bg-white/[0.1] transition-all"
                  >
                    <Icon name="edit" className="w-4 h-4" />
                    Editar
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  onDeleteScheduledPost(selectedPost.id);
                  setPostDialogOpen(false);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm font-medium text-white/40 hover:text-white/70 transition-all"
              >
                <Icon name="trash" className="w-4 h-4" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day View Dialog */}
      {dayViewDialogOpen && selectedDayDate && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4"
          onClick={() => setDayViewDialogOpen(false)}
        >
          <div
            className="bg-[#0a0a0a] border border-white/[0.08] rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-medium text-white capitalize">
                    {new Date(selectedDayDate).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                  </h3>
                  <p className="text-[11px] text-white/30 mt-1">
                    {(() => {
                      const dayPosts = scheduledPosts.filter((p) => p.scheduledDate === selectedDayDate);
                      const published = dayPosts.filter((p) => p.status === "published").length;
                      const scheduled = dayPosts.filter((p) => p.status === "scheduled").length;
                      const parts = [];
                      if (scheduled > 0) parts.push(`${scheduled} agendado${scheduled !== 1 ? "s" : ""}`);
                      if (published > 0) parts.push(`${published} publicado${published !== 1 ? "s" : ""}`);
                      return parts.length > 0 ? parts.join(" · ") : "Nenhum post";
                    })()}
                  </p>
                </div>
                <button
                  onClick={() => setDayViewDialogOpen(false)}
                  className="p-1.5 text-white/20 hover:text-white/50 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="px-5 py-4 overflow-y-auto max-h-[65vh]">
              <div className="space-y-2">
                {scheduledPosts
                  .filter((post) => post.scheduledDate === selectedDayDate)
                  .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
                  .map((post) => {
                    const contentType = post.instagramContentType;
                    const typeLabel =
                      contentType === "story"
                        ? "Story"
                        : contentType === "carousel"
                          ? "Carousel"
                          : contentType === "reel"
                            ? "Reel"
                            : null;

                    return (
                      <div
                        key={post.id}
                        className="group flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all"
                      >
                        {/* Thumbnail */}
                        <div
                          onClick={() => {
                            setDayViewDialogOpen(false);
                            handlePostClick(post);
                          }}
                          className="cursor-pointer"
                        >
                          {post.imageUrl ? (
                            <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.03] border border-white/[0.06] transition-colors">
                              <img
                                src={post.imageUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0 border border-white/[0.06] transition-colors">
                              <Icon name="image" className="w-6 h-6 text-white/20" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-sm font-semibold text-white">
                              {post.scheduledTime}
                            </span>
                            {typeLabel && (
                              <span className="text-[9px] font-medium text-white/40 px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-md">
                                {typeLabel}
                              </span>
                            )}
                            {post.status === "published" && (
                              <span className="text-[9px] font-medium text-emerald-400/80 px-2 py-0.5 bg-emerald-500/[0.08] border border-emerald-500/[0.15] rounded-md">
                                Publicado
                              </span>
                            )}
                            {post.status === "failed" && (
                              <span className="text-[9px] font-medium text-red-400/80 px-2 py-0.5 bg-red-500/[0.08] border border-red-500/[0.15] rounded-md">
                                Falhou
                              </span>
                            )}
                            {post.status === "scheduled" && (
                              <span className="text-[9px] font-medium text-white/40 px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-md">
                                Agendado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/40 line-clamp-2">
                            {post.caption || "Sem legenda"}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {post.status === "scheduled" && (
                            <>
                              {onPublishToInstagram && (
                                <button
                                  onClick={() => {
                                    onPublishToInstagram(post);
                                    setDayViewDialogOpen(false);
                                  }}
                                  className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                                  title="Publicar agora"
                                >
                                  <Icon name="send" className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedPostForEdit(post);
                                  setSelectedDate(post.scheduledDate);
                                  setSelectedTime(post.scheduledTime);
                                  setDayViewDialogOpen(false);
                                  setIsScheduleModalOpen(true);
                                }}
                                className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Icon name="edit" className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  onUpdateScheduledPost(post.id, {
                                    status: "published",
                                    publishedAt: Date.now(),
                                  });
                                }}
                                className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                                title="Marcar como publicado"
                              >
                                <Icon name="check" className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => onDeleteScheduledPost(post.id)}
                            className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Icon name="trash" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 pb-4 pt-3 border-t border-white/[0.06]">
              <button
                onClick={() => {
                  setDayViewDialogOpen(false);
                  handleDayClick(selectedDayDate);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white/70 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] rounded-xl transition-all"
              >
                <Icon name="plus" className="w-4 h-4" />
                Novo Agendamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Today View */}
      {showTodayView && (() => {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const todayPosts = scheduledPosts.filter((post) => post.scheduledDate === todayStr).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
        const publishedCount = todayPosts.filter((p) => p.status === "published").length;
        const scheduledCount = todayPosts.filter((p) => p.status === "scheduled").length;

        return (
          <main className="flex-1 px-3 md:px-8 py-4 md:py-6 flex flex-col">
            <div className="flex items-center gap-4 mb-8">
              <button
                onClick={() => setShowTodayView(false)}
                className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/[0.06] rounded-lg transition-colors"
              >
                <Icon name="chevron-left" className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-lg font-medium text-white capitalize">
                  {today.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                </h2>
                <p className="text-[11px] text-white/30 mt-0.5">
                  {todayPosts.length === 0 ? "Nenhum post" : (
                    <>
                      {scheduledCount > 0 && <span>{scheduledCount} agendado{scheduledCount !== 1 ? "s" : ""}</span>}
                      {scheduledCount > 0 && publishedCount > 0 && <span> · </span>}
                      {publishedCount > 0 && <span className="text-emerald-400/50">{publishedCount} publicado{publishedCount !== 1 ? "s" : ""}</span>}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {todayPosts.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-24">
                  <Icon name="calendar" className="w-6 h-6 text-white/10 mb-3" />
                  <p className="text-sm font-medium text-white/30">Nenhum post para hoje</p>
                  <p className="text-[11px] text-white/15 mt-1">Clique em "Agendar" para criar o primeiro</p>
                </div>
              ) : (
                todayPosts.map((post) => {
                  const contentType = post.instagramContentType;
                  const typeLabel =
                    contentType === "story"
                      ? "Story"
                      : contentType === "carousel"
                        ? "Carousel"
                        : contentType === "reel"
                          ? "Reel"
                          : null;

                  return (
                    <div
                      key={post.id}
                      className="group bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden transition-all flex flex-col hover:bg-white/[0.03] hover:border-white/[0.08]"
                    >
                      {/* Post Image */}
                      <div
                        onClick={() => handlePostClick(post)}
                        className="aspect-square bg-black/40 overflow-hidden cursor-pointer relative"
                      >
                        {post.imageUrl ? (
                          <img
                            src={post.imageUrl}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Icon name="image" className="w-8 h-8 text-white/15" />
                          </div>
                        )}
                        {/* Status Badge */}
                        <div className="absolute top-3 right-3">
                          {post.status === "published" && (
                            <span className="text-[9px] font-medium text-emerald-400/80 px-2.5 py-1 bg-emerald-500/[0.15] backdrop-blur-sm border border-emerald-500/[0.2] rounded-lg">
                              Publicado
                            </span>
                          )}
                          {post.status === "failed" && (
                            <span className="text-[9px] font-medium text-red-400/80 px-2.5 py-1 bg-red-500/[0.15] backdrop-blur-sm border border-red-500/[0.2] rounded-lg">
                              Falhou
                            </span>
                          )}
                          {post.status === "scheduled" && (
                            <span className="text-[9px] font-medium text-white/50 px-2.5 py-1 bg-black/40 backdrop-blur-sm border border-white/[0.1] rounded-lg">
                              Agendado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Post Info */}
                      <div className="p-4 flex flex-col flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-semibold text-white">
                            {post.scheduledTime}
                          </span>
                          {typeLabel && (
                            <span className="text-[9px] font-medium text-white/40 px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-md">
                              {typeLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 line-clamp-2 flex-1 mb-3">
                          {post.caption || "Sem legenda"}
                        </p>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {post.status === "scheduled" && onPublishToInstagram && (
                            <button
                              onClick={() => onPublishToInstagram(post)}
                              className="flex-1 p-1.5 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg text-[10px] font-medium transition-colors"
                              title="Publicar agora"
                            >
                              <Icon name="send" className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {post.status === "scheduled" && (
                            <button
                              onClick={() => {
                                setSelectedPostForEdit(post);
                                setSelectedDate(post.scheduledDate);
                                setSelectedTime(post.scheduledTime);
                                setIsScheduleModalOpen(true);
                              }}
                              className="flex-1 p-1.5 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg text-[10px] font-medium transition-colors"
                              title="Editar"
                            >
                              <Icon name="edit" className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteScheduledPost(post.id)}
                            className="flex-1 p-1.5 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg text-[10px] font-medium transition-colors"
                            title="Excluir"
                          >
                            <Icon name="trash" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </main>
        );
      })()}

      {/* Regular Calendar View */}
      {!showTodayView && (
      <main className="flex-1 px-3 md:px-8 py-2 md:py-4 flex flex-col">
        <div className="grid grid-cols-7 flex-1">
          {monthCalendar.map((day, index) => {
            const dayIsToday = isToday(day.date);
            return (
              <div
                key={index}
                onClick={() => day.dateStr && handleDayClick(day.dateStr)}
                className={`min-h-[72px] sm:min-h-[90px] md:min-h-[120px] p-1.5 sm:p-2 md:p-3 transition-all flex flex-col border-b border-r border-white/[0.04] ${
                  day.date ? "cursor-pointer hover:bg-white/[0.02]" : ""
                } ${dayIsToday ? "bg-white/[0.03]" : ""} ${
                  index % 7 === 0 ? "border-l-0" : ""
                }`}
              >
                {day.date && (
                  <>
                    <div className="flex items-center justify-between mb-1.5 md:mb-2">
                      <span
                        onClick={(e) => {
                          if (day.posts.length > 0 && day.dateStr) {
                            e.stopPropagation();
                            handleDayViewClick(day.dateStr);
                          }
                        }}
                        className={`text-sm md:text-lg font-light transition-colors ${
                          dayIsToday
                            ? "text-white"
                            : "text-white/40"
                        } ${
                          day.posts.length > 0 ? "cursor-pointer hover:text-white/80" : ""
                        }`}
                      >
                        {day.date}
                      </span>
                      {day.posts.length > 0 && (
                        <span className="text-[9px] font-medium text-white/20">{day.posts.length}</span>
                      )}
                    </div>
                    {/* Mobile: show dots for posts */}
                    <div className="md:hidden flex flex-wrap gap-0.5 mt-auto">
                      {day.posts.slice(0, 4).map((post) => (
                        <div
                          key={post.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePostClick(post);
                          }}
                          className={`w-1.5 h-1.5 rounded-full cursor-pointer ${
                            post.status === "published" ? "bg-emerald-500/50" :
                            post.status === "failed" ? "bg-red-500/50" : "bg-white/20"
                          }`}
                        />
                      ))}
                      {day.posts.length > 4 && (
                        <span className="text-[7px] text-white/20">+{day.posts.length - 4}</span>
                      )}
                    </div>
                    {/* Desktop: show post cards */}
                    <div className="hidden md:flex flex-col gap-1 mt-auto">
                      {day.posts.slice(0, 2).map((post) => (
                        <div
                          key={post.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePostClick(post);
                          }}
                          className="text-[10px] px-1.5 py-1 rounded-md transition-all hover:bg-white/[0.04] cursor-pointer flex items-center gap-1.5"
                        >
                          <span className={`w-1 h-1 rounded-full flex-shrink-0 ${
                            post.status === "published"
                              ? "bg-emerald-500/60"
                              : post.status === "failed"
                                ? "bg-red-500/60"
                                : "bg-white/20"
                          }`} />
                          <span className="font-medium text-white/50 truncate">{post.scheduledTime}</span>
                        </div>
                      ))}
                      {day.posts.length > 2 && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            if (day.dateStr) handleDayViewClick(day.dateStr);
                          }}
                          className="text-[9px] text-white/20 hover:text-white/40 pl-1.5 cursor-pointer transition-colors"
                        >
                          +{day.posts.length - 2} mais
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
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
