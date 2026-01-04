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

        {/* Main app - catch all other routes */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  );
}

function AdminLoadingFallback() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
      <Loader label="Loading admin panel..." />
    </div>
  );
}

export default Router;
