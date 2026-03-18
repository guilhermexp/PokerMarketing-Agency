import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DbTournamentEvent,
  WeekScheduleWithCount,
} from "@/services/apiClient";

vi.mock("@/lib/client-logger", () => ({
  clientLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/services/apiClient", () => ({
  getScheduleEvents: vi.fn(),
  createWeekSchedule: vi.fn(),
  deleteWeekSchedule: vi.fn(),
  getWeekSchedulesList: vi.fn(),
}));

vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}));

import {
  createWeekSchedule,
  getScheduleEvents,
  getWeekSchedulesList,
} from "@/services/apiClient";
import { useTournamentHandlers } from "@/hooks/useTournamentHandlers";
import * as XLSX from "xlsx";

class MockFileReader {
  onload: ((event: { target: { result: ArrayBuffer } }) => void) | null = null;

  readAsArrayBuffer() {
    this.onload?.({ target: { result: new ArrayBuffer(8) } });
  }
}

function buildParams(
  overrides: Partial<Parameters<typeof useTournamentHandlers>[0]> = {}
) {
  return {
    userId: "user-1",
    organizationId: "org-1",
    currentScheduleId: "schedule-old",
    setTournamentEvents: vi.fn(),
    setWeekScheduleInfo: vi.fn(),
    setCurrentScheduleId: vi.fn(),
    setIsWeekExpired: vi.fn(),
    setAllSchedules: vi.fn(),
    setDailyFlyerState: vi.fn(),
    setHasRestoredDailyFlyers: vi.fn(),
    ...overrides,
  };
}

describe("useTournamentHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("FileReader", MockFileReader);
    vi.setSystemTime(new Date("2026-03-18T10:00:00Z"));
  });

  it("seleciona uma schedule, carrega eventos e limpa estado ao trocar de semana", async () => {
    const params = buildParams();
    const schedule = {
      id: "schedule-new",
      start_date: "2026-03-16",
      end_date: "2026-03-22",
      filename: "PPST_16_03_al_22_03.xlsx",
      daily_flyer_urls: {},
    } as WeekScheduleWithCount;

    vi.mocked(getScheduleEvents).mockResolvedValue({
      events: [
        {
          id: "event-1",
          day_of_week: "MONDAY",
          name: "Main Event",
          game: "NLH",
          gtd: "10000",
          buy_in: "200",
          rebuy: "0",
          add_on: "0",
          stack: "20000",
          players: "100",
          late_reg: "60",
          minutes: "30",
          structure: "Turbo",
          times: { "-3": "19:00" },
        } as DbTournamentEvent,
      ],
    } as never);

    const removeItemSpy = vi.spyOn(localStorage, "removeItem");
    const { result } = renderHook(() => useTournamentHandlers(params));

    await act(async () => {
      await result.current.handleSelectSchedule(schedule);
    });

    expect(getScheduleEvents).toHaveBeenCalledWith(
      "user-1",
      "schedule-new",
      "org-1"
    );
    expect(params.setTournamentEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "event-1",
        day: "MONDAY",
        name: "Main Event",
      }),
    ]);
    expect(params.setDailyFlyerState).toHaveBeenCalledWith({});
    expect(params.setHasRestoredDailyFlyers).toHaveBeenCalledWith(false);
    expect(removeItemSpy).toHaveBeenCalledWith("dailyFlyerMapping");
    expect(removeItemSpy).toHaveBeenCalledWith("flyer_selectedDay");
    expect(params.setCurrentScheduleId).toHaveBeenCalledWith("schedule-new");
    expect(params.setWeekScheduleInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "schedule-new",
        startDate: "16/03",
        endDate: "22/03",
      })
    );
  });

  it("importa a planilha, monta a week info e persiste a schedule quando autenticado", async () => {
    const params = buildParams({ currentScheduleId: null });
    const workbook = {
      SheetNames: ["Semana 16-03 al 22-03"],
      Sheets: {
        "Semana 16-03 al 22-03": {},
      },
    };

    vi.mocked(XLSX.read).mockReturnValue(workbook as never);
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      ["", "SEGUNDA"],
      [],
      [],
      ["", "", 0.75, "", "", "", "", "", "10000", "Main Event", "NLH", "200", "0", "0", "", "20000", "100", "60", "30", "Turbo"],
    ] as never);

    vi.mocked(createWeekSchedule).mockResolvedValue({
      schedule: { id: "schedule-created" },
      eventsCount: 1,
    } as never);
    vi.mocked(getWeekSchedulesList).mockResolvedValue({
      schedules: [{ id: "schedule-created" }],
    } as never);

    const { result } = renderHook(() => useTournamentHandlers(params));

    await act(async () => {
      await result.current.handleTournamentFileUpload(
        new File(["xlsx"], "PPST_16_03_al_22_03.xlsx")
      );
    });

    expect(params.setTournamentEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "MONDAY-3",
        day: "MONDAY",
        name: "Main Event",
      }),
    ]);
    expect(params.setWeekScheduleInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "PPST_16_03_al_22_03.xlsx",
        startDate: "16/03",
        endDate: "22/03",
      })
    );
    expect(createWeekSchedule).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        start_date: "2026-03-16",
        end_date: "2026-03-22",
        organization_id: "org-1",
      })
    );
    expect(params.setCurrentScheduleId).toHaveBeenCalledWith("schedule-created");
    expect(params.setIsWeekExpired).toHaveBeenCalledWith(false);
    expect(params.setAllSchedules).toHaveBeenCalledWith([{ id: "schedule-created" }]);
  });
});
