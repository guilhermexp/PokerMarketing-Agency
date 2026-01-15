/**
 * Flyer API
 *
 * API calls specific to flyer generation and management.
 */

import { fetchApi } from './client';
import type { GalleryImage } from '@/types';
import type { WeekScheduleInfo, TournamentEvent } from '@/types';
import type { TimePeriod } from '@/types/flyer.types';

export interface FlyerGenerationResponse {
  id: string;
  url: string;
  period: TimePeriod;
  eventId?: string;
  createdAt: string;
}

export interface FlyerUploadRequest {
  imageUrl: string;
  eventId?: string;
  period?: TimePeriod;
  scheduleId?: string;
  tournamentEventId?: string;
  day?: string;
}

export interface WeekScheduleWithCount {
  id: string;
  filename: string;
  startDate: string;
  endDate: string;
  eventCount: number;
  daily_flyer_urls?: Record<string, string[]>;
}

// =============================================================================
// Flyer CRUD Operations
// =============================================================================

/**
 * Save a generated flyer to the database
 */
export const saveFlyer = async (data: FlyerUploadRequest): Promise<GalleryImage> => {
  return fetchApi<GalleryImage>('/flyers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

/**
 * Get all flyers for a specific schedule
 */
export const getScheduleFlyers = async (scheduleId: string): Promise<GalleryImage[]> => {
  return fetchApi<GalleryImage[]>(`/flyers?scheduleId=${scheduleId}`);
};

/**
 * Get all flyers for a specific event
 */
export const getEventFlyers = async (eventId: string): Promise<GalleryImage[]> => {
  return fetchApi<GalleryImage[]>(`/flyers?eventId=${eventId}`);
};

/**
 * Delete a flyer
 */
export const deleteFlyer = async (flyerId: string): Promise<void> => {
  await fetchApi(`/flyers/${flyerId}`, { method: 'DELETE' });
};

// =============================================================================
// Schedule Management
// =============================================================================

/**
 * Get week schedule info
 */
export const getWeekScheduleInfo = async (): Promise<WeekScheduleInfo | null> => {
  return fetchApi<WeekScheduleInfo | null>('/schedule/current');
};

/**
 * Get all schedules
 */
export const getAllSchedules = async (): Promise<WeekScheduleWithCount[]> => {
  return fetchApi<WeekScheduleWithCount[]>('/schedules');
};

/**
 * Get schedule by ID
 */
export const getScheduleById = async (id: string): Promise<WeekScheduleInfo> => {
  return fetchApi<WeekScheduleInfo>(`/schedules/${id}`);
};

/**
 * Create new schedule from Excel
 */
export const createSchedule = async (file: File): Promise<WeekScheduleInfo> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/db/schedules', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Failed to create schedule');
  }
  return response.json();
};

/**
 * Delete a schedule
 */
export const deleteSchedule = async (id: string): Promise<void> => {
  await fetchApi(`/schedules/${id}`, { method: 'DELETE' });
};

/**
 * Get tournaments from schedule
 */
export const getScheduleTournaments = async (
  scheduleId: string,
): Promise<TournamentEvent[]> => {
  return fetchApi<TournamentEvent[]>(`/schedules/${scheduleId}/tournaments`);
};

/**
 * Upload schedule file and parse tournaments
 */
export const uploadScheduleFile = async (
  file: File,
): Promise<{ tournaments: TournamentEvent[]; scheduleInfo: WeekScheduleInfo }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/schedule/upload', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Failed to upload schedule');
  }
  return response.json();
};

// =============================================================================
// Event & Daily Flyers
// =============================================================================

/**
 * Add event flyer
 */
export const addEventFlyer = async (
  imageUrl: string,
  tournamentEventId: string,
): Promise<GalleryImage> => {
  return fetchApi<GalleryImage>('/event-flyers', {
    method: 'POST',
    body: JSON.stringify({ imageUrl, tournamentEventId }),
  });
};

/**
 * Add daily flyer
 */
export const addDailyFlyer = async (
  imageUrl: string,
  weekScheduleId: string,
  day: string,
  period: TimePeriod,
): Promise<GalleryImage> => {
  return fetchApi<GalleryImage>('/daily-flyers', {
    method: 'POST',
    body: JSON.stringify({ imageUrl, weekScheduleId, day, period }),
  });
};
