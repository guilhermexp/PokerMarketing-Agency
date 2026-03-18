import { App } from "@/App";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function GalleryView() {
  return (
    <ErrorBoundary>
      <App routeView="gallery" />
    </ErrorBoundary>
  );
}
