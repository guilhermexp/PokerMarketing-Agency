import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrandProfile } from "@/types";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: unknown }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: () => (props: Record<string, unknown>) => <div {...props} />,
    },
  ),
}));

vi.mock("../../../lib/auth-client", () => ({
  authClient: {
    signOut: vi.fn(),
  },
}));

const useCampaignsMock = vi.fn();

vi.mock("../../../hooks/useAppData", () => ({
  useCampaigns: (...args: unknown[]) => useCampaignsMock(...args),
}));

vi.mock("../../campaigns/UploadForm", () => ({
  UploadForm: () => <div>upload-form</div>,
}));

vi.mock("../../layout/FloatingSidebar", () => ({
  FloatingSidebar: () => <div>floating-sidebar</div>,
}));

vi.mock("../../common/QuickPostModal", () => ({
  QuickPostModal: () => null,
}));

vi.mock("../../ui/published-stories-widget", () => ({
  PublishedStoriesWidget: () => null,
}));

vi.mock("../../calendar/SchedulePostModal", () => ({
  SchedulePostModal: () => null,
}));

vi.mock("../../common/Icon", () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

function createDashboardProps(overrides: Record<string, unknown> = {}) {
  return {
    brandProfile: { name: "Poker Club" } as unknown as BrandProfile,
    campaign: null,
    onGenerate: vi.fn(),
    isGenerating: false,
    onEditProfile: vi.fn(),
    onResetCampaign: vi.fn(),
    isAssistantOpen: false,
    onToggleAssistant: vi.fn(),
    assistantHistory: [],
    isAssistantLoading: false,
    onAssistantSendMessage: vi.fn(),
    chatReferenceImage: null,
    onSetChatReference: vi.fn(),
    theme: "dark" as "light" | "dark",
    onThemeToggle: vi.fn(),
    galleryImages: [],
    onAddImageToGallery: vi.fn((image) => ({ id: "gallery-1", ...image })),
    onUpdateGalleryImage: vi.fn(),
    tournamentEvents: [],
    weekScheduleInfo: null,
    onTournamentFileUpload: vi.fn(),
    onAddTournamentEvent: vi.fn(),
    flyerState: {},
    setFlyerState: vi.fn(),
    dailyFlyerState: {},
    setDailyFlyerState: vi.fn(),
    selectedDailyFlyerIds: {},
    setSelectedDailyFlyerIds: vi.fn(),
    activeView: "campaign" as "campaign" | "campaigns" | "carousels" | "flyer" | "gallery" | "calendar" | "playground" | "image-playground",
    onViewChange: vi.fn(),
    onPublishToCampaign: vi.fn(),
    styleReferences: [],
    onAddStyleReference: vi.fn(),
    onRemoveStyleReference: vi.fn(),
    onSelectStyleReference: vi.fn(),
    selectedStyleReference: null,
    onClearSelectedStyleReference: vi.fn(),
    scheduledPosts: [],
    onSchedulePost: vi.fn(),
    onUpdateScheduledPost: vi.fn(),
    onDeleteScheduledPost: vi.fn(),
    onPublishToInstagram: vi.fn(),
    publishingStates: {},
    campaignsList: [],
    onLoadCampaign: vi.fn(),
    userId: "user-1",
    organizationId: null,
    allSchedules: [],
    pendingToolEdit: null,
    ...overrides,
  };
}

describe("Dashboard", () => {
  beforeEach(() => {
    useCampaignsMock.mockReturnValue({ campaigns: [] });
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  it("renders the upload form on the main campaign view when there is no campaign", async () => {
    const { Dashboard } = await import("../Dashboard");
    const props = createDashboardProps() as Parameters<typeof Dashboard>[0];
    render(<Dashboard {...props} />);

    expect(screen.getByText("upload-form")).toBeTruthy();
  });

  it("hides the upload form while generation is in progress", async () => {
    const { Dashboard } = await import("../Dashboard");
    const props = createDashboardProps({
      isGenerating: true,
    }) as Parameters<typeof Dashboard>[0];
    render(<Dashboard {...props} />);

    expect(screen.queryByPlaceholderText("Descreva sua ideia...")).toBeNull();
  });
});
