/**
 * Tournament API - Poker tournament schedule operations
 *
 * Handles Week Schedules, Tournament Events, and Flyer management.
 */

import { fetchApi } from './client';

// =============================================================================
// Types
// =============================================================================

export interface DbWeekSchedule {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  filename: string | null;
  original_filename: string | null;
  daily_flyer_urls?: Record<string, string[]>;
  created_at: string;
  updated_at: string;
}

export interface DbTournamentEvent {
  id: string;
  user_id: string;
  week_schedule_id: string | null;
  day_of_week: string;
  name: string;
  game: string | null;
  gtd: string | null;
  buy_in: string | null;
  rebuy: string | null;
  add_on: string | null;
  stack: string | null;
  players: string | null;
  late_reg: string | null;
  minutes: string | null;
  structure: string | null;
  times: Record<string, string>;
  event_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface TournamentData {
  schedule: DbWeekSchedule | null;
  events: DbTournamentEvent[];
}

export interface WeekScheduleWithCount extends DbWeekSchedule {
  event_count: number;
}

// =============================================================================
// Tournament Data Operations
// =============================================================================

/**
 * Get current week schedule and events
 */
export async function getTournamentData(
  userId: string,
  organizationId?: string | null,
): Promise<TournamentData> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<TournamentData>(`/tournaments?${params}`);
}

/**
 * Get all week schedules for a user
 */
export async function getWeekSchedulesList(
  userId: string,
  organizationId?: string | null,
): Promise<{ schedules: WeekScheduleWithCount[] }> {
  const params = new URLSearchParams({ user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<{ schedules: WeekScheduleWithCount[] }>(
    `/tournaments/list?${params}`,
  );
}

/**
 * Load events for a specific schedule
 */
export async function getScheduleEvents(
  userId: string,
  scheduleId: string,
  organizationId?: string | null,
): Promise<{ events: DbTournamentEvent[] }> {
  const params = new URLSearchParams({
    user_id: userId,
    week_schedule_id: scheduleId,
  });
  if (organizationId) params.append('organization_id', organizationId);
  return fetchApi<{ events: DbTournamentEvent[] }>(`/tournaments?${params}`);
}

/**
 * Create new week schedule with events
 */
export async function createWeekSchedule(
  userId: string,
  data: {
    start_date: string;
    end_date: string;
    filename?: string;
    organization_id?: string | null;
    events: Array<{
      day: string;
      name: string;
      game?: string;
      gtd?: string;
      buyIn?: string;
      rebuy?: string;
      addOn?: string;
      stack?: string;
      players?: string;
      lateReg?: string;
      minutes?: string;
      structure?: string;
      times?: Record<string, string>;
      eventDate?: string;
    }>;
  },
): Promise<{ schedule: DbWeekSchedule; eventsCount: number }> {
  return fetchApi<{ schedule: DbWeekSchedule; eventsCount: number }>(
    '/tournaments',
    {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, ...data }),
    },
  );
}

/**
 * Delete week schedule and its events
 */
export async function deleteWeekSchedule(
  userId: string,
  scheduleId: string,
  organizationId?: string | null,
): Promise<void> {
  const params = new URLSearchParams({ id: scheduleId, user_id: userId });
  if (organizationId) params.append('organization_id', organizationId);
  await fetchApi(`/tournaments?${params}`, { method: 'DELETE' });
}

// =============================================================================
// Tournament Flyer Operations
// =============================================================================

export async function addEventFlyer(
  eventId: string,
  flyerUrl: string,
): Promise<unknown> {
  return fetchApi(`/tournaments/event-flyer?event_id=${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ flyer_url: flyerUrl, action: 'add' }),
  });
}

export async function removeEventFlyer(
  eventId: string,
  flyerUrl: string,
): Promise<unknown> {
  return fetchApi(`/tournaments/event-flyer?event_id=${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify({ flyer_url: flyerUrl, action: 'remove' }),
  });
}

export async function addDailyFlyer(
  scheduleId: string,
  period: string,
  flyerUrl: string,
): Promise<unknown> {
  return fetchApi(
    `/tournaments/daily-flyer?schedule_id=${scheduleId}&period=${period}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ flyer_url: flyerUrl, action: 'add' }),
    },
  );
}

export async function removeDailyFlyer(
  scheduleId: string,
  period: string,
  flyerUrl: string,
): Promise<unknown> {
  return fetchApi(
    `/tournaments/daily-flyer?schedule_id=${scheduleId}&period=${period}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ flyer_url: flyerUrl, action: 'remove' }),
    },
  );
}
