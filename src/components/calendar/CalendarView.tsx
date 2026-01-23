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

const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const CalendarView: React.FC<CalendarViewProps> = ({
  scheduledPosts,
  onSchedulePost,
  onUpdateScheduledPost,
  onDeleteScheduledPost,
  galleryImages,
  campaigns = [],
  onPublishToInstagram,
  publishingStates: _publishingStates,
}) => {
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

  // Generate month calendar
  const monthCalendar = useMemo(() => {
    const year = currentYear;
    const month = currentMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    let startDay = firstDay.getDay();

    const calendar: { date: number | null; dateStr: string | null; posts: ScheduledPost[] }[] = [];

    // Empty cells before first day
    for (let i = 0; i < startDay; i++) {
      calendar.push({ date: null, dateStr: null, posts: [] });
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayPosts = scheduledPosts.filter((post) => post.scheduledDate === dateStr);
      calendar.push({ date: day, dateStr, posts: dayPosts });
    }

    // Fill remaining cells
    const remainingCells = (7 - (calendar.length % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      calendar.push({ date: null, dateStr: null, posts: [] });
    }

    return calendar;
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
    <div className="min-h-screen flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 bg-black border-b border-white/10 z-50">
        <div className="px-6 py-4">
          <div className="flex flex-col gap-4">
            {/* Row 1: Title */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-white tracking-tight">Agenda de Publicações</h1>
                <p className="text-sm text-white/50 mt-1">Gerencie seus posts agendados</p>
              </div>
            </div>

            {/* Row 2: Controls */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={goToPreviousMonth}
                  className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Icon name="chevron-left" className="w-4 h-4" />
                </button>
                <button
                  onClick={goToNextMonth}
                  className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Icon name="chevron-right" className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-medium text-white/70">
                  {monthNames[currentMonth]} {currentYear}
                </h3>

                <button
                  onClick={goToToday}
                  className="px-3 py-1.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:border-white/30 transition-all"
                >
                  Hoje
                </button>
              </div>

              <div className="flex items-center gap-4">
                {/* Stats */}
                <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-medium text-white/60">
                      {stats.scheduled} agendados
                    </span>
                  </div>
                  <div className="h-3 w-px bg-white/10" />
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-[10px] font-medium text-white/60">
                      {stats.published} publicados
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedDate(null);
                    setIsScheduleModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                >
                  <Icon name="plus" className="w-4 h-4" />
                  Agendar Post
                </button>
              </div>
            </div>
          </div>

          {/* Day headers */}
          <div className="flex mt-4">
            <div className="flex-1 grid grid-cols-7">
              {dayNames.map((day) => (
                <div key={day} className="p-2 text-center font-medium text-sm text-white/40">
                  {day}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Notification Banner */}
      {showNotificationBanner && pendingPosts.length > 0 && (
        <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="bell" className="w-4 h-4 text-amber-400" />
            <p className="text-xs font-semibold text-amber-400">
              {pendingPosts.length} post{pendingPosts.length > 1 ? "s" : ""} pendente
              {pendingPosts.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isRubeConfigured() && (
              <button
                onClick={handlePublishAll}
                className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-full text-xs font-medium text-white/90 hover:border-white/30 transition-all"
              >
                <Icon name="send" className="w-3 h-3" />
                Publicar Todos
              </button>
            )}
            <button
              onClick={() => setShowNotificationBanner(false)}
              className="p-1 text-amber-400/40 hover:text-amber-400"
            >
              <Icon name="x" className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <main className="flex-1 px-6 py-6">
        <div className="grid grid-cols-7 gap-px bg-white/5 border border-white/10 rounded-lg overflow-hidden">
          {monthCalendar.map((day, index) => (
            <div
              key={index}
              onClick={() => day.dateStr && day.posts.length === 0 && handleDayClick(day.dateStr)}
              className={`bg-black min-h-[140px] p-3 transition-all hover:bg-black/80 ${
                day.date && day.posts.length === 0 ? "cursor-pointer" : ""
              } ${isToday(day.date) ? "ring-2 ring-inset ring-primary" : ""}`}
            >
              {day.date && (
                <>
                  <h3
                    onClick={(e) => {
                      if (day.posts.length > 0 && day.dateStr) {
                        e.stopPropagation();
                        handleDayViewClick(day.dateStr);
                      }
                    }}
                    className={`mb-3 font-light text-7xl ${
                      isToday(day.date) ? "text-primary" : "text-white/80"
                    } ${day.posts.length > 0 ? "cursor-pointer hover:text-white transition-colors" : ""}`}
                  >
                    {day.date}
                  </h3>
                  <div className="space-y-2">
                    {day.posts.slice(0, 3).map((post) => (
                      <div
                        key={post.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePostClick(post);
                        }}
                        className="text-xs p-2 border-l-2 border-primary bg-white/5 hover:bg-white/10 transition-all hover:pl-3 cursor-pointer group relative"
                      >
                        <div className="font-medium text-white/90 truncate">{post.scheduledTime}</div>
                        <div className="text-white/50 text-[10px] truncate mt-1">
                          {post.caption?.substring(0, 40)}...
                        </div>
                        {post.status === "published" && (
                          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500" />
                        )}
                        {post.status === "failed" && (
                          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                        )}
                      </div>
                    ))}
                    {day.posts.length > 3 && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (day.dateStr) handleDayViewClick(day.dateStr);
                        }}
                        className="text-[10px] text-white/40 hover:text-white/70 pl-2 cursor-pointer transition-colors"
                      >
                        +{day.posts.length - 3} mais
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Post Detail Dialog - Single Post View */}
      {postDialogOpen && selectedPost && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4"
          onClick={() => setPostDialogOpen(false)}
        >
          <div
            className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-[0_25px_90px_rgba(0,0,0,0.7)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-white">{formatDateRange(selectedPost)}</h3>
                  <p className="text-sm text-white/50 mt-1">{selectedPost.scheduledTime}</p>
                </div>
                <button
                  onClick={() => setPostDialogOpen(false)}
                  className="p-2 text-white/40 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Image Preview */}
              {selectedPost.imageUrl && (
                <div className="px-6 py-4 bg-black/20">
                  <img
                    src={selectedPost.imageUrl}
                    alt=""
                    className="w-full h-auto rounded-lg border border-white/10"
                  />
                </div>
              )}

              {/* Content Details */}
              <div className="px-6 py-4 space-y-4">
              {/* Caption */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-2">Legenda</p>
                <p className="text-sm text-white/80 leading-relaxed">
                  {selectedPost.caption || <span className="italic text-white/40">Sem legenda</span>}
                </p>
              </div>

              {/* Hashtags */}
              {selectedPost.hashtags && selectedPost.hashtags.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-2">Hashtags</p>
                  <p className="text-sm text-white/60">{selectedPost.hashtags.join(" ")}</p>
                </div>
              )}

              {/* Status & Platform */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[9px] font-medium text-white/60 px-2 py-1 bg-white/5 border border-white/10 rounded-full">
                  {selectedPost.status === "scheduled"
                    ? "Agendado"
                    : selectedPost.status === "published"
                      ? "Publicado"
                      : "Falhou"}
                </span>
                {selectedPost.instagramContentType && (
                  <span className="text-[9px] font-medium text-white/50 px-2 py-1 bg-black/40 border border-white/10 rounded-full">
                    {selectedPost.instagramContentType === "story"
                      ? "Story"
                      : selectedPost.instagramContentType === "carousel"
                        ? "Carousel"
                        : selectedPost.instagramContentType === "reel"
                          ? "Reel"
                          : "Photo"}
                  </span>
                )}
                <span className="text-[9px] font-medium text-white/50 px-2 py-1 bg-black/40 border border-white/10 rounded-full uppercase">
                  {selectedPost.platforms}
                </span>
              </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex gap-2 flex-shrink-0">
              {selectedPost.status === "scheduled" && (
                <>
                  {isRubeConfigured() && (
                    <button
                      onClick={() => {
                        onPublishToInstagram(selectedPost);
                        setPostDialogOpen(false);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all"
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
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all"
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
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/40 hover:text-white hover:border-white/30 transition-all"
              >
                <Icon name="trash" className="w-4 h-4" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day View Dialog - Shows all posts for a specific day */}
      {dayViewDialogOpen && selectedDayDate && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4"
          onClick={() => setDayViewDialogOpen(false)}
        >
          <div
            className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-[0_25px_90px_rgba(0,0,0,0.7)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Minimalist */}
            <div className="px-6 py-4 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex flex-col items-center justify-center">
                    <span className="text-xl font-light text-white">
                      {new Date(selectedDayDate).getDate()}
                    </span>
                    <span className="text-[9px] text-white/40 uppercase">
                      {new Date(selectedDayDate).toLocaleDateString("pt-BR", { month: "short" })}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white capitalize">
                      {new Date(selectedDayDate).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                    </h3>
                    <p className="text-xs text-white/50 mt-0.5">
                      {scheduledPosts.filter((p) => p.scheduledDate === selectedDayDate).length} posts agendados
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDayViewDialogOpen(false)}
                  className="p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Content - List of all posts - Minimalist */}
            <div className="px-5 py-4 overflow-y-auto max-h-[65vh]">
              <div className="space-y-3">
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
                        className="group flex items-center gap-4 p-3 rounded-xl bg-black/20 border border-white/10 hover:bg-black/30 hover:border-white/20 transition-all"
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
                            <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-black/40 border border-white/10 hover:border-white/30 transition-colors">
                              <img
                                src={post.imageUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-lg bg-black/40 flex items-center justify-center flex-shrink-0 border border-white/10 hover:border-white/30 transition-colors">
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
                              <span className="text-[9px] font-medium text-white/50 px-2 py-0.5 bg-black/40 border border-white/10 rounded-full">
                                {typeLabel}
                              </span>
                            )}
                            {post.status === "published" && (
                              <span className="text-[9px] font-medium text-white/60 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full">
                                Publicado
                              </span>
                            )}
                            {post.status === "failed" && (
                              <span className="text-[9px] font-medium text-white/60 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full">
                                Falhou
                              </span>
                            )}
                            {post.status === "scheduled" && (
                              <span className="text-[9px] font-medium text-white/60 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full">
                                Agendado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/50 line-clamp-2">
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
                                  className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
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
                                className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
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
                                className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                title="Marcar como publicado"
                              >
                                <Icon name="check" className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => onDeleteScheduledPost(post.id)}
                            className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
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
            <div className="px-5 pb-4 pt-3 border-t border-white/10">
              <button
                onClick={() => {
                  setDayViewDialogOpen(false);
                  handleDayClick(selectedDayDate);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white/90 bg-black/40 backdrop-blur-2xl border border-white/10 hover:border-white/30 rounded-full transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
              >
                <Icon name="plus" className="w-4 h-4" />
                Novo Agendamento
              </button>
            </div>
          </div>
        </div>
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
};
