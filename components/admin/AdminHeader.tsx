/**
 * Admin Header Component
 * Top header with user info and quick actions
 */

import React from 'react';
import { useUser, UserButton } from '@clerk/clerk-react';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/admin': 'Overview',
  '/admin/users': 'Users',
  '/admin/organizations': 'Organizations',
  '/admin/usage': 'AI Usage',
  '/admin/logs': 'Activity Logs',
};

export function AdminHeader() {
  const { user } = useUser();
  const location = useLocation();

  // Get page title based on current path
  const getPageTitle = () => {
    for (const [path, title] of Object.entries(pageTitles)) {
      if (location.pathname === path || location.pathname.startsWith(path + '/')) {
        return title;
      }
    }
    return 'Admin';
  };

  return (
    <header className="h-16 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] fixed top-0 left-64 right-0 z-10">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Page Title */}
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {getPageTitle()}
          </h1>
          <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/10 text-yellow-500 rounded-full border border-yellow-500/20">
            Super Admin
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Quick Stats */}
          <div className="hidden md:flex items-center gap-6 mr-4">
            <div className="text-right">
              <p className="text-xs text-[var(--color-text-tertiary)]">Logged in as</p>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                {user?.primaryEmailAddress?.emailAddress || 'Admin'}
              </p>
            </div>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => window.location.reload()}
            className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            title="Refresh"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* User Button */}
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'w-9 h-9',
              },
            }}
          />
        </div>
      </div>
    </header>
  );
}

export default AdminHeader;
