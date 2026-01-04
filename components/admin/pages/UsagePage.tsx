/**
 * Admin AI Usage Page
 * Detailed AI usage analytics and cost tracking
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { StatsCard } from '../common/StatsCard';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

type GroupBy = 'day' | 'provider' | 'model' | 'operation';

export function UsagePage() {
  const { getToken } = useAuth();
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
      const token = await getToken();

      const res = await fetch(`${API_BASE}/api/admin/usage?groupBy=${group}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch usage data');

      const data = await res.json();
      setTotals(data.totals);
      setTimeline(data.timeline || []);
      setTopUsers(data.topUsers || []);
      setTopOrganizations(data.topOrganizations || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching usage:', err);
      setError(err instanceof Error ? err.message : 'Failed to load usage data');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchUsage(groupBy);
  }, [fetchUsage, groupBy]);

  const chartData = timeline.map((item) => ({
    name: item.date
      ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : item.provider || item.model_id || item.operation || 'Unknown',
    requests: parseInt(item.total_requests) || 0,
    cost: (parseInt(item.total_cost_cents) || 0) / 100,
  }));

  const pieData = groupBy !== 'day' && timeline.length > 0
    ? timeline.slice(0, 6).map((item, index) => ({
        name: item.provider || item.model_id || item.operation || 'Unknown',
        value: parseInt(item.total_cost_cents) || 0,
        color: COLORS[index % COLORS.length],
      }))
    : [];

  if (isLoading && !totals) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading usage data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Cost (30 days)"
          value={`$${totals?.totalCostUsd?.toFixed(2) || '0.00'}`}
          color="green"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatsCard
          title="Total Requests"
          value={totals?.totalRequests?.toLocaleString() || '0'}
          color="blue"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatsCard
          title="Success Rate"
          value={`${totals?.totalRequests ? ((totals.successCount / totals.totalRequests) * 100).toFixed(1) : 0}%`}
          color="purple"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatsCard
          title="Images Generated"
          value={totals?.totalImages?.toLocaleString() || '0'}
          color="orange"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* Group By Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--color-text-secondary)]">Group by:</span>
        <div className="flex gap-1 p-1 bg-[var(--color-bg-tertiary)] rounded-lg">
          {(['day', 'provider', 'model', 'operation'] as GroupBy[]).map((group) => (
            <button
              key={group}
              onClick={() => setGroupBy(group)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                groupBy === group
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline/Bar Chart */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] p-6">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
            {groupBy === 'day' ? 'Usage Over Time' : `Usage by ${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}`}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {groupBy === 'day' ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-text-tertiary)" fontSize={12} />
                  <YAxis stroke="var(--color-text-tertiary)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                  />
                  <Area type="monotone" dataKey="requests" name="Requests" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.2} />
                </AreaChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-text-tertiary)" fontSize={10} angle={-45} textAnchor="end" height={60} />
                  <YAxis stroke="var(--color-text-tertiary)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="requests" name="Requests" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost Distribution Pie Chart */}
        {groupBy !== 'day' && pieData.length > 0 && (
          <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              Cost Distribution
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`$${(value / 100).toFixed(2)}`, 'Cost']}
                    contentStyle={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Cost Chart */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] p-6">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
            Cost Breakdown
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" stroke="var(--color-text-tertiary)" fontSize={12} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <YAxis type="category" dataKey="name" stroke="var(--color-text-tertiary)" fontSize={10} width={100} />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
                  contentStyle={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="cost" name="Cost" fill="#10B981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Users & Organizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Users */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] p-6">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
            Top Users by Cost
          </h3>
          <div className="space-y-3">
            {topUsers.length === 0 ? (
              <p className="text-[var(--color-text-secondary)] text-sm">No data available</p>
            ) : (
              topUsers.map((user, index) => (
                <div key={user.user_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-xs font-medium">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-[var(--color-text-primary)]">
                        {user.name || user.email}
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        {parseInt(user.total_requests).toLocaleString()} requests
                      </div>
                    </div>
                  </div>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    ${user.totalCostUsd.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Organizations */}
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] p-6">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
            Top Organizations by Cost
          </h3>
          <div className="space-y-3">
            {topOrganizations.length === 0 ? (
              <p className="text-[var(--color-text-secondary)] text-sm">No data available</p>
            ) : (
              topOrganizations.map((org, index) => (
                <div key={org.organization_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-medium">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-[var(--color-text-primary)] font-mono">
                        {org.organization_id.slice(0, 20)}...
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)]">
                        {parseInt(org.total_requests).toLocaleString()} requests
                      </div>
                    </div>
                  </div>
                  <span className="font-medium text-[var(--color-text-primary)]">
                    ${org.totalCostUsd.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Token Usage Stats */}
      {totals && (totals.totalInputTokens > 0 || totals.totalOutputTokens > 0) && (
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] p-6">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
            Token Usage
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500">
                {totals.totalInputTokens.toLocaleString()}
              </div>
              <div className="text-sm text-[var(--color-text-secondary)]">Input Tokens</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">
                {totals.totalOutputTokens.toLocaleString()}
              </div>
              <div className="text-sm text-[var(--color-text-secondary)]">Output Tokens</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-500">
                {(totals.totalInputTokens + totals.totalOutputTokens).toLocaleString()}
              </div>
              <div className="text-sm text-[var(--color-text-secondary)]">Total Tokens</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UsagePage;
