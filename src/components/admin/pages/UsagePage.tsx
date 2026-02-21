/**
 * Usage Page - Página de uso de IA
 * Design minimalista com tema dark
 */

import React, { useEffect, useState, useCallback } from 'react';
import { StatsCard } from '../common/StatsCard';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface UsageTotals {
  totalRequests: number;
  successCount: number;
  failedCount: number;
  totalCostCents: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalImages: number;
  totalVideoSeconds: number;
}

interface TimelineItem {
  date?: string;
  provider?: string;
  model_id?: string;
  operation?: string;
  total_requests: string;
  total_cost_cents: string;
}

interface TopUser {
  user_id: string;
  email: string;
  name: string;
  total_requests: string;
  total_cost_cents: string;
  totalCostUsd: number;
}

interface TopOrganization {
  organization_id: string;
  total_requests: string;
  total_cost_cents: string;
  totalCostUsd: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

type GroupBy = 'day' | 'provider' | 'model' | 'operation';

const groupByLabels: Record<GroupBy, string> = {
  day: 'Dia',
  provider: 'Provedor',
  model: 'Modelo',
  operation: 'Operação',
};

export function UsagePage() {
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [topOrganizations, setTopOrganizations] = useState<TopOrganization[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async (group: GroupBy) => {
    try {
      setIsLoading(true);

      const res = await fetch(`${API_BASE}/api/admin/usage?groupBy=${group}`, {
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Falha ao carregar dados de uso');

      const data = await res.json();
      setTotals(data.totals);
      setTimeline(data.timeline || []);
      setTopUsers(data.topUsers || []);
      setTopOrganizations(data.topOrganizations || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching usage:', err);
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage(groupBy);
  }, [fetchUsage, groupBy]);

  const chartData = timeline.map((item) => ({
    name: item.date
      ? new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
      : item.provider || item.model_id || item.operation || 'N/A',
    requisicoes: parseInt(item.total_requests) || 0,
    custo: (parseInt(item.total_cost_cents) || 0) / 100,
  }));

  if (isLoading && !totals) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
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
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Custo Total (30d)"
          value={`$${totals?.totalCostUsd?.toFixed(2) || '0.00'}`}
          subtitle={`R$ ${((totals?.totalCostUsd || 0) * 6.0).toFixed(2).replace('.', ',')}`}
          color="amber"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatsCard
          title="Requisições"
          value={totals?.totalRequests?.toLocaleString('pt-BR') || '0'}
          color="default"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          }
        />
        <StatsCard
          title="Taxa de Sucesso"
          value={`${totals?.totalRequests ? ((totals.successCount / totals.totalRequests) * 100).toFixed(1) : 0}%`}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatsCard
          title="Imagens Geradas"
          value={totals?.totalImages?.toLocaleString('pt-BR') || '0'}
          color="default"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          }
        />
      </div>

      {/* Group By Selector */}
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-muted-foreground">Agrupar por:</span>
        <div className="flex gap-1 p-1 bg-white/[0.03] rounded-md">
          {(['day', 'provider', 'model', 'operation'] as GroupBy[]).map((group) => (
            <button
              key={group}
              onClick={() => setGroupBy(group)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded transition-colors ${
                groupBy === group
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'text-muted-foreground hover:text-white/80'
              }`}
            >
              {groupByLabels[group]}
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Timeline/Bar Chart */}
        <div className="bg-white/[0.02] border border-border rounded-lg p-5">
          <h3 className="text-[13px] font-medium text-white/70 mb-4">
            {groupBy === 'day' ? 'Uso ao Longo do Tempo' : `Uso por ${groupByLabels[groupBy]}`}
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              {groupBy === 'day' ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      fontSize: '11px',
                    }}
                  />
                  <Area type="monotone" dataKey="requisicoes" name="Requisições" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeWidth={1.5} />
                </AreaChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={9} angle={-45} textAnchor="end" height={60} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="requisicoes" name="Requisições" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost Chart */}
        <div className="bg-white/[0.02] border border-border rounded-lg p-5">
          <h3 className="text-[13px] font-medium text-white/70 mb-4">
            Custo por {groupByLabels[groupBy]}
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} />
                <YAxis type="category" dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={9} width={80} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Custo']}
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '6px',
                    fontSize: '11px',
                  }}
                />
                <Bar dataKey="custo" name="Custo" fill="#10b981" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Users & Organizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Users */}
        <div className="bg-white/[0.02] border border-border rounded-lg p-5">
          <h3 className="text-[13px] font-medium text-white/70 mb-4">
            Top Usuários por Custo
          </h3>
          <div className="space-y-3">
            {topUsers.length === 0 ? (
              <p className="text-muted-foreground text-[12px]">Sem dados disponíveis</p>
            ) : (
              topUsers.map((user, index) => (
                <div key={user.user_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 text-[10px] font-medium">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-[12px] font-medium text-white/70">
                        {user.name || user.email}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {parseInt(user.total_requests).toLocaleString('pt-BR')} req.
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[12px] font-medium text-amber-500 tabular-nums">
                      ${user.totalCostUsd.toFixed(2)}
                    </span>
                    <div className="text-[10px] text-muted-foreground">
                      R$ {(user.totalCostUsd * 6.0).toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Organizations */}
        <div className="bg-white/[0.02] border border-border rounded-lg p-5">
          <h3 className="text-[13px] font-medium text-white/70 mb-4">
            Top Organizações por Custo
          </h3>
          <div className="space-y-3">
            {topOrganizations.length === 0 ? (
              <p className="text-muted-foreground text-[12px]">Sem dados disponíveis</p>
            ) : (
              topOrganizations.map((org, index) => (
                <div key={org.organization_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-muted-foreground text-[10px] font-medium">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-[12px] font-medium text-white/70 font-mono">
                        {org.organization_id.slice(0, 16)}...
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {parseInt(org.total_requests).toLocaleString('pt-BR')} req.
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[12px] font-medium text-amber-500 tabular-nums">
                      ${org.totalCostUsd.toFixed(2)}
                    </span>
                    <div className="text-[10px] text-muted-foreground">
                      R$ {(org.totalCostUsd * 6.0).toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Token Usage Stats */}
      {totals && (totals.totalInputTokens > 0 || totals.totalOutputTokens > 0) && (
        <div className="bg-white/[0.02] border border-border rounded-lg p-5">
          <h3 className="text-[13px] font-medium text-white/70 mb-4">
            Uso de Tokens
          </h3>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-semibold text-white/80 tabular-nums">
                {totals.totalInputTokens.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Tokens de Entrada</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-white/80 tabular-nums">
                {totals.totalOutputTokens.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Tokens de Saída</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-amber-500 tabular-nums">
                {(totals.totalInputTokens + totals.totalOutputTokens).toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Total de Tokens</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UsagePage;
