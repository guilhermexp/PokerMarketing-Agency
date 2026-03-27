import { App } from "@/App";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function IntegrationsView() {
  return (
    <ErrorBoundary>
      <App routeView="integrations" />
    </ErrorBoundary>
  );
}
