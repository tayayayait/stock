import React, { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface InfiniteTableColumn<T> {
  id: string;
  header: React.ReactNode;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  render: (item: T) => React.ReactNode;
}

export interface InfiniteTableProps<T> {
  data: T[];
  columns: Array<InfiniteTableColumn<T>>;
  getRowId: (item: T, index: number) => string | number;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  error?: string | null;
  onRetry?: () => void;
  emptyState?: React.ReactNode;
  rowHeight?: number;
}

const DEFAULT_ROW_HEIGHT = 64;

export function InfiniteTable<T>({
  data,
  columns,
  getRowId,
  isLoading = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  onLoadMore,
  error,
  onRetry,
  emptyState,
  rowHeight = DEFAULT_ROW_HEIGHT,
}: InfiniteTableProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const loaderTriggeredRef = useRef(false);

  const itemsCount = useMemo(() => data.length + (hasNextPage ? 1 : 0), [data.length, hasNextPage]);

  const rowVirtualizer = useVirtualizer({
    count: itemsCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (!hasNextPage || !onLoadMore) {
      return;
    }

    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) {
      return;
    }

    const isLoaderRow = lastItem.index >= data.length;
    const nearEnd = lastItem.index >= data.length - 1;

    if ((isLoaderRow || nearEnd) && !loaderTriggeredRef.current && !isLoading && !isFetchingNextPage) {
      loaderTriggeredRef.current = true;
      onLoadMore();
    }
  }, [
    virtualItems,
    data.length,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    onLoadMore,
  ]);

  useEffect(() => {
    if (!isFetchingNextPage) {
      loaderTriggeredRef.current = false;
    }
  }, [isFetchingNextPage]);

  const renderEmptyState = () => {
    if (isLoading) {
      return null;
    }

    if (error) {
      return (
        <div className="flex h-full flex-1 items-center justify-center p-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold text-rose-600">데이터를 불러오지 못했어요.</p>
            <p className="max-w-xs text-xs text-slate-500">일시적인 오류일 수 있으니 잠시 후 다시 시도해주세요.</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-400"
              >
                다시 시도
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    if (emptyState) {
      return <>{emptyState}</>;
    }

    return (
      <div className="flex h-full flex-1 items-center justify-center p-12">
        <p className="text-sm text-slate-500">표시할 데이터가 없습니다.</p>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {columns.map((column) => (
          <div
            key={column.id}
            style={{ minWidth: column.minWidth ? `${column.minWidth}px` : undefined }}
            className={column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}
          >
            {column.header}
          </div>
        ))}
      </div>
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const isLoaderRow = virtualRow.index >= data.length;
            const item = data[virtualRow.index];

            return (
              <div
                key={isLoaderRow ? `loader-${virtualRow.index}` : getRowId(item, virtualRow.index)}
                className="absolute left-0 right-0 border-b border-slate-100 px-4"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  height: `${virtualRow.size}px`,
                  display: 'flex',
                  alignItems: 'stretch',
                }}
              >
                {isLoaderRow ? (
                  <div className="flex w-full items-center justify-center text-xs text-slate-500">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-transparent" />
                      데이터를 불러오는 중입니다…
                    </span>
                  </div>
                ) : (
                  <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(120px,1fr))] items-center gap-4 py-3 text-sm text-slate-700">
                    {columns.map((column) => (
                      <div
                        key={column.id}
                        style={{ minWidth: column.minWidth ? `${column.minWidth}px` : undefined }}
                        className={
                          column.align === 'right'
                            ? 'text-right'
                            : column.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                        }
                      >
                        {column.render(item)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {data.length === 0 && !isLoading ? renderEmptyState() : null}
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center border-t border-slate-200 bg-white py-6 text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border border-slate-300 border-t-transparent" />
            데이터를 불러오는 중입니다…
          </span>
        </div>
      ) : null}
      {error && data.length > 0 ? (
        <div className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-600">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full bg-rose-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-rose-400"
              >
                다시 시도
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default InfiniteTable;
