import React, { useMemo, useRef, useEffect, useState } from "react";
import type { ScheduledPost, InstagramPublishState } from "../../types";
import { ScheduledPostCard } from "./ScheduledPostCard";
import { Icon } from "../common/Icon";

interface WeeklyCalendarProps {
  currentDate: Date;
  scheduledPosts: ScheduledPost[];
  onDayClick: (date: string, hour?: number) => void;
  onUpdatePost: (postId: string, updates: Partial<ScheduledPost>) => void;
  onDeletePost: (postId: string) => void;
  onPostClick?: (post: ScheduledPost) => void;
  onPublishToInstagram: (post: ScheduledPost) => void;
  publishingStates: Record<string, InstagramPublishState>;
}

const dayNames = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

export const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({
  currentDate,
  scheduledPosts,
  onDayClick,
  onUpdatePost,
  onDeletePost,
  onPostClick,
  onPublishToInstagram,
  publishingStates,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentHourRef = useRef<HTMLDivElement>(null);

  // State for day summary modal
  const [selectedDaySummary, setSelectedDaySummary] = useState<{
    date: string;
    dayName: string;
    dayNumber: number;
    month: string;
  } | null>(null);

  // Get current time info
  const now = new Date();
  const currentHour = now.getHours();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Generate all hours of the day (6am to 23pm) to see full schedule
  const hours = useMemo(() => {
    const startHour = 6; // Start from 6am
    return Array.from({ length: 24 - startHour }, (_, i) => startHour + i);
  }, []);

  // Auto-scroll to current hour on mount
  useEffect(() => {
    if (currentHourRef.current && scrollRef.current) {
      currentHourRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, []);

  const weekDays = useMemo(() => {
    // Get the start of the week (Monday)
    const startOfWeek = new Date(currentDate);
    const dayOfWeek = startOfWeek.getDay();
    // Adjust for Monday start: Sunday (0) becomes 6, Monday (1) becomes 0, etc.
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(startOfWeek.getDate() - daysFromMonday);

    const days: Array<{
      date: string;
      dayName: string;
      dayNumber: number;
      month: string;
      isToday: boolean;
      isPast: boolean;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

      days.push({
        date: dateStr,
        dayName: dayNames[i], // Use index directly since we iterate Mon-Sun
        dayNumber: date.getDate(),
        month: date.toLocaleDateString("pt-BR", { month: "short" }),
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
      });
    }

    return days;
  }, [currentDate, todayStr]);

  const getPostsForDate = (date: string): ScheduledPost[] => {
    return scheduledPosts
      .filter((post) => post.scheduledDate === date)
      .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  };

  const getPostsForHour = (date: string, hour: number): ScheduledPost[] => {
    return scheduledPosts.filter((post) => {
      if (post.scheduledDate !== date) return false;
      const postHour = parseInt(post.scheduledTime.split(":")[0], 10);
      return postHour === hour;
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Day Headers */}
      <div className="overflow-x-auto flex-shrink-0">
        <div className="grid grid-cols-8 border-b border-white/[0.06] min-w-[720px] bg-[#060606]">
          {/* Time column header */}
          <div className="py-3 px-2 text-center text-[10px] font-medium text-white/30 uppercase tracking-wider border-r border-white/[0.06]">
            Hora
          </div>
          {/* Day columns */}
          {weekDays.map((day) => (
            <div
              key={day.date}
              className={`py-3 px-2 text-center border-r border-white/[0.06] last:border-r-0 ${day.isToday ? "bg-white/[0.02]" : ""}`}
            >
              <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
                {day.dayName}
              </div>
              <div
                className={`text-2xl font-light mt-1 ${day.isToday ? "text-white" : "text-white/50"}`}
              >
                {day.dayNumber}
              </div>
              <div className="text-[9px] text-white/25 mt-0.5">
                {day.month}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time Grid */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-8 min-w-[720px]">
            {hours.map((hour) => {
              const isCurrentHour = hour === currentHour;
              return (
                <React.Fragment key={hour}>
                  {/* Time Label */}
                  <div
                    ref={isCurrentHour ? currentHourRef : null}
                    className={`py-3 px-2 text-center text-[9px] font-medium border-b border-r border-white/[0.06] sticky left-0 bg-[#060606] ${isCurrentHour ? "text-white/70" : "text-white/25"
                      }`}
                  >
                    {String(hour).padStart(2, "0")}:00
                    {isCurrentHour && (
                      <span className="ml-1 text-[7px] text-white/40">now</span>
                    )}
                  </div>
                  {/* Day Cells */}
                  {weekDays.map((day) => {
                    const posts = getPostsForHour(day.date, hour);
                    const isPastSlot =
                      day.isPast || (day.isToday && hour < currentHour);
                    return (
                      <div
                        key={`${day.date}-${hour}`}
                        onClick={() => !isPastSlot && onDayClick(day.date, hour)}
                        className={`
                        min-h-[60px] p-1 border-b border-r border-white/[0.06] last:border-r-0
                        transition-colors
                        ${isPastSlot
                            ? "bg-white/[0.01] opacity-30 cursor-not-allowed"
                            : "cursor-pointer hover:bg-white/[0.03]"
                          }
                        ${day.isToday && !isPastSlot ? "bg-white/[0.015]" : ""}
                        ${isCurrentHour && day.isToday ? "ring-1 ring-inset ring-white/[0.1]" : ""}
                      `}
                      >
                        {posts.map((post) => (
                          <ScheduledPostCard
                            key={post.id}
                            post={post}
                            variant="compact"
                            onUpdate={onUpdatePost}
                            onDelete={onDeletePost}
                            onPublishToInstagram={onPublishToInstagram}
                            publishingState={publishingStates[post.id] || null}
                          />
                        ))}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary Footer */}
      <div className="border-t border-white/[0.06] bg-[#060606] flex-shrink-0 overflow-x-auto">
        <div className="grid grid-cols-8 min-w-[720px]">
          {/* Label column */}
          <div className="p-3 border-r border-white/[0.06] flex flex-col justify-center">
            <div className="text-[10px] font-medium text-white/30 text-center uppercase tracking-wider">
              Resumo
            </div>
          </div>
          {/* Day columns */}
          {weekDays.map((day) => {
            const posts = getPostsForDate(day.date);
            const scheduled = posts.filter((p) => p.status === "scheduled").length;
            const publishing = posts.filter((p) => p.status === "publishing").length;
            const published = posts.filter((p) => p.status === "published").length;
            const failed = posts.filter((p) => p.status === "failed").length;
            const total = posts.length;

            // Get next scheduled post for this day
            const nextPost = posts.find((p) => p.status === "scheduled");
            const hasActivity = total > 0;

            return (
              <div
                key={day.date}
                onClick={() => hasActivity && setSelectedDaySummary({
                  date: day.date,
                  dayName: day.dayName,
                  dayNumber: day.dayNumber,
                  month: day.month,
                })}
                className={`p-2 border-r border-white/[0.06] last:border-r-0 min-h-[80px] ${day.isToday ? "bg-white/[0.02]" : ""
                  } ${hasActivity ? "cursor-pointer hover:bg-white/[0.02] transition-colors" : ""}`}
              >
                {hasActivity ? (
                  <div className="space-y-1.5">
                    {/* Status badges */}
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {published > 0 && (
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/[0.1] rounded-md">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
                          <span className="text-[8px] font-medium text-emerald-400/70">
                            {published}
                          </span>
                        </div>
                      )}
                      {failed > 0 && (
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500/[0.1] rounded-md">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400/70" />
                          <span className="text-[8px] font-medium text-red-400/70">
                            {failed}
                          </span>
                        </div>
                      )}
                      {publishing > 0 && (
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/[0.1] rounded-md">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400/70 animate-pulse" />
                          <span className="text-[8px] font-medium text-amber-400/70">
                            {publishing}
                          </span>
                        </div>
                      )}
                      {scheduled > 0 && (
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white/[0.04] rounded-md">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                          <span className="text-[8px] font-medium text-white/30">
                            {scheduled}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Next scheduled info */}
                    {nextPost && (
                      <div className="text-center">
                        <div className="text-[7px] text-white/25 uppercase tracking-wider">
                          Proximo
                        </div>
                        <div className="text-[9px] font-medium text-white/40">
                          {nextPost.scheduledTime}
                        </div>
                      </div>
                    )}

                    {/* All published indicator */}
                    {published === total && total > 0 && (
                      <div className="text-center">
                        <div className="text-[8px] font-medium text-emerald-400/60">
                          Todos publicados
                        </div>
                      </div>
                    )}

                    {/* Has failures indicator */}
                    {failed > 0 && (
                      <div className="text-center">
                        <div className="text-[8px] font-medium text-red-400/60">
                          {failed} {failed === 1 ? "falhou" : "falharam"}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-2">
                    <div className="w-6 h-6 rounded-lg border border-dashed border-white/[0.08] flex items-center justify-center mb-1">
                      <span className="text-[10px] text-white/20">-</span>
                    </div>
                    <span className="text-[8px] text-white/20">Sem posts</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Summary Modal */}
      {selectedDaySummary && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedDaySummary(null)}
        >
          <div
            className="bg-[#0a0a0a] border border-white/[0.08] rounded-2xl w-full max-w-xl max-h-[85vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex flex-col items-center justify-center">
                  <span className="text-xl font-light text-white">{selectedDaySummary.dayNumber}</span>
                  <span className="text-[9px] text-white/40">{selectedDaySummary.month}</span>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">{selectedDaySummary.dayName}</h3>
                  <p className="text-xs text-white/40 mt-0.5">
                    {getPostsForDate(selectedDaySummary.date).length} posts agendados
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDaySummary(null)}
                className="p-2 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06]"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="px-4 pb-4 overflow-y-auto max-h-[65vh]">
              <div className="space-y-2">
                {getPostsForDate(selectedDaySummary.date).map((post) => {
                  const contentType = post.instagramContentType;
                  const typeLabel = contentType === 'story' ? 'Story' :
                    contentType === 'carousel' ? 'Carousel' :
                      contentType === 'reel' ? 'Reel' : null;

                  return (
                    <div
                      key={post.id}
                      className="group flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all"
                    >
                      {/* Thumbnail */}
                      <div
                        onClick={() => {
                          if (onPostClick) {
                            setSelectedDaySummary(null);
                            onPostClick(post);
                          }
                        }}
                        className={onPostClick ? "cursor-pointer" : ""}
                      >
                        {post.imageUrl ? (
                          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.03] border border-white/[0.06] transition-colors">
                            <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0 border border-white/[0.06] transition-colors">
                            <Icon name="image" className="w-6 h-6 text-white/20" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-white">{post.scheduledTime}</span>
                          {typeLabel && (
                            <span className="text-[9px] font-medium text-white/40 px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-md">{typeLabel}</span>
                          )}
                          {post.status === 'published' && (
                            <span className="text-[9px] font-medium text-emerald-400/80 px-2 py-0.5 bg-emerald-500/[0.08] border border-emerald-500/[0.15] rounded-md">Publicado</span>
                          )}
                          {post.status === 'failed' && (
                            <span className="text-[9px] font-medium text-red-400/80 px-2 py-0.5 bg-red-500/[0.08] border border-red-500/[0.15] rounded-md">Falhou</span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 line-clamp-2">
                          {post.caption || 'Sem legenda'}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {post.status === 'scheduled' && (
                          <>
                            {onPublishToInstagram && (
                              <button
                                onClick={() => onPublishToInstagram(post)}
                                className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                                title="Publicar agora"
                              >
                                <Icon name="send" className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const newTime = prompt('Nova hora (HH:MM):', post.scheduledTime);
                                if (newTime && /^\d{2}:\d{2}$/.test(newTime)) {
                                  onUpdatePost(post.id, { scheduledTime: newTime });
                                }
                              }}
                              className="p-2 text-white/30 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
                              title="Reagendar"
                            >
                              <Icon name="clock" className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                onUpdatePost(post.id, { status: 'published', publishedAt: Date.now() });
                              }}
                              className="p-2 text-white/30 hover:text-emerald-400/70 hover:bg-emerald-500/[0.08] rounded-lg transition-colors"
                              title="Marcar como publicado"
                            >
                              <Icon name="check" className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => onDeletePost(post.id)}
                          className="p-2 text-white/30 hover:text-red-400/70 hover:bg-red-500/[0.08] rounded-lg transition-colors"
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
                  setSelectedDaySummary(null);
                  onDayClick(selectedDaySummary.date);
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
    </div>
  );
};
