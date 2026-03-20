/**
 * Application Router
 * Handles routing between main app and admin panel
 */

import React, { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { lazyWithRetry } from '@/lib/asset-version-recovery';
import { Loader } from './components/common/Loader';

// Lazy load admin panel for code splitting
const AdminApp = lazyWithRetry(() =>
  import('./components/admin/AdminApp').then((m) => ({ default: m.AdminApp })),
);

// Dev-only: Error notification test page
const ErrorNotificationTest = lazyWithRetry(() =>
  import('./components/test/ErrorNotificationTest').then((m) => ({
    default: m.ErrorNotificationTest,
  }))
);

const CampaignView = lazyWithRetry(() =>
  import('./views/campaign-view').then((m) => ({ default: m.CampaignView })),
);
const CampaignsView = lazyWithRetry(() =>
  import('./views/campaigns-view').then((m) => ({ default: m.CampaignsView })),
);
const CarouselsView = lazyWithRetry(() =>
  import('./views/carousels-view').then((m) => ({ default: m.CarouselsView })),
);
const FlyerView = lazyWithRetry(() =>
  import('./views/flyer-view').then((m) => ({ default: m.FlyerView })),
);
const GalleryView = lazyWithRetry(() =>
  import('./views/gallery-view').then((m) => ({ default: m.GalleryView })),
);
const CalendarView = lazyWithRetry(() =>
  import('./views/calendar-view').then((m) => ({ default: m.CalendarView })),
);
const PlaygroundView = lazyWithRetry(() =>
  import('./views/playground-view').then((m) => ({ default: m.PlaygroundView })),
);
const ImagePlaygroundView = lazyWithRetry(() =>
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
          element={<MainRoute><CampaignView /></MainRoute>}
        />
        <Route
          path="/campaigns"
          element={<MainRoute><CampaignsView /></MainRoute>}
        />
        <Route
          path="/carousels"
          element={<MainRoute><CarouselsView /></MainRoute>}
        />
        <Route
          path="/flyer"
          element={<MainRoute><FlyerView /></MainRoute>}
        />
        <Route
          path="/gallery"
          element={<MainRoute><GalleryView /></MainRoute>}
        />
        <Route
          path="/calendar"
          element={<MainRoute><CalendarView /></MainRoute>}
        />
        <Route
          path="/playground"
          element={<MainRoute><PlaygroundView /></MainRoute>}
        />
        <Route
          path="/image-playground"
          element={<MainRoute><ImagePlaygroundView /></MainRoute>}
        />
        <Route path="*" element={<Navigate to="/campaign" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function MainRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      {children}
    </Suspense>
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
