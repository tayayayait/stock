import React, { FormEvent, useCallback, useEffect, useState } from 'react';

import { type Category } from '../../../../services/categories';
import { useCategoryStore } from '../stores/categoryStore';

const findCategoryByName = (categories: readonly Category[], target: string): Category | null => {
  const normalized = target.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const category of categories) {
    if (category.name.trim().toLowerCase() === normalized) {
      return category;
    }
    const found = findCategoryByName(category.children ?? [], target);
    if (found) {
      return found;
    }
  }

  return null;
};

interface CategoryManageDialogProps {
  mode: 'category' | 'subCategory';
  open: boolean;
  onClose: () => void;
  onCompleted: (entry: { category: string; subCategory?: string }) => void;
  initialCategory?: string;
}

const inputClassName =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

const labelClassName = 'text-xs font-semibold uppercase tracking-wide text-slate-600';

const CategoryManageDialog: React.FC<CategoryManageDialogProps> = ({
  mode,
  open,
  onClose,
  onCompleted,
  initialCategory,
}) => {
  const { items, create, saving, error, clearError } = useCategoryStore();
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isCategoryMode = mode === 'category';
  const isSubCategoryMode = mode === 'subCategory';
  const shouldLockCategory = isSubCategoryMode;

  useEffect(() => {
    if (!open) {
      return;
    }

    setCategory(initialCategory?.trim() ?? '');
    setSubCategory('');
    setFormError(null);
    clearError();
  }, [clearError, initialCategory, open]);

  useEffect(() => {
    if (!open) {
      setCategory('');
      setSubCategory('');
      setFormError(null);
    }
  }, [open]);

  const handleClose = useCallback(() => {
    if (saving) {
      return;
    }
    onClose();
  }, [onClose, saving]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedCategory = category.trim();
      const trimmedSubCategory = subCategory.trim();

      if (!trimmedCategory) {
        setFormError('카테고리 이름을 입력해 주세요.');
        return;
      }

      if (isSubCategoryMode && !trimmedSubCategory) {
        setFormError('하위 카테고리 이름을 입력해 주세요.');
        return;
      }

      setFormError(null);

      try {
        if (isCategoryMode) {
          const created = await create({ name: trimmedCategory });
          onCompleted({ category: created.name });
        } else {
          const parent = findCategoryByName(items, trimmedCategory);
          if (!parent || !parent.id) {
            setFormError('선택한 상위 카테고리를 찾을 수 없습니다.');
            return;
          }
          const created = await create({ name: trimmedSubCategory, parentId: parent.id });
          onCompleted({ category: parent.name, subCategory: created.name });
        }
        onClose();
      } catch (submitError) {
        if (submitError instanceof Error && submitError.message) {
          setFormError(submitError.message);
        } else {
          setFormError('카테고리를 저장하지 못했습니다.');
        }
      }
    },
    [category, create, isCategoryMode, isSubCategoryMode, items, onClose, onCompleted, subCategory],
  );

  const activeError = formError ?? error ?? null;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-manage-dialog-title"
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="category-manage-dialog-title" className="text-lg font-semibold text-slate-800">
            카테고리 관리
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-slate-200 px-2 py-1 text-sm text-slate-500 hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
          >
            닫기
          </button>
        </div>
        <form className="space-y-5 px-5 py-6 text-sm text-slate-700" onSubmit={handleSubmit}>
          <p className="text-slate-500">카테고리와 필요하다면 하위 카테고리를 추가하세요.</p>
          <label className="flex flex-col gap-2">
            <span className={labelClassName}>카테고리 이름</span>
            <input
              type="text"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setFormError(null);
              }}
              className={inputClassName}
              placeholder="예: 식품"
              autoFocus={isCategoryMode}
              disabled={shouldLockCategory}
            />
          </label>
          {isSubCategoryMode ? (
            <label className="flex flex-col gap-2">
              <span className={labelClassName}>하위 카테고리</span>
              <input
                type="text"
                value={subCategory}
                onChange={(event) => {
                  setSubCategory(event.target.value);
                  setFormError(null);
                }}
                className={inputClassName}
                placeholder="예: 간식"
                autoFocus
              />
            </label>
          ) : null}
          {activeError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{activeError}</p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
              disabled={saving}
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CategoryManageDialog;
