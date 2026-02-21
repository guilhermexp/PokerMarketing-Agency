/**
 * Organizations Page - Página de organizações
 * Design minimalista com tema dark
 */

import React, { useEffect, useState, useCallback } from 'react';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';

interface Organization {
  organization_id: string;
  primary_brand_name: string;
  brand_count: string;
  campaign_count: string;
  gallery_image_count: string;
  scheduled_post_count: string;
  first_brand_created: string;
  last_activity: string;
  aiUsageThisMonth: {
    requests: number;
    costCents: number;
    costUsd: number;
  };
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganizations = useCallback(async (page: number) => {
    try {
      setIsLoading(true);

      const res = await fetch(`${API_BASE}/api/admin/organizations?page=${page}&limit=20`, {
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Falha ao carregar organizações');

      const data = await res.json();
      setOrganizations(data.organizations);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setError(err instanceof Error ? err.message : 'Falha ao carregar organizações');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations(pagination.page);
  }, [fetchOrganizations, pagination.page]);

  const handlePageChange = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const columns: Column<Organization>[] = [
    {
      key: 'organization',
      header: 'Organização',
      render: (row) => (
        <div>
          <div className="text-[13px] font-medium text-white/80">
            {row.primary_brand_name || 'Sem nome'}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {row.organization_id?.slice(0, 20)}...
          </div>
        </div>
      ),
    },
    {
      key: 'brands',
      header: 'Marcas',
      render: (row) => (
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {row.brand_count}
        </span>
      ),
    },
    {
      key: 'campaigns',
      header: 'Campanhas',
      render: (row) => (
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {row.campaign_count}
        </span>
      ),
    },
    {
      key: 'images',
      header: 'Imagens',
      render: (row) => (
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {row.gallery_image_count}
        </span>
      ),
    },
    {
      key: 'posts',
      header: 'Posts',
      render: (row) => (
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {row.scheduled_post_count}
        </span>
      ),
    },
    {
      key: 'aiUsage',
      header: 'Uso IA (mês)',
      render: (row) => (
        <div className="text-right">
          <div className="text-[12px] font-medium text-amber-500 tabular-nums">
            ${row.aiUsageThisMonth?.costUsd?.toFixed(2) || '0.00'}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {row.aiUsageThisMonth?.requests || 0} req.
          </div>
        </div>
      ),
    },
    {
      key: 'last_activity',
      header: 'Última Atividade',
      render: (row) => (
        <span className="text-[12px] text-muted-foreground">
          {row.last_activity
            ? new Date(row.last_activity).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-medium text-white/90">Todas as Organizações</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {pagination.total} organizações cadastradas
          </p>
        </div>
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
        data={organizations}
        isLoading={isLoading}
        emptyMessage="Nenhuma organização encontrada"
      />

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="bg-white/[0.02] border border-border rounded-lg overflow-hidden">
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

export default OrganizationsPage;
