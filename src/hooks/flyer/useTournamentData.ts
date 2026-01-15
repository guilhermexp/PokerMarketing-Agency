/**
 * useTournamentData Hook
 *
 * Handles tournament data management including loading, filtering, and sorting.
 */

import { useCallback, useMemo } from 'react';
import { useFlyerStore, selectSortedTournaments, selectCurrentDayTournaments } from '@/stores/flyerStore';
import type { TournamentEvent } from '@/types';
import type { TimePeriod } from '@/types/flyer.types';
import { DAY_ORDER, getSortValue, parseGtd } from '@/components/flyer/utils';

export const useTournamentData = () => {
  const {
    tournaments,
    schedules: _schedules,
    selectedDay,
    enabledPeriods,
    showPastTournaments,
    showOnlyWithGtd,
    sortBy,

    setTournaments,
    addTournament,
    updateTournament,
    selectDay,
    setEnabledPeriods,
    setSortBy,
    setShowPastTournaments,
    setShowOnlyWithGtd,
  } = useFlyerStore();

  // Get tournaments for selected day
  const _currentDayTournaments = useFlyerStore(selectCurrentDayTournaments);

  // Get sorted tournaments
  const _sortedTournaments = useFlyerStore(selectSortedTournaments);

  // Filter by enabled periods
  const filteredByPeriod = useMemo(() => {
    return tournaments.filter((t) => enabledPeriods.includes(t.day as TimePeriod));
  }, [tournaments, enabledPeriods]);

  // Filter by GTD
  const filteredByGtd = useMemo(() => {
    if (!showOnlyWithGtd) return filteredByPeriod;
    return filteredByPeriod.filter((t) => t.gtd && t.gtd !== '0');
  }, [filteredByPeriod, showOnlyWithGtd]);

  // Filter past tournaments
  const visibleTournaments = useMemo(() => {
    if (showPastTournaments) return filteredByGtd;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    const todayIndex = DAY_ORDER.indexOf(today);
    const _selectedIndex = DAY_ORDER.indexOf(selectedDay);
    return filteredByGtd.filter((t) => {
      const dayIndex = DAY_ORDER.indexOf(t.day);
      return dayIndex >= todayIndex;
    });
  }, [filteredByGtd, showPastTournaments, selectedDay]);

  // Sort tournaments
  const sortedVisibleTournaments = useMemo(() => {
    const sorted = [...visibleTournaments];

    if (sortBy === 'time') {
      sorted.sort((a, b) => {
        const timeA = getSortValue(a.times?.['-3'] || '0');
        const timeB = getSortValue(b.times?.['-3'] || '0');
        return timeA - timeB;
      });
    } else if (sortBy === 'gtd') {
      sorted.sort((a, b) => {
        const gtdA = parseGtd(a.gtd);
        const gtdB = parseGtd(b.gtd);
        return gtdB - gtdA;
      });
    }

    return sorted;
  }, [visibleTournaments, sortBy]);

  // Group tournaments by period
  const tournamentsByPeriod = useMemo(() => {
    const grouped: Record<TimePeriod, TournamentEvent[]> = {
      ALL: [],
      MORNING: [],
      AFTERNOON: [],
      NIGHT: [],
      HIGHLIGHTS: [],
    };

    sortedVisibleTournaments.forEach((t) => {
      const time = t.times?.['-3'] || '';
      const match = time.match(/(\d{1,2}):(\d{2})/);

      if (match) {
        const hour = parseInt(match[1]);
        if (hour < 12) {
          grouped.MORNING.push(t);
        } else if (hour < 18) {
          grouped.AFTERNOON.push(t);
        } else {
          grouped.NIGHT.push(t);
        }
      } else {
        grouped.NIGHT.push(t);
      }
    });

    return grouped;
  }, [sortedVisibleTournaments]);

  // Get available days
  const availableDays = useMemo(() => {
    return DAY_ORDER.filter((day) =>
      tournaments.some((t) => t.day === day)
    );
  }, [tournaments]);

  // Get tournament by ID
  const getTournamentById = useCallback(
    (id: string): TournamentEvent | undefined => {
      return tournaments.find((t) => t.id === id);
    },
    [tournaments],
  );

  // Add multiple tournaments
  const addTournaments = useCallback(
    (newTournaments: TournamentEvent[]) => {
      const existingIds = new Set(tournaments.map((t) => t.id));
      const uniqueNew = newTournaments.filter((t) => !existingIds.has(t.id));
      setTournaments([...tournaments, ...uniqueNew]);
    },
    [tournaments, setTournaments],
  );

  // Update tournament
  const updateTournamentById = useCallback(
    (id: string, updates: Partial<TournamentEvent>) => {
      updateTournament(id, updates);
    },
    [updateTournament],
  );

  // Remove tournament
  const removeTournament = useCallback(
    (id: string) => {
      useFlyerStore.setState((state) => ({
        tournaments: state.tournaments.filter((t) => t.id !== id),
      }));
    },
    [],
  );

  // Select next day with tournaments
  const selectNextDay = useCallback(() => {
    const currentIndex = DAY_ORDER.indexOf(selectedDay);
    const nextIndex = (currentIndex + 1) % DAY_ORDER.length;
    const nextDay = DAY_ORDER[nextIndex];

    if (availableDays.includes(nextDay)) {
      selectDay(nextDay);
    } else {
      // Find first available day
      const firstAvailable = availableDays[0];
      if (firstAvailable) {
        selectDay(firstAvailable);
      }
    }
  }, [selectedDay, availableDays, selectDay]);

  // Select previous day with tournaments
  const selectPreviousDay = useCallback(() => {
    const currentIndex = DAY_ORDER.indexOf(selectedDay);
    const prevIndex = currentIndex === 0 ? DAY_ORDER.length - 1 : currentIndex - 1;
    const prevDay = DAY_ORDER[prevIndex];

    if (availableDays.includes(prevDay)) {
      selectDay(prevDay);
    } else {
      // Find last available day
      const lastAvailable = availableDays[availableDays.length - 1];
      if (lastAvailable) {
        selectDay(lastAvailable);
      }
    }
  }, [selectedDay, availableDays, selectDay]);

  return {
    // Data
    tournaments,
    schedules: _schedules,
    currentDayTournaments: _currentDayTournaments,
    sortedTournaments: sortedVisibleTournaments,
    tournamentsByPeriod,
    availableDays,

    // Selection
    selectedDay,
    selectDay,
    selectNextDay,
    selectPreviousDay,

    // Filters
    enabledPeriods,
    setEnabledPeriods,
    showPastTournaments,
    setShowPastTournaments,
    showOnlyWithGtd,
    setShowOnlyWithGtd,
    sortBy,
    setSortBy,

    // Actions
    setTournaments,
    addTournament,
    addTournaments,
    updateTournament: updateTournamentById,
    removeTournament,
    getTournamentById,
  };
};
