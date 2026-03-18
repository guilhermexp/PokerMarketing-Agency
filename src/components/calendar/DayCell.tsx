import React from "react";
import type { ScheduledPost } from "../../types";

interface DayCellData {
  date: number | null;
  dateStr: string | null;
  posts: ScheduledPost[];
}

interface DayCellProps {
  day: DayCellData;
  index: number;
  isToday: boolean;
  onDayClick: (dateStr: string) => void;
  onDayViewClick: (dateStr: string) => void;
  onPostClick: (post: ScheduledPost) => void;
}

export const DayCell: React.FC<DayCellProps> = ({
  day,
  index,
  isToday,
  onDayClick,
  onDayViewClick,
  onPostClick,
}) => {
  return (
    <div
      onClick={() => day.dateStr && onDayClick(day.dateStr)}
      className={`min-h-[72px] sm:min-h-[90px] md:min-h-[120px] p-1.5 sm:p-2 md:p-3 transition-all flex flex-col border-b border-r border-white/[0.04] ${
        day.date ? "cursor-pointer hover:bg-white/[0.02]" : ""
      } ${isToday ? "bg-white/[0.03]" : ""} ${
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
                  onDayViewClick(day.dateStr);
                }
              }}
              className={`text-sm md:text-lg font-light transition-colors ${
                isToday ? "text-white" : "text-white/40"
              } ${day.posts.length > 0 ? "cursor-pointer hover:text-white/80" : ""}`}
            >
              {day.date}
            </span>
            {day.posts.length > 0 && (
              <span className="text-[9px] font-medium text-white/20">
                {day.posts.length}
              </span>
            )}
          </div>
          {/* Mobile: show dots for posts */}
          <div className="md:hidden flex flex-wrap gap-0.5 mt-auto">
            {day.posts.slice(0, 4).map((post) => (
              <div
                key={post.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onPostClick(post);
                }}
                className={`w-1.5 h-1.5 rounded-full cursor-pointer ${
                  post.status === "published"
                    ? "bg-emerald-500/50"
                    : post.status === "failed"
                      ? "bg-red-500/50"
                      : "bg-white/20"
                }`}
              />
            ))}
            {day.posts.length > 4 && (
              <span className="text-[7px] text-white/20">
                +{day.posts.length - 4}
              </span>
            )}
          </div>
          {/* Desktop: show post cards */}
          <div className="hidden md:flex flex-col gap-1 mt-auto">
            {day.posts.slice(0, 2).map((post) => (
              <div
                key={post.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onPostClick(post);
                }}
                className="text-[10px] px-1.5 py-1 rounded-md transition-all hover:bg-white/[0.04] cursor-pointer flex items-center gap-1.5"
              >
                <span
                  className={`w-1 h-1 rounded-full flex-shrink-0 ${
                    post.status === "published"
                      ? "bg-emerald-500/60"
                      : post.status === "failed"
                        ? "bg-red-500/60"
                        : "bg-white/20"
                  }`}
                />
                <span className="font-medium text-white/50 truncate">
                  {post.scheduledTime}
                </span>
              </div>
            ))}
            {day.posts.length > 2 && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (day.dateStr) onDayViewClick(day.dateStr);
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
};
