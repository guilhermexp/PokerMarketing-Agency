/**
 * Users Page - Página de usuários
 * Design minimalista com tema dark
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

      if (!res.ok) throw new Error('Falha ao carregar usuários');

      const data = await res.json();
      setUsers(data.users);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err instanceof Error ? err.message : 'Falha ao carregar usuários');
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
      header: 'Usuário',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.avatar_url ? (
            <img
              src={row.avatar_url}
              alt={row.name || row.email}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 text-[11px] font-medium">
              {(row.name || row.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-[13px] font-medium text-white/80">
              {row.name || 'Sem nome'}
            </div>
            <div className="text-[11px] text-muted-foreground">{row.email}</div>
          </div>
        </div>
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
      key: 'brands',
      header: 'Marcas',
      render: (row) => (
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {row.brand_count}
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
      key: 'last_login',
      header: 'Último Login',
      render: (row) => (
        <span className="text-[12px] text-muted-foreground">
          {row.last_login
            ? new Date(row.last_login).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : '-'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Cadastro',
      render: (row) => (
        <span className="text-[12px] text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-medium text-white/90">Todos os Usuários</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {pagination.total} usuários cadastrados
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-xs">
        <SearchInput
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={handleSearch}
        />
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
        data={users}
        isLoading={isLoading}
        emptyMessage="Nenhum usuário encontrado"
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

export default UsersPage;
