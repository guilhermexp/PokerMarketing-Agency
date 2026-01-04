/**
 * Admin Organizations Page
 * List all organizations with their usage stats
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
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
  const { getToken } = useAuth();
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
      const token = await getToken();

      const res = await fetch(`${API_BASE}/api/admin/organizations?page=${page}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch organizations');

      const data = await res.json();
      setOrganizations(data.organizations);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      console.error('Error fetching organizations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchOrganizations(pagination.page);
  }, [fetchOrganizations, pagination.page]);

  const handlePageChange = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const columns: Column<Organization>[] = [
    {
      key: 'organization',
      header: 'Organization',
      render: (row) => (
        <div>
          <div className="font-medium text-[var(--color-text-primary)]">
            {row.primary_brand_name || 'Unnamed'}
          </div>
          <div className="text-xs text-[var(--color-text-tertiary)] font-mono">
            {row.organization_id.slice(0, 20)}...
          </div>
        </div>
      ),
    },
    {
      key: 'brands',
      header: 'Brands',
      render: (row) => (
        <span className="px-2 py-1 bg-purple-500/10 text-purple-500 rounded-full text-xs font-medium">
          {row.brand_count}
        </span>
      ),
    },
    {
      key: 'campaigns',
      header: 'Campaigns',
      render: (row) => (
        <span className="px-2 py-1 bg-blue-500/10 text-blue-500 rounded-full text-xs font-medium">
          {row.campaign_count}
        </span>
      ),
    },
    {
      key: 'images',
      header: 'Images',
      render: (row) => (
        <span className="px-2 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-medium">
          {row.gallery_image_count}
        </span>
      ),
    },
    {
      key: 'posts',
      header: 'Posts',
      render: (row) => (
        <span className="px-2 py-1 bg-orange-500/10 text-orange-500 rounded-full text-xs font-medium">
          {row.scheduled_post_count}
        </span>
      ),
    },
    {
      key: 'aiUsage',
      header: 'AI Usage (Month)',
      render: (row) => (
        <div className="text-right">
          <div className="text-[var(--color-text-primary)] font-medium">
            ${row.aiUsageThisMonth.costUsd.toFixed(2)}
          </div>
          <div className="text-xs text-[var(--color-text-tertiary)]">
            {row.aiUsageThisMonth.requests} requests
          </div>
        </div>
      ),
    },
    {
      key: 'last_activity',
      header: 'Last Activity',
      render: (row) => (
        <span className="text-[var(--color-text-secondary)]">
          {row.last_activity
            ? new Date(row.last_activity).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">All Organizations</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {pagination.total} organizations registered
          </p>
        </div>
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
        data={organizations}
        isLoading={isLoading}
        emptyMessage="No organizations found"
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

export default OrganizationsPage;
