import React, { useMemo, useRef, useEffect } from "react";
import type { ScheduledPost, InstagramPublishState } from "../../types";
import { ScheduledPostCard } from "./ScheduledPostCard";

interface WeeklyCalendarProps {
  currentDate: Date;
  scheduledPosts: ScheduledPost[];
  onDayClick: (date: string) => void;
  onUpdatePost: (postId: string, updates: Partial<ScheduledPost>) => void;
  onDeletePost: (postId: string) => void;
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
  onPublishToInstagram,
  publishingStates,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentHourRef = useRef<HTMLDivElement>(null);

  // Get current time info
  const now = new Date();
  const currentHour = now.getHours();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Generate hours starting from current hour (for today) or from 6am
  const hours = useMemo(() => {
    // Show from current hour onwards, minimum starting at 6am
    const startHour = Math.max(0, currentHour - 1); // Show 1 hour before current
    return Array.from({ length: 24 - startHour }, (_, i) => startHour + i);
  }, [currentHour]);

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
                        onClick={() => !isPastSlot && onDayClick(day.date)}
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
      <div className="border-t border-white/5 p-3 bg-black/40 flex-shrink-0 overflow-x-auto">
        <div className="grid grid-cols-8 gap-2 min-w-[720px]">
          <div className="text-[8px] font-black text-white/20 uppercase text-center">
            Total
          </div>
          {weekDays.map((day) => {
            const posts = getPostsForDate(day.date);
            const scheduled = posts.filter(
              (p) => p.status === "scheduled",
            ).length;
            const published = posts.filter(
              (p) => p.status === "published",
            ).length;

            return (
              <div key={day.date} className="text-center">
                {posts.length > 0 ? (
                  <div className="flex items-center justify-center gap-2">
                    {scheduled > 0 && (
                      <span className="text-[9px] font-bold text-amber-500">
                        {scheduled}
                      </span>
                    )}
                    {published > 0 && (
                      <span className="text-[9px] font-bold text-green-500">
                        {published}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[9px] text-white/10">-</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
