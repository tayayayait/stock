import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type Product } from '../../../../domains/products';
import { listMovements, type MovementSummary, type MovementType } from '../../../../services/movements';

interface ProductDetailPanelProps {
  product: Product | null;
}

type MovementStatus = 'idle' | 'loading' | 'success' | 'error';

interface MovementState {
  status: MovementStatus;
  items: MovementSummary[];
  error?: string;
}

const formatCurrency = (value: number | null | undefined, currency?: string | null): string => {
  if (!Number.isFinite(value ?? NaN)) {
    return '데이터 없음';
  }

  const normalized = Number(value);
  const formatter = new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: currency?.trim() || 'KRW',
    currencyDisplay: 'symbol',
    maximumFractionDigits: 0,
  });

  return formatter.format(normalized);
};

const ProductDetailPanel: React.FC<ProductDetailPanelProps> = ({ product }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions'>('overview');
  const [movementState, setMovementState] = useState<MovementState>({ status: 'idle', items: [] });
  const [movementRequestId, setMovementRequestId] = useState(0);
  const lastSkuRef = useRef<string>();

  useEffect(() => {
    const sku = product?.sku?.trim();
    if (!sku) {
      lastSkuRef.current = undefined;
      setMovementState({ status: 'idle', items: [] });
      return;
    }

    const controller = new AbortController();
    const isSameSku = lastSkuRef.current === sku;
    let isCancelled = false;

    setMovementState((prev) => ({
      status: 'loading',
      items: isSameSku ? prev.items : [],
      error: undefined,
    }));

    listMovements({ sku, limit: 50, signal: controller.signal })
      .then((response) => {
        if (isCancelled) {
          return;
        }
        lastSkuRef.current = sku;
        setMovementState({ status: 'success', items: response.items });
      })
      .catch((error) => {
        if (isCancelled || controller.signal.aborted) {
          return;
        }

        lastSkuRef.current = sku;
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : '입출고 내역을 불러오지 못했습니다.';

        setMovementState((prev) => ({
          status: 'error',
          items: isSameSku ? prev.items : [],
          error: message,
        }));
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [product?.sku, movementRequestId]);

  const inventoryEntries = useMemo(() => {
    if (!product?.inventory || product.inventory.length === 0) {
      return [];
    }

    return product.inventory.map((entry) => ({
      key: `${entry.warehouseCode}-${entry.locationCode}`,
      warehouseCode: entry.warehouseCode || '미지정 창고',
      locationCode: entry.locationCode || '미지정 위치',
      onHand: entry.onHand,
      reserved: entry.reserved,
    }));
  }, [product]);

  const totalInventory = useMemo(() => {
    const onHand = Number.isFinite(product?.onHand ?? NaN) ? Number(product?.onHand) : 0;
    const reserved = Number.isFinite(product?.reserved ?? NaN) ? Number(product?.reserved) : 0;
    const available = Math.max(0, onHand - reserved);

    return {
      onHand,
      reserved,
      available,
    };
  }, [product?.onHand, product?.reserved]);

  const movementRows = useMemo(() => {
    if (movementState.items.length === 0) {
      return [];
    }

    return [...movementState.items].sort((a, b) => {
      const aTime = Date.parse(a.occurredAt);
      const bTime = Date.parse(b.occurredAt);
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return bTime - aTime;
      }
      return 0;
    });
  }, [movementState.items]);

  const latestReceipt = useMemo(
    () => movementRows.find((movement) => movement.type === 'RECEIPT'),
    [movementRows],
  );

  const latestIssue = useMemo(
    () => movementRows.find((movement) => movement.type === 'ISSUE'),
    [movementRows],
  );

  const movementDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  );

  const movementTypeLabel: Record<MovementType, string> = useMemo(
    () => ({
      RECEIPT: '입고',
      ISSUE: '출고',
      ADJUST: '조정',
      TRANSFER: '이동',
    }),
    [],
  );

  const movementQuantityClass: Record<MovementType, string> = useMemo(
    () => ({
      RECEIPT: 'text-emerald-600',
      ISSUE: 'text-rose-600',
      ADJUST: 'text-slate-600',
      TRANSFER: 'text-indigo-600',
    }),
    [],
  );

  const formatLocationSegment = (location?: { warehouseCode?: string; locationCode?: string } | null) => {
    if (!location) {
      return undefined;
    }

    const parts = [location.warehouseCode, location.locationCode].filter((part): part is string => Boolean(part && part.trim()));
    if (parts.length === 0) {
      return undefined;
    }
    return parts.join(' · ');
  };

  const describeMovementLocation = (movement: MovementSummary) => {
    const partnerLabel = movement.partnerId ? `거래처 ${movement.partnerId}` : '거래처 미지정';

    if (movement.type === 'TRANSFER') {
      const fromLabel = formatLocationSegment(movement.from);
      const toLabel = formatLocationSegment(movement.to);
      const locationLabel = fromLabel || toLabel ? `${fromLabel ?? '미지정'} → ${toLabel ?? '미지정'}` : '창고 정보 없음';
      return { partnerLabel, locationLabel };
    }

    if (movement.type === 'ISSUE') {
      const fromLabel = formatLocationSegment(movement.from);
      return {
        partnerLabel,
        locationLabel: fromLabel ?? '출고 창고 미지정',
      };
    }

    const toLabel = formatLocationSegment(movement.to);
    return {
      partnerLabel,
      locationLabel: toLabel ?? '입고 창고 미지정',
    };
  };

  const handleRetryMovements = () => {
    if (!product?.sku) {
      return;
    }
    setMovementRequestId((id) => id + 1);
  };

  const movementStatus = movementState.status;
  const isLoadingMovements = movementStatus === 'loading';
  const hasMovementData = movementRows.length > 0;
  const hasRecentSummary = Boolean(latestReceipt || latestIssue);

  if (!product) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        품목을 선택하면 상세가 표시됩니다.
      </div>
    );
  }

  const currency = product.currency ?? undefined;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200">
      <div className="border-b border-slate-200 p-4">
        <div className="text-xs font-semibold text-indigo-600">SKU {product.sku}</div>
        <h4 className="mt-1 text-lg font-semibold text-slate-900">{product.name}</h4>
        {product.brand && <p className="mt-1 text-xs text-slate-500">{product.brand}</p>}
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 px-4 pt-3">
        <button
          type="button"
          className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
            activeTab === 'overview' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-slate-500'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
            activeTab === 'transactions' ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-slate-500'
          }`}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' ? (
          <div className="space-y-4 text-sm text-slate-600">
            <section>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">재고 요약</h5>
              <div className="mt-1 grid gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">가용 재고</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {totalInventory.available.toLocaleString()} EA
                  </div>
                  <div className="text-[11px] text-slate-400">총 재고에서 예약 수량을 제외한 값</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">총 재고</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {totalInventory.onHand.toLocaleString()} EA
                  </div>
                  <div className="text-[11px] text-slate-400">시스템 상 재고 수량</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">예약 수량</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {totalInventory.reserved.toLocaleString()} EA
                  </div>
                  <div className="text-[11px] text-slate-400">출고 예약 또는 홀딩 수량</div>
                </div>
              </div>
            </section>

            <section>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">카테고리</h5>
              <div className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="font-medium text-slate-900">{product.category || '미분류'}</div>
                <div className="text-xs text-slate-500">{product.subCategory || '세부 카테고리 없음'}</div>
              </div>
            </section>

            <section>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">최근 입출고 요약</h5>
              <div className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-3">
                {hasRecentSummary ? (
                  <div className="grid gap-3">
                    {latestReceipt && (
                      <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">최근 입고</div>
                          <div className="mt-1 text-sm font-medium text-slate-900">
                            {movementDateFormatter.format(new Date(latestReceipt.occurredAt))}
                          </div>
                          <div className="text-xs text-slate-500">
                            {latestReceipt.partnerId ? `거래처 ${latestReceipt.partnerId}` : '거래처 정보 없음'}
                          </div>
                        </div>
                        <div className="text-right text-sm font-semibold text-emerald-600">
                          +{latestReceipt.qty.toLocaleString()} EA
                        </div>
                      </div>
                    )}
                    {latestIssue && (
                      <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">최근 출고</div>
                          <div className="mt-1 text-sm font-medium text-slate-900">
                            {movementDateFormatter.format(new Date(latestIssue.occurredAt))}
                          </div>
                          <div className="text-xs text-slate-500">
                            {latestIssue.partnerId ? `거래처 ${latestIssue.partnerId}` : '거래처 정보 없음'}
                          </div>
                        </div>
                        <div className="text-right text-sm font-semibold text-rose-600">
                          -{latestIssue.qty.toLocaleString()} EA
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400">최근 입출고 데이터가 없습니다.</div>
                )}
              </div>
            </section>

            <section>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">구매가 / 판매가</h5>
              <div className="mt-1 grid gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">구매가</span>
                  <span className="font-medium text-slate-900">{formatCurrency(product.supplyPrice, currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">판매가</span>
                  <span className="font-medium text-slate-900">{formatCurrency(product.salePrice, currency)}</span>
                </div>
              </div>
            </section>

            <section>
              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">위치별 재고</h5>
              <div className="mt-1 space-y-2">
                {inventoryEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">
                    등록된 창고 재고 정보가 없습니다.
                  </div>
                ) : (
                  inventoryEntries.map((entry) => (
                    <div key={entry.key} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-xs font-semibold text-slate-500">
                        {entry.warehouseCode} · {entry.locationCode}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-slate-600">가용 재고</span>
                        <span className="font-semibold text-slate-900">{(entry.onHand - entry.reserved).toLocaleString()}</span>
                      </div>
                      <div className="mt-0.5 grid grid-cols-2 gap-1 text-[11px] text-slate-500">
                        <span>재고 {entry.onHand.toLocaleString()}</span>
                        <span className="text-right">예약 {entry.reserved.toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">최근 입출고 내역</h5>
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-xs text-slate-500">
                <span>
                  {isLoadingMovements
                    ? '입출고 내역을 불러오는 중...'
                    : hasMovementData
                      ? `총 ${movementRows.length.toLocaleString()}건`
                      : '데이터가 없습니다.'}
                </span>
                {movementStatus === 'error' && (
                  <button
                    type="button"
                    onClick={handleRetryMovements}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
                  >
                    다시 시도
                  </button>
                )}
              </div>

              {movementStatus === 'error' && !hasMovementData ? (
                <div className="px-4 py-10 text-center text-sm text-rose-600">
                  {movementState.error ?? '입출고 내역을 불러오는 중 오류가 발생했습니다.'}
                </div>
              ) : hasMovementData ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">날짜</th>
                        <th className="px-4 py-3 text-left font-medium">구분</th>
                        <th className="px-4 py-3 text-right font-medium">수량</th>
                        <th className="px-4 py-3 text-left font-medium">거래처 · 창고</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-600">
                      {movementRows.map((movement) => {
                        const { partnerLabel, locationLabel } = describeMovementLocation(movement);
                        return (
                          <tr key={movement.id} className="align-top">
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                              {movementDateFormatter.format(new Date(movement.occurredAt))}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-700">
                              {movementTypeLabel[movement.type]}
                            </td>
                            <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold ${movementQuantityClass[movement.type]}`}>
                              {movement.type === 'ISSUE' ? '-' : movement.type === 'RECEIPT' ? '+' : ''}
                              {movement.qty.toLocaleString()} EA
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-slate-700">{partnerLabel}</div>
                              <div className="text-xs text-slate-500">{locationLabel}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  입출고 내역 데이터가 없습니다.
                </div>
              )}

              {isLoadingMovements && hasMovementData && (
                <div className="border-t border-slate-200 px-4 py-3 text-center text-xs text-slate-500">
                  최신 데이터를 불러오는 중입니다...
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetailPanel;
