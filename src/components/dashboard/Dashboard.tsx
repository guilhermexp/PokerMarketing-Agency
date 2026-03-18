import React from "react";
import { FloatingSidebar } from "@/components/layout/FloatingSidebar";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useBrandProfileController } from "@/controllers/BrandProfileController";
import { DashboardCampaignView } from "@/components/dashboard/dashboard-campaign-view";
import { DashboardFlyerView } from "@/components/dashboard/dashboard-flyer-view";
import { DashboardOverlays } from "@/components/dashboard/dashboard-overlays";
import { DashboardSecondaryViews } from "@/components/dashboard/dashboard-secondary-views";

function FeatureFallback({ title }: { title: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border bg-black/40">
      <div className="space-y-2 text-center">
        <h2 className="text-sm font-semibold text-white">
          Falha ao carregar {title}
        </h2>
        <p className="text-xs text-muted-foreground">
          Recarregue a view para tentar novamente.
        </p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { onViewChange, routeView } = useBrandProfileController();

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-black font-sans text-white selection:bg-primary selection:text-black md:h-screen md:flex">
      <FloatingSidebar activeView={routeView} onViewChange={onViewChange} />

      <main className="relative z-10 flex-1 overflow-y-auto bg-black pb-24 sm:pb-[env(safe-area-inset-bottom)] lg:pl-20">
        {routeView === "campaign" ? (
          <ErrorBoundary fallback={<FeatureFallback title="campanha" />}>
            <DashboardCampaignView />
          </ErrorBoundary>
        ) : null}

        {routeView === "flyer" ? (
          <ErrorBoundary fallback={<FeatureFallback title="torneio" />}>
            <DashboardFlyerView />
          </ErrorBoundary>
        ) : null}

        {routeView !== "campaign" && routeView !== "flyer" ? (
          <DashboardSecondaryViews />
        ) : null}
      </main>

      <DashboardOverlays />
    </div>
  );
}
