import * as React from 'react';

export type TableColumn<T> = {
  id: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
};

export interface TableProps<T> {
  columns: Array<TableColumn<T>>;
  data: T[];
  rowKey: (row: T) => string | number;
  isLoading?: boolean;
  isSelectable?: boolean;
  selectedRowIds?: Set<string | number>;
  onSelectionChange?: (selected: Set<string | number>) => void;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

const headerCellBaseClasses =
  'px-4 py-3 text-sm font-semibold text-slate-600 uppercase tracking-wide bg-slate-50 border-b border-slate-200';
const bodyRowBaseClasses =
  'group border-b border-slate-100 bg-white/60 transition-colors hover:bg-indigo-50/50 focus-within:bg-indigo-50/70';
const cellBaseClasses = 'px-4 py-3 text-sm text-slate-700';

function resolveAlignmentClass(align: TableColumn<any>['align']) {
  switch (align) {
    case 'center':
      return 'text-center';
    case 'right':
      return 'text-right';
    default:
      return 'text-left';
  }
}

export function Table<T>({
  columns,
  data,
  rowKey,
  isLoading = false,
  isSelectable = false,
  selectedRowIds,
  onSelectionChange,
  onRowClick,
  emptyState,
  className = '',
}: TableProps<T>) {
  const selected = React.useMemo(() => {
    if (!selectedRowIds) {
      return new Set<string | number>();
    }
    return new Set(selectedRowIds);
  }, [selectedRowIds]);

  const headerCheckboxRef = React.useRef<HTMLInputElement | null>(null);

  const handleToggleAll: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    event.stopPropagation();

    if (!onSelectionChange) {
      return;
    }

    const isChecked = event.target.checked;

    if (!isChecked) {
      onSelectionChange(new Set<string | number>());
      return;
    }

    const allIds = data.map((row) => rowKey(row));
    onSelectionChange(new Set<string | number>(allIds));
  };

  const handleToggleRow = (row: T) => (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();

    if (!onSelectionChange) {
      return;
    }

    const rowId = rowKey(row);
    const next = new Set<string | number>(selected);

    if (next.has(rowId)) {
      next.delete(rowId);
    } else {
      next.add(rowId);
    }

    onSelectionChange(next);
  };

  const handleRowClick = (row: T) => () => {
    onRowClick?.(row);
  };

  const isAllSelected = React.useMemo(() => {
    if (!data.length) {
      return false;
    }

    return data.every((row) => selected.has(rowKey(row)));
  }, [data, selected, rowKey]);

  React.useEffect(() => {
    if (!headerCheckboxRef.current) {
      return;
    }

    headerCheckboxRef.current.indeterminate = selected.size > 0 && !isAllSelected;
  }, [selected.size, isAllSelected]);

  const loadingRows = React.useMemo(() => Array.from({ length: 4 }), []);

  return (
    <div
      className={[
        'overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <table className="min-w-full divide-y divide-slate-200">
        <thead>
          <tr>
            {isSelectable ? (
              <th className={`${headerCellBaseClasses} w-12`}>
                <label className="flex items-center justify-center">
                  <span className="sr-only">Select all rows</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    ref={headerCheckboxRef}
                    checked={isAllSelected}
                    aria-checked={
                      isAllSelected ? 'true' : selected.size > 0 ? 'mixed' : 'false'
                    }
                    onChange={handleToggleAll}
                    onClick={(event) => event.stopPropagation()}
                  />
                </label>
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.id}
                className={[
                  headerCellBaseClasses,
                  resolveAlignmentClass(column.align),
                  column.width ? column.width : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading
            ? loadingRows.map((_, index) => (
                <tr key={`loading-${index}`} className={`${bodyRowBaseClasses} animate-pulse`}>
                  {isSelectable ? <td className="px-4 py-3" /> : null}
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={[cellBaseClasses, resolveAlignmentClass(column.align)].join(' ')}
                    >
                      <div className="h-3 rounded-full bg-slate-200/60" />
                    </td>
                  ))}
                </tr>
              ))
            : null}

          {!isLoading && data.length === 0 ? (
            <tr>
              <td
                className={`${cellBaseClasses} text-center text-slate-500`}
                colSpan={columns.length + (isSelectable ? 1 : 0)}
              >
                {emptyState ?? '표시할 데이터가 없습니다.'}
              </td>
            </tr>
          ) : null}

          {!isLoading
            ? data.map((row) => {
                const rowId = rowKey(row);
                const isSelected = selected.has(rowId);

                return (
                  <tr
                    key={rowId}
                    className={`${bodyRowBaseClasses} ${
                      isSelected ? 'bg-indigo-50/80' : ''
                    } cursor-pointer`}
                    onClick={handleRowClick(row)}
                    tabIndex={0}
                  >
                    {isSelectable ? (
                      <td className="px-4 py-3">
                        <label className="flex items-center justify-center">
                          <span className="sr-only">Select row</span>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={isSelected}
                            onChange={handleToggleRow(row)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </label>
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={[cellBaseClasses, resolveAlignmentClass(column.align)].join(' ')}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            : null}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
