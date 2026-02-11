/**
 * Application Router
 * Handles routing between main app and admin panel
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { Loader } from './components/common/Loader';

// Lazy load admin panel for code splitting
const AdminApp = lazy(() => import('./components/admin/AdminApp'));

// Dev-only: Error notification test page
const ErrorNotificationTest = lazy(() =>
  import('./components/test/ErrorNotificationTest').then((m) => ({
    default: m.ErrorNotificationTest,
  }))
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

        {/* Main app - catch all other routes */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
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

export default Router;
