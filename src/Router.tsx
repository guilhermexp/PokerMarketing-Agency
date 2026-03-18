/**
 * Application Router
 * Handles routing between main app and admin panel
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Loader } from './components/common/Loader';

// Lazy load admin panel for code splitting
const AdminApp = lazy(() =>
  import('./components/admin/AdminApp').then((m) => ({ default: m.AdminApp })),
);

// Dev-only: Error notification test page
const ErrorNotificationTest = lazy(() =>
  import('./components/test/ErrorNotificationTest').then((m) => ({
    default: m.ErrorNotificationTest,
  }))
);

const CampaignView = lazy(() =>
  import('./views/campaign-view').then((m) => ({ default: m.CampaignView })),
);
const CampaignsView = lazy(() =>
  import('./views/campaigns-view').then((m) => ({ default: m.CampaignsView })),
);
const CarouselsView = lazy(() =>
  import('./views/carousels-view').then((m) => ({ default: m.CarouselsView })),
);
const FlyerView = lazy(() =>
  import('./views/flyer-view').then((m) => ({ default: m.FlyerView })),
);
const GalleryView = lazy(() =>
  import('./views/gallery-view').then((m) => ({ default: m.GalleryView })),
);
const CalendarView = lazy(() =>
  import('./views/calendar-view').then((m) => ({ default: m.CalendarView })),
);
const PlaygroundView = lazy(() =>
  import('./views/playground-view').then((m) => ({ default: m.PlaygroundView })),
);
const ImagePlaygroundView = lazy(() =>
  import('./views/image-playground-view').then((m) => ({
    default: m.ImagePlaygroundView,
  })),
);

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin routes */}
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<AdminLoadingFallback />}>
              <AdminApp />
            </Suspense>
          }
        />

        {/* Dev-only: Test routes */}
        {import.meta.env.DEV && (
          <Route
            path="/test/error-notifications"
            element={
              <Suspense fallback={<AdminLoadingFallback />}>
                <ErrorNotificationTest />
              </Suspense>
            }
          />
        )}

        <Route path="/" element={<Navigate to="/campaign" replace />} />
        <Route
          path="/campaign"
          element={<MainRoute fallbackLabel="Campanha"><CampaignView /></MainRoute>}
        />
        <Route
          path="/campaigns"
          element={<MainRoute fallbackLabel="Campanhas"><CampaignsView /></MainRoute>}
        />
        <Route
          path="/carousels"
          element={<MainRoute fallbackLabel="Carrosséis"><CarouselsView /></MainRoute>}
        />
        <Route
          path="/flyer"
          element={<MainRoute fallbackLabel="Flyers"><FlyerView /></MainRoute>}
        />
        <Route
          path="/gallery"
          element={<MainRoute fallbackLabel="Galeria"><GalleryView /></MainRoute>}
        />
        <Route
          path="/calendar"
          element={<MainRoute fallbackLabel="Calendário"><CalendarView /></MainRoute>}
        />
        <Route
          path="/playground"
          element={<MainRoute fallbackLabel="Playground"><PlaygroundView /></MainRoute>}
        />
        <Route
          path="/image-playground"
          element={<MainRoute fallbackLabel="Image Playground"><ImagePlaygroundView /></MainRoute>}
        />
        <Route path="*" element={<Navigate to="/campaign" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function MainRoute({
  children,
  fallbackLabel,
}: {
  children: React.ReactNode;
  fallbackLabel: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
          <span className="text-sm text-muted-foreground">
            Falha ao carregar a view.
          </span>
        </div>
      }
    >
      <Suspense fallback={<ViewLoadingFallback label={fallbackLabel} />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function ViewLoadingFallback({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] px-4 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="space-y-3">
            <div className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
            <div className="h-8 w-56 animate-pulse rounded-full bg-white/15" />
          </div>
          <div className="h-10 w-24 animate-pulse rounded-2xl bg-white/10" />
        </div>
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <div className="h-[480px] animate-pulse rounded-[28px] border border-white/10 bg-white/5" />
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="h-32 animate-pulse rounded-[24px] border border-white/10 bg-white/5" />
              <div className="h-32 animate-pulse rounded-[24px] border border-white/10 bg-white/5" />
              <div className="h-32 animate-pulse rounded-[24px] border border-white/10 bg-white/5" />
            </div>
            <div className="h-[344px] animate-pulse rounded-[32px] border border-white/10 bg-white/5" />
          </div>
        </div>
        <span className="text-sm text-muted-foreground">
          Carregando {label.toLowerCase()}...
        </span>
      </div>
    </div>
  );
}

function AdminLoadingFallback() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader size={20} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading admin panel...</span>
      </div>
    </div>
  );
}
