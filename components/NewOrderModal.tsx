import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Decimal from 'decimal.js';
import { calculateLineAmount, calculateOrderTotals, toDecimal } from '@/src/utils/orderTotals';
import { fetchProducts } from '@/src/services/products';
import { decimalInputProps, handleDecimalInputKeyDown } from '@/utils/numericInput';
import Modal from './ui/Modal';

type ProductOption = {
  id: string;
  name: string;
  sku: string;
};

type OrderLineDraft = {
  id: string;
  productId: string | null;
  productInput: string;
  quantity: string;
  unitPrice: string;
};

type NewOrderLinePayload = {
  productId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

export interface NewOrderPayload {
  customerName: string;
  notes?: string;
  lines: NewOrderLinePayload[];
  totals: {
    subtotal: string;
    tax: string;
    total: string;
    taxRate: string;
  };
};

interface NewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: NewOrderPayload) => Promise<void> | void;
  taxRate?: number;
}

const DEFAULT_TAX_RATE = 0.1;
const PRODUCT_LOAD_ERROR_MESSAGE = '상품 정보를 불러오는 중 문제가 발생했습니다. 다시 시도해 주세요.';
const NO_PRODUCTS_MESSAGE = '등록된 제품이 없습니다. 품목 관리에서 제품을 추가해 주세요.';

const createLineId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `line-${Math.random().toString(36).slice(2, 11)}`;
};

const createEmptyLine = (): OrderLineDraft => ({
  id: createLineId(),
  productId: null,
  productInput: '',
  quantity: '1',
  unitPrice: '0',
});

const formatProductLabel = (product: ProductOption) => `${product.name} (${product.sku})`;

interface ProductSelectorProps {
  products: ProductOption[];
  value: string | null;
  inputValue: string;
  disabled?: boolean;
  loading?: boolean;
  statusMessage?: string | null;
  onInputChange: (next: string) => void;
  onProductChange: (next: ProductOption | null) => void;
}

const ProductSelector: React.FC<ProductSelectorProps> = ({
  products,
  value,
  inputValue,
  disabled,
  loading = false,
  statusMessage,
  onInputChange,
  onProductChange,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const inputId = React.useId();
  const listboxId = `${inputId}-listbox`;

  const filtered = React.useMemo(() => {
    const trimmed = inputValue.trim().toLowerCase();
    if (!trimmed) {
      return products;
    }

    return products.filter((product) => {
      const nameMatch = product.name.toLowerCase().includes(trimmed);
      const skuMatch = product.sku.toLowerCase().includes(trimmed);
      return nameMatch || skuMatch;
    });
  }, [products, inputValue]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 40,
    overscan: 6,
  });

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedIndex = filtered.findIndex((product) => product.id === value);
    if (selectedIndex >= 0) {
      setHighlighted(selectedIndex);
      rowVirtualizer.scrollToIndex(selectedIndex);
    }
  }, [filtered, isOpen, rowVirtualizer, value]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (highlighted >= filtered.length) {
      setHighlighted(filtered.length ? filtered.length - 1 : 0);
      return;
    }

    rowVirtualizer.scrollToIndex(highlighted);
  }, [highlighted, filtered.length, isOpen, rowVirtualizer]);

  const commitSelection = React.useCallback(
    (product: ProductOption) => {
      onProductChange(product);
      onInputChange(formatProductLabel(product));
      setIsOpen(false);
    },
    [onInputChange, onProductChange],
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onInputChange(event.target.value);
    setIsOpen(true);
    setHighlighted(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setIsOpen(true);
      setHighlighted(0);
      return;
    }

    if (!filtered.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      if (!isOpen) {
        return;
      }
      event.preventDefault();
      const product = filtered[highlighted];
      if (product) {
        commitSelection(product);
      }
    } else if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault();
        setIsOpen(false);
      }
    }
  };

  const handleFocus = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const handleBlur = () => {
    window.setTimeout(() => setIsOpen(false), 120);
  };

  return (
    <div className="relative">
      <input
        id={inputId}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && filtered[highlighted] ? `${listboxId}-${filtered[highlighted].id}` : undefined}
        aria-busy={loading}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder="제품명을 검색하세요"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
      {isOpen && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
        >
          {loading && !products.length ? (
            <div className="p-3 text-sm text-slate-500">상품 정보를 불러오는 중입니다...</div>
          ) : filtered.length ? (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const option = filtered[virtualRow.index];
                if (!option) {
                  return null;
                }

                const isSelected = value === option.id;
                const isActive = highlighted === virtualRow.index;
                const optionId = `${listboxId}-${option.id}`;

                return (
                  <div
                    key={option.id}
                    id={optionId}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commitSelection(option)}
                    onMouseEnter={() => setHighlighted(virtualRow.index)}
                    className={`flex cursor-pointer flex-col gap-0.5 px-3 py-2 text-sm ${
                      isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-700'
                    } ${isSelected ? 'font-semibold' : ''}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <span>{option.name}</span>
                    <span className="text-xs text-slate-500">품번: {option.sku}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 text-sm text-slate-500">
              {products.length
                ? '검색 결과가 없습니다.'
                : statusMessage ?? '등록된 제품이 없습니다. 품목 관리에서 제품을 추가해 주세요.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const NewOrderModal: React.FC<NewOrderModalProps> = ({ isOpen, onClose, onSubmit, taxRate = DEFAULT_TAX_RATE }) => {
  const [customerName, setCustomerName] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<OrderLineDraft[]>([createEmptyLine()]);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [productOptions, setProductOptions] = React.useState<ProductOption[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = React.useState(false);
  const [productLoadError, setProductLoadError] = React.useState<string | null>(null);
  const isMountedRef = React.useRef(true);
  const isFetchingProductsRef = React.useRef(false);

  const productStatusMessage = React.useMemo(() => {
    if (productLoadError) {
      return productLoadError;
    }
    if (!isLoadingProducts && productOptions.length === 0) {
      return NO_PRODUCTS_MESSAGE;
    }
    return null;
  }, [isLoadingProducts, productLoadError, productOptions.length]);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadProducts = React.useCallback(async () => {
    if (isFetchingProductsRef.current) {
      return;
    }

    isFetchingProductsRef.current = true;

    if (isMountedRef.current) {
      setIsLoadingProducts(true);
      setProductLoadError(null);
    }

    try {
      const items = await fetchProducts();

      if (!isMountedRef.current) {
        return;
      }

      const normalized = items
        .map<ProductOption | null>((item) => {
          const candidateId = item.productId?.toString().trim() ||
            (Number.isFinite(item.legacyProductId) ? item.legacyProductId.toString() : '');
          if (!candidateId) {
            return null;
          }

          return {
            id: candidateId,
            sku: item.sku,
            name: item.name,
          };
        })
        .filter((item): item is ProductOption => item !== null);

      setProductOptions(normalized);
      setProductLoadError(null);
    } catch (error) {
      console.error('[NewOrderModal] Failed to load products', error);
      if (isMountedRef.current) {
        setProductOptions([]);
        setProductLoadError(PRODUCT_LOAD_ERROR_MESSAGE);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingProducts(false);
      }
      isFetchingProductsRef.current = false;
    }
  }, []);

  const handleRetryLoadProducts = React.useCallback(() => {
    void loadProducts();
  }, [loadProducts]);

  const totals = React.useMemo(() => {
    const orderTotals = calculateOrderTotals(
      lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice })),
      taxRate,
    );

    return {
      subtotal: orderTotals.subtotal,
      tax: orderTotals.tax,
      total: orderTotals.total,
    };
  }, [lines, taxRate]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadProducts();

    setCustomerName('');
    setNotes('');
    setLines([createEmptyLine()]);
    setErrors([]);
    setIsSubmitting(false);
  }, [isOpen, loadProducts]);

  const updateLine = React.useCallback((lineId: string, updater: (line: OrderLineDraft) => OrderLineDraft) => {
    setLines((prev) => prev.map((line) => (line.id === lineId ? updater(line) : line)));
  }, []);

  const handleAddLine = () => {
    setLines((prev) => [...prev, createEmptyLine()]);
  };

  const handleRemoveLine = (lineId: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.id !== lineId) : prev));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const validationErrors: string[] = [];
    const trimmedCustomer = customerName.trim();

    if (!trimmedCustomer) {
      validationErrors.push('고객명을 입력해 주세요.');
    }

    if (!lines.length) {
      validationErrors.push('최소 1개 이상의 품목을 추가해 주세요.');
    }

    const normalizedLines: NewOrderLinePayload[] = [];

    lines.forEach((line, index) => {
      const product = productOptions.find((option) => option.id === line.productId);
      if (!product) {
        validationErrors.push(`${index + 1}번 라인의 제품을 선택해 주세요.`);
        return;
      }

      const quantity = toDecimal(line.quantity);
      const unitPrice = toDecimal(line.unitPrice);

      if (!quantity.isFinite() || quantity.lte(0)) {
        validationErrors.push(`${index + 1}번 라인의 수량을 0보다 크게 입력해 주세요.`);
        return;
      }

      if (!unitPrice.isFinite() || unitPrice.lt(0)) {
        validationErrors.push(`${index + 1}번 라인의 단가를 0 이상으로 입력해 주세요.`);
        return;
      }

      const lineTotal = quantity.times(unitPrice);

      if (lineTotal.lt(0)) {
        validationErrors.push(`${index + 1}번 라인의 금액이 유효하지 않습니다.`);
        return;
      }

      normalizedLines.push({
        productId: product.id,
        quantity: quantity.toString(),
        unitPrice: unitPrice.toString(),
        lineTotal: lineTotal.toFixed(2),
      });
    });

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (totals.total.lt(0)) {
      validationErrors.push('총 금액이 유효하지 않습니다.');
      setErrors(validationErrors);
      return;
    }

    setErrors([]);
    setIsSubmitting(true);

    try {
      await onSubmit({
        customerName: trimmedCustomer,
        notes: notes.trim() || undefined,
        lines: normalizedLines,
        totals: {
          subtotal: totals.subtotal.toFixed(2),
          tax: totals.tax.toFixed(2),
          total: totals.total.toFixed(2),
          taxRate: new Decimal(taxRate).toString(),
        },
      });
      onClose();
    } catch (error) {
      console.error('[NewOrderModal] Failed to submit order', error);
      setErrors(['주문 저장 중 오류가 발생했습니다. 다시 시도해 주세요.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="새 주문 작성">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="customer-name">
            고객명
          </label>
          <input
            id="customer-name"
            type="text"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="주문 고객을 입력하세요"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">주문 품목</h4>
            <button
              type="button"
              onClick={handleAddLine}
              className="rounded-md border border-primary-200 px-3 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50"
            >
              + 품목 추가
            </button>
          </div>

          {isLoadingProducts && (
            <p className="text-xs text-slate-500">상품 정보를 불러오는 중입니다...</p>
          )}

          {productLoadError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-600">
              <div className="flex items-start justify-between gap-2">
                <span>{productLoadError}</span>
                <button
                  type="button"
                  onClick={handleRetryLoadProducts}
                  className="font-semibold text-rose-600 underline underline-offset-2"
                >
                  다시 시도
                </button>
              </div>
            </div>
          )}

          {!productLoadError && !isLoadingProducts && productOptions.length === 0 && (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
              {NO_PRODUCTS_MESSAGE}
            </div>
          )}

          <div className="space-y-3">
            {lines.map((line, index) => {
              const lineAmount = calculateLineAmount({ quantity: line.quantity, unitPrice: line.unitPrice });

              return (
                <div key={line.id} className="grid grid-cols-12 gap-3 rounded-md border border-slate-200 p-3">
                  <div className="col-span-12 sm:col-span-5">
                    <label className="block text-xs font-medium text-slate-500">제품</label>
                    <ProductSelector
                      products={productOptions}
                      value={line.productId}
                      inputValue={line.productInput}
                      loading={isLoadingProducts}
                      statusMessage={productStatusMessage}
                      onInputChange={(next) =>
                        updateLine(line.id, (current) => ({
                          ...current,
                          productInput: next,
                          productId: null,
                        }))
                      }
                      onProductChange={(selected) =>
                        updateLine(line.id, (current) => ({
                          ...current,
                          productId: selected ? selected.id : null,
                          productInput: selected ? formatProductLabel(selected) : '',
                        }))
                      }
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-500" htmlFor={`${line.id}-quantity`}>
                      수량
                    </label>
                    <input
                      id={`${line.id}-quantity`}
                      type="number"
                      {...decimalInputProps}
                      min="0"
                      step="0.01"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.id, (current) => ({ ...current, quantity: event.target.value }))
                      }
                      onKeyDown={handleDecimalInputKeyDown}
                      className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>

                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-500" htmlFor={`${line.id}-price`}>
                      단가
                    </label>
                    <input
                      id={`${line.id}-price`}
                      type="number"
                      {...decimalInputProps}
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(line.id, (current) => ({ ...current, unitPrice: event.target.value }))
                      }
                      onKeyDown={handleDecimalInputKeyDown}
                      className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>

                  <div className="col-span-8 sm:col-span-2 self-end text-right">
                    <span className="block text-xs font-medium text-slate-500">금액</span>
                    <span className="text-sm font-semibold text-slate-800">{lineAmount.toFixed(2)}</span>
                  </div>

                  <div className="col-span-4 sm:col-span-1 flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(line.id)}
                      className="text-xs font-medium text-rose-600 hover:text-rose-500"
                      disabled={lines.length <= 1}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="order-notes">
            비고
          </label>
          <textarea
            id="order-notes"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="주문 관련 메모를 입력하세요"
          />
        </div>

        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>합계</span>
            <span>{totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>부가세 ({(taxRate * 100).toFixed(0)}%)</span>
            <span>{totals.tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-slate-800">
            <span>총액</span>
            <span>{totals.total.toFixed(2)}</span>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-600">
            <ul className="list-disc space-y-1 pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            disabled={isSubmitting}
          >
            취소
          </button>
          <button
            type="submit"
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-300"
            disabled={isSubmitting}
          >
            {isSubmitting ? '저장 중...' : '주문 생성'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default NewOrderModal;
