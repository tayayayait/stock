import * as React from 'react';

export interface TableListColumn<T> {
  key: React.Key;
  label: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

interface TableListProps<T> {
  columns: Array<TableListColumn<T>>;
  rows: T[];
  isLoading?: boolean;
  skeletonRowCount?: number;
  emptyMessage?: string;
  getRowKey?: (row: T, index: number) => React.Key;
  onRowClick?: (row: T) => void;
  className?: string;
}

const alignClass: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

const TableList = <T,>({
  columns,
  rows,
  isLoading = false,
  skeletonRowCount = 5,
  emptyMessage = '표시할 데이터가 없습니다.',
  getRowKey,
  onRowClick,
  className = '',
}: TableListProps<T>) => {
  const content = React.useMemo(() => {
    if (isLoading) {
      return Array.from({ length: skeletonRowCount }).map((_, skeletonIndex) => (
        <tr key={`skeleton-${skeletonIndex}`} className="border-t border-slate-100">
          {columns.map((column) => (
            <td key={column.key} className={`px-4 py-3 ${alignClass[column.align ?? 'left']}`}>
              <div className="h-3 w-full animate-pulse rounded bg-slate-200/70" />
            </td>
          ))}
        </tr>
      ));
    }

    if (!rows.length) {
      return (
        <tr>
          <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-slate-500">
            {emptyMessage}
          </td>
        </tr>
      );
    }

    return rows.map((row, rowIndex) => {
      const key = getRowKey ? getRowKey(row, rowIndex) : rowIndex;
      const clickable = typeof onRowClick === 'function';
      const handleClick = clickable ? () => onRowClick(row) : undefined;

      return (
        <tr
          key={key}
          className={`border-t border-slate-100 transition-colors ${
            clickable ? 'cursor-pointer hover:bg-slate-50' : ''
          }`}
          onClick={handleClick}
        >
          {columns.map((column) => (
            <td key={column.key} className={`px-4 py-3 text-sm text-slate-700 ${alignClass[column.align ?? 'left']} ${column.className ?? ''}`}>
              {column.render ? column.render(row, rowIndex) : (row as Record<string, unknown>)[column.key as string]}
            </td>
          ))}
        </tr>
      );
    });
  }, [columns, rows, isLoading, skeletonRowCount, emptyMessage, getRowKey, onRowClick]);

  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm ${className}`}>
      <table className="min-w-full divide-y divide-slate-100">
        <thead>
          <tr className="bg-slate-50/70">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${alignClass[column.align ?? 'left']} ${column.className ?? ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">{content}</tbody>
      </table>
    </div>
  );
};

export default TableList;
