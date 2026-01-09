/**
 * Logs Page - Página de logs de atividade
 * Design minimalista com tema dark
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
  timestamp?: string;
  model?: string;
  cost_cents?: number;
  error?: string | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

const severityColors = {
  info: 'text-white/50',
  warning: 'text-amber-500',
  error: 'text-red-400',
  critical: 'text-red-500 font-medium',
};

export function LogsPage() {
  const { getToken } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
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

      if (!res.ok) throw new Error('Falha ao carregar logs');

      const data = await res.json();
      setLogs(data.logs);
      setPagination(data.pagination);
      setCategories(data.filters?.categories || []);
      setRecentErrorCount(data.filters?.recentErrorCount || 0);
      setError(null);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err instanceof Error ? err.message : 'Falha ao carregar logs');
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
      header: 'Data/Hora',
      className: 'w-32',
      render: (row) => {
        const date = new Date(row.timestamp || row.created_at);
        return (
          <div className="text-[11px]">
            <div className="text-white/60">
              {date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </div>
            <div className="text-white/40">
              {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        );
      },
    },
    {
      key: 'severity',
      header: 'Nível',
      className: 'w-20',
      render: (row) => (
        <span className={`text-[11px] uppercase tracking-wide ${severityColors[row.severity]}`}>
          {row.severity}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      className: 'w-28',
      render: (row) => (
        <span className="text-[11px] text-white/50">
          {row.category}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Ação',
      render: (row) => (
        <div>
          <div className="text-[12px] font-medium text-white/70">{row.action || row.category}</div>
          {row.model && (
            <div className="text-[10px] text-white/40 mt-0.5 font-mono">
              {row.model}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Ator',
      render: (row) => (
        <div className="text-[11px]">
          <div className="text-white/60">
            {row.actor_name || row.user_name || 'Sistema'}
          </div>
          <div className="text-white/40">
            {row.actor_email || row.user_email || '-'}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-16',
      render: (row) => (
        row.success !== false && !row.error ? (
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      ),
    },
    {
      key: 'duration',
      header: 'Tempo',
      className: 'w-20 text-right',
      render: (row) => (
        <span className="text-[11px] text-white/40 tabular-nums">
          {row.duration_ms ? `${row.duration_ms}ms` : '-'}
        </span>
      ),
    },
  ];

  const severityLabels: Record<string, string> = {
    info: 'Info',
    warning: 'Aviso',
    error: 'Erro',
    critical: 'Crítico',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-medium text-white/90">Logs de Atividade</h2>
          <p className="text-[12px] text-white/40 mt-0.5">
            {pagination.total} logs registrados
            {recentErrorCount > 0 && (
              <span className="ml-2 text-red-400">
                ({recentErrorCount} erros nas últimas 24h)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-56">
          <SearchInput
            placeholder="Buscar ações..."
            value={filters.action}
            onChange={handleSearch}
          />
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/40">Categoria:</span>
            <div className="flex gap-1">
              {categories.slice(0, 5).map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                    filters.category === cat
                      ? 'bg-amber-500/15 text-amber-500'
                      : 'text-white/40 hover:text-white/60 bg-white/[0.03]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Severity Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/40">Nível:</span>
          <div className="flex gap-1">
            {(['info', 'warning', 'error', 'critical'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => handleSeverityChange(sev)}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                  filters.severity === sev
                    ? 'bg-amber-500/15 text-amber-500'
                    : `${severityColors[sev]} bg-white/[0.03] hover:bg-white/[0.05]`
                }`}
              >
                {severityLabels[sev]}
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
            className="text-[11px] text-amber-500 hover:text-amber-400"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-[13px]">
          {error}
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={logs}
        isLoading={isLoading}
        emptyMessage="Nenhum log encontrado"
      />

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
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
