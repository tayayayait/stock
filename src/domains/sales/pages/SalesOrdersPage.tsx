import * as React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import InfiniteTable, { type InfiniteTableColumn } from '../../../components/common/InfiniteTable';
import {
  fetchSalesOrderList,
  type SalesOrderListPage,
  type SalesOrderListRecord,
  type SalesOrderStatus,
} from '../../../services/sales';

const PAGE_SIZE = 30;

const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  draft: '작성 중',
  confirmed: '확정',
  shipped: '출고 완료',
};

const STATUS_CLASS: Record<SalesOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  confirmed: 'bg-amber-100 text-amber-600',
  shipped: 'bg-emerald-100 text-emerald-600',
};

function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

function formatCurrency(amount: string, currency = 'KRW') {
  try {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency }).format(Number(amount));
  } catch (error) {
    const numeric = Number(amount);
    if (Number.isFinite(numeric)) {
      return `${numeric.toLocaleString('ko-KR')} ${currency}`;
    }
    return amount;
  }
}

const SalesOrdersPage: React.FC = () => {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<'all' | SalesOrderStatus>('all');
  const [sort, setSort] = React.useState<'orderDate' | 'createdAt'>('orderDate');
  const [direction, setDirection] = React.useState<'asc' | 'desc'>('desc');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');

  const filters = React.useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status === 'all' ? undefined : status,
      from: fromDate || undefined,
      to: toDate || undefined,
      sort: `${sort}:${direction}`,
    }),
    [direction, fromDate, search, sort, status, toDate],
  );

  const salesOrdersQuery = useInfiniteQuery({
    queryKey: ['sales-orders', filters],
    initialPageParam: 1,
    queryFn: ({ pageParam = 1 }) =>
      fetchSalesOrderList({
        page: typeof pageParam === 'number' ? pageParam : Number(pageParam) || 1,
        pageSize: PAGE_SIZE,
        search: filters.search,
        status: filters.status as SalesOrderStatus | undefined,
        from: filters.from,
        to: filters.to,
        sort: filters.sort,
      }),
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
  });

  const rows = React.useMemo<SalesOrderListRecord[]>(() => {
    const pages = salesOrdersQuery.data?.pages as SalesOrderListPage[] | undefined;
    if (!pages) {
      return [];
    }

    return pages.flatMap((page) => page.items);
  }, [salesOrdersQuery.data]);

  const handleRefresh = React.useCallback(() => {
    void salesOrdersQuery
      .refetch()
      .catch((error) => {
        console.error('[sales-orders] refetch failed', error);
      });
  }, [salesOrdersQuery]);

  const handleLoadMore = React.useCallback(() => {
    if (salesOrdersQuery.isFetchingNextPage) {
      return;
    }

    salesOrdersQuery
      .fetchNextPage()
      .catch((error) => {
        console.error('[sales-orders] fetchNextPage failed', error);
      });
  }, [salesOrdersQuery]);

  const handleRetry = React.useCallback(() => {
    void salesOrdersQuery
      .refetch()
      .catch((error) => {
        console.error('[sales-orders] retry refetch failed', error);
      });
  }, [salesOrdersQuery]);

  const tableColumns = React.useMemo<InfiniteTableColumn<SalesOrderListRecord>[]>(
    () => [
      {
        id: 'orderNumber',
        header: '주문번호',
        render: (order) => (
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800">{order.orderNumber}</span>
            <span className="text-xs text-slate-400">{order.warehouseName ?? '창고 미지정'}</span>
          </div>
        ),
      },
      {
        id: 'customer',
        header: '고객',
        minWidth: 180,
        render: (order) => <span className="text-slate-600">{order.customerName ?? '미지정'}</span>,
      },
      {
        id: 'status',
        header: '상태',
        render: (order) => (
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
        ),
      },
      {
        id: 'orderDate',
        header: '주문일',
        render: (order) => <span>{formatDate(order.orderDate)}</span>,
      },
      {
        id: 'shipmentDate',
        header: '출고일',
        render: (order) => <span>{formatDate(order.shipmentDate)}</span>,
      },
      {
        id: 'total',
        header: '주문금액',
        align: 'right',
        render: (order) => <span>{formatCurrency(order.totalAmount, order.currency)}</span>,
      },
    ],
    [],
  );

  const errorMessage = salesOrdersQuery.error instanceof Error ? salesOrdersQuery.error.message : null;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">판매 주문</h1>
        <p className="text-sm text-slate-500">상태 및 기간 조건을 서버에서 필터링하여 무한 스크롤 형태로 확인할 수 있습니다.</p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-sm text-slate-600">
            검색어
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="주문번호, 고객명 검색"
              className="mt-1 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="flex flex-col text-sm text-slate-600">
            상태
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'all' | SalesOrderStatus)}
              className="mt-1 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">전체</option>
              <option value="draft">작성 중</option>
              <option value="confirmed">확정</option>
              <option value="shipped">출고 완료</option>
            </select>
          </label>

          <label className="flex flex-col text-sm text-slate-600">
            시작일
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="flex flex-col text-sm text-slate-600">
            종료일
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="flex flex-col text-sm text-slate-600">
            정렬
            <select
              value={`${sort}:${direction}`}
              onChange={(event) => {
                const [nextSort, nextDirection] = event.target.value.split(':') as [
                  'orderDate' | 'createdAt',
                  'asc' | 'desc',
                ];
                setSort(nextSort);
                setDirection(nextDirection);
              }}
              className="mt-1 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="orderDate:desc">최근 주문 순</option>
              <option value="orderDate:asc">주문일 빠른 순</option>
              <option value="createdAt:desc">생성일 최신 순</option>
              <option value="createdAt:asc">생성일 오래된 순</option>
            </select>
          </label>

          <button
            type="button"
            onClick={handleRefresh}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            새로 고침
          </button>
        </div>

        <InfiniteTable<SalesOrderListRecord>
          data={rows}
          columns={tableColumns}
          getRowId={(order) => order.id}
          isLoading={salesOrdersQuery.isLoading}
          isFetchingNextPage={salesOrdersQuery.isFetchingNextPage}
          hasNextPage={Boolean(salesOrdersQuery.hasNextPage)}
          onLoadMore={handleLoadMore}
          error={errorMessage}
          onRetry={handleRetry}
          emptyState={<p className="p-6 text-sm text-slate-500">조건에 맞는 판매 주문이 없습니다.</p>}
        />
      </section>
    </div>
  );
};

export default SalesOrdersPage;
