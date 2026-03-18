import { App } from "@/App";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function CarouselsView() {
  return (
    <ErrorBoundary>
      <App routeView="carousels" />
    </ErrorBoundary>
  );
}
