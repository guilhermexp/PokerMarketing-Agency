import { App } from "@/App";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function FlyerView() {
  return (
    <ErrorBoundary>
      <App routeView="flyer" />
    </ErrorBoundary>
  );
}
