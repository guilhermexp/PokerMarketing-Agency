import React from 'react';
import { Icon } from '../common/Icon';

// Generate time slots from 6:00 to 23:45 in 15-minute intervals
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = 6; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      slots.push(timeStr);
    }
  }
  return slots;
};

export const TIME_SLOTS = generateTimeSlots();

// Convert 24h time format to 12h
export const formatTime12h = (time24h: string) => {
  const [hours, minutes] = time24h.split(':');
  const hour = parseInt(hours);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${minutes}${period}`;
};

// Calendar helper
export const getDaysInMonth = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  return { daysInMonth, startingDayOfWeek };
};

interface ScheduleConfigProps {
  scheduledDate: string;
  scheduledTime: string;
  calendarDate: Date;
  todayStr: string;
  monthName: string;
  daysInMonth: number;
  startingDayOfWeek: number;
  timeFormat: '12h' | '24h';
  timeListRef: React.RefObject<HTMLDivElement | null>;
  isTimeInPast: boolean;
  hasSelectedImages: boolean;
  onSelectDate: (day: number) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onTimeChange: (time: string) => void;
  onTimeFormatChange: (format: '12h' | '24h') => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const ScheduleConfig: React.FC<ScheduleConfigProps> = ({
  scheduledDate,
  scheduledTime,
  todayStr,
  monthName,
  daysInMonth,
  startingDayOfWeek,
  timeFormat,
  timeListRef,
  isTimeInPast,
  hasSelectedImages,
  onSelectDate,
  onPreviousMonth,
  onNextMonth,
  onTimeChange,
  onTimeFormatChange,
  onSubmit,
  onClose,
  calendarDate,
}) => {
  return (
    <>
      {/* Middle Column - Calendar */}
      <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-white capitalize">
            {monthName}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={onPreviousMonth}
              className="w-9 h-9 rounded-lg bg-[#070707] backdrop-blur-xl border border-border text-white/70 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center"
            >
              <Icon name="chevron-left" className="w-4 h-4" />
            </button>
            <button
              onClick={onNextMonth}
              className="w-9 h-9 rounded-lg bg-[#070707] backdrop-blur-xl border border-border text-white/70 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center"
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 flex flex-col">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 sm:mb-3">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day) => (
              <div
                key={day}
                className="text-center text-[10px] sm:text-xs font-semibold text-muted-foreground py-1 sm:py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 flex-1">
            {/* Empty cells for days before month starts */}
            {Array.from({ length: startingDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {/* Actual days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = dateStr === scheduledDate;
              const isPast = dateStr < todayStr;
              const isCurrentDay = dateStr === todayStr;

              return (
                <button
                  key={day}
                  onClick={() => !isPast && onSelectDate(day)}
                  disabled={isPast}
                  className={`aspect-square rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center justify-center ${
                    isSelected
                      ? 'bg-white text-black shadow-lg'
                      : isPast
                        ? 'text-muted-foreground cursor-not-allowed'
                        : isCurrentDay
                          ? 'bg-white/10 text-white border border-border hover:bg-white/20'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Close Button at bottom */}
        <button
          onClick={onClose}
          className="mt-4 sm:mt-6 w-full py-2.5 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-all"
        >
          Cancelar
        </button>
      </div>

      {/* Right Column - Time Slots */}
      <div className="w-full sm:w-72 bg-[#070707] border-t sm:border-t-0 sm:border-l border-border flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <h3 className="text-xs sm:text-sm font-semibold text-white">Horário</h3>
            <div className="flex gap-1">
              <button
                onClick={() => onTimeFormatChange('12h')}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  timeFormat === '12h'
                    ? 'bg-background/60 backdrop-blur-xl border border-border text-white'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                12h
              </button>
              <button
                onClick={() => onTimeFormatChange('24h')}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  timeFormat === '24h'
                    ? 'bg-background/60 backdrop-blur-xl border border-border text-white'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                24h
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleDateString('pt-BR', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })}
          </p>
        </div>

        {/* Time Slots List */}
        <div ref={timeListRef} className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5 sm:space-y-2">
          {TIME_SLOTS.map((time) => {
            const isSelected = time === scheduledTime;
            const isPast = scheduledDate === todayStr && time <= new Date().toTimeString().slice(0, 5);

            return (
              <button
                key={time}
                onClick={() => !isPast && onTimeChange(time)}
                disabled={isPast}
                className={`w-full py-2.5 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  isSelected
                    ? 'bg-white text-black shadow-lg'
                    : isPast
                      ? 'bg-background/30 text-muted-foreground cursor-not-allowed border border-border'
                      : 'bg-background/60 backdrop-blur-xl text-white/70 hover:bg-white/5 hover:text-white border border-border'
                }`}
              >
                {timeFormat === '12h' ? formatTime12h(time) : time}
              </button>
            );
          })}
        </div>

        {/* Continue Button */}
        <div className="p-3 sm:p-4 border-t border-border">
          <button
            onClick={onSubmit}
            disabled={!hasSelectedImages || isTimeInPast}
            className="w-full py-2.5 sm:py-3 bg-white text-black text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-white/20"
          >
            Agendar Publicação
          </button>
        </div>
      </div>
    </>
  );
};
