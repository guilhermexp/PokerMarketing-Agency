/**
 * Admin Users Page
 * List and manage all users
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { DataTable, Column } from '../common/DataTable';
import { Pagination } from '../common/Pagination';
import { SearchInput } from '../common/SearchInput';

interface User {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  campaign_count: string;
  brand_count: string;
  scheduled_post_count: string;
  last_login: string | null;
  created_at: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

export function UsersPage() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (page: number, searchQuery: string) => {
    try {
      setIsLoading(true);
      const token = await getToken();

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const res = await fetch(`${API_BASE}/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch users');

      const data = await res.json();
      setUsers(data.users);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchUsers(pagination.page, search);
  }, [fetchUsers, pagination.page, search]);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const columns: Column<User>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.avatar_url ? (
            <img
              src={row.avatar_url}
              alt={row.name || row.email}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-sm font-medium">
              {(row.name || row.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-medium text-[var(--color-text-primary)]">
              {row.name || 'No name'}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">{row.email}</div>
          </div>
        </div>
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
      key: 'brands',
      header: 'Brands',
      render: (row) => (
        <span className="px-2 py-1 bg-purple-500/10 text-purple-500 rounded-full text-xs font-medium">
          {row.brand_count}
        </span>
      ),
    },
    {
      key: 'posts',
      header: 'Posts',
      render: (row) => (
        <span className="px-2 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-medium">
          {row.scheduled_post_count}
        </span>
      ),
    },
    {
      key: 'last_login',
      header: 'Last Login',
      render: (row) => (
        <span className="text-[var(--color-text-secondary)]">
          {row.last_login
            ? new Date(row.last_login).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Never'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Joined',
      render: (row) => (
        <span className="text-[var(--color-text-secondary)]">
          {new Date(row.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">All Users</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {pagination.total} users registered
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-md">
        <SearchInput
          placeholder="Search by name or email..."
          value={search}
          onChange={handleSearch}
        />
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
        data={users}
        isLoading={isLoading}
        emptyMessage="No users found"
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

export default UsersPage;
