import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { type Category } from '../../../../services/categories';
import { useCategoryStore } from '../stores/categoryStore';

interface CategoryEditDialogProps {
  open: boolean;
  category: Category;
  onClose: () => void;
  onCompleted?: (category: Category) => void;
}

const inputClassName =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

const labelClassName = 'text-xs font-semibold uppercase tracking-wide text-slate-600';

const CategoryEditDialog: React.FC<CategoryEditDialogProps> = ({ open, category, onClose, onCompleted }) => {
  const { update, saving, error, clearError } = useCategoryStore();

  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(category.name);
    setDescription(category.description ?? '');
    setFormError(null);
    clearError();
  }, [category.description, category.name, clearError, open]);

  const handleClose = useCallback(() => {
    if (saving) {
      return;
    }
    onClose();
  }, [onClose, saving]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedName = name.trim();
      if (!trimmedName) {
        setFormError('카테고리 이름을 입력해주세요.');
        return;
      }

      try {
        setFormError(null);
        const updated = await update(category.id, {
          name: trimmedName,
          description: description.trim() || undefined,
          parentId: category.parentId,
        });
        onCompleted?.(updated);
        onClose();
      } catch (submitError) {
        if (submitError instanceof Error && submitError.message) {
          setFormError(submitError.message);
        } else {
          setFormError('카테고리를 수정하지 못했습니다.');
        }
      }
    },
    [category.id, category.parentId, description, name, onClose, onCompleted, update],
  );

  const activeError = useMemo(() => formError ?? error ?? null, [error, formError]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-edit-dialog-title"
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="category-edit-dialog-title" className="text-lg font-semibold text-slate-800">
            카테고리 수정
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
          <label className="flex flex-col gap-2">
            <span className={labelClassName}>카테고리 이름</span>
            <input
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFormError(null);
              }}
              className={inputClassName}
              placeholder="예: 식품"
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={labelClassName}>설명 (선택)</span>
            <textarea
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setFormError(null);
              }}
              className={`${inputClassName} min-h-[96px]`}
              placeholder="카테고리 용도나 설명을 입력하세요."
            />
          </label>

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

export default CategoryEditDialog;

