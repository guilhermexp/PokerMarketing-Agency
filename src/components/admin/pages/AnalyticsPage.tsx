/**
 * Analytics Page - Dashboard de análise de performance
 * Design minimalista com tema dark
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { StatsCard } from '../common/StatsCard';

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

  // Transform campaigns data for chart
  const campaignsChartData = (data?.campaigns_per_day || []).map((item) => ({
    date: new Date(item.date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      ...(period === 'day' ? { hour: '2-digit' } : {})
    }),
    campanhas: parseInt(item.count) || 0,
  }));

  // Transform images data for chart
  const imagesChartData = (data?.images_per_day || []).map((item) => ({
    date: new Date(item.date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      ...(period === 'day' ? { hour: '2-digit' } : {})
    }),
    imagens: parseInt(item.count) || 0,
  }));

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

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title="Total de Campanhas"
          value={data?.total_campaigns?.toLocaleString('pt-BR') || 0}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          color="amber"
        />
        <StatsCard
          title="Total de Imagens"
          value={data?.total_images?.toLocaleString('pt-BR') || 0}
          subtitle="Imagens geradas por IA"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
          color="green"
        />
        <StatsCard
          title="Total de Flyers"
          value={data?.total_flyers?.toLocaleString('pt-BR') || 0}
          subtitle="Flyers de torneio"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          }
          color="default"
        />
        <StatsCard
          title="Taxa de Sucesso"
          value={`${((data?.success_rate || 0) * 100).toFixed(1)}%`}
          subtitle="Geração de imagens"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="green"
        />
        <StatsCard
          title="Custo IA"
          value={`$${((data?.total_ai_cost_cents || 0) / 100).toFixed(2)}`}
          subtitle="Custos totais"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="default"
        />
      </div>

      {/* Campaigns Chart */}
      {campaignsChartData.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5">
          <h3 className="text-[13px] font-medium text-white/70 mb-4">
            Campanhas Criadas (
            {period === 'day' && 'Últimas 24 horas'}
            {period === 'week' && 'Últimos 7 dias'}
            {period === 'month' && 'Últimos 30 dias'}
            )
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={campaignsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  itemStyle={{ color: 'rgba(255,255,255,0.9)' }}
                />
                <Bar
                  dataKey="campanhas"
                  name="Campanhas"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Images Chart */}
      {imagesChartData.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-5">
          <h3 className="text-[13px] font-medium text-white/70 mb-4">
            Imagens Geradas (
            {period === 'day' && 'Últimas 24 horas'}
            {period === 'week' && 'Últimos 7 dias'}
            {period === 'month' && 'Últimos 30 dias'}
            )
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={imagesChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  itemStyle={{ color: 'rgba(255,255,255,0.9)' }}
                />
                <Area
                  type="monotone"
                  dataKey="imagens"
                  name="Imagens"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.1}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalyticsPage;
