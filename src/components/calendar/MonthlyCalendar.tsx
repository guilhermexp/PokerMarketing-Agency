import React, { useMemo } from 'react';
import type { ScheduledPost, InstagramPublishState } from '../../types';
import { ScheduledPostCard } from './ScheduledPostCard';

interface MonthlyCalendarProps {
  currentDate: Date;
  scheduledPosts: ScheduledPost[];
  onDayClick: (date: string) => void;
  onUpdatePost: (postId: string, updates: Partial<ScheduledPost>) => void;
  onDeletePost: (postId: string) => void;
  onPublishToInstagram: (post: ScheduledPost) => void;
  publishingStates: Record<string, InstagramPublishState>;
}

const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const MonthlyCalendar: React.FC<MonthlyCalendarProps> = ({
  currentDate,
  scheduledPosts,
  onDayClick,
  onUpdatePost,
  onDeletePost,
  onPublishToInstagram,
  publishingStates
}) => {
  const { calendarDays, visibleWeeks } = useMemo(() => {
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

    // Agrupar dias em semanas
    const weeks: Array<typeof days> = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    // Determinar quais semanas devem ser visíveis
    // Uma semana é visível se contém o dia de hoje ou dias futuros
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const visibleWeekIndices: boolean[] = weeks.map((week, idx) => {
      const hasCurrentOrFuture = week.some(day => {
        const dayDate = new Date(day.date);
        return dayDate >= todayDate;
      });
      console.log(`Semana ${idx}:`, week.map(d => d.dayNumber).join(', '), '-> visível:', hasCurrentOrFuture);
      return hasCurrentOrFuture;
    });

    console.log('Hoje:', todayStr);
    console.log('Semanas visíveis:', visibleWeekIndices);

    return {
      calendarDays: days,
      visibleWeeks: visibleWeekIndices
    };
  }, [currentDate]);

  const getPostsForDate = (date: string): ScheduledPost[] => {
    return scheduledPosts.filter(post => post.scheduledDate === date);
  };

  // Filtrar apenas dias de semanas visíveis
  const visibleDays = useMemo(() => {
    const result: typeof calendarDays = [];
    for (let i = 0; i < calendarDays.length; i++) {
      const weekIndex = Math.floor(i / 7);
      if (visibleWeeks[weekIndex]) {
        result.push(calendarDays[i]);
      }
    }
    return result;
  }, [calendarDays, visibleWeeks]);

  // Calcular o número de linhas necessárias
  const numberOfRows = Math.ceil(visibleDays.length / 7);

  return (
    <div className="h-full flex flex-col">
      {/* Day Headers */}
      <div className="grid grid-cols-7 border-b border-white/10 bg-black/20">
        {dayNames.map(day => (
          <div
            key={day}
            className="py-3 text-center text-[10px] font-medium text-white/40"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div
        className="flex-1 grid grid-cols-7"
        style={{ gridTemplateRows: `repeat(${numberOfRows}, minmax(120px, 1fr))` }}
      >
        {visibleDays.map((day, index) => {
          const posts = getPostsForDate(day.date);
          const hasScheduled = posts.some(p => p.status === 'scheduled');
          const hasPublished = posts.some(p => p.status === 'published');
          const hasFailed = posts.some(p => p.status === 'failed');

          return (
            <div
              key={index}
              onClick={() => onDayClick(day.date)}
              className={`
                min-h-[120px] p-3 border-b border-r border-white/5 cursor-pointer
                transition-all hover:bg-white/[0.02]
                ${!day.isCurrentMonth ? 'bg-black/10' : ''}
                ${day.isToday ? 'border-2 border-white/20' : ''}
              `}
            >
              {/* Day Number */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`
                    text-3xl font-light
                    ${day.isToday
                      ? 'text-white'
                      : day.isCurrentMonth
                        ? 'text-white/80'
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
              <div className="space-y-1.5">
                {posts.slice(0, 3).map(post => (
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
                {posts.length > 3 && (
                  <div className="text-[9px] font-medium text-white/30 pl-1">
                    +{posts.length - 3} mais
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
