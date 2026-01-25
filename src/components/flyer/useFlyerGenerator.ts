import { useState, useMemo, useEffect, useCallback } from "react";
import type {
    TournamentEvent,
    WeekScheduleInfo,
    GalleryImage,
    ImageSize,
    ImageModel
} from "@/types";
import type { Currency, TimePeriod } from "@/types/flyer.types";
import { parseGtd, DAY_TRANSLATIONS, getSortValue } from "./utils";

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export const useFlyerGenerator = (
    events: TournamentEvent[],
    weekScheduleInfo: WeekScheduleInfo | null,
    setDailyFlyerState: React.Dispatch<
        React.SetStateAction<
            Record<string, Record<TimePeriod, (GalleryImage | "loading")[]>>
        >
    >
) => {
    const daysMap = [
        "SUNDAY",
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
    ];
    const currentDayName = daysMap[new Date().getDay()];

    // State with LocalStorage Persistence
    const [selectedDay, setSelectedDay] = useState(() => {
        if (typeof window === 'undefined') return "MONDAY";
        return localStorage.getItem("flyer_selectedDay") || currentDayName;
    });

    const [selectedAspectRatio, setSelectedAspectRatio] = useState(() => {
        if (typeof window === 'undefined') return "9:16";
        return localStorage.getItem("flyer_aspectRatio") || "9:16";
    });

    const [selectedImageSize, setSelectedImageSize] = useState<ImageSize>(() => {
        if (typeof window === 'undefined') return "1K";
        return (localStorage.getItem("flyer_imageSize") as ImageSize) || "1K";
    });

    const [selectedCurrency, setSelectedCurrency] = useState<Currency>(() => {
        if (typeof window === 'undefined') return "BRL";
        return (localStorage.getItem("flyer_currency") as Currency) || "BRL";
    });

    const [selectedLanguage, setSelectedLanguage] = useState<"pt" | "en">(() => {
        if (typeof window === 'undefined') return "pt";
        return (localStorage.getItem("flyer_language") as "pt" | "en") || "pt";
    });

    const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>(() => {
        if (typeof window === 'undefined') return "gemini-3-pro-image-preview";
        return (
            (localStorage.getItem("flyer_imageModel") as ImageModel) ||
            "gemini-3-pro-image-preview"
        );
    });

    const [showIndividualTournaments, setShowIndividualTournaments] = useState(false);
    const [showPastTournaments, setShowPastTournaments] = useState(false);

    const [enabledPeriods, setEnabledPeriods] = useState<Record<TimePeriod, boolean>>(() => {
        if (typeof window === 'undefined') return { ALL: true, MORNING: true, AFTERNOON: true, NIGHT: true, HIGHLIGHTS: true };
        const saved = localStorage.getItem("flyer_enabledPeriods");
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return { ALL: true, MORNING: true, AFTERNOON: true, NIGHT: true, HIGHLIGHTS: true };
            }
        }
        return { ALL: true, MORNING: true, AFTERNOON: true, NIGHT: true, HIGHLIGHTS: true };
    });

    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [activeHelpTooltip, setActiveHelpTooltip] = useState<string | null>(null);

    const [showOnlyWithGtd, setShowOnlyWithGtd] = useState(() => {
        if (typeof window === 'undefined') return true;
        return localStorage.getItem("flyer_showOnlyWithGtd") === "true";
    });

    const [sortBy, setSortBy] = useState<"time" | "gtd">(() => {
        if (typeof window === 'undefined') return "time";
        return (localStorage.getItem("flyer_sortBy") as "time" | "gtd") || "time";
    });

    const [collabLogo, setCollabLogo] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem("flyer_collabLogo") || null;
    });

    const [manualStyleRef, setManualStyleRef] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem("flyer_manualStyleRef") || null;
    });

    const [isStylePanelOpen, setIsStylePanelOpen] = useState(true);
    const [isSchedulesPanelOpen, setIsSchedulesPanelOpen] = useState(false);
    const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

    const [batchTrigger, setBatchTrigger] = useState(false);
    const [isBatchGenerating, setIsBatchGenerating] = useState(false);
    const [globalStyleReference, setGlobalStyleReference] = useState<GalleryImage | null>(null);
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [compositionAssets, setCompositionAssets] = useState<import("@/types").ImageFile[]>([]);

    // Persistence Effects
    useEffect(() => { localStorage.setItem("flyer_selectedDay", selectedDay); }, [selectedDay]);
    useEffect(() => { localStorage.setItem("flyer_aspectRatio", selectedAspectRatio); }, [selectedAspectRatio]);
    useEffect(() => { localStorage.setItem("flyer_imageSize", selectedImageSize); }, [selectedImageSize]);
    useEffect(() => { localStorage.setItem("flyer_currency", selectedCurrency); }, [selectedCurrency]);
    useEffect(() => { localStorage.setItem("flyer_language", selectedLanguage); }, [selectedLanguage]);
    useEffect(() => { localStorage.setItem("flyer_imageModel", selectedImageModel); }, [selectedImageModel]);
    useEffect(() => { localStorage.setItem("flyer_showOnlyWithGtd", String(showOnlyWithGtd)); }, [showOnlyWithGtd]);
    useEffect(() => { localStorage.setItem("flyer_sortBy", sortBy); }, [sortBy]);
    useEffect(() => { localStorage.setItem("flyer_enabledPeriods", JSON.stringify(enabledPeriods)); }, [enabledPeriods]);

    useEffect(() => {
        try {
            if (collabLogo) localStorage.setItem("flyer_collabLogo", collabLogo);
            else localStorage.removeItem("flyer_collabLogo");
        } catch (e) { console.warn("Failed to save collabLogo:", e); }
    }, [collabLogo]);

    useEffect(() => {
        try {
            if (manualStyleRef) localStorage.setItem("flyer_manualStyleRef", manualStyleRef);
            else localStorage.removeItem("flyer_manualStyleRef");
        } catch (e) { console.warn("Failed to save manualStyleRef:", e); }
    }, [manualStyleRef]);

    // Restore global style ref
    useEffect(() => {
        if (manualStyleRef && !globalStyleReference) {
            setGlobalStyleReference({
                id: "restored-style",
                src: manualStyleRef,
                prompt: "Referência restaurada",
                source: "Edicão",
                model: selectedImageModel,
                aspectRatio: selectedAspectRatio,
                imageSize: selectedImageSize
            });
        }
    }, [manualStyleRef, globalStyleReference, setGlobalStyleReference, selectedImageModel, selectedAspectRatio, selectedImageSize]);

    // Update selected day if events change and current day has no events
    useEffect(() => {
        if (events.length > 0) {
            // Logic to auto-select day if needed, but respect user choice if valid
            // Keeping simple for now, relying on initial state or user interaction
        }
    }, [events.length]);

    // Derived Data
    const currentEvents = useMemo(() => {
        let filtered = events.filter((e) => e.day === selectedDay);

        if (showIndividualTournaments && showOnlyWithGtd) {
            filtered = filtered.filter((e) => parseGtd(e.gtd) > 0);
        }

        if (showIndividualTournaments) {
            return filtered.sort((a, b) => {
                if (sortBy === "gtd") {
                    return parseGtd(b.gtd) - parseGtd(a.gtd);
                }
                return (
                    getSortValue(a.times?.["-3"] || "") -
                    getSortValue(b.times?.["-3"] || "")
                );
            });
        }

        return filtered;
    }, [events, selectedDay, showIndividualTournaments, showOnlyWithGtd, sortBy]);

    const dayStats = useMemo(() => {
        const dayEvents = events.filter((e) => e.day === selectedDay);
        return {
            total: dayEvents.length,
            withGtd: dayEvents.filter((e) => parseGtd(e.gtd) > 0).length,
            totalGtd: dayEvents.reduce((sum, e) => sum + parseGtd(e.gtd), 0),
            top3: [...events] // Should be currentEvents? No, ALL events for the day potentially? Original used currentEvents (which is filtered by day)
                .filter(e => e.day === selectedDay)
                .sort((a, b) => parseGtd(b.gtd) - parseGtd(a.gtd))
                .slice(0, 3),
        };
    }, [events, selectedDay]);

    const weekStats = useMemo(() => {
        return {
            totalTournaments: events.length,
            totalGtd: events.reduce((sum, e) => sum + parseGtd(e.gtd), 0),
        };
    }, [events]);

    const isEventPast = useCallback((event: TournamentEvent) => {
        if (event.day !== currentDayName) return false;

        if (!event.times?.["-3"]) return false;
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeValue = currentHour * 60 + currentMinute;
        const timeStr = event.times?.["-3"] || "";
        const [hours, minutes] = timeStr.split(":").map(Number);
        if (isNaN(hours)) return false;
        const eventTimeValue = hours * 60 + (minutes || 0);
        return eventTimeValue < currentTimeValue;
    }, [currentDayName]);

    const pastEvents = useMemo(() => currentEvents.filter(isEventPast), [currentEvents, isEventPast]);
    const upcomingEvents = useMemo(() => currentEvents.filter((e) => !isEventPast(e)), [currentEvents, isEventPast]);

    const getEventsForPeriod = (period: TimePeriod): TournamentEvent[] => {
        const eventsWithGtd = currentEvents.filter((e) => parseGtd(e.gtd) > 0);

        if (period === "ALL") return eventsWithGtd;

        const morning = eventsWithGtd.filter((e) => {
            const h = (e.times?.["-3"] || "").split(":");
            const hour = parseInt(h[0]);
            return !isNaN(hour) && hour >= 6 && hour < 12;
        });

        const afternoon = eventsWithGtd.filter((e) => {
            const h = (e.times?.["-3"] || "").split(":");
            const hour = parseInt(h[0]);
            return !isNaN(hour) && hour >= 12 && hour < 18;
        });

        const night = eventsWithGtd.filter((e) => {
            const h = (e.times?.["-3"] || "").split(":");
            const hour = parseInt(h[0]);
            return (
                !isNaN(hour) && ((hour >= 18 && hour <= 23) || (hour >= 0 && hour < 6))
            );
        });

        if (period === "MORNING") return morning;
        if (period === "AFTERNOON") return afternoon;
        if (period === "NIGHT") return night;

        if (period === "HIGHLIGHTS")
            return [...eventsWithGtd]
                .sort((a, b) => parseGtd(b.gtd) - parseGtd(a.gtd))
                .slice(0, 3);

        return [];
    };

    const generateBatch = () => {
        setIsBatchGenerating(true);
        setDailyFlyerState((prev) => ({
            ...prev,
            [selectedDay]: {
                ALL: [],
                MORNING: [],
                AFTERNOON: [],
                NIGHT: [],
                HIGHLIGHTS: [],
            },
        }));
        setBatchTrigger(true);
        setTimeout(() => {
            setBatchTrigger(false);
            setIsBatchGenerating(false);
        }, 1500);
    };

    // Date Logic
    const getDayDate = (day: string): string => {
        if (!weekScheduleInfo) return "";
        const [startDay, startMonth] = weekScheduleInfo.startDate.split("/").map(Number);
        const dayIndex = DAY_ORDER.indexOf(day);
        const startDayIndex = DAY_ORDER.indexOf("MONDAY"); // Assuming Mon start
        // If startDayIndex is -1 (not found), default to 0
        const safeStartIndex = startDayIndex >= 0 ? startDayIndex : 0;
        const diff = dayIndex - safeStartIndex;

        const currentYear = new Date().getFullYear();
        const startYear = (startMonth === 12 && new Date().getMonth() === 0) ? currentYear - 1 : currentYear;

        const startDate = new Date(startYear, startMonth - 1, startDay);
        startDate.setDate(startDate.getDate() + diff);

        const resultDay = startDate.getDate();
        const resultMonth = startDate.getMonth() + 1;
        return `${String(resultDay).padStart(2, "0")}/${String(resultMonth).padStart(2, "0")}`;
    };

    const getScheduleDate = (day: string): string => {
        if (!weekScheduleInfo) return "";
        const [startDay, startMonth] = weekScheduleInfo.startDate.split("/").map(Number);
        const dayIndex = DAY_ORDER.indexOf(day);
        const startDayIndex = DAY_ORDER.indexOf("MONDAY");
        const safeStartIndex = startDayIndex >= 0 ? startDayIndex : 0;
        const diff = dayIndex - safeStartIndex;

        const currentYear = new Date().getFullYear();
        const startYear = (startMonth === 12 && new Date().getMonth() === 0) ? currentYear - 1 : currentYear;

        const startDate = new Date(startYear, startMonth - 1, startDay);
        startDate.setDate(startDate.getDate() + diff);

        const resultYear = startDate.getFullYear();
        const resultMonth = startDate.getMonth() + 1;
        const resultDay = startDate.getDate();
        return `${resultYear}-${String(resultMonth).padStart(2, "0")}-${String(resultDay).padStart(2, "0")}`;
    };

    return {
        state: {
            selectedDay,
            selectedAspectRatio,
            selectedImageSize,
            selectedCurrency,
            selectedLanguage,
            selectedImageModel,
            showIndividualTournaments,
            showPastTournaments,
            enabledPeriods,
            isSettingsModalOpen,
            activeHelpTooltip,
            showOnlyWithGtd,
            sortBy,
            collabLogo,
            manualStyleRef,
            isStylePanelOpen,
            batchTrigger,
            isBatchGenerating,
            globalStyleReference,
            isManualModalOpen,
            isSchedulesPanelOpen,
            compositionAssets,
            isMobilePanelOpen
        },
        setters: {
            setSelectedDay,
            setSelectedAspectRatio,
            setSelectedImageSize,
            setSelectedCurrency,
            setSelectedLanguage,
            setSelectedImageModel,
            setShowIndividualTournaments,
            setShowPastTournaments,
            setEnabledPeriods,
            setIsSettingsModalOpen,
            setActiveHelpTooltip,
            setShowOnlyWithGtd,
            setSortBy,
            setCollabLogo,
            setManualStyleRef,
            setIsStylePanelOpen,
            setBatchTrigger,
            setIsBatchGenerating,
            setGlobalStyleReference,
            setIsManualModalOpen,
            setIsSchedulesPanelOpen,
            setCompositionAssets,
            setIsMobilePanelOpen
        },
        data: {
            currentEvents,
            dayStats,
            weekStats,
            currentDayName: DAY_TRANSLATIONS[selectedDay] || selectedDay,
            pastEvents,
            upcomingEvents
        },
        methods: {
            getEventsForPeriod,
            generateBatch,
            getDayDate,
            getScheduleDate
        }
    };
};
