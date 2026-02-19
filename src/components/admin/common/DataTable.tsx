/**
 * Data Table - Tabela de dados minimalista
 */

import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = 'Nenhum dado disponível',
  onRowClick,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="bg-white/[0.02] border border-border rounded-xl">
        <div className="p-8 text-center">
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-[13px]">Carregando...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white/[0.02] border border-border rounded-xl">
        <div className="p-8 text-center text-muted-foreground text-[13px]">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.02] border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground ${column.className || ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row, index) => (
              <tr
                key={index}
                className={`${onRowClick ? 'cursor-pointer hover:bg-white/[0.02]' : ''} transition-colors`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 text-[13px] text-white/70 ${column.className || ''}`}
                  >
                    {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataTable;
