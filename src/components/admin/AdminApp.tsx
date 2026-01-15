/**
 * Admin App Component
 * Main entry point for the admin panel with routing
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminProtectedRoute } from './AdminProtectedRoute';
import { AdminLayout } from './AdminLayout';
import { OverviewPage } from './pages/OverviewPage';
import { UsersPage } from './pages/UsersPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { UsagePage } from './pages/UsagePage';
import { LogsPage } from './pages/LogsPage';

export function AdminApp() {
  return (
    <AdminProtectedRoute>
      <AdminLayout>
        <Routes>
          <Route index element={<OverviewPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </AdminLayout>
    </AdminProtectedRoute>
  );
}

export default AdminApp;
