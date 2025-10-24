import * as React from 'react';
import { http } from '@/src/services/http';
import { ko } from '@/src/i18n/ko';
import { normalizeHttpError, type NormalizedHttpError } from '@/src/utils/httpErrors';

export type SalesOrderStatus = 'draft' | 'picking' | 'packed' | 'shipped';

export type SalesOrderListItem = {
  id: number;
  orderNumber: string;
  status: SalesOrderStatus;
  orderDate?: string;
  shipmentDate?: string | null;
  totalAmount: string;
  currency?: string;
  customer?: {
    id: number;
    name: string;
  };
};

export interface SalesOrderDateRange {
  from?: string;
  to?: string;
}

export interface UseSalesOrdersOptions {
  search?: string;
  status?: 'all' | SalesOrderStatus;
  dateRange?: SalesOrderDateRange;
  debounceMs?: number;
}

export interface UseSalesOrdersResult {
  orders: SalesOrderListItem[];
  isLoading: boolean;
  isSkeletonVisible: boolean;
  error: NormalizedHttpError | null;
  refresh: () => void;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    if (debounced === value) {
      return;
    }

    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delay, debounced]);

  return debounced;
}

function toISOString(value?: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

const DEFAULT_DEBOUNCE_MS = 300;
const SKELETON_DELAY_MS = 600;

export function useSalesOrders({
  search = '',
  status = 'all',
  dateRange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseSalesOrdersOptions = {}): UseSalesOrdersResult {
  const [orders, setOrders] = React.useState<SalesOrderListItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSkeletonVisible, setIsSkeletonVisible] = React.useState(false);
  const [error, setError] = React.useState<NormalizedHttpError | null>(null);
  const [refreshIndex, setRefreshIndex] = React.useState(0);
  const skeletonTimerRef = React.useRef<number | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);

  const debouncedSearch = useDebouncedValue(search.trim(), debounceMs);
  const debouncedFrom = useDebouncedValue(dateRange?.from, debounceMs);
  const debouncedTo = useDebouncedValue(dateRange?.to, debounceMs);

  const refresh = React.useCallback(() => {
    setRefreshIndex((prev) => prev + 1);
  }, []);

  React.useEffect(() => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    let isActive = true;

    setIsLoading(true);
    setError(null);
    setIsSkeletonVisible(false);

    if (skeletonTimerRef.current) {
      window.clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = null;
    }

    skeletonTimerRef.current = window.setTimeout(() => {
      if (!controller.signal.aborted && isActive) {
        setIsSkeletonVisible(true);
      }
    }, SKELETON_DELAY_MS);

    const params = new URLSearchParams();

    if (debouncedSearch) {
      params.set('q', debouncedSearch);
    }

    if (status !== 'all') {
      params.set('status', status);
    }

    const fromIso = toISOString(debouncedFrom);
    const toIso = toISOString(debouncedTo);

    if (fromIso) {
      params.set('from', fromIso);
    }

    if (toIso) {
      params.set('to', toIso);
    }

    const query = params.toString();
    const url = query ? `/api/sales-orders?${query}` : '/api/sales-orders';

    void (async () => {
      try {
        const payload = await http.request<
          { data?: SalesOrderListItem[] } | SalesOrderListItem[] | null
        >(url, { method: 'GET', signal: controller.signal });

        if (!isActive || controller.signal.aborted) {
          return;
        }

        const data = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : null;

        if (!data) {
          throw new Error(ko.sales.errors.fetchFailed);
        }

        setOrders(data);
        setError(null);
      } catch (error) {
        if (!isActive || (error as Error).name === 'AbortError' || controller.signal.aborted) {
          return;
        }

        setError(normalizeHttpError(error, ko.sales.errors.fetchFailed));
      } finally {
        if (!isActive) {
          return;
        }

        if (skeletonTimerRef.current) {
          window.clearTimeout(skeletonTimerRef.current);
          skeletonTimerRef.current = null;
        }

        setIsSkeletonVisible(false);
        setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;

      if (skeletonTimerRef.current) {
        window.clearTimeout(skeletonTimerRef.current);
        skeletonTimerRef.current = null;
      }

      controller.abort();
    };
  }, [debouncedSearch, status, debouncedFrom, debouncedTo, refreshIndex]);

  return React.useMemo(
    () => ({ orders, isLoading, isSkeletonVisible, error, refresh }),
    [orders, isLoading, isSkeletonVisible, error, refresh],
  );
}

export default useSalesOrders;
