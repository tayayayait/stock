import React, { useCallback, useEffect, useId, useMemo } from 'react';
import { DEFAULT_UNIT_OPTIONS, generateSku, type Product } from '../../../../domains/products';
import { type Category } from '../../../../services/categories';
import { validateProductDraft } from '../productValidation';
import { useCategoryStore } from '../stores/categoryStore';

export interface ProductFormProps {
  row: Product;
  onChange: (row: Product) => void;
  existingSkus: string[];
}

const ProductForm: React.FC<ProductFormProps> = ({ row, onChange, existingSkus }) => {
  const {
    items: categoryTree,
    loading: categoriesLoading,
    error: categoriesError,
    load: loadCategories,
  } = useCategoryStore();

  useEffect(() => {
    if (!categoriesLoading && categoryTree.length === 0) {
      void loadCategories().catch(() => undefined);
    }
  }, [categoriesLoading, categoryTree.length, loadCategories]);

  const { categoryOptions, subCategoryOptions } = useMemo(() => {
    const categories = new Set<string>();
    const subCategories = new Set<string>();

    const traverse = (nodes: Category[], depth: number) => {
      nodes.forEach((node) => {
        const name = node.name.trim();
        if (!name) {
          return;
        }
        if (depth === 0) {
          categories.add(name);
        } else {
          subCategories.add(name);
        }
        if (node.children.length > 0) {
          traverse(node.children, depth + 1);
        }
      });
    };

    traverse(categoryTree, 0);

    return {
      categoryOptions: Array.from(categories).sort((a, b) => a.localeCompare(b)),
      subCategoryOptions: Array.from(subCategories).sort((a, b) => a.localeCompare(b)),
    };
  }, [categoryTree]);

  const duplicateSku = useMemo(() => {
    const normalized = row.sku.trim().toUpperCase();
    if (!normalized) {
      return false;
    }
    return existingSkus.some((value) => value.trim().toUpperCase() === normalized);
  }, [existingSkus, row.sku]);

  const updateRow = useCallback(
    (patch: Partial<Product>) => {
      onChange({ ...row, ...patch });
    },
    [onChange, row],
  );

  const skuInputId = useId();
  const nameInputId = useId();
  const categoryListId = useId();
  const subCategoryListId = useId();

  const inputClassName =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';

  const handleSkuGenerate = useCallback(() => {
    const generated = generateSku(existingSkus);
    updateRow({ sku: generated });
  }, [existingSkus, updateRow]);

  const handleOptionalNumberChange = useCallback(
    (key: 'supplyPrice' | 'salePrice') =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.value.trim();
        if (!raw) {
          updateRow({ [key]: null } as Partial<Product>);
          return;
        }
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value)) {
          return;
        }
        updateRow({ [key]: Math.max(0, Math.round(value * 100) / 100) } as Partial<Product>);
      },
    [updateRow],
  );

  const handleSelectChange = useCallback(
    (key: keyof Product) =>
      (event: React.ChangeEvent<HTMLSelectElement>) => {
        updateRow({ [key]: event.target.value } as Partial<Product>);
      },
    [updateRow],
  );

  const validationMessage = useMemo(() => validateProductDraft(row), [row]);
  const showValidationMessage = useMemo(() => {
    if (!validationMessage) {
      return false;
    }

    const hasTyped =
      row.sku.trim().length > 0 ||
      row.name.trim().length > 0 ||
      row.category.trim().length > 0 ||
      row.subCategory.trim().length > 0;

    return hasTyped;
  }, [row.category, row.name, row.sku, row.subCategory, validationMessage]);

  return (
    <form className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={skuInputId} className="text-xs font-semibold text-slate-600">
            SKU
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={skuInputId}
              className={inputClassName}
              value={row.sku}
              onChange={(event) => updateRow({ sku: event.target.value })}
              placeholder="SKU 입력"
            />
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
              onClick={handleSkuGenerate}
            >
              자동생성
            </button>
          </div>
          {duplicateSku && (
            <p className="mt-1 text-xs text-rose-500">이미 사용 중인 SKU입니다.</p>
          )}
        </div>
        <div>
          <label htmlFor={nameInputId} className="text-xs font-semibold text-slate-600">
            품명
          </label>
          <input
            id={nameInputId}
            className={inputClassName}
            value={row.name}
            onChange={(event) => updateRow({ name: event.target.value })}
            placeholder="품명 입력"
          />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={row.isActive}
            onChange={(event) => updateRow({ isActive: event.target.checked })}
          />
          사용 여부
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor={categoryListId} className="text-xs font-semibold text-slate-600">
            카테고리
          </label>
          <input
            list={categoryListId}
            className={inputClassName}
            value={row.category}
            onChange={(event) => updateRow({ category: event.target.value })}
            placeholder="카테고리 선택"
          />
          <datalist id={categoryListId}>
            {categoryOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor={subCategoryListId} className="text-xs font-semibold text-slate-600">
            하위 카테고리
          </label>
          <input
            list={subCategoryListId}
            className={inputClassName}
            value={row.subCategory}
            onChange={(event) => updateRow({ subCategory: event.target.value })}
            placeholder="하위 카테고리 입력"
          />
          <datalist id={subCategoryListId}>
            {subCategoryOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>
      {categoriesError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {categoriesError}
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-slate-600">단위</label>
        <select className={inputClassName} value={row.unit} onChange={handleSelectChange('unit')}>
          {DEFAULT_UNIT_OPTIONS.map((unitOption) => (
            <option key={unitOption} value={unitOption}>
              {unitOption}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs font-semibold text-slate-600">매입가</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputClassName}
            value={row.supplyPrice ?? ''}
            onChange={handleOptionalNumberChange('supplyPrice')}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">판매가</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputClassName}
            value={row.salePrice ?? ''}
            onChange={handleOptionalNumberChange('salePrice')}
          />
        </div>
      </div>

      {(duplicateSku || showValidationMessage) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
          {duplicateSku ? '이미 사용 중인 SKU입니다. 다른 값을 입력해 주세요.' : validationMessage}
        </div>
      )}
    </form>
  );
};

export default ProductForm;
