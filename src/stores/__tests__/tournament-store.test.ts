import { describe, expect, it } from "vitest";
import { useTournamentStore } from "../tournament-store";

describe("useTournamentStore", () => {
  it("mantem selecao local e limpa estado derivado de flyers", () => {
    useTournamentStore.setState({
      currentScheduleId: null,
      dailyFlyerState: {},
      selectedDailyFlyerIds: {},
      hasRestoredDailyFlyers: false,
      flyerState: {},
      hasAutoLoadedSchedule: false,
      lastLoadedOrgId: null,
      lastLoadedScheduleId: null,
    });

    useTournamentStore.getState().setCurrentScheduleId("schedule-1");
    useTournamentStore.getState().setDailyFlyerState({
      monday: { ALL: ["loading"] },
    } as never);
    useTournamentStore.getState().clearScheduleState();

    expect(useTournamentStore.getState().currentScheduleId).toBeNull();
    expect(useTournamentStore.getState().dailyFlyerState).toEqual({});
    expect(useTournamentStore.getState().selectedDailyFlyerIds).toEqual({});
  });
});
