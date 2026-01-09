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
        <div className="grid grid-cols-8 border-b border-white/5 min-w-[720px]">
          {/* Time column header */}
          <div className="py-3 px-2 text-center text-[9px] font-black text-white/20 uppercase tracking-wider border-r border-white/5">
            Hora
          </div>
          {/* Day columns */}
          {weekDays.map((day) => (
            <div
              key={day.date}
              className={`py-3 px-2 text-center border-r border-white/5 last:border-r-0 ${
                day.isToday ? "bg-primary/10" : ""
              }`}
            >
              <div className="text-[8px] font-black text-white/30 uppercase tracking-wider">
                {day.dayName}
              </div>
              <div
                className={`text-lg font-black ${day.isToday ? "text-primary" : "text-white/60"}`}
              >
                {day.dayNumber}
              </div>
              <div className="text-[8px] text-white/20 uppercase">
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
                    className={`py-3 px-2 text-center text-[9px] font-bold border-b border-r border-white/5 sticky left-0 bg-[#111111] ${
                      isCurrentHour ? "text-primary" : "text-white/20"
                    }`}
                  >
                    {String(hour).padStart(2, "0")}:00
                    {isCurrentHour && (
                      <span className="ml-1 text-[7px]">←</span>
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
                        min-h-[60px] p-1 border-b border-r border-white/5 last:border-r-0
                        transition-colors
                        ${
                          isPastSlot
                            ? "bg-black/40 opacity-30 cursor-not-allowed"
                            : "cursor-pointer hover:bg-white/5"
                        }
                        ${day.isToday && !isPastSlot ? "bg-primary/5" : ""}
                        ${isCurrentHour && day.isToday ? "ring-1 ring-primary/30" : ""}
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
      <div className="border-t border-white/5 bg-black/40 flex-shrink-0 overflow-x-auto">
        <div className="grid grid-cols-8 min-w-[720px]">
          {/* Label column */}
          <div className="p-3 border-r border-white/5 flex flex-col justify-center">
            <div className="text-[8px] font-black text-white/20 uppercase tracking-wider text-center">
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
            const hasUpcoming = scheduled > 0;
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
                className={`p-2 border-r border-white/5 last:border-r-0 min-h-[80px] ${
                  day.isToday ? "bg-primary/5" : ""
                } ${hasActivity ? "cursor-pointer hover:bg-white/5 transition-colors" : ""}`}
              >
                {hasActivity ? (
                  <div className="space-y-1.5">
                    {/* Status badges */}
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {published > 0 && (
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-green-500/20 rounded">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          <span className="text-[8px] font-bold text-green-400">
                            {published}
                          </span>
                        </div>
                      )}
                      {failed > 0 && (
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-500/20 rounded">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          <span className="text-[8px] font-bold text-red-400">
                            {failed}
                          </span>
                        </div>
                      )}
                      {publishing > 0 && (
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/20 rounded">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-[8px] font-bold text-amber-400">
                            {publishing}
                          </span>
                        </div>
                      )}
                      {scheduled > 0 && (
                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white/10 rounded">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                          <span className="text-[8px] font-bold text-white/60">
                            {scheduled}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Next scheduled info */}
                    {nextPost && (
                      <div className="text-center">
                        <div className="text-[7px] text-white/30 uppercase tracking-wider">
                          Próximo
                        </div>
                        <div className="text-[9px] font-bold text-white/50">
                          {nextPost.scheduledTime}
                        </div>
                      </div>
                    )}

                    {/* All published indicator */}
                    {published === total && total > 0 && (
                      <div className="text-center">
                        <div className="text-[8px] font-bold text-green-400/80">
                          ✓ Todos publicados
                        </div>
                      </div>
                    )}

                    {/* Has failures indicator */}
                    {failed > 0 && (
                      <div className="text-center">
                        <div className="text-[8px] font-bold text-red-400/80">
                          ✗ {failed} {failed === 1 ? "falhou" : "falharam"}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-2">
                    <div className="w-6 h-6 rounded-full border border-dashed border-white/10 flex items-center justify-center mb-1">
                      <span className="text-[10px] text-white/20">—</span>
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
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedDaySummary(null)}
        >
          <div
            className="bg-[#0a0a0a] border border-white/[0.06] rounded-xl w-full max-w-xl max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Minimal */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.06] flex flex-col items-center justify-center">
                  <span className="text-xs font-black text-white">{selectedDaySummary.dayNumber}</span>
                  <span className="text-[8px] text-white/40 uppercase">{selectedDaySummary.month}</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white/90">{selectedDaySummary.dayName}</h3>
                  <p className="text-[10px] text-white/40">
                    {getPostsForDate(selectedDaySummary.date).length} posts agendados
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDaySummary(null)}
                className="p-1.5 text-white/30 hover:text-white/60 transition-colors"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content - Clean List */}
            <div className="px-4 pb-4 overflow-y-auto max-h-[65vh]">
              <div className="space-y-2">
                {getPostsForDate(selectedDaySummary.date).map((post) => {
                  const contentType = post.instagramContentType;
                  const typeLabel = contentType === 'story' ? 'Story' :
                                   contentType === 'carousel' ? 'Carousel' :
                                   contentType === 'reel' ? 'Reel' : null;
                  const statusColor = post.status === 'published' ? 'text-emerald-400' :
                                     post.status === 'failed' ? 'text-red-400' :
                                     post.status === 'publishing' ? 'text-amber-400' : 'text-white/50';

                  return (
                    <div
                      key={post.id}
                      className="group flex items-center gap-4 p-3 rounded-xl hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/[0.06]"
                    >
                      {/* Thumbnail - Clickable */}
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
                          <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-white/5 border border-white/10 hover:border-white/30 transition-colors">
                            <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-24 h-24 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10 hover:border-white/30 transition-colors">
                            <Icon name="image" className="w-8 h-8 text-white/20" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-white/90">{post.scheduledTime}</span>
                          {typeLabel && (
                            <span className="text-[10px] font-bold text-white/40 uppercase px-1.5 py-0.5 bg-white/5 rounded">{typeLabel}</span>
                          )}
                          {post.status === 'published' && (
                            <span className="text-[10px] font-bold text-emerald-400 uppercase px-1.5 py-0.5 bg-emerald-500/10 rounded">Publicado</span>
                          )}
                          {post.status === 'failed' && (
                            <span className="text-[10px] font-bold text-red-400 uppercase px-1.5 py-0.5 bg-red-500/10 rounded">Falhou</span>
                          )}
                        </div>
                        <p className="text-xs text-white/50 line-clamp-2">
                          {post.caption || 'Sem legenda'}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5">
                        {post.status === 'scheduled' && (
                          <>
                            {onPublishToInstagram && (
                              <button
                                onClick={() => onPublishToInstagram(post)}
                                className="p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                title="Publicar agora"
                              >
                                <Icon name="send" className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const newTime = prompt('Nova hora (HH:MM):', post.scheduledTime);
                                if (newTime && /^\d{2}:\d{2}$/.test(newTime)) {
                                  onUpdatePost(post.id, { scheduledTime: newTime });
                                }
                              }}
                              className="p-1.5 text-white/30 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                              title="Reagendar"
                            >
                              <Icon name="clock" className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                onUpdatePost(post.id, { status: 'published', publishedAt: Date.now() });
                              }}
                              className="p-1.5 text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors"
                              title="Marcar como publicado"
                            >
                              <Icon name="check" className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => onDeletePost(post.id)}
                          className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                          title="Excluir"
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer - Minimal */}
            <div className="px-3 pb-3">
              <button
                onClick={() => {
                  setSelectedDaySummary(null);
                  onDayClick(selectedDaySummary.date);
                }}
                className="w-full py-2.5 text-[10px] font-bold text-primary/80 uppercase tracking-wide bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded-lg transition-colors"
              >
                + Novo agendamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
