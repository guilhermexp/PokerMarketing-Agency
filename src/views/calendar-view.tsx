import { App } from "@/App";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export function CalendarView() {
  return (
    <ErrorBoundary>
      <App routeView="calendar" />
    </ErrorBoundary>
  );
}
