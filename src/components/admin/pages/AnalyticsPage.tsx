/**
 * Analytics Page - Dashboard de análise de performance
 * Design minimalista com tema dark
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';

interface AnalyticsData {
  total_campaigns: number;
  total_images: number;
  total_flyers: number;
  total_ai_cost_cents: number;
  estimated_time_saved_hours: number;
  success_rate: number;
  campaigns_per_day: Array<{
    date: string;
    count: string;
  }>;
  images_per_day: Array<{
    date: string;
    count: string;
  }>;
  campaigns_by_organization: Array<{
    organization_id: string;
    count: string;
  }>;
  ai_costs_by_org: Array<{
    organization_id: string;
    total_cost_cents: string;
  }>;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export function AnalyticsPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const token = await getToken();

        const res = await fetch(`${API_BASE}/api/admin/analytics?period=${period}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error('Falha ao carregar dados de analytics');
        const analyticsData = await res.json();
        setData(analyticsData);
        setError(null);
      } catch (err) {
        console.error('Error fetching analytics data:', err);
        setError(err instanceof Error ? err.message : 'Falha ao carregar dados');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [getToken, period]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-white/40">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-[13px]">Carregando...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-[13px]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white/90">Analytics</h1>
          <p className="text-[13px] text-white/40 mt-1">
            Análise de performance e métricas do sistema
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2">
          {(['day', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
                period === p
                  ? 'bg-white/10 text-white/90 border border-white/20'
                  : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:text-white/60'
              }`}
            >
              {p === 'day' && 'Dia'}
              {p === 'week' && 'Semana'}
              {p === 'month' && 'Mês'}
            </button>
          ))}
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-8 text-center">
        <div className="text-white/40 text-[13px]">
          <div className="mb-4">
            <svg className="w-12 h-12 mx-auto text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="font-medium text-white/60">Dashboard Analytics em desenvolvimento</p>
          <p className="mt-1">Gráficos e métricas serão exibidos aqui</p>
          {data && (
            <p className="mt-4 text-white/30 text-[11px]">
              Dados carregados: {data.total_campaigns} campanhas
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnalyticsPage;
