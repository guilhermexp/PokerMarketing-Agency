/**
 * Flyer Generator Utilities
 *
 * Helper functions used across flyer components.
 */

import type { Currency } from '@/types/flyer.types';
import type { TimePeriod } from '@/types/flyer.types';

// Check if we're in development mode (QStash won't work locally)
export const isDevMode =
  typeof window !== "undefined" && window.location.hostname === "localhost";

// ============================================
// Currency Formatting
// ============================================

export const formatCurrencyValue = (val: string, currency: Currency): string => {
  if (!val || val === '0' || val === '') return '---';
  const num = parseFloat(String(val).replace(/[^0-9.-]+/g, '')) || 0;
  if (num === 0) return '---';
  if (currency === 'USD') return `$${num.toLocaleString('en-US')}`;
  return `R$ ${(num * 5).toLocaleString('pt-BR', { minimumFractionDigits: num % 1 !== 0 ? 2 : 0 })}`;
};

// ============================================
// Time Period Utilities
// ============================================

export const DAY_TRANSLATIONS: Record<string, string> = {
  MONDAY: 'Segunda',
  TUESDAY: 'Terça',
  WEDNESSDAY: 'Quarta',
  THURSDAY: 'Quinta',
  FRIDAY: 'Sexta',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

export const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESSDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export const PERIOD_LABELS: Record<"pt" | "en", Record<TimePeriod, string>> = {
  pt: {
    ALL: 'Todos',
    MORNING: 'Manhã',
    AFTERNOON: 'Tarde',
    NIGHT: 'Noite',
    HIGHLIGHTS: 'Destaques',
  },
  en: {
    ALL: 'All',
    MORNING: 'Morning',
    AFTERNOON: 'Afternoon',
    NIGHT: 'Night',
    HIGHLIGHTS: 'Highlights',
  }
};

export const PERIOD_ORDER: TimePeriod[] = ['MORNING', 'AFTERNOON', 'NIGHT', 'HIGHLIGHTS'];

export const getInitialTimeForPeriod = (period: TimePeriod): string => {
  switch (period) {
    case "MORNING":
      return "06:00";
    case "AFTERNOON":
      return "12:00";
    case "NIGHT":
      return "18:00";
    case "HIGHLIGHTS":
      return "19:00";
    case "ALL":
      return "08:00";
    default:
      return "09:00";
  }
};

// ============================================
// File Utilities
// ============================================

export const fileToBase64 = (
  file: File,
): Promise<{ base64: string; mimeType: string; dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType: file.type, dataUrl });
    };
    reader.onerror = (error) => reject(error);
  });

// ============================================
// Sort Utilities
// ============================================

export const getSortValue = (timeStr: string): number => {
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
};

export const parseGtd = (gtd: string): number => {
  const num = parseFloat(gtd.replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : num;
};

// ============================================
// Date Utilities
// ============================================

export const getDayDate = (day: string): string => {
  const now = new Date();
  const currentDayIndex = now.getDay();
  const targetDayIndex = DAY_ORDER.indexOf(day);
  const diff = targetDayIndex - currentDayIndex;
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + diff);
  return targetDate.toLocaleDateString('pt-BR');
};

export const getScheduleDate = (day: string): string => {
  const now = new Date();
  const currentDayIndex = now.getDay();
  const targetDayIndex = DAY_ORDER.indexOf(day);
  let diff = targetDayIndex - currentDayIndex;
  if (diff < 0) diff += 7;
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + diff);
  return targetDate.toISOString().split('T')[0];
};

// ============================================
// Filter Utilities
// ============================================

export const getEventsByPeriod = (
  events: import('@/types').TournamentEvent[],
  period: TimePeriod,
): import('@/types').TournamentEvent[] => {
  const periodHours: Record<TimePeriod, [number, number]> = {
    ALL: [0, 24],
    MORNING: [0, 12],
    AFTERNOON: [12, 18],
    NIGHT: [18, 24],
    HIGHLIGHTS: [18, 24],
  };

  const [startHour, endHour] = periodHours[period] || [0, 24];

  return events.filter((event) => {
    const time = event.times?.['-3'] || '';
    const hourMatch = time.match(/(\d{1,2}):(\d{2})/);
    if (!hourMatch) return period === 'HIGHLIGHTS';

    const hour = parseInt(hourMatch[1]);
    return hour >= startHour && hour < endHour;
  });
};
