import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useBrandProfileControllerMock = vi.fn();

vi.mock("@/controllers/BrandProfileController", () => ({
  useBrandProfileController: () => useBrandProfileControllerMock(),
}));

vi.mock("@/components/layout/FloatingSidebar", () => ({
  FloatingSidebar: () => <div>floating-sidebar</div>,
}));

vi.mock("../dashboard-campaign-view", () => ({
  DashboardCampaignView: () => <div>campaign-view</div>,
}));

vi.mock("../dashboard-flyer-view", () => ({
  DashboardFlyerView: () => <div>flyer-view</div>,
}));

vi.mock("../dashboard-secondary-views", () => ({
  DashboardSecondaryViews: () => <div>secondary-view</div>,
}));

vi.mock("../dashboard-overlays", () => ({
  DashboardOverlays: () => <div>dashboard-overlays</div>,
}));

describe("Dashboard", () => {
  beforeEach(() => {
    useBrandProfileControllerMock.mockReturnValue({
      onViewChange: vi.fn(),
      routeView: "campaign",
    });
  });

  it("renderiza a view de campanha quando a rota ativa e campaign", async () => {
    const { Dashboard } = await import("../Dashboard");

    render(<Dashboard />);

    expect(screen.getByText("floating-sidebar")).toBeTruthy();
    expect(screen.getByText("campaign-view")).toBeTruthy();
    expect(screen.getByText("dashboard-overlays")).toBeTruthy();
    expect(screen.queryByText("secondary-view")).toBeNull();
  });

  it("renderiza as secondary views para rotas fora de campaign e flyer", async () => {
    useBrandProfileControllerMock.mockReturnValue({
      onViewChange: vi.fn(),
      routeView: "gallery",
    });

    const { Dashboard } = await import("../Dashboard");

    render(<Dashboard />);

    expect(screen.getByText("secondary-view")).toBeTruthy();
    expect(screen.queryByText("campaign-view")).toBeNull();
    expect(screen.queryByText("flyer-view")).toBeNull();
  });
});
