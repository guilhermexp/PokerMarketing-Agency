/**
 * Excel Processor
 *
 * Handles parsing and processing of tournament schedule Excel files.
 */

import type { TournamentEvent, WeekScheduleInfo } from '@/types';
import type { TimePeriod } from '@/types/flyer.types';

export interface ParsedSchedule {
  tournaments: TournamentEvent[];
  scheduleInfo: WeekScheduleInfo;
}

export interface ExcelRow {
  Day?: string;
  NAME?: string;
  GAME?: string;
  GTD?: string;
  BUYIN?: string;
  REBUY?: string;
  ADDON?: string;
  STACK?: string;
  PLAYERS?: string;
  LATE_REG?: string;
  MINUTES?: string;
  STRUCTURE?: string;
  TIME?: string;
}

/**
 * Parse Excel row data into TournamentEvent format
 */
const parseRowToEvent = (row: ExcelRow, day: string): TournamentEvent => {
  const timeMatch = row.TIME?.match(/(\d{1,2}):(\d{2})/);
  const hours: Record<string, string> = {};

  if (timeMatch) {
    const timeValue = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    hours['-3'] = timeValue;
    // Add other timezone offsets if needed
    hours['0'] = `${(parseInt(timeMatch[1]) + 3).toString().padStart(2, '0')}:${timeMatch[2]}`;
  }

  return {
    id: `${day}-${row.NAME?.replace(/\s+/g, '-').toLowerCase() || Date.now()}`,
    day,
    name: row.NAME || 'Torneio',
    game: row.GAME || 'Holdem',
    gtd: row.GTD || '0',
    buyIn: row.BUYIN || '0',
    rebuy: row.REBUY || '0',
    addOn: row.ADDON || '0',
    stack: row.STACK || '',
    players: row.PLAYERS || '',
    lateReg: row.LATE_REG || '',
    minutes: row.MINUTES || '',
    structure: row.STRUCTURE || '',
    times: hours,
  };
};

/**
 * Determine period based on time
 */
const getPeriod = (time: string): TimePeriod => {
  const match = time.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 'NIGHT';

  const hour = parseInt(match[1]);

  if (hour < 12) return 'MORNING';
  if (hour < 18) return 'AFTERNOON';
  return 'NIGHT';
};

/**
 * Process raw Excel data into structured schedule
 */
export const processExcelData = (
  data: ExcelRow[],
  filename: string,
  startDate: string,
  endDate: string,
): ParsedSchedule => {
  const tournaments: TournamentEvent[] = [];
  const dailyFlyerUrls: Record<TimePeriod, string[]> = {
    ALL: [],
    MORNING: [],
    AFTERNOON: [],
    NIGHT: [],
    HIGHLIGHTS: [],
  };

  // Group events by day
  const eventsByDay: Record<string, ExcelRow[]> = {};

  data.forEach((row) => {
    const day = row.Day?.toUpperCase().trim() || 'MONDAY';
    if (!eventsByDay[day]) {
      eventsByDay[day] = [];
    }
    eventsByDay[day].push(row);
  });

  // Convert to TournamentEvent array
  Object.entries(eventsByDay).forEach(([day, dayEvents]) => {
    dayEvents.forEach((row) => {
      const event = parseRowToEvent(row, day);
      tournaments.push(event);

      // Add to daily flyer URLs based on period
      const time = row.TIME || '';
      const period = getPeriod(time);
      if (period !== 'ALL') {
        dailyFlyerUrls[period] = dailyFlyerUrls[period] || [];
      }
    });
  });

  const scheduleInfo: WeekScheduleInfo = {
    id: `schedule-${Date.now()}`,
    startDate,
    endDate,
    filename,
    daily_flyer_urls: dailyFlyerUrls,
  };

  return {
    tournaments,
    scheduleInfo,
  };
};

/**
 * Validate Excel data structure
 */
export const validateExcelData = (data: ExcelRow[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data || data.length === 0) {
    errors.push('No data found in file');
    return { valid: false, errors };
  }

  // Check for required columns
  const requiredColumns = ['Day', 'NAME', 'TIME'];
  const firstRow = data[0];

  requiredColumns.forEach((col) => {
    if (!(col in firstRow)) {
      errors.push(`Missing required column: ${col}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Generate summary statistics from schedule
 */
export const generateScheduleStats = (tournaments: TournamentEvent[]) => {
  const totalEvents = tournaments.length;
  const activeDays = new Set(tournaments.map((t) => t.day)).size;

  // Count tournaments by day
  const byDay: Record<string, number> = {};
  tournaments.forEach((t) => {
    byDay[t.day] = (byDay[t.day] || 0) + 1;
  });

  // Count tournaments by period
  const byPeriod: Record<TimePeriod, number> = {
    ALL: 0,
    MORNING: 0,
    AFTERNOON: 0,
    NIGHT: 0,
    HIGHLIGHTS: 0,
  };

  tournaments.forEach((t) => {
    const time = t.times?.['-3'] || '';
    const period = getPeriod(time);
    byPeriod[period]++;
  });

  // Calculate total GTD
  let totalGtd = 0;
  tournaments.forEach((t) => {
    const gtdValue = parseFloat(t.gtd.replace(/[^0-9.-]/g, ''));
    if (!isNaN(gtdValue)) {
      totalGtd += gtdValue;
    }
  });

  return {
    totalEvents,
    activeDays,
    byDay,
    byPeriod,
    totalGtd,
  };
};
