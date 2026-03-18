import { App } from "@/App";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function CampaignsView() {
  return (
    <ErrorBoundary>
      <App routeView="campaigns" />
    </ErrorBoundary>
  );
}
