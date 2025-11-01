import * as React from 'react';

import { DEFAULT_UNIT, DEFAULT_UNIT_OPTIONS, type Product } from '../../../domains/products';
import { fetchProducts } from '../../../services/products';
import { type Partner } from '../../../services/orders';
import WarehouseLocationSelect from './WarehouseLocationSelect';
import type { OrdersLocation, OrdersWarehouse, WarehouseLocationSelection } from './types';
import { formatWarehouseLocationLabel } from '../../../utils/warehouse';
import { useToast } from '../../../components/Toaster';

type OrderItemDraft = {
  productId: string | null;
  sku: string;
  productName: string;
  searchTerm: string;
  qty: number;
  unit: string;
};

export type OrderKind = 'purchase' | 'sales';

export interface NewOrderFormState {
  orderKind: OrderKind;
  partnerId: string;
  memo: string;
  items: OrderItemDraft[];
  warehouseId: string | null;
  warehouseCode: string | null;
  detailedLocationId: string | null;
  detailedLocationCode: string | null;
  scheduledAt: string;
}

export interface NewOrderFormProps {
  defaultKind: OrderKind;
  partners: Partner[];
  warehouses: OrdersWarehouse[];
  locationsByWarehouse: Record<string, OrdersLocation[]>;
  loadingLocations: Record<string, boolean>;
  products?: Product[];
  productLoadError?: string | null;
  onReloadProducts?: () => Promise<Product[]>;
  onResetProductLoadError?: () => void;
  onSubmit: (form: NewOrderFormState) => Promise<void>;
  onSubmitSuccess?: (helpers: { resetForm: () => void }) => void;
  onRequestLocations: (warehouseCode: string) => Promise<void> | void;
  onRequestCreatePartner?: (kind: OrderKind) => void;
  onRequestManageWarehouse?: () => void;
  onCancel?: () => void;
  onKindChange?: (kind: OrderKind) => void;
  className?: string;
  active?: boolean;
  submitButtonLabel?: string;
  cancelButtonLabel?: string;
  formId?: string;
  'aria-labelledby'?: string;
  preferredWarehouseSelection?: WarehouseLocationSelection | null;
  canSelectWarehouse?: boolean;
  canManageWarehouse?: boolean;
  showKindSwitcher?: boolean;
}

const buildInitialItem = (): OrderItemDraft => ({
  productId: null,
  sku: '',
  productName: '',
  searchTerm: '',
  qty: 0,
  unit: DEFAULT_UNIT,
});

const LAST_SELECTION_STORAGE_KEY = 'orders:lastWarehouseSelection';

const filterActivePartners = (partners: Partner[]) => partners.filter((partner) => partner.isActive !== false);

const buildPartnerOptions = (partners: Partner[], kind: OrderKind): Partner[] => {
  const activePartners = filterActivePartners(partners);
  if (kind === 'purchase') {
    return activePartners.filter((partner) => partner.type === 'SUPPLIER');
  }

  const customers = activePartners.filter((partner) => partner.type === 'CUSTOMER');
  if (customers.length > 0) {
    return customers;
  }

  const suppliers = activePartners.filter((partner) => partner.type === 'SUPPLIER');
  if (suppliers.length > 0) {
    return suppliers;
  }

  return activePartners;
};

const resolveDefaultPartnerId = (partners: Partner[], kind: OrderKind) => buildPartnerOptions(partners, kind)[0]?.id ?? '';

const normalizeIdentifier = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
};

const getInventoryStatsForSelection = (
  product: Product | null,
  warehouseCode?: string | null,
  locationCode?: string | null,
): { warehouseQuantity: number | null; locationQuantity: number | null } => {
  const normalizedWarehouse = normalizeIdentifier(warehouseCode);
  if (!product || !normalizedWarehouse) {
    return { warehouseQuantity: null, locationQuantity: null };
  }
  const normalizedLocation = normalizeIdentifier(locationCode);
  let warehouseQuantity = 0;
  let locationQuantity = 0;
  let hasWarehouseEntry = false;
  let hasLocationEntry = false;
  (product.inventory ?? []).forEach((entry) => {
    const entryWarehouse = normalizeIdentifier(entry?.warehouseCode);
    if (!entryWarehouse || entryWarehouse !== normalizedWarehouse) {
      return;
    }
    hasWarehouseEntry = true;
    const entryLocation = normalizeIdentifier(entry?.locationCode);
    const onHand = Math.max(0, Number(entry?.onHand ?? 0));
    warehouseQuantity += onHand;
    if (normalizedLocation) {
      if (entryLocation === normalizedLocation) {
        hasLocationEntry = true;
        locationQuantity += onHand;
      }
    }
  });
  return {
    warehouseQuantity: hasWarehouseEntry ? warehouseQuantity : 0,
    locationQuantity: normalizedLocation
      ? hasLocationEntry
        ? locationQuantity
        : 0
      : null,
  };
};

const NewOrderForm: React.FC<NewOrderFormProps> = ({
  defaultKind,
  partners,
  warehouses,
  locationsByWarehouse,
  loadingLocations,
  products,
  productLoadError,
  onReloadProducts,
  onResetProductLoadError,
  onSubmit,
  onSubmitSuccess,
  onRequestLocations,
  onRequestCreatePartner,
  onRequestManageWarehouse,
  onCancel,
  onKindChange,
  className,
  active = true,
  submitButtonLabel = '저장',
  cancelButtonLabel = '취소',
  formId,
  'aria-labelledby': ariaLabelledBy,
  preferredWarehouseSelection,
  canSelectWarehouse = true,
  canManageWarehouse = true,
  showKindSwitcher = true,
}) => {
  const showToast = useToast();
  const resolvePartnerId = React.useCallback((kind: OrderKind) => resolveDefaultPartnerId(partners, kind), [partners]);

  const [productOptions, setProductOptions] = React.useState<Product[]>(products ?? []);
  const [loadingProducts, setLoadingProducts] = React.useState(false);
  const [productFetchError, setProductFetchError] = React.useState<string | null>(null);
  const isFetchingProductsRef = React.useRef(false);
  const productCacheRef = React.useRef<Product[]>(products ?? []);
  const hasLoadedProductsRef = React.useRef(products !== undefined);
  const isMountedRef = React.useRef(true);
  const [hideZeroWarehouseStock, setHideZeroWarehouseStock] = React.useState(false);

  const createInitialState = React.useCallback(
    (kind: OrderKind = defaultKind): NewOrderFormState => ({
      orderKind: kind,
      partnerId: resolvePartnerId(kind),
      memo: '',
      items: [buildInitialItem()],
      warehouseId: null,
      warehouseCode: null,
      detailedLocationId: null,
      detailedLocationCode: null,
      scheduledAt: '',
    }),
    [defaultKind, resolvePartnerId],
  );
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const applyProductOptions = React.useCallback(
    (items: Product[]) => {
      productCacheRef.current = items;
      if (!isMountedRef.current) {
        return;
      }
      setProductOptions(items);
      hasLoadedProductsRef.current = true;
      setProductFetchError(null);
    },
    [],
  );

  const fetchAndStoreProducts = React.useCallback(async () => {
    if (!isMountedRef.current) {
      return [] as Product[];
    }
    if (isFetchingProductsRef.current) {
      return productCacheRef.current;
    }
    isFetchingProductsRef.current = true;
    setLoadingProducts(true);
    setProductFetchError(null);
    onResetProductLoadError?.();
    try {
      const items = await (onReloadProducts ? onReloadProducts() : fetchProducts());
      applyProductOptions(items);
      return items;
    } catch (err) {
      console.error('[orders] Failed to load products for new order form', err);
      if (isMountedRef.current) {
        setProductFetchError('상품 정보를 불러오지 못했습니다. 다시 시도해주세요.');
      }
      throw err;
    } finally {
      isFetchingProductsRef.current = false;
      hasLoadedProductsRef.current = true;
      if (isMountedRef.current) {
        setLoadingProducts(false);
      }
    }
  }, [applyProductOptions, onReloadProducts, onResetProductLoadError]);

  React.useEffect(() => {
    if (products === undefined) {
      return;
    }
    applyProductOptions(products);
    hasLoadedProductsRef.current = true;
    if (isMountedRef.current) {
      setLoadingProducts(false);
    }
    isFetchingProductsRef.current = false;
  }, [applyProductOptions, products]);

  const [formState, setFormState] = React.useState<NewOrderFormState>(() => createInitialState());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const warehouseInventoryBySku = React.useMemo(() => {
    const entries = new Map<string, { warehouseQuantity: number | null; locationQuantity: number | null }>();
    productOptions.forEach((product) => {
      entries.set(
        product.sku,
        getInventoryStatsForSelection(product, formState.warehouseCode, formState.detailedLocationCode),
      );
    });
    return entries;
  }, [productOptions, formState.detailedLocationCode, formState.warehouseCode]);
  const computeStatsForProduct = React.useCallback(
    (product: Product | null): { warehouseQuantity: number | null; locationQuantity: number | null } => {
      if (!product) {
        return { warehouseQuantity: null, locationQuantity: null };
      }
      const cached = warehouseInventoryBySku.get(product.sku);
      if (cached) {
        return cached;
      }
      return getInventoryStatsForSelection(product, formState.warehouseCode, formState.detailedLocationCode);
    },
    [formState.detailedLocationCode, formState.warehouseCode, warehouseInventoryBySku],
  );
  const hasPositiveWarehouseStock = React.useMemo(() => {
    if (!formState.warehouseCode) {
      return true;
    }
    for (const stats of warehouseInventoryBySku.values()) {
      if ((stats?.warehouseQuantity ?? 0) > 0) {
        return true;
      }
    }
    return false;
  }, [formState.warehouseCode, warehouseInventoryBySku]);


  React.useEffect(() => {
    if (!formState.warehouseCode && hideZeroWarehouseStock) {
      setHideZeroWarehouseStock(false);
    }
  }, [formState.warehouseCode, hideZeroWarehouseStock]);
  const partnerOptions = React.useMemo(
    () => buildPartnerOptions(partners, formState.orderKind),
    [partners, formState.orderKind],
  );

  const resetFormState = React.useCallback(() => {
    setFormState(createInitialState());
    setError(null);
    pendingSelectionRef.current = null;
  }, [createInitialState]);

  const unitOptions = React.useMemo(() => {
    const units = new Set<string>(DEFAULT_UNIT_OPTIONS);
    productOptions.forEach((product) => {
      if (product.unit) {
        units.add(product.unit);
      }
    });
    formState.items.forEach((item) => {
      if (item.unit) {
        units.add(item.unit);
      }
    });
    return Array.from(units);
  }, [formState.items, productOptions]);

  React.useEffect(() => {
    setFormState((prev) => ({
      ...prev,
      orderKind: defaultKind,
      partnerId: resolvePartnerId(defaultKind),
    }));
  }, [defaultKind, resolvePartnerId]);

  React.useEffect(() => {
    if (!active) {
      return;
    }

    if (products === undefined && productOptions.length === 0 && productCacheRef.current.length > 0) {
      setProductOptions(productCacheRef.current);
    }

    const requestActive = isFetchingProductsRef.current;

    if (products !== undefined || hasLoadedProductsRef.current || requestActive) {
      return;
    }

    void fetchAndStoreProducts().catch(() => undefined);
  }, [active, fetchAndStoreProducts, productOptions.length, products]);

  React.useEffect(() => {
    if (active) {
      return;
    }
    setProductFetchError(null);
    isFetchingProductsRef.current = false;
  }, [active]);

  React.useEffect(() => {
    if (productLoadError !== undefined) {
      setProductFetchError(productLoadError);
    }
  }, [productLoadError]);

  const handleRetryProducts = React.useCallback(() => {
    if (isFetchingProductsRef.current) {
      return;
    }
    onResetProductLoadError?.();
    void fetchAndStoreProducts().catch(() => undefined);
  }, [fetchAndStoreProducts, onResetProductLoadError]);

  React.useEffect(() => {
    setFormState((prev) => {
      if (partnerOptions.some((partner) => partner.id === prev.partnerId)) {
        return prev;
      }
      return {
        ...prev,
        partnerId: resolvePartnerId(prev.orderKind),
      };
    });
  }, [partnerOptions, resolvePartnerId]);

  const handleChangeKind = React.useCallback(
    (kind: OrderKind) => {
      setFormState((prev) => ({
        ...prev,
        orderKind: kind,
        partnerId: resolvePartnerId(kind),
      }));
      onKindChange?.(kind);
    },
    [onKindChange, resolvePartnerId],
  );

  const handleChangeItem = React.useCallback((index: number, patch: Partial<OrderItemDraft>) => {
    setFormState((prev) => {
      const nextItems = prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
      return { ...prev, items: nextItems };
    });
  }, []);

  const handleAddItem = React.useCallback(() => {
    setFormState((prev) => ({ ...prev, items: [...prev.items, buildInitialItem()] }));
  }, []);

  const handleRemoveItem = React.useCallback((index: number) => {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, itemIndex) => itemIndex !== index) : prev.items,
    }));
  }, []);

  const pendingSelectionRef = React.useRef<{
    warehouseId: string | null;
    warehouseCode: string | null;
    locationId: string | null;
    locationCode: string | null;
  } | null>(null);
  const restoredSelectionRef = React.useRef<string | null>(null);
  const preferredSelectionRef = React.useRef<string | null>(null);

  const handlePersistSelection = React.useCallback(
    (
      selection:
        | {
            warehouseId: string | null;
            warehouseCode: string;
            locationId: string | null;
            locationCode: string | null;
          }
        | null,
    ) => {
      try {
        if (!selection) {
          window.localStorage.removeItem(LAST_SELECTION_STORAGE_KEY);
          return;
        }
        window.localStorage.setItem(
          LAST_SELECTION_STORAGE_KEY,
          JSON.stringify({
            warehouseId: selection.warehouseId,
            locationId: selection.locationId,
            warehouseCode: selection.warehouseCode,
            locationCode: selection.locationCode,
          }),
        );
      } catch (storageError) {
        console.error('[orders] Failed to persist warehouse selection', storageError);
      }
    },
    [],
  );

  const handleSelectWarehouseLocation = React.useCallback(
    (selection: {
      warehouseId: string | null;
      warehouseCode: string;
      locationId: string | null;
      locationCode: string;
    }) => {
      const warehouse =
        warehouses.find(
          (entry) =>
            entry.code === selection.warehouseCode ||
            (selection.warehouseId && entry.id === selection.warehouseId),
        ) ?? null;
      const warehouseCode = warehouse?.code ?? selection.warehouseCode;
      const locationList = warehouseCode ? locationsByWarehouse[warehouseCode] ?? [] : [];
      const location = locationList.find(
        (entry) => entry.id === selection.locationId || entry.code === selection.locationCode,
      );
      setFormState((prev) => ({
        ...prev,
        warehouseId: warehouse?.id ?? selection.warehouseId ?? null,
        warehouseCode,
        detailedLocationId: location?.id ?? selection.locationId ?? null,
        detailedLocationCode: location?.code ?? selection.locationCode ?? null,
      }));
      handlePersistSelection({
        warehouseId: warehouse?.id ?? selection.warehouseId ?? null,
        warehouseCode,
        locationId: location?.id ?? selection.locationId ?? null,
        locationCode: location?.code ?? selection.locationCode ?? null,
      });
      pendingSelectionRef.current = null;
      setError(null);
    },
    [handlePersistSelection, locationsByWarehouse, warehouses],
  );

  const handleClearWarehouseLocation = React.useCallback(() => {
    setFormState((prev) => ({
      ...prev,
      warehouseId: null,
      warehouseCode: null,
      detailedLocationId: null,
      detailedLocationCode: null,
    }));
    pendingSelectionRef.current = null;
    handlePersistSelection(null);
    setError(null);
  }, [handlePersistSelection]);

  React.useEffect(() => {
    if (restoredSelectionRef.current || warehouses.length === 0) {
      return;
    }
    try {
      const stored = window.localStorage.getItem(LAST_SELECTION_STORAGE_KEY);
      if (!stored) {
        restoredSelectionRef.current = 'empty';
        return;
      }
      const parsed = JSON.parse(stored) as {
        warehouseId?: string;
        locationId?: string;
        warehouseCode?: string;
        locationCode?: string;
      };
      if (!parsed?.warehouseCode) {
        restoredSelectionRef.current = 'empty';
        return;
      }
      const warehouse = warehouses.find(
        (entry) => entry.code === parsed.warehouseCode || entry.id === parsed.warehouseId,
      );
      const resolvedWarehouseCode = warehouse?.code ?? parsed.warehouseCode ?? null;
      if (!resolvedWarehouseCode) {
        restoredSelectionRef.current = 'empty';
        return;
      }
      const resolvedWarehouseId = warehouse?.id ?? parsed.warehouseId ?? null;
      restoredSelectionRef.current = `${resolvedWarehouseCode}:${parsed.locationId ?? parsed.locationCode ?? ''}`;
      pendingSelectionRef.current = {
        warehouseId: resolvedWarehouseId,
        locationId: parsed.locationId ?? null,
        warehouseCode: resolvedWarehouseCode,
        locationCode: parsed.locationCode ?? null,
      };
      setFormState((prev) => ({
        ...prev,
        warehouseId: resolvedWarehouseId,
        warehouseCode: resolvedWarehouseCode,
        detailedLocationId: null,
        detailedLocationCode: parsed.locationCode ?? null,
      }));
      void onRequestLocations(resolvedWarehouseCode);
    } catch (restoreError) {
      console.error('[orders] Failed to restore warehouse selection', restoreError);
      restoredSelectionRef.current = 'error';
    }
  }, [onRequestLocations, warehouses]);

  React.useEffect(() => {
    if (!preferredWarehouseSelection) {
      return;
    }
    const key = `${preferredWarehouseSelection.warehouseCode}:${preferredWarehouseSelection.locationId}`;
    if (preferredSelectionRef.current === key) {
      return;
    }
    preferredSelectionRef.current = key;
    const warehouse = warehouses.find(
      (entry) =>
        entry.code === preferredWarehouseSelection.warehouseCode ||
        entry.id === preferredWarehouseSelection.warehouseId,
    );
    pendingSelectionRef.current = {
      warehouseId: preferredWarehouseSelection.warehouseId,
      locationId: preferredWarehouseSelection.locationId,
      warehouseCode: preferredWarehouseSelection.warehouseCode,
      locationCode: preferredWarehouseSelection.locationCode,
    };
    if (warehouse) {
      setFormState((prev) => ({
        ...prev,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        detailedLocationId: null,
        detailedLocationCode: preferredWarehouseSelection.locationCode ?? null,
      }));
      void onRequestLocations(warehouse.code);
      return;
    }
    setFormState((prev) => ({
      ...prev,
      warehouseId: preferredWarehouseSelection.warehouseId,
      warehouseCode: preferredWarehouseSelection.warehouseCode,
      detailedLocationId: null,
      detailedLocationCode: preferredWarehouseSelection.locationCode ?? null,
    }));
    void onRequestLocations(preferredWarehouseSelection.warehouseCode);
  }, [onRequestLocations, preferredWarehouseSelection, warehouses]);

  React.useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) {
      return;
    }
    const warehouse = warehouses.find(
      (entry) =>
        (pending.warehouseId && entry.id === pending.warehouseId) ||
        (pending.warehouseCode && entry.code === pending.warehouseCode),
    );
    const warehouseCode = warehouse?.code ?? pending.warehouseCode;
    if (!warehouse || !warehouseCode) {
      return;
    }
    const location = (locationsByWarehouse[warehouseCode] ?? []).find(
      (entry) => entry.id === pending.locationId || entry.code === pending.locationCode,
    );
    if (!location) {
      return;
    }
    setFormState((prev) => ({
      ...prev,
      warehouseId: warehouse.id,
      warehouseCode,
      detailedLocationId: location.id,
      detailedLocationCode: location.code,
    }));
    handlePersistSelection({
      warehouseId: warehouse.id,
      locationId: location.id,
      warehouseCode,
      locationCode: location.code,
    });
    pendingSelectionRef.current = null;
    setError(null);
  }, [handlePersistSelection, locationsByWarehouse, warehouses]);

  React.useEffect(() => {
    if (!formState.warehouseId || !formState.detailedLocationId) {
      return;
    }
    const warehouse = warehouses.find(
      (entry) =>
        (formState.warehouseId && entry.id === formState.warehouseId) ||
        (formState.warehouseCode && entry.code === formState.warehouseCode),
    );
    const warehouseCode = warehouse?.code ?? formState.warehouseCode;
    if (!warehouse || !warehouseCode) {
      return;
    }
    const location = (locationsByWarehouse[warehouseCode] ?? []).find(
      (entry) => entry.id === formState.detailedLocationId || entry.code === formState.detailedLocationCode,
    );
    if (!location) {
      return;
    }
    if (formState.warehouseCode === warehouse.code && formState.detailedLocationCode === location.code) {
      return;
    }
    setFormState((prev) => ({
      ...prev,
      warehouseCode,
      detailedLocationCode: location.code,
    }));
  }, [formState.detailedLocationId, formState.detailedLocationCode, formState.warehouseCode, formState.warehouseId, locationsByWarehouse, warehouses]);

  const selectedWarehouseLabel = React.useMemo(() => {
    if (!formState.warehouseId || !formState.detailedLocationId) {
      return '';
    }
    const warehouse = warehouses.find(
      (entry) =>
        (formState.warehouseId && entry.id === formState.warehouseId) ||
        (formState.warehouseCode && entry.code === formState.warehouseCode),
    );
    const warehouseCode = warehouse?.code ?? formState.warehouseCode;
    const locationList = warehouseCode ? locationsByWarehouse[warehouseCode] ?? [] : [];
    const location = locationList.find(
      (entry) => entry.id === formState.detailedLocationId || entry.code === formState.detailedLocationCode,
    );
    if (warehouse && location) {
      return formatWarehouseLocationLabel(
        warehouse.name ?? warehouse.code,
        location.name ?? location.description ?? location.code,
      );
    }
    if (warehouse && formState.detailedLocationCode) {
      return formatWarehouseLocationLabel(warehouse.name ?? warehouse.code, formState.detailedLocationCode);
    }
    if (formState.warehouseCode && formState.detailedLocationCode) {
      return formatWarehouseLocationLabel(formState.warehouseCode, formState.detailedLocationCode);
    }
    return '';
  }, [formState.detailedLocationCode, formState.detailedLocationId, formState.warehouseCode, formState.warehouseId, locationsByWarehouse, warehouses]);

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        if (!formState.scheduledAt) {
          setError(formState.orderKind === 'purchase' ? '입고일을 선택해주세요.' : '출고일을 선택해주세요.');
          return;
        }
        if (!formState.partnerId || !partnerOptions.some((partner) => partner.id === formState.partnerId)) {
          setError('거래처를 선택해주세요.');
          return;
        }
        const cleanedItems = formState.items.map((item) => ({
          sku: item.sku.trim(),
          qty: Number.isFinite(item.qty) ? Number(item.qty) : 0,
          unit: item.unit.trim() || 'EA',
        }));
        if (cleanedItems.some((item) => !item.sku)) {
          setError('모든 품목에 상품을 선택해주세요.');
          return;
        }
        const validItems = cleanedItems.filter((item) => item.qty > 0);
        if (validItems.length === 0) {
          setError('거래처와 품목 정보를 입력해주세요.');
          return;
        }
        if (
          !formState.warehouseId ||
          !formState.detailedLocationId ||
          !formState.warehouseCode ||
          !formState.detailedLocationCode
        ) {
          setError('창고와 상세위치를 선택해주세요.');
          return;
        }
        await onSubmit({
          orderKind: formState.orderKind,
          partnerId: formState.partnerId,
          memo: formState.memo.trim(),
          items: validItems,
          warehouseId: formState.warehouseId,
          warehouseCode: formState.warehouseCode,
          detailedLocationId: formState.detailedLocationId,
          detailedLocationCode: formState.detailedLocationCode,
          scheduledAt: formState.scheduledAt,
        });
        onSubmitSuccess?.({ resetForm: resetFormState });
      } catch (err) {
        console.error('[orders] NewOrderForm submit failed', err);
        const status =
          typeof err === 'object' && err !== null && 'status' in err
            ? (err as { status?: unknown }).status
            : undefined;
        const normalizedStatus = typeof status === 'number' ? status : undefined;
        const isNetworkOrServerError =
          normalizedStatus === 0 || (normalizedStatus !== undefined && normalizedStatus >= 500);
        if (err instanceof Error && err.message && !isNetworkOrServerError) {
          setError(err.message);
        } else {
          const toastMessage =
            formState.orderKind === 'purchase' ? '입고 처리에 실패했습니다.' : '출고 처리에 실패했습니다.';
          showToast(toastMessage, { tone: 'error' });
        }
      } finally {
        setSubmitting(false);
      }
    },
    [formState, onSubmit, onSubmitSuccess, partnerOptions, resetFormState, showToast],
  );

  return (
    <form
      id={formId}
      aria-labelledby={ariaLabelledBy}
      onSubmit={handleSubmit}
      className={`space-y-4 text-sm ${className ?? ''}`.trim()}
    >
      {showKindSwitcher ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 font-semibold ${
              formState.orderKind === 'purchase' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => handleChangeKind('purchase')}
          >
            입고 주문서
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 font-semibold ${
              formState.orderKind === 'sales' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => handleChangeKind('sales')}
          >
            출고 주문서
          </button>
        </div>
      ) : null}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-500" htmlFor="partner">
            거래처
          </label>
          {onRequestCreatePartner ? (
            <button
              type="button"
              className="text-xs font-semibold text-blue-600"
              onClick={() => onRequestCreatePartner(formState.orderKind)}
            >
              거래처 추가
            </button>
          ) : null}
        </div>
        <select
          id="partner"
          className="w-full rounded-md border border-slate-200 px-3 py-2"
          value={formState.partnerId}
          onChange={(event) => {
            setFormState((prev) => ({ ...prev, partnerId: event.target.value }));
            setError(null);
          }}
        >
          <option value="">거래처 선택</option>
          {partnerOptions.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-500" htmlFor="warehouse-location">
            창고 / 상세위치
          </label>
          {onRequestManageWarehouse ? (
            <button
              type="button"
              onClick={onRequestManageWarehouse}
              className="text-xs font-semibold text-blue-600 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!canManageWarehouse}
            >
              창고 추가
            </button>
          ) : null}
        </div>
        <WarehouseLocationSelect
          id="warehouse-location"
          value={{
            warehouseId: formState.warehouseId,
            warehouseCode: formState.warehouseCode,
            locationId: formState.detailedLocationId,
            locationCode: formState.detailedLocationCode,
          }}
          selectedLabel={selectedWarehouseLabel}
          warehouses={warehouses}
          locationsByWarehouse={locationsByWarehouse}
          loadingLocations={loadingLocations}
          disabled={!canSelectWarehouse}
          onChange={handleSelectWarehouseLocation}
          onClear={handleClearWarehouseLocation}
          onRequestLocations={onRequestLocations}
          onManage={canManageWarehouse ? onRequestManageWarehouse : undefined}
          manageDisabled={!canManageWarehouse}
        />
        {!canSelectWarehouse ? (
          <p className="mt-1 text-xs text-slate-400">창고 선택 권한이 없습니다.</p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="scheduledAt">
          {formState.orderKind === 'purchase' ? '입고일' : '출고일'}
        </label>
        <input
          id="scheduledAt"
          type="date"
          className="w-full rounded-md border border-slate-200 px-3 py-2"
          value={formState.scheduledAt}
          onChange={(event) => {
            setFormState((prev) => ({ ...prev, scheduledAt: event.target.value }));
            setError(null);
          }}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500" htmlFor="memo">
          메모
        </label>
        <textarea
          id="memo"
          className="w-full rounded-md border border-slate-200 px-3 py-2"
          placeholder="운영 메모를 입력하세요"
          value={formState.memo}
          onChange={(event) => setFormState((prev) => ({ ...prev, memo: event.target.value }))}
        />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">품목</span>
            {formState.warehouseCode ? (
              <label className="flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-slate-500">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-slate-300"
                  checked={hideZeroWarehouseStock}
                  onChange={(event) => setHideZeroWarehouseStock(event.target.checked)}
                />
                해당 창고 보유품만 보기
              </label>
            ) : null}
          </div>
          <button type="button" className="text-xs font-semibold text-blue-600" onClick={handleAddItem}>
            품목 추가
          </button>
        </div>
        <div className="space-y-4">
          {formState.warehouseCode && hideZeroWarehouseStock && !hasPositiveWarehouseStock ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              해당 창고에 보유 중인 상품이 없습니다.
            </p>
          ) : null}
          {formState.items.map((item, index) => {
            const searchInputId = `product-search-${index}`;
            const selectId = `product-select-${index}`;
            const quantityInputId = `product-qty-${index}`;
            const unitSelectId = `product-unit-${index}`;
            const selectedProduct = item.sku
              ? productOptions.find((entry) => entry.sku === item.sku) ?? null
              : null;
            let candidateProducts = productOptions;
            if (
              selectedProduct &&
              candidateProducts.every((product) => product.sku !== selectedProduct.sku)
            ) {
              candidateProducts = [...candidateProducts, selectedProduct];
            }
            const candidateWithStats = candidateProducts.map((product) => ({
              product,
              stats: computeStatsForProduct(product),
            }));
            const normalizedSearch = item.searchTerm.trim().toLowerCase();
            const searchFiltered = normalizedSearch
              ? candidateWithStats.filter(({ product }) => {
                  const name = product.name.toLowerCase();
                  const sku = product.sku.toLowerCase();
                  const id = product.productId?.toLowerCase() ?? '';
                  return (
                    name.includes(normalizedSearch) ||
                    sku.includes(normalizedSearch) ||
                    id.includes(normalizedSearch)
                  );
                })
              : candidateWithStats;
            const productChoices =
              hideZeroWarehouseStock && formState.warehouseCode && !normalizedSearch
                ? searchFiltered.filter(({ product, stats }) => {
                    const quantity = stats?.warehouseQuantity ?? 0;
                    if (quantity > 0) {
                      return true;
                    }
                    return selectedProduct?.sku === product.sku;
                  })
                : searchFiltered;
            const hasVisibleOptions = productChoices.length > 0;
            const { warehouseQuantity, locationQuantity } = computeStatsForProduct(selectedProduct);
            const stockContext = (() => {
              if (!formState.warehouseCode) {
                return null;
              }
              const baseUnit = selectedProduct?.unit ?? item.unit ?? DEFAULT_UNIT;
              const warehouseText = `현재 재고: ${(warehouseQuantity ?? 0).toLocaleString('ko-KR')} ${baseUnit} (${formState.warehouseCode})`;
              if (formState.detailedLocationCode?.trim()) {
                const locationText = `${formState.detailedLocationCode}: ${(locationQuantity ?? 0).toLocaleString('ko-KR')} ${baseUnit}`;
                return `${warehouseText} · 상세 위치 ${locationText}`;
              }
              return warehouseText;
            })();
            const stockLabel = stockContext;
            return (
              <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-12">
                <div className="sm:col-span-7">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500" htmlFor={searchInputId}>
                    상품 검색
                  </label>
                  <div className="space-y-2">
                    <input
                      id={searchInputId}
                      className="w-full rounded-md border border-slate-200 px-3 py-2"
                      placeholder="상품명이나 SKU로 검색"
                      value={item.searchTerm}
                      onChange={(event) =>
                        handleChangeItem(index, {
                          searchTerm: event.target.value,
                        })
                      }
                    />
                    <label
                      className="block text-[11px] font-semibold text-slate-500"
                      htmlFor={selectId}
                    >
                      상품
                    </label>
                    <div className="flex items-center gap-2">
                    <select
                      id={selectId}
                      className="w-full rounded-md border border-slate-200 px-3 py-2"
                      value={item.sku}
                      onChange={(event) => {
                        const sku = event.target.value;
                        if (!sku) {
                          handleChangeItem(index, {
                            productId: null,
                            sku: '',
                            productName: '',
                            unit: 'EA',
                          });
                          return;
                        }
                        const product = productOptions.find((entry) => entry.sku === sku) ?? null;
                        handleChangeItem(index, {
                          productId: product?.productId ?? null,
                          sku,
                          productName: product?.name ?? '',
                          searchTerm: product ? `${product.name} (${product.sku})` : item.searchTerm,
                          unit: product?.unit ?? item.unit ?? 'EA',
                        });
                      }}
                    >
                      <option value="">
                        {loadingProducts
                          ? '상품을 불러오는 중...'
                          : hasVisibleOptions
                          ? '상품 선택'
                          : normalizedSearch
                          ? '검색 결과가 없습니다.'
                          : hideZeroWarehouseStock && formState.warehouseCode
                          ? '보유 중인 상품이 없습니다.'
                          : '상품 선택'}
                      </option>
                      {productChoices.map(({ product, stats }) => {
                        const quantityText = formState.warehouseCode
                          ? (stats?.warehouseQuantity ?? 0).toLocaleString('ko-KR')
                          : null;
                        const optionLabel = formState.warehouseCode
                          ? `${product.name} (${product.sku}) · ${quantityText}`
                          : `${product.name} (${product.sku})`;
                        return (
                          <option key={product.sku} value={product.sku}>
                            {optionLabel}
                          </option>
                        );
                      })}
                    </select>
                      <button
                        type="button"
                        aria-label="선택 초기화"
                        title="선택 초기화"
                        className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          if (!item.sku) return;
                          handleChangeItem(index, {
                            productId: null,
                            sku: '',
                            productName: '',
                            unit: DEFAULT_UNIT,
                            searchTerm: '',
                          });
                          const el = document.getElementById(searchInputId) as HTMLInputElement | null;
                          el?.focus();
                        }}
                        disabled={!item.sku}
                      >
                        초기화
                      </button>
                    </div>
                    {stockLabel ? (
                      <p className="text-[11px] text-slate-500">{stockLabel}</p>
                    ) : null}
                  </div>
                </div>
                <div className="sm:col-span-4">
                  <label className="mb-1 block text-[11px] font-semibold text-slate-500" htmlFor={quantityInputId}>
                    수량 / 단위
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={quantityInputId}
                      type="number"
                      min={0}
                      className="w-full rounded-md border border-slate-200 px-3 py-2"
                      value={item.qty}
                      onChange={(event) => handleChangeItem(index, { qty: Number(event.target.value) })}
                    />
                    <select
                      id={unitSelectId}
                      className="w-28 rounded-md border border-slate-200 px-2 py-2"
                      value={item.unit}
                      onChange={(event) => handleChangeItem(index, { unit: event.target.value })}
                      aria-label="단위"
                    >
                      {unitOptions.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="sm:col-span-1 sm:text-right">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500"
                    onClick={() => handleRemoveItem(index)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {productFetchError ? (
          <div className="flex items-center justify-between rounded-md bg-rose-50 p-2 text-xs text-rose-600">
            <p className="pr-4">{productFetchError}</p>
            <button
              type="button"
              className="rounded border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600"
              onClick={handleRetryProducts}
              disabled={loadingProducts}
            >
              다시 시도
            </button>
          </div>
        ) : null}
      </div>

      {error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{error}</p> : null}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel ? (
          <button
            type="button"
            className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
            onClick={onCancel}
            disabled={submitting}
          >
            {cancelButtonLabel}
          </button>
        ) : null}
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          disabled={submitting}
        >
          {submitting ? `${submitButtonLabel} 중...` : submitButtonLabel}
        </button>
      </div>
    </form>
  );
};

export const __test__ = {
  buildPartnerOptions,
  resolveDefaultPartnerId,
};

export default NewOrderForm;

