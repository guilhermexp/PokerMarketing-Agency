import { clientLogger } from "@/lib/client-logger";
/**
 * Tournament Handlers Hook
 *
 * Manages all tournament-related operations:
 * - Selecting schedules
 * - Uploading tournament files (Excel parsing)
 * - Deleting schedules
 * - Clearing expired schedules
 */

import { useCallback } from "react";
import type { TournamentEvent, WeekScheduleInfo, GalleryImage } from "@/types";
import type { TimePeriod } from "@/stores/tournament-store";
import type {
  DbTournamentEvent,
  WeekScheduleWithCount,
} from "@/services/apiClient";
import {
  getScheduleEvents,
  createWeekSchedule,
  deleteWeekSchedule,
  getWeekSchedulesList,
} from "@/services/apiClient";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert Excel time value (decimal) to HH:MM string
 */
export function excelTimeToStr(val: unknown): string {
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  return String(val || "");
}

/**
 * Parse date string to Date object (date only, no time component issues)
 */
export function parseDateOnly(dateStr: string): Date {
  const [datePart] = dateStr.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Parse week info from filename
 * Pattern: "PPST 16 18 al 21 18" or "PPST_16_18_al_21_18" or "PPST 22-12 al 28-12"
 */
export function parseWeekFromFilename(
  filename: string
): WeekScheduleInfo | null {
  const match = filename.match(
    /(\d{1,2})[\s_-](\d{1,2})[\s_-]al[\s_-](\d{1,2})[\s_-](\d{1,2})/i
  );
  if (match) {
    const [, startDay, startMonth, endDay, endMonth] = match;
    return {
      startDate: `${startDay.padStart(2, "0")}/${startMonth.padStart(2, "0")}`,
      endDate: `${endDay.padStart(2, "0")}/${endMonth.padStart(2, "0")}`,
      filename,
    };
  }
  return null;
}

/**
 * Map database event to frontend TournamentEvent type
 */
export function mapDbEventToTournamentEvent(
  e: DbTournamentEvent
): TournamentEvent {
  return {
    id: e.id,
    day: e.day_of_week,
    name: e.name,
    game: e.game || "",
    gtd: e.gtd || "",
    buyIn: e.buy_in || "",
    rebuy: e.rebuy || "",
    addOn: e.add_on || "",
    stack: e.stack || "",
    players: e.players || "",
    lateReg: e.late_reg || "",
    minutes: e.minutes || "",
    structure: e.structure || "",
    times: e.times || {},
  };
}

// =============================================================================
// Types
// =============================================================================

// Type for flyer state value (matches tournament-store)
type FlyerStateValue = GalleryImage | "loading";
type DailyFlyerState = Record<string, Record<TimePeriod, FlyerStateValue[]>>;
type SetStateAction<T> = T | ((prev: T) => T);

interface UseTournamentHandlersParams {
  userId: string | null;
  organizationId: string | null;
  currentScheduleId: string | null;
  setTournamentEvents: (action: SetStateAction<TournamentEvent[]>) => void;
  setWeekScheduleInfo: (info: WeekScheduleInfo | null) => void;
  setCurrentScheduleId: (id: string | null) => void;
  setIsWeekExpired: (expired: boolean) => void;
  setAllSchedules: (action: SetStateAction<WeekScheduleWithCount[]>) => void;
  setDailyFlyerState: (action: SetStateAction<DailyFlyerState>) => void;
  setHasRestoredDailyFlyers: (restored: boolean) => void;
  setTournamentDataCache?: (data: { schedule: WeekScheduleWithCount; events: DbTournamentEvent[] }) => void;
}

interface TournamentHandlers {
  handleSelectSchedule: (schedule: WeekScheduleWithCount) => Promise<void>;
  handleTournamentFileUpload: (file: File) => Promise<void>;
  handleDeleteSchedule: (scheduleId: string) => Promise<void>;
  handleClearExpiredSchedule: () => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

export function useTournamentHandlers({
  userId,
  organizationId,
  currentScheduleId,
  setTournamentEvents,
  setWeekScheduleInfo,
  setCurrentScheduleId,
  setIsWeekExpired,
  setAllSchedules,
  setDailyFlyerState,
  setHasRestoredDailyFlyers,
  setTournamentDataCache,
}: UseTournamentHandlersParams): TournamentHandlers {
  const handleSelectSchedule = useCallback(
    async (schedule: WeekScheduleWithCount) => {
      if (!userId) return;

      // Only clear state if actually SWITCHING to a different schedule
      // Don't clear if reloading the same schedule (e.g., on remount)
      const isSwitchingSchedule =
        currentScheduleId && currentScheduleId !== schedule.id;

      try {
        // Load events for selected schedule
        const eventsData = await getScheduleEvents(
          userId,
          schedule.id,
          organizationId
        );
        const mappedEvents: TournamentEvent[] =
          eventsData.events.map(mapDbEventToTournamentEvent);
        setTournamentEvents(mappedEvents);

        // Update SWR cache so the sync effect doesn't clear these events
        if (setTournamentDataCache) {
          setTournamentDataCache({ schedule, events: eventsData.events });
        }

        // Only clear daily flyer state when SWITCHING schedules (not on initial load or reload)
        if (isSwitchingSchedule) {
          clientLogger.debug(
            "[Tournament] Switching schedules, clearing flyer state"
          );
          setDailyFlyerState({});
          setHasRestoredDailyFlyers(false);

          // Clear schedule-specific localStorage items for a fresh start
          localStorage.removeItem("dailyFlyerMapping");
          localStorage.removeItem("flyer_selectedDay");
        }

        setCurrentScheduleId(schedule.id);

        // Check if this schedule is expired
        const endDate = parseDateOnly(schedule.end_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        setIsWeekExpired(today > endDate);

        // Set week schedule info (handle ISO datetime strings)
        const startDate = parseDateOnly(schedule.start_date);
        const endDateInfo = parseDateOnly(schedule.end_date);
        setWeekScheduleInfo({
          id: schedule.id,
          startDate: `${String(startDate.getDate()).padStart(2, "0")}/${String(startDate.getMonth() + 1).padStart(2, "0")}`,
          endDate: `${String(endDateInfo.getDate()).padStart(2, "0")}/${String(endDateInfo.getMonth() + 1).padStart(2, "0")}`,
          filename: schedule.filename || "Planilha carregada",
          daily_flyer_urls: schedule.daily_flyer_urls,
        });

        clientLogger.debug(
          `[Tournament] Selected schedule ${schedule.id} with ${mappedEvents.length} events`
        );
      } catch (error: unknown) {
        clientLogger.error("[Tournament] Failed to load schedule events:", error);
      }
    },
    [
      userId,
      organizationId,
      currentScheduleId,
      setTournamentEvents,
      setWeekScheduleInfo,
      setCurrentScheduleId,
      setIsWeekExpired,
      setDailyFlyerState,
      setHasRestoredDailyFlyers,
      setTournamentDataCache,
    ]
  );

  const handleTournamentFileUpload = useCallback(
    (file: File): Promise<void> => {
      clientLogger.debug("[Upload] Starting file upload:", file.name);
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            clientLogger.debug("[Upload] File read complete, parsing...");
            const data = new Uint8Array(e.target!.result as ArrayBuffer);
            const XLSX = await import("xlsx");
            const wb = XLSX.read(data, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, {
              header: 1,
              defval: "",
            }) as unknown[][];
            const events: TournamentEvent[] = [];
            let currentDay = "";
            const dayMap: Record<string, string> = {
              MONDAY: "MONDAY",
              SEGUNDA: "MONDAY",
              TUESDAY: "TUESDAY",
              TERÇA: "TUESDAY",
              WEDNESDAY: "WEDNESDAY",
              QUARTA: "WEDNESDAY",
              THURSDAY: "THURSDAY",
              QUINTA: "THURSDAY",
              FRIDAY: "FRIDAY",
              SEXTA: "FRIDAY",
              SATURDAY: "SATURDAY",
              SÁBADO: "SATURDAY",
              SUNDAY: "SUNDAY",
              DOMINGO: "SUNDAY",
            };
            json.forEach((row, i) => {
              const raw = String(row[1] || "")
                .trim()
                .toUpperCase();
              if (dayMap[raw]) currentDay = dayMap[raw];
              else if (row[9] && i > 2 && row[9] !== "NAME" && currentDay) {
                events.push({
                  id: `${currentDay}-${i}`,
                  day: currentDay,
                  name: String(row[9]),
                  game: String(row[10]),
                  gtd: String(row[8]),
                  buyIn: String(row[11]),
                  rebuy: String(row[12]),
                  addOn: String(row[13]),
                  stack: String(row[15]),
                  players: String(row[16]),
                  lateReg: String(row[17]),
                  minutes: String(row[18]),
                  structure: String(row[19]),
                  times: { "-3": excelTimeToStr(row[2]) },
                });
              }
            });
            clientLogger.debug("[Upload] Parsed", events.length, "events from file");
            setTournamentEvents(events);

            // Extract week info from filename or sheet name
            let weekInfo =
              parseWeekFromFilename(file.name) ||
              parseWeekFromFilename(wb.SheetNames[0]);

            // If extraction fails, use current week
            if (!weekInfo) {
              const today = new Date();
              const dayOfWeek = today.getDay();
              const monday = new Date(today);
              monday.setDate(
                today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
              );
              const sunday = new Date(monday);
              sunday.setDate(monday.getDate() + 6);

              weekInfo = {
                startDate: `${String(monday.getDate()).padStart(2, "0")}/${String(monday.getMonth() + 1).padStart(2, "0")}`,
                endDate: `${String(sunday.getDate()).padStart(2, "0")}/${String(sunday.getMonth() + 1).padStart(2, "0")}`,
                filename: file.name,
              };
            }

            clientLogger.debug("[Upload] WeekInfo:", weekInfo);
            setWeekScheduleInfo(weekInfo);

            // Save to database if authenticated
            clientLogger.debug("[Upload] userId:", userId);
            if (userId) {
              try {
                // Parse dates for database (convert DD/MM to YYYY-MM-DD)
                const year = new Date().getFullYear();
                const [startDay, startMonth] = weekInfo.startDate.split("/");
                const [endDay, endMonth] = weekInfo.endDate.split("/");

                // Handle year rollover (if end month < start month, end is next year)
                let endYear = year;
                if (parseInt(endMonth) < parseInt(startMonth)) {
                  endYear = year + 1;
                }

                const startDateISO = `${year}-${startMonth.padStart(2, "0")}-${startDay.padStart(2, "0")}`;
                const endDateISO = `${endYear}-${endMonth.padStart(2, "0")}-${endDay.padStart(2, "0")}`;

                const result = await createWeekSchedule(userId, {
                  start_date: startDateISO,
                  end_date: endDateISO,
                  filename: file.name,
                  organization_id: organizationId,
                  events: events.map((ev) => ({
                    day: ev.day,
                    name: ev.name,
                    game: ev.game,
                    gtd: ev.gtd,
                    buyIn: ev.buyIn,
                    rebuy: ev.rebuy,
                    addOn: ev.addOn,
                    stack: ev.stack,
                    players: ev.players,
                    lateReg: ev.lateReg,
                    minutes: ev.minutes,
                    structure: ev.structure,
                    times: ev.times,
                  })),
                });

                setCurrentScheduleId(result.schedule.id);
                setIsWeekExpired(false);
                clientLogger.debug(
                  `[Tournament] Saved ${result.eventsCount} events to database`
                );

                // Refresh schedules list
                const schedulesData = await getWeekSchedulesList(
                  userId,
                  organizationId
                );
                setAllSchedules(schedulesData.schedules);
              } catch (dbErr) {
                clientLogger.error(
                  "[Tournament] Failed to save to database:",
                  dbErr
                );
                // Continue anyway - data is still in local state
              }
            }

            clientLogger.debug(
              "[Upload] Complete! Events:",
              events.length,
              "WeekInfo:",
              weekInfo.startDate,
              "-",
              weekInfo.endDate
            );
            resolve();
          } catch (err) {
            clientLogger.error("[Upload] Error:", err);
            reject(err);
          }
        };
        reader.readAsArrayBuffer(file);
      });
    },
    [
      userId,
      organizationId,
      setTournamentEvents,
      setWeekScheduleInfo,
      setCurrentScheduleId,
      setIsWeekExpired,
      setAllSchedules,
    ]
  );

  const handleDeleteSchedule = useCallback(
    async (scheduleId: string) => {
      if (!userId) return;
      try {
        await deleteWeekSchedule(userId, scheduleId, organizationId);
        setAllSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
        if (currentScheduleId === scheduleId) {
          setCurrentScheduleId(null);
          setTournamentEvents([]);
          setWeekScheduleInfo(null);
          setIsWeekExpired(false);
        }
        clientLogger.debug("[Tournament] Deleted schedule:", scheduleId);
      } catch (e) {
        clientLogger.error("[Tournament] Failed to delete schedule:", e);
      }
    },
    [
      userId,
      organizationId,
      currentScheduleId,
      setAllSchedules,
      setCurrentScheduleId,
      setTournamentEvents,
      setWeekScheduleInfo,
      setIsWeekExpired,
    ]
  );

  const handleClearExpiredSchedule = useCallback(async () => {
    if (userId && currentScheduleId) {
      try {
        await deleteWeekSchedule(userId, currentScheduleId, organizationId);
        setCurrentScheduleId(null);
        setTournamentEvents([]);
        setWeekScheduleInfo(null);
        setIsWeekExpired(false);
      } catch (e) {
        clientLogger.error("[Tournament] Failed to clear expired schedule:", e);
      }
    }
  }, [
    userId,
    currentScheduleId,
    organizationId,
    setCurrentScheduleId,
    setTournamentEvents,
    setWeekScheduleInfo,
    setIsWeekExpired,
  ]);

  return {
    handleSelectSchedule,
    handleTournamentFileUpload,
    handleDeleteSchedule,
    handleClearExpiredSchedule,
  };
}
