/**
 * Admin Header - Cabeçalho do painel admin
 * Design minimalista com tema dark
 */

import React from 'react';
import { authClient } from '../../lib/auth-client';
import { UserProfileButton } from '../auth/AuthWrapper';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/admin': 'Visão Geral',
  '/admin/users': 'Usuários',
  '/admin/organizations': 'Organizações',
  '/admin/usage': 'Uso de IA',
  '/admin/logs': 'Logs de Atividade',
};

export function AdminHeader() {
  const { data: sessionData } = authClient.useSession();
  const user = sessionData?.user;
  const location = useLocation();

  const getPageTitle = () => {
    for (const [path, title] of Object.entries(pageTitles)) {
      if (location.pathname === path || location.pathname.startsWith(path + '/')) {
        return title;
      }
    }
    return 'Admin';
  };

  return (
    <header className="h-14 bg-[#000000] border-b border-border fixed top-0 left-56 right-0 z-10">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Page Title */}
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-medium text-white/90">
            {getPageTitle()}
          </h1>
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-500 rounded">
            Admin
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* User info */}
          <div className="hidden md:block text-right mr-1">
            <p className="text-[11px] text-muted-foreground leading-tight">Logado como</p>
            <p className="text-[12px] font-medium text-muted-foreground leading-tight">
              {user?.email || 'Admin'}
            </p>
          </div>

          {/* Refresh */}
          <button
            onClick={() => window.location.reload()}
            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-white/70 hover:bg-white/[0.04] transition-all"
            title="Atualizar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>

          {/* User Button */}
          <UserProfileButton />
        </div>
      </div>
    </header>
  );
}

export default AdminHeader;
