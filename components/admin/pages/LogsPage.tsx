/**
 * Admin Activity Logs Page
 * View and filter system activity logs
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { SearchInput } from '../common/SearchInput';

interface ActivityLog {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  category: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
  severity: 'info' | 'warning' | 'error' | 'critical';
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  ip_address: string | null;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
}

interface CategoryCount {
  category: string;
  count: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

const severityColors = {
  info: 'bg-blue-500/10 text-blue-500',
  warning: 'bg-yellow-500/10 text-yellow-500',
  error: 'bg-red-500/10 text-red-500',
  critical: 'bg-red-600/20 text-red-400 border border-red-500/30',
};

const categoryColors: Record<string, string> = {
  auth: 'bg-purple-500/10 text-purple-500',
  crud: 'bg-blue-500/10 text-blue-500',
  ai_generation: 'bg-green-500/10 text-green-500',
  publishing: 'bg-orange-500/10 text-orange-500',
  settings: 'bg-gray-500/10 text-gray-400',
  admin: 'bg-yellow-500/10 text-yellow-500',
  system: 'bg-cyan-500/10 text-cyan-500',
  error: 'bg-red-500/10 text-red-500',
};

export function LogsPage() {
  const { getToken } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [recentErrorCount, setRecentErrorCount] = useState(0);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    action: '',
    category: '',
    severity: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (page: number, currentFilters: typeof filters) => {
    try {
      setIsLoading(true);
      const token = await getToken();

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });

      if (currentFilters.action) params.append('action', currentFilters.action);
      if (currentFilters.category) params.append('category', currentFilters.category);
      if (currentFilters.severity) params.append('severity', currentFilters.severity);

      const res = await fetch(`${API_BASE}/api/admin/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch logs');

      const data = await res.json();
      setLogs(data.logs);
      setPagination(data.pagination);
      setCategories(data.filters.categories || []);
      setRecentErrorCount(data.filters.recentErrorCount || 0);
      setError(null);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchLogs(pagination.page, filters);
  }, [fetchLogs, pagination.page, filters]);

  const handleSearch = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, action: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handleCategoryChange = useCallback((category: string) => {
    setFilters((prev) => ({ ...prev, category: category === prev.category ? '' : category }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handleSeverityChange = useCallback((severity: string) => {
    setFilters((prev) => ({ ...prev, severity: severity === prev.severity ? '' : severity }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const columns: Column<ActivityLog>[] = [
    {
      key: 'timestamp',
      header: 'Time',
      className: 'w-36',
      render: (row) => (
        <div className="text-xs">
          <div className="text-[var(--color-text-primary)]">
            {new Date(row.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <div className="text-[var(--color-text-tertiary)]">
            {new Date(row.created_at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </div>
        </div>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      className: 'w-24',
      render: (row) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColors[row.severity]}`}>
          {row.severity}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      className: 'w-32',
      render: (row) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryColors[row.category] || 'bg-gray-500/10 text-gray-400'}`}>
          {row.category}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <div>
          <div className="font-medium text-[var(--color-text-primary)]">{row.action}</div>
          {row.entity_name && (
            <div className="text-xs text-[var(--color-text-tertiary)]">
              {row.entity_type}: {row.entity_name}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="text-sm">
          <div className="text-[var(--color-text-primary)]">
            {row.actor_name || row.user_name || 'System'}
          </div>
          <div className="text-xs text-[var(--color-text-tertiary)]">
            {row.actor_email || row.user_email || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-20',
      render: (row) => (
        row.success ? (
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      className: 'w-24 text-right',
      render: (row) => (
        <span className="text-[var(--color-text-secondary)]">
          {row.duration_ms ? `${row.duration_ms}ms` : '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Activity Logs</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {pagination.total} total logs
            {recentErrorCount > 0 && (
              <span className="ml-2 text-red-500">
                ({recentErrorCount} errors in last 24h)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="w-64">
          <SearchInput
            placeholder="Search actions..."
            value={filters.action}
            onChange={handleSearch}
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-text-secondary)]">Category:</span>
          <div className="flex gap-1">
            {categories.slice(0, 6).map((cat) => (
              <button
                key={cat.category}
                onClick={() => handleCategoryChange(cat.category)}
                className={`px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                  filters.category === cat.category
                    ? 'bg-[var(--color-accent)] text-white'
                    : categoryColors[cat.category] || 'bg-gray-500/10 text-gray-400 hover:bg-gray-500/20'
                }`}
              >
                {cat.category} ({cat.count})
              </button>
            ))}
          </div>
        </div>

        {/* Severity Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-text-secondary)]">Severity:</span>
          <div className="flex gap-1">
            {(['info', 'warning', 'error', 'critical'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => handleSeverityChange(sev)}
                className={`px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                  filters.severity === sev
                    ? 'bg-[var(--color-accent)] text-white'
                    : severityColors[sev] + ' hover:opacity-80'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* Clear Filters */}
        {(filters.action || filters.category || filters.severity) && (
          <button
            onClick={() => {
              setFilters({ action: '', category: '', severity: '' });
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-500">
          {error}
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={logs}
        isLoading={isLoading}
        emptyMessage="No logs found"
      />

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="bg-[var(--color-bg-secondary)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            itemsPerPage={pagination.limit}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </div>
  );
}

export default LogsPage;
