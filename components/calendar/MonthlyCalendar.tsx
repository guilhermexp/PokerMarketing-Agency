import React, { useMemo } from 'react';
import type { ScheduledPost } from '../../types';
import { ScheduledPostCard } from './ScheduledPostCard';

interface MonthlyCalendarProps {
  currentDate: Date;
  scheduledPosts: ScheduledPost[];
  onDayClick: (date: string) => void;
  onUpdatePost: (postId: string, updates: Partial<ScheduledPost>) => void;
  onDeletePost: (postId: string) => void;
}

const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const MonthlyCalendar: React.FC<MonthlyCalendarProps> = ({
  currentDate,
  scheduledPosts,
  onDayClick,
  onUpdatePost,
  onDeletePost
}) => {
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of the month
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();

    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    // Days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    const days: Array<{
      date: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Previous month days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        dayNumber: day,
        isCurrentMonth: false,
        isToday: false
      });
    }

    // Current month days
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        dayNumber: day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr
      });
    }

    // Next month days to fill the grid (6 rows x 7 days = 42)
    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        dayNumber: day,
        isCurrentMonth: false,
        isToday: false
      });
    }

    return days;
  }, [currentDate]);

  const getPostsForDate = (date: string): ScheduledPost[] => {
    return scheduledPosts.filter(post => post.scheduledDate === date);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Day Headers */}
      <div className="grid grid-cols-7 border-b border-white/5">
        {dayNames.map(day => (
          <div
            key={day}
            className="py-3 text-center text-[9px] font-black text-white/30 uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6">
        {calendarDays.map((day, index) => {
          const posts = getPostsForDate(day.date);
          const hasScheduled = posts.some(p => p.status === 'scheduled');
          const hasPublished = posts.some(p => p.status === 'published');
          const hasFailed = posts.some(p => p.status === 'failed');

          return (
            <div
              key={index}
              onClick={() => onDayClick(day.date)}
              className={`
                min-h-[100px] p-2 border-b border-r border-white/5 cursor-pointer
                transition-colors hover:bg-white/5
                ${!day.isCurrentMonth ? 'bg-black/20' : ''}
                ${day.isToday ? 'bg-primary/5' : ''}
              `}
            >
              {/* Day Number */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`
                    text-xs font-bold
                    ${day.isToday
                      ? 'w-6 h-6 flex items-center justify-center rounded-full bg-primary text-black'
                      : day.isCurrentMonth
                        ? 'text-white/60'
                        : 'text-white/20'
                    }
                  `}
                >
                  {day.dayNumber}
                </span>

                {/* Status Indicators */}
                {posts.length > 0 && (
                  <div className="flex items-center gap-1">
                    {hasScheduled && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                    {hasPublished && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                    {hasFailed && <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  </div>
                )}
              </div>

              {/* Scheduled Posts Preview */}
              <div className="space-y-1">
                {posts.slice(0, 2).map(post => (
                  <ScheduledPostCard
                    key={post.id}
                    post={post}
                    variant="compact"
                    onUpdate={onUpdatePost}
                    onDelete={onDeletePost}
                  />
                ))}
                {posts.length > 2 && (
                  <div className="text-[8px] font-bold text-white/30 uppercase tracking-wider pl-1">
                    +{posts.length - 2} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
