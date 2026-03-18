import { App } from "@/App";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function PlaygroundView() {
  return (
    <ErrorBoundary>
      <App routeView="playground" />
    </ErrorBoundary>
  );
}
