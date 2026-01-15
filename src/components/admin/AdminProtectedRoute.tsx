/**
 * Admin Protected Route Component
 * Guards admin routes - only allows super admins to access
 */

import React from 'react';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import { useSuperAdmin } from '../../hooks/useSuperAdmin';
import { Loader } from '../common/Loader';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

function AdminAccessCheck({ children }: AdminProtectedRouteProps) {
  const { isSuperAdmin, isLoading } = useSuperAdmin();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <Loader label="Verifying admin access..." />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
            Access Denied
          </h1>
          <p className="text-[var(--color-text-secondary)] mb-6">
            You don't have permission to access the admin panel.
            This area is restricted to super administrators only.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Return to App
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  return (
    <>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
      <SignedIn>
        <AdminAccessCheck>{children}</AdminAccessCheck>
      </SignedIn>
    </>
  );
}

export default AdminProtectedRoute;
