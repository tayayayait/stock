import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../../../components/ui/Modal';
import {
  type Partner,
  type PartnerType,
  createPurchaseOrder,
  createSalesOrder,
  listPartners,
  recordSalesShipment,
} from '../../../services/orders';
import { fetchProducts, type Product } from '../../../services/products';
import NewOrderForm, { type NewOrderFormState, type OrderKind } from '../components/NewOrderForm';
import PartnerModal from '../components/PartnerModal';
import QuickWarehouseModal from '../components/QuickWarehouseModal';
import WarehouseTransferPanel from '../components/WarehouseTransferPanel';
import {
  fetchWarehouses,
  fetchLocations,
  type ApiLocation,
  type ApiWarehouse,
} from '../../../services/api';
import { submitMovement, type CreateMovementPayload } from '../../../services/movements';
import type { OrdersLocation, OrdersWarehouse, WarehouseLocationSelection } from '../components/types';

const normalizeWarehouse = (warehouse: ApiWarehouse): OrdersWarehouse => ({
  id: String(warehouse.id ?? warehouse.code),
  code: warehouse.code,
  name: warehouse.name ?? null,
  address: warehouse.address ?? null,
  notes: warehouse.notes ?? null,
  isActive: warehouse.isActive ?? null,
  createdAt: warehouse.createdAt ?? null,
  updatedAt: warehouse.updatedAt ?? null,
});

const normalizeLocation = (location: ApiLocation): OrdersLocation => ({
  id: String(location.id ?? location.code),
  code: location.code,
  name: location.description ?? null,
  description: location.description ?? null,
  warehouseCode: location.warehouseCode,
  warehouseId: location.warehouse?.id !== undefined && location.warehouse?.id !== null
    ? String(location.warehouse.id)
    : null,
  warehouseName: location.warehouse?.name ?? null,
  isActive: location.isActive ?? null,
  createdAt: location.createdAt ?? null,
  updatedAt: location.updatedAt ?? null,
});

type OrderCreationSummary = {
  id: string;
  orderKind: OrderKind;
  itemCount: number;
  quantities: Array<{ unit: string; quantity: number }>;
  partnerName?: string | null;
  scheduledDate: string;
  warehouseCode: string;
  locationCode: string;
};

const aggregateQuantitiesByUnit = (
  items: Array<{ qty: number; unit: string }>,
): Array<{ unit: string; quantity: number }> => {
  const totals = new Map<string, number>();
  items.forEach((item) => {
    const unit = item.unit?.trim() || 'EA';
    const current = totals.get(unit) ?? 0;
    const quantity = Number.isFinite(item.qty) ? Number(item.qty) : 0;
    totals.set(unit, current + quantity);
  });
  return Array.from(totals.entries()).map(([unit, quantity]) => ({ unit, quantity }));
};

const formatQuantitySummary = (quantities: Array<{ unit: string; quantity: number }>): string => {
  if (!quantities.length) {
    return '0';
  }
  return quantities
    .map(({ unit, quantity }) => `${quantity.toLocaleString()} ${unit}`)
    .join(', ');
};

const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [orderKind, setOrderKind] = React.useState<OrderKind>('purchase');
  const [activeTab, setActiveTab] = React.useState<'purchase' | 'sales' | 'transfer'>('purchase');
  const [partners, setPartners] = React.useState<Partner[]>([]);
  const [warehouses, setWarehouses] = React.useState<OrdersWarehouse[]>([]);
  const [locationsByWarehouse, setLocationsByWarehouse] = React.useState<Record<string, OrdersLocation[]>>({});
  const [loadingLocations, setLoadingLocations] = React.useState<Record<string, boolean>>({});
  const [isPartnerModalOpen, setPartnerModalOpen] = React.useState(false);
  const [partnerModalDefaultType, setPartnerModalDefaultType] = React.useState<PartnerType>('SUPPLIER');
  const [isWarehouseModalOpen, setWarehouseModalOpen] = React.useState(false);
  const [preferredWarehouseSelection, setPreferredWarehouseSelection] = React.useState<WarehouseLocationSelection | null>(null);
  const [productCatalog, setProductCatalog] = React.useState<Product[] | null>(null);
  const [productCatalogError, setProductCatalogError] = React.useState<string | null>(null);
  const productCatalogRequestRef = React.useRef<Promise<Product[]> | null>(null);
  const [orderCreationSummary, setOrderCreationSummary] = React.useState<OrderCreationSummary | null>(null);
  const [isCompletionModalOpen, setCompletionModalOpen] = React.useState(false);
  const pendingFormResetRef = React.useRef<(() => void) | null>(null);

  const loadPartners = React.useCallback(async () => {
    try {
      const partnerList = await listPartners();
      setPartners(partnerList);
    } catch (err) {
      console.error('[orders] loadPartners failed', err);
    }
  }, []);

  const loadWarehouses = React.useCallback(async () => {
    try {
      const response = await fetchWarehouses({ pageSize: 100 });
      setWarehouses(response.items.map(normalizeWarehouse));
    } catch (err) {
      console.error('[orders] loadWarehouses failed', err);
    }
  }, []);

  const loadProductCatalog = React.useCallback(async () => {
    if (productCatalogRequestRef.current) {
      return productCatalogRequestRef.current;
    }

    const request = (async () => {
      try {
        const items = await fetchProducts();
        setProductCatalog(items);
        setProductCatalogError(null);
        return items;
      } catch (err) {
        console.error('[orders] loadProductCatalog failed', err);
        setProductCatalogError('상품 정보를 불러오지 못했습니다. 다시 시도해주세요.');
        throw err;
      } finally {
        productCatalogRequestRef.current = null;
      }
    })();

    productCatalogRequestRef.current = request;
    return request;
  }, []);

  const resetProductCatalogError = React.useCallback(() => {
    setProductCatalogError(null);
  }, []);

  const ensureLocationsLoaded = React.useCallback(
    async (warehouseCode: string) => {
      if (!warehouseCode || locationsByWarehouse[warehouseCode] || loadingLocations[warehouseCode]) {
        return;
      }
      setLoadingLocations((prev) => ({ ...prev, [warehouseCode]: true }));
      try {
        const response = await fetchLocations(warehouseCode, { pageSize: 100 });
        setLocationsByWarehouse((prev) => ({
          ...prev,
          [warehouseCode]: (response.items ?? []).map(normalizeLocation),
        }));
      } catch (err) {
        console.error('[orders] ensureLocationsLoaded failed', err);
      } finally {
        setLoadingLocations((prev) => {
          const next = { ...prev };
          delete next[warehouseCode];
          return next;
        });
      }
    },
    [loadingLocations, locationsByWarehouse],
  );

  React.useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  React.useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  React.useEffect(() => {
    void loadProductCatalog().catch(() => {
      // 에러 상태는 loadProductCatalog 내부에서 처리되므로 여기서는 무시합니다.
    });
  }, [loadProductCatalog]);

  const handleCreateOrder = React.useCallback(
    async (form: NewOrderFormState) => {
      try {
        if (
          !form.warehouseId ||
          !form.detailedLocationId ||
          !form.warehouseCode ||
          !form.detailedLocationCode
        ) {
          throw new Error('창고와 상세위치를 선택해주세요.');
        }
        const scheduledAtIso = new Date(form.scheduledAt).toISOString();
        if (form.orderKind === 'purchase') {
          const order = await createPurchaseOrder({
            partnerId: form.partnerId,
            memo: form.memo || undefined,
            items: form.items.map((item) => ({ sku: item.sku, qty: item.qty, unit: item.unit })),
            status: 'RECEIVED',
            warehouseId: form.warehouseId,
            warehouseCode: form.warehouseCode,
            detailedLocationId: form.detailedLocationId,
            detailedLocationCode: form.detailedLocationCode,
            scheduledAt: scheduledAtIso,
          });
          const receiptLines = order.items.filter((item) => (item.receivedQty ?? item.qty) > 0);
          const baseWarehouse = order.warehouseCode ?? form.warehouseCode;
          if (!baseWarehouse) {
            throw new Error('입고 창고 정보를 찾을 수 없습니다.');
          }
          const baseLocation = order.detailedLocationCode ?? form.detailedLocationCode ?? undefined;
          if (receiptLines.length > 0) {
            const occurredAt = scheduledAtIso;
            const movementPayloads: CreateMovementPayload[] = receiptLines
              .map((item): CreateMovementPayload | null => {
                const rawQty = Number.isFinite(item.receivedQty) ? item.receivedQty : item.qty;
                const qty = Math.max(0, Math.round(rawQty ?? 0));
                if (qty <= 0) {
                  return null;
                }
                const toWarehouse = item.warehouseCode ?? baseWarehouse;
                if (!toWarehouse) {
                  return null;
                }
                return {
                  type: 'RECEIPT',
                  sku: item.sku,
                  qty,
                  toWarehouse,
                  toLocation: item.locationCode ?? baseLocation,
                  partnerId: order.partnerId,
                  refNo: order.id,
                  memo: 'purchase-order-auto',
                  occurredAt,
                  userId: 'orders-ui',
                } satisfies CreateMovementPayload;
              })
              .filter((payload): payload is CreateMovementPayload => Boolean(payload));
            if (movementPayloads.length > 0) {
              await Promise.all(movementPayloads.map((payload) => submitMovement(payload)));
            }
          }
          setOrderCreationSummary({
            id: order.id,
            orderKind: 'purchase',
            itemCount: order.items.length,
            quantities: aggregateQuantitiesByUnit(order.items),
            partnerName: partners.find((entry) => entry.id === form.partnerId)?.name ?? null,
            scheduledDate: form.scheduledAt,
            warehouseCode: form.warehouseCode,
            locationCode: form.detailedLocationCode,
          });
          setCompletionModalOpen(true);
          setOrderKind('purchase');
          setActiveTab('purchase');
        } else {
          const order = await createSalesOrder({
            partnerId: form.partnerId,
            memo: form.memo || undefined,
            items: form.items.map((item) => ({ sku: item.sku, qty: item.qty, unit: item.unit })),
            warehouseId: form.warehouseId,
            warehouseCode: form.warehouseCode,
            detailedLocationId: form.detailedLocationId,
            detailedLocationCode: form.detailedLocationCode,
            scheduledAt: scheduledAtIso,
          });
          const baseWarehouse = order.warehouseCode ?? form.warehouseCode;
          if (!baseWarehouse) {
            throw new Error('출고 창고 정보를 찾을 수 없습니다.');
          }
          const baseLocation = order.detailedLocationCode ?? form.detailedLocationCode ?? undefined;

          const requestedQuantities = new Map<string, number>();
          form.items.forEach((item) => {
            const normalizedQty = Number.isFinite(item.qty) ? Math.max(0, Math.round(item.qty)) : 0;
            if (normalizedQty > 0) {
              requestedQuantities.set(item.sku, (requestedQuantities.get(item.sku) ?? 0) + normalizedQty);
            }
          });

          const shipmentLines = order.items.reduce<
            Array<{ sku: string; quantity: number; warehouseCode: string; locationCode: string }>
          >((acc, item) => {
            const requested = requestedQuantities.get(item.sku);
            if (!requested) {
              return acc;
            }
            const shipmentQty = Math.min(Math.max(0, Math.round(item.qty)), requested);
            if (shipmentQty <= 0) {
              return acc;
            }
            const warehouseCode = item.warehouseCode ?? baseWarehouse;
            if (!warehouseCode) {
              return acc;
            }
            const locationCode = item.locationCode ?? baseLocation ?? '';
            acc.push({
              sku: item.sku,
              quantity: shipmentQty,
              warehouseCode,
              locationCode,
            });
            requestedQuantities.set(item.sku, requested - shipmentQty);
            return acc;
          }, []);

          if (shipmentLines.length > 0) {
            await recordSalesShipment(order.id, {
              note: 'orders-ui-auto',
              lines: shipmentLines,
            });

            const occurredAt = scheduledAtIso;
            await Promise.all(
              shipmentLines.map((line) =>
                submitMovement({
                  type: 'ISSUE',
                  sku: line.sku,
                  qty: line.quantity,
                  fromWarehouse: line.warehouseCode,
                  fromLocation: line.locationCode || undefined,
                  partnerId: order.partnerId,
                  refNo: order.id,
                  memo: 'sales-order-auto',
                  occurredAt,
                  userId: 'orders-ui',
                }),
              ),
            );
          }
          setOrderCreationSummary({
            id: order.id,
            orderKind: 'sales',
            itemCount: order.items.length,
            quantities: aggregateQuantitiesByUnit(order.items),
            partnerName: partners.find((entry) => entry.id === form.partnerId)?.name ?? null,
            scheduledDate: form.scheduledAt,
            warehouseCode: form.warehouseCode,
            locationCode: form.detailedLocationCode,
          });
          setCompletionModalOpen(true);
          setOrderKind('sales');
          setActiveTab('sales');
        }
      } catch (err) {
        console.error('[orders] handleCreateOrder failed', err);
        throw err;
      }
    },
    [partners],
  );

  const handleFormSubmitSuccess = React.useCallback(({ resetForm }: { resetForm: () => void }) => {
    pendingFormResetRef.current = resetForm;
  }, []);

  const handleCompletionModalDismiss = React.useCallback(() => {
    setCompletionModalOpen(false);
    setOrderCreationSummary(null);
    if (pendingFormResetRef.current) {
      pendingFormResetRef.current();
      pendingFormResetRef.current = null;
    }
  }, []);

  const handleRequestCreatePartner = React.useCallback(
    (kind: OrderKind) => {
      setPartnerModalDefaultType(kind === 'sales' ? 'CUSTOMER' : 'SUPPLIER');
      setPartnerModalOpen(true);
    },
    [],
  );

  const handleViewOrderDetail = React.useCallback(() => {
    if (!orderCreationSummary) {
      return;
    }
    const path =
      orderCreationSummary.orderKind === 'purchase'
        ? `/orders/purchase/${orderCreationSummary.id}`
        : `/orders/sales/${orderCreationSummary.id}`;
    navigate(path);
    handleCompletionModalDismiss();
  }, [handleCompletionModalDismiss, navigate, orderCreationSummary]);

  const handlePartnerCreated = React.useCallback(
    async (_partner: Partner) => {
      await loadPartners();
    },
    [loadPartners],
  );

  const handleWarehouseCreated = React.useCallback(
    async (warehouse: ApiWarehouse, location: ApiLocation) => {
      setPreferredWarehouseSelection({
        warehouseId: String(warehouse.id),
        warehouseCode: warehouse.code,
        locationId: String(location.id),
        locationCode: location.code,
      });
      await loadWarehouses();
      await ensureLocationsLoaded(warehouse.code);
    },
    [ensureLocationsLoaded, loadWarehouses],
  );

  const formTitleId = React.useId();

  const submitButtonLabel = orderKind === 'purchase' ? '입고' : '출고';
  const handleSelectTab = React.useCallback(
    (tab: 'purchase' | 'sales' | 'transfer') => {
      if (tab === 'transfer') {
        setActiveTab('transfer');
        return;
      }
      setOrderKind(tab);
      setActiveTab(tab);
    },
    [setActiveTab, setOrderKind],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3">
          <h2 id={formTitleId} className="text-lg font-semibold text-slate-800">
            주문 생성
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === 'purchase' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
              onClick={() => handleSelectTab('purchase')}
            >
              입고 주문서
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === 'sales' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
              onClick={() => handleSelectTab('sales')}
            >
              출고 주문서
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === 'transfer' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
              onClick={() => handleSelectTab('transfer')}
            >
              창고 이동
            </button>
          </div>
        </div>
        {activeTab === 'transfer' ? (
          <WarehouseTransferPanel
            warehouses={warehouses}
            defaultFromWarehouse={preferredWarehouseSelection?.warehouseCode}
            className="mt-4"
          />
        ) : (
          <NewOrderForm
            key={orderKind}
            defaultKind={orderKind}
            partners={partners}
            warehouses={warehouses}
            locationsByWarehouse={locationsByWarehouse}
            loadingLocations={loadingLocations}
            products={productCatalog ?? undefined}
            productLoadError={productCatalogError ?? undefined}
            onReloadProducts={loadProductCatalog}
            onResetProductLoadError={resetProductCatalogError}
            onSubmit={handleCreateOrder}
            onSubmitSuccess={handleFormSubmitSuccess}
            onKindChange={(kind) => {
              setOrderKind(kind);
              setActiveTab(kind);
            }}
            onRequestCreatePartner={handleRequestCreatePartner}
            onRequestLocations={ensureLocationsLoaded}
            onRequestManageWarehouse={() => setWarehouseModalOpen(true)}
            preferredWarehouseSelection={preferredWarehouseSelection}
            submitButtonLabel={submitButtonLabel}
            aria-labelledby={formTitleId}
            showKindSwitcher={false}
          />
        )}
      </section>

      <PartnerModal
        open={isPartnerModalOpen}
        mode="create"
        defaultType={partnerModalDefaultType}
        onClose={() => setPartnerModalOpen(false)}
        onCompleted={handlePartnerCreated}
      />

      <QuickWarehouseModal
        open={isWarehouseModalOpen}
        onClose={() => setWarehouseModalOpen(false)}
        onCreated={handleWarehouseCreated}
      />

      <Modal
        isOpen={isCompletionModalOpen && Boolean(orderCreationSummary)}
        onClose={handleCompletionModalDismiss}
        title="주문 생성 완료"
      >
        {orderCreationSummary ? (
          <div className="space-y-6 text-sm text-slate-700">
            <div>
              <p className="text-lg font-semibold text-slate-800">
                {orderCreationSummary.orderKind === 'purchase' ? '입고가 완료되었습니다.' : '출고가 완료되었습니다.'}
              </p>
              <p className="mt-2 text-xs text-slate-500">주문 ID: {orderCreationSummary.id}</p>
            </div>
            <dl className="space-y-3">
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-slate-500">주문 유형</dt>
                <dd className="text-sm font-medium text-slate-800">
                  {orderCreationSummary.orderKind === 'purchase' ? '입고 주문' : '출고 주문'}
                </dd>
              </div>
              {orderCreationSummary.partnerName ? (
                <div className="flex items-center justify-between">
                  <dt className="text-xs font-semibold text-slate-500">거래처</dt>
                  <dd className="text-sm font-medium text-slate-800">{orderCreationSummary.partnerName}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-slate-500">품목 수</dt>
                <dd className="text-sm font-medium text-slate-800">{orderCreationSummary.itemCount}건</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-slate-500">총 수량</dt>
                <dd className="text-sm font-medium text-slate-800">
                  {formatQuantitySummary(orderCreationSummary.quantities)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-slate-500">창고</dt>
                <dd className="text-sm font-medium text-slate-800">{orderCreationSummary.warehouseCode}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-slate-500">상세위치</dt>
                <dd className="text-sm font-medium text-slate-800">{orderCreationSummary.locationCode}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-xs font-semibold text-slate-500">
                  {orderCreationSummary.orderKind === 'purchase' ? '입고 예정일' : '출고 예정일'}
                </dt>
                <dd className="text-sm font-medium text-slate-800">{orderCreationSummary.scheduledDate}</dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2 pt-2 text-sm">
              <button
                type="button"
                onClick={handleViewOrderDetail}
                className="rounded-md border border-slate-200 px-4 py-2 font-semibold text-blue-600 transition hover:border-blue-200 hover:text-blue-500"
              >
                상세 내역 보기
              </button>
              <button
                type="button"
                onClick={handleCompletionModalDismiss}
                className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                완료
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default OrdersPage;
