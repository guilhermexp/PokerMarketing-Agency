import { App } from "@/App";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function ImagePlaygroundView() {
  return (
    <ErrorBoundary>
      <App routeView="image-playground" />
    </ErrorBoundary>
  );
}
