import * as React from 'react';
import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import Modal from '../../../../components/ui/Modal';
import { useToast } from '../../../components/Toaster';
import { emitInventoryRefreshEvent } from '../../../app/utils/inventoryEvents';
import { fetchProducts, type Product } from '../../../services/products';
import { submitMovement } from '../../../services/movements';
import type { OrdersWarehouse } from './types';
import {
  adjustWarehouseInventory,
  buildWarehouseInventoryIndex,
  type WarehouseInventoryIndex,
  type WarehouseInventoryItem,
} from '../utils/warehouseInventory';
interface WarehouseTransferPanelProps {
  warehouses: OrdersWarehouse[];
  defaultFromWarehouse?: string | null;
  defaultToWarehouse?: string | null;
  className?: string;
}
interface TransferHistoryEntry {
  sku: string;
  name: string;
  qty: number;
  fromId: string;
  toId: string;
  ts: number;
}
interface DroppableAreaProps {
  id: string;
  label: string;
  highlight?: boolean;
  children?: React.ReactNode;
}
const USER_ID = 'orders-transfer-ui';

type LocationAllocation = { locationCode?: string; qty: number };

const planLocationAllocations = (item: WarehouseInventoryItem, quantity: number): LocationAllocation[] => {
  if (quantity <= 0) {
    return [];
  }
  const slots =
    item.locations.length > 0
      ? item.locations.map((slot) => ({ ...slot }))
      : [{ code: undefined, onHand: item.onHand }];
  const ordered = slots.sort((a, b) => b.onHand - a.onHand);
  const allocations: LocationAllocation[] = [];
  let remaining = quantity;

  for (const slot of ordered) {
    if (remaining <= 0) {
      break;
    }
    const available = Math.max(0, slot.onHand);
    if (available <= 0) {
      continue;
    }
    const moveQty = Math.min(available, remaining);
    if (moveQty > 0) {
      allocations.push({ locationCode: slot.code, qty: moveQty });
      remaining -= moveQty;
    }
  }

  if (remaining > 0) {
    return [];
  }

  return allocations;
};
const resolveInitialPair = (
  warehouses: OrdersWarehouse[],
  preferredFrom?: string | null,
  preferredTo?: string | null,
): { from?: string; to?: string } => {
  if (warehouses.length === 0) {
    return {};
  }
  const codes = warehouses.map((w) => w.code);
  const fromCandidate = preferredFrom && codes.includes(preferredFrom) ? preferredFrom : codes[0];
  let toCandidate = preferredTo && codes.includes(preferredTo) ? preferredTo : undefined;
  if (!toCandidate) {
    toCandidate = codes.find((code) => code !== fromCandidate) ?? codes[0];
  }
  if (fromCandidate === toCandidate && codes.length > 1) {
    toCandidate = codes.find((code) => code !== fromCandidate) ?? codes[0];
  }
  return { from: fromCandidate, to: toCandidate };
};
const useWarehouseLookup = (warehouses: OrdersWarehouse[]) =>
  React.useMemo(() => {
    const map = new Map<string, OrdersWarehouse>();
    warehouses.forEach((warehouse) => {
      map.set(warehouse.code, warehouse);
    });
    return map;
  }, [warehouses]);
const DroppableArea: React.FC<DroppableAreaProps> = ({ id, label, highlight, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id, data: { target: id } });
  return (
    <div
      ref={setNodeRef}
      className={`h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition ${
        isOver || highlight ? 'ring-2 ring-blue-400' : ''
      }`}
    >
      <div className="mb-2 text-xs font-semibold text-slate-500">{label}</div>
      <div className="flex h-full flex-col gap-2">{children}</div>
    </div>
  );
};
const DraggableProduct: React.FC<{ item: WarehouseInventoryItem; disabled?: boolean }> = ({ item, disabled }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: item.sku,
    data: { origin: 'from', name: item.name },
    disabled,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
    >
      <div>
        <div className="text-sm font-medium text-slate-800">{item.name}</div>
        <div className="text-xs text-slate-500">
          {item.sku} · 재고 {item.onHand.toLocaleString('ko-KR')}
        </div>
      </div>
    </div>
  );
};
const QuickSendButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
  >
    보내기
  </button>
);
const WarehouseTransferPanel: React.FC<WarehouseTransferPanelProps> = ({
  warehouses,
  defaultFromWarehouse,
  defaultToWarehouse,
  className,
}) => {
  const showToast = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const warehouseLookup = useWarehouseLookup(warehouses);
  const [{ from, to }, setPair] = React.useState<{ from?: string; to?: string }>(() =>
    resolveInitialPair(warehouses, defaultFromWarehouse ?? undefined, defaultToWarehouse ?? undefined),
  );
  const [inventoryIndex, setInventoryIndex] = React.useState<WarehouseInventoryIndex>({});
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [recent, setRecent] = React.useState<TransferHistoryEntry[]>([]);
  const [selectedQty, setSelectedQty] = React.useState<Record<string, number>>({});
  const [quantityPrompt, setQuantityPrompt] = React.useState<{
    mode: 'instant' | 'batch';
    sku: string;
    name: string;
    maxQty: number;
    fromWarehouse: string;
    toWarehouse: string;
  } | null>(null);
  const [quantityInput, setQuantityInput] = React.useState<number>(1);
  const isBusy = pendingCount > 0;
  const fromProducts = (from && inventoryIndex[from]) ?? [];
  const toProducts = (to && inventoryIndex[to]) ?? [];
  const resetState = React.useCallback(() => {
    setRecent([]);
    setSelectedQty({});
  }, []);
  React.useEffect(() => {
    setSelectedQty({});
  }, [from, to]);
  React.useEffect(() => {
    const { from: initialFrom, to: initialTo } = resolveInitialPair(
      warehouses,
      defaultFromWarehouse ?? undefined,
      defaultToWarehouse ?? undefined,
    );
    setPair({ from: initialFrom, to: initialTo });
    resetState();
  }, [defaultFromWarehouse, defaultToWarehouse, resetState, warehouses]);
  const loadInventory = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const products: Product[] = await fetchProducts();
      const index = buildWarehouseInventoryIndex(products);
      setInventoryIndex(index);
    } catch (error) {
      console.error('[orders] warehouse transfer: failed to load inventory', error);
      setLoadError('창고 재고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void loadInventory();
  }, [loadInventory]);
  const runTransfer = React.useCallback(
    async (input: { sku: string; qty: number; fromWarehouse: string; toWarehouse: string; productName?: string }) => {
      const { sku, qty, fromWarehouse, toWarehouse, productName } = input;
      if (qty <= 0) {
        return false;
      }

      const sourceItems = inventoryIndex[fromWarehouse] ?? [];
      const sourceItem = sourceItems.find((item) => item.sku === sku);
      if (!sourceItem || sourceItem.onHand <= 0) {
        showToast('선택한 창고에 해당 상품 재고가 없습니다.', { tone: 'info' });
        return false;
      }
      if (qty > sourceItem.onHand) {
        showToast('요청 수량이 현재 재고를 초과합니다.', { tone: 'info' });
        return false;
      }

      const allocations = planLocationAllocations(sourceItem, qty);
      if (allocations.length === 0) {
        showToast('이동 가능한 재고가 없습니다.', { tone: 'info' });
        return false;
      }

      setPendingCount((count) => count + 1);
      try {
        const completed: LocationAllocation[] = [];
        for (const allocation of allocations) {
          await submitMovement({
            type: 'TRANSFER',
            sku,
            qty: allocation.qty,
            fromWarehouse,
            fromLocation: allocation.locationCode,
            toWarehouse,
            userId: USER_ID,
          });
          completed.push(allocation);
        }

        const totalMoved = completed.reduce((sum, allocation) => sum + allocation.qty, 0);
        setInventoryIndex((previous) => {
          let next = previous;
          for (const allocation of completed) {
            next = adjustWarehouseInventory(next, fromWarehouse, sku, -allocation.qty, {
              fallbackName: productName,
              locationCode: allocation.locationCode,
            });
          }
          for (const allocation of completed) {
            next = adjustWarehouseInventory(next, toWarehouse, sku, allocation.qty, {
              fallbackName: productName,
            });
          }
          return next;
        });
        emitInventoryRefreshEvent({
          source: 'transfers',
          movements: [
            {
              product: { sku },
              change: totalMoved,
              occurredAt: new Date().toISOString(),
            },
          ],
        });
        return true;
      } catch (error) {
        console.error('[orders] warehouse transfer: submitMovement failed', error);
        const message =
          error instanceof Error && error.message
            ? error.message
            : '이동 요청이 실패했어요. 창고와 재고를 확인해 주세요.';
        showToast(message, { tone: 'error' });
        return false;
      } finally {
        setPendingCount((count) => Math.max(0, count - 1));
      }
    },
    [inventoryIndex, showToast],
  );
  const ensureTransferReady = React.useCallback(
    (
      sku: string,
      overrides?: { fromWarehouse?: string; toWarehouse?: string },
    ):
      | { sourceWarehouse: string; targetWarehouse: string; sourceItem: WarehouseInventoryItem }
      | null => {
      const sourceWarehouse = overrides?.fromWarehouse ?? from;
      const targetWarehouse = overrides?.toWarehouse ?? to;
      if (!sourceWarehouse || !targetWarehouse) {
        showToast('Please choose both warehouses first.', { tone: 'info' });
        return null;
      }
      if (sourceWarehouse === targetWarehouse) {
        showToast('You cannot move stock within the same warehouse.', { tone: 'info' });
        return null;
      }
      const sourceItems = inventoryIndex[sourceWarehouse] ?? [];
      const sourceItem = sourceItems.find((item) => item.sku === sku);
      if (!sourceItem) {
        showToast('No matching stock exists in the selected warehouse.', { tone: 'info' });
        return null;
      }
      if (sourceItem.onHand <= 0) {
        showToast('There is no available stock to move.', { tone: 'info' });
        return null;
      }
      return { sourceWarehouse, targetWarehouse, sourceItem };
    },
    [from, to, inventoryIndex, showToast],
  );
  const openQuantityPrompt = React.useCallback(
    (sku: string, mode: 'instant' | 'batch') => {
      const context = ensureTransferReady(sku);
      if (!context) {
        return;
      }
      const { sourceWarehouse, targetWarehouse, sourceItem } = context;
      const preset =
        mode === 'batch' && selectedQty[sku]
          ? Math.min(sourceItem.onHand, Math.max(1, selectedQty[sku]))
          : 1;
      setQuantityInput(preset);
      setQuantityPrompt({
        mode,
        sku,
        name: sourceItem.name,
        maxQty: sourceItem.onHand,
        fromWarehouse: sourceWarehouse,
        toWarehouse: targetWarehouse,
      });
    },
    [ensureTransferReady, selectedQty],
  );
  const moveNow = React.useCallback(
    async (
      sku: string,
      qty = 1,
      options?: { productName?: string; fromWarehouse?: string; toWarehouse?: string },
    ) => {
      const context = ensureTransferReady(sku, {
        fromWarehouse: options?.fromWarehouse,
        toWarehouse: options?.toWarehouse,
      });
      if (!context) {
        return false;
      }
      const { sourceWarehouse, targetWarehouse, sourceItem } = context;
      const moveQty = Math.min(Math.max(1, qty), sourceItem.onHand);
      const success = await runTransfer({
        sku,
        qty: moveQty,
        fromWarehouse: sourceWarehouse,
        toWarehouse: targetWarehouse,
        productName: options?.productName ?? sourceItem.name,
      });
      if (!success) {
        return false;
      }
      const timestamp = Date.now();
      setRecent((prev) => [
        {
          sku,
          name: options?.productName ?? sourceItem.name,
          qty: moveQty,
          fromId: sourceWarehouse,
          toId: targetWarehouse,
          ts: timestamp,
        },
        ...prev.slice(0, 19),
      ]);
      setSelectedQty((prev) => {
        if (!(sku in prev)) {
          return prev;
        }
        const { [sku]: _removed, ...rest } = prev;
        return rest;
      });
      return true;
    },
    [ensureTransferReady, runTransfer],
  );
  const moveSelected = React.useCallback(async () => {
    const entries = (Object.entries(selectedQty) as Array<[string, number]>).filter(
      ([, qty]) => Number.isFinite(qty) && qty > 0,
    );
    if (entries.length === 0) {
      showToast('Add items to the selection list first.', { tone: 'info' });
      return;
    }
    for (const [sku, qty] of entries) {
      const success = await moveNow(sku, qty);
      if (!success) {
        break;
      }
    }
  }, [moveNow, selectedQty, showToast]);
  const handleQuantitySubmit = React.useCallback(
    async (intent: 'instant' | 'batch') => {
      if (!quantityPrompt) {
        return;
      }
      const normalized = Math.floor(quantityInput);
      if (!Number.isFinite(normalized) || normalized <= 0) {
        showToast('Enter a quantity of at least 1.', { tone: 'info' });
        return;
      }
      if (normalized > quantityPrompt.maxQty) {
        showToast('Requested quantity exceeds available stock.', { tone: 'info' });
        return;
      }
      if (intent === 'batch') {
        setSelectedQty((prev) => ({
          ...prev,
          [quantityPrompt.sku]: normalized,
        }));
        showToast('Added to the selection list.', { tone: 'success' });
        setQuantityPrompt(null);
        setQuantityInput(1);
        return;
      }
      const success = await moveNow(quantityPrompt.sku, normalized, {
        productName: quantityPrompt.name,
        fromWarehouse: quantityPrompt.fromWarehouse,
        toWarehouse: quantityPrompt.toWarehouse,
      });
      if (success) {
        setQuantityPrompt(null);
        setQuantityInput(1);
      }
    },
    [moveNow, quantityInput, quantityPrompt, showToast],
  );
  const handleSelectionClear = React.useCallback(() => {
    if (!quantityPrompt) {
      return;
    }
    setSelectedQty((prev) => {
      const { [quantityPrompt.sku]: _removed, ...rest } = prev;
      return rest;
    });
    setQuantityPrompt(null);
    setQuantityInput(1);
  }, [quantityPrompt]);
  const handleQuantityClose = React.useCallback(() => {
    if (isBusy) {
      return;
    }
    setQuantityPrompt(null);
    setQuantityInput(1);
  }, [isBusy]);
  const existingSelection = quantityPrompt ? selectedQty[quantityPrompt.sku] : undefined;
  const undoMove = React.useCallback(
    async (entry: TransferHistoryEntry) => {
      const success = await runTransfer({
        sku: entry.sku,
        qty: entry.qty,
        fromWarehouse: entry.toId,
        toWarehouse: entry.fromId,
        productName: entry.name,
      });
      if (!success) {
        return;
      }
      setRecent((prev) => prev.filter((candidate) => candidate.ts !== entry.ts));
      showToast('Transfer has been reverted.', { tone: 'success' });
    },
    [runTransfer, showToast],
  );
  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!active || !over) {
        return;
      }
      if (active.data?.current?.origin === 'from' && over.data?.current?.target === 'to') {
        openQuantityPrompt(String(active.id), 'instant');
      }
    },
    [openQuantityPrompt],
  );
const getWarehouseLabel = React.useCallback(
    (code?: string) => {
      if (!code) {
        return '미선택';
      }
      const record = warehouseLookup.get(code);
      const name = record?.name?.trim();
      return name ? `${code} · ${name}` : code;
    },
    [warehouseLookup],
  );
  const containerClassName = React.useMemo(
    () =>
      [
        'flex h-[640px] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
        className,
      ]
        .filter(Boolean)
        .join(' '),
    [className],
  );
  return (
    <>
      <div className={containerClassName}>
        <div className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500">출발 창고</label>
              <select
                value={from ?? ''}
                onChange={(event) => setPair((prev) => ({ ...prev, from: event.target.value }))}
                className="mt-1 min-w-[200px] rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                disabled={isBusy || loading || warehouses.length === 0}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.code} value={warehouse.code}>
                    {getWarehouseLabel(warehouse.code)}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-xl text-slate-400">→</span>
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500">도착 창고</label>
              <select
                value={to ?? ''}
                onChange={(event) => setPair((prev) => ({ ...prev, to: event.target.value }))}
                className={`mt-1 min-w-[200px] rounded border px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 ${
                  from && to && from === to ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-slate-300'
                }`}
                disabled={isBusy || loading || warehouses.length === 0}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.code} value={warehouse.code}>
                    {getWarehouseLabel(warehouse.code)}
                  </option>
                ))}
              </select>
              {from && to && from === to ? (
                <span className="mt-1 text-[11px] text-rose-500">동일 창고로는 이동할 수 없습니다.</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void moveSelected()}
              disabled={isBusy || loading || Object.keys(selectedQty).length === 0}
              className="ml-auto inline-flex items-center gap-2 rounded border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              선택 이동
            </button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-60 border-r border-slate-200 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-slate-700">최근 이동</div>
            <div className="flex flex-col gap-2 overflow-y-auto">
              {recent.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                  아직 이동 내역이 없어요.
                </p>
              ) : (
                recent.map((entry) => {
                  const fromLabel = getWarehouseLabel(entry.fromId);
                  const toLabel = getWarehouseLabel(entry.toId);
                  return (
                    <div key={entry.ts} className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
                      <div className="font-semibold text-slate-700">{entry.name}</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {entry.sku} · {fromLabel} → {toLabel}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                        <span>{entry.qty.toLocaleString('ko-KR')} EA</span>
                        <button
                          type="button"
                          onClick={() => void undoMove(entry)}
                          disabled={isBusy}
                          className="text-blue-500 transition hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          되돌리기
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
          <section className="flex-1 overflow-hidden bg-slate-50">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">재고를 불러오는 중...</div>
            ) : loadError ? (
              <div className="flex h-full items-center justify-center">
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {loadError}
                </div>
              </div>
            ) : (
              <div className="h-full overflow-y-auto px-6 py-6">
                <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-800">선택 이동</h3>
                      <p className="text-xs text-slate-500">수량을 입력하고 여러 상품을 한 번에 이동할 수 있어요.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void moveSelected()}
                      disabled={isBusy || loading || Object.keys(selectedQty).length === 0}
                      className="rounded border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      선택 이동
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-slate-700">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2">제품</th>
                          <th className="w-24 py-2 text-right">현재고</th>
                          <th className="w-32 py-2 text-right">선택 이동</th>
                          <th className="w-24 py-2 text-right">바로 이동</th>
                        </tr>
                      </thead>
                      <tbody>
                        {from && fromProducts.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                              선택한 창고에 표시할 재고가 없어요.
                            </td>
                          </tr>
                        ) : (
                          fromProducts.map((item) => (
                            <tr key={item.sku} className="border-b border-slate-100">
                              <td className="py-3">
                                <div className="font-medium text-slate-800">{item.name}</div>
                                <div className="text-xs text-slate-500">{item.sku}</div>
                              </td>
                              <td className="py-3 text-right font-semibold text-slate-700">
                                {item.onHand.toLocaleString('ko-KR')}
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => openQuantityPrompt(item.sku, 'batch')}
                                  disabled={isBusy || item.onHand <= 0}
                                  className={`rounded border px-2 py-1 text-xs font-semibold transition ${
                                    selectedQty[item.sku]
                                      ? 'border-blue-300 text-blue-600'
                                      : 'border-slate-200 text-slate-600'
                                  } hover:border-blue-300 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                  {selectedQty[item.sku] ? '선택 수정' : '선택'}
                                </button>
                                {selectedQty[item.sku] ? (
                                  <div className="mt-1 text-[11px] text-blue-500">선택 완료</div>
                                ) : null}
                              </td>
                              <td className="py-3 text-right">
                                <QuickSendButton
                                  onClick={() => openQuantityPrompt(item.sku, 'instant')}
                                  disabled={isBusy || item.onHand <= 0}
                                />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <div className="grid grid-cols-2 gap-4">
                    <DroppableArea id="from" label={`드래그 목록 – ${getWarehouseLabel(from)}`}>
                      {fromProducts.map((item) => (
                        <div
                          key={item.sku}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                          <div className="flex-1">
                            <DraggableProduct item={item} disabled={isBusy || item.onHand <= 0} />
                          </div>
                          <QuickSendButton
                            onClick={() => openQuantityPrompt(item.sku, 'instant')}
                            disabled={isBusy || item.onHand <= 0}
                          />
                        </div>
                      ))}
                    </DroppableArea>
                    <DroppableArea id="to" highlight label={`새 위치 재고 – ${getWarehouseLabel(to)}`}>
                      {toProducts.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                          아직 표시할 재고가 없어요. 오른쪽으로 드롭하면 즉시 이동합니다.
                        </p>
                      ) : (
                        toProducts.map((item) => (
                          <div key={item.sku} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="text-sm font-medium text-slate-800">{item.name}</div>
                            <div className="text-xs text-slate-500">
                              {item.sku} · 재고 {item.onHand.toLocaleString('ko-KR')}
                            </div>
                          </div>
                        ))
                      )}
                      <div className="mt-3 text-[11px] text-slate-400">오른쪽으로 드롭하면 즉시 이동합니다.</div>
                    </DroppableArea>
                  </div>
                </DndContext>
              </div>
            )}
          </section>
        </div>
      </div>
      {quantityPrompt ? (
        <Modal
          isOpen
          onClose={handleQuantityClose}
          title="이동 수량 입력"
        >
          <div className="space-y-5 text-sm text-slate-700">
            <div>
              <div className="text-base font-semibold text-slate-800">{quantityPrompt.name}</div>
              <div className="text-xs text-slate-500 mt-1">{quantityPrompt.sku}</div>
              <div className="mt-2 text-xs text-slate-500">
                이동 가능 수량: {quantityPrompt.maxQty.toLocaleString('ko-KR')}
              </div>
            </div>
            <label className="flex flex-col gap-2 text-xs font-semibold text-slate-600">
              이동 수량
              <input
                type="number"
                min={1}
                max={quantityPrompt.maxQty}
                value={quantityInput}
                onChange={(event) => setQuantityInput(Number(event.target.value) || 0)}
                disabled={isBusy}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
            </label>
            {existingSelection && quantityPrompt.mode === 'batch' ? (
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600">
                선택 목록에 {existingSelection.toLocaleString('ko-KR')} EA가 저장되어 있습니다.
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleQuantityClose}
                disabled={isBusy}
                className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                취소
              </button>
              {quantityPrompt.mode === 'batch' ? (
                <>
                  {existingSelection ? (
                    <button
                      type="button"
                      onClick={handleSelectionClear}
                      disabled={isBusy}
                      className="rounded border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      선택 해제
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleQuantitySubmit('batch')}
                    disabled={isBusy}
                    className="rounded border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-600 transition hover:border-blue-300 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    선택 이동에 추가
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleQuantitySubmit('instant')}
                    disabled={isBusy}
                    className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    바로 이동
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleQuantitySubmit('instant')}
                  disabled={isBusy}
                  className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  이동
                </button>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
};
export default WarehouseTransferPanel;
