import { App } from "@/App";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function CampaignView() {
  return (
    <ErrorBoundary>
      <App routeView="campaign" />
    </ErrorBoundary>
  );
}
