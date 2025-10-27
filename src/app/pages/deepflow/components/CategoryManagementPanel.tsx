import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { type Category } from '../../../../services/categories';
import { useCategoryStore } from '../stores/categoryStore';
import CategoryManageDialog from './CategoryManageDialog';
import CategoryEditDialog from './CategoryEditDialog';
import ConfirmDialog from './ConfirmDialog';

type DialogState =
  | { type: 'addRoot' }
  | { type: 'addChild'; category: Category }
  | { type: 'edit'; category: Category }
  | { type: 'delete'; category: Category };

interface RenderRow {
  id: string;
  depth: number;
  item: Category;
  hasChildren: boolean;
  isExpanded: boolean;
}

const normalizeText = (value: string): string => value.trim().toLowerCase();

const flattenCategoryTree = (
  categories: Category[],
  parentId: string | null = null,
): Array<{ item: Category; parentId: string | null }> => {
  const result: Array<{ item: Category; parentId: string | null }> = [];
  categories.forEach((category) => {
    result.push({ item: category, parentId });
    if (category.children.length > 0) {
      result.push(...flattenCategoryTree(category.children, category.id));
    }
  });
  return result;
};

const CategoryManagementPanel: React.FC = () => {
  const { items, loading, saving, error, load, remove, clearError } = useCategoryStore();

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void load().catch(() => {
      /* handled by store */
    });
  }, [load]);

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      const flattened = flattenCategoryTree(items);
      flattened.forEach(({ item }) => {
        if (!(item.id in next)) {
          next[item.id] = true;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!flattened.some(({ item }) => item.id === id)) {
          delete next[id];
        }
      });
      return next;
    });
  }, [items]);

  const { rowsByParent, parentLookup } = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    const parent = new Map<string, string | null>();

    const walk = (nodes: Category[], parentId: string | null) => {
      if (!map.has(parentId)) {
        map.set(parentId, []);
      }
      const bucket = map.get(parentId)!;
      nodes.forEach((node) => {
        bucket.push(node);
        parent.set(node.id, parentId);
        walk(node.children, node.id);
      });
    };

    walk(items, null);
    return { rowsByParent: map, parentLookup: parent };
  }, [items]);

  const flattened = useMemo(() => flattenCategoryTree(items), [items]);

  const visibleRowIds = useMemo(() => {
    const query = normalizeText(search);
    if (!query) {
      return new Set(flattened.map(({ item }) => item.id));
    }

    const matches = new Set<string>();
    const ensureVisible = (id: string | null) => {
      if (!id) {
        return;
      }
      if (!matches.has(id)) {
        matches.add(id);
        ensureVisible(parentLookup.get(id) ?? null);
      }
    };

    flattened.forEach(({ item }) => {
      const combined = `${item.name} ${item.description ?? ''}`.toLowerCase();
      if (combined.includes(query)) {
        matches.add(item.id);
        ensureVisible(parentLookup.get(item.id) ?? null);
      }
    });

    return matches;
  }, [flattened, parentLookup, search]);

  const renderRows = useMemo<RenderRow[]>(() => {
    const result: RenderRow[] = [];
    const query = normalizeText(search);

    const walk = (parentId: string | null, depth: number) => {
      const children = rowsByParent.get(parentId) ?? [];
      children.forEach((child) => {
        if (query && !visibleRowIds.has(child.id)) {
          return;
        }

        const hasChildren = (rowsByParent.get(child.id) ?? []).length > 0;
        const isExpanded = query ? true : expanded[child.id] ?? true;

        result.push({
          id: child.id,
          depth,
          item: child,
          hasChildren,
          isExpanded,
        });

        if (hasChildren && (query || isExpanded)) {
          walk(child.id, depth + 1);
        }
      });
    };

    walk(null, 0);
    return result;
  }, [expanded, rowsByParent, search, visibleRowIds]);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);

  const handleRefresh = useCallback(() => {
    void load(search).catch(() => {
      /* handled by store */
    });
  }, [load, search]);

  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  const handleOpenAddRoot = useCallback(() => {
    setLocalError(null);
    setDialog({ type: 'addRoot' });
  }, []);

  const handleOpenAddChild = useCallback((category: Category) => {
    setLocalError(null);
    setDialog({ type: 'addChild', category });
  }, []);

  const handleOpenEdit = useCallback((category: Category) => {
    setLocalError(null);
    setDialog({ type: 'edit', category });
  }, []);

  const handleOpenDelete = useCallback((category: Category) => {
    setLocalError(null);
    setDialog({ type: 'delete', category });
  }, []);

  const handleDialogClose = useCallback(() => {
    setDialog(null);
  }, []);

  const handleEntryCompleted = useCallback(() => {
    setDialog(null);
    setLocalError(null);
    void load(search).catch(() => {
      /* handled by store */
    });
  }, [load, search]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!dialog || dialog.type !== 'delete') {
      return;
    }

    try {
      await remove(dialog.category.id);
      setDialog(null);
      setLocalError(null);
    } catch (deleteError) {
      if (deleteError instanceof Error && deleteError.message) {
        setLocalError(deleteError.message);
      } else {
        setLocalError('카테고리를 삭제하지 못했습니다.');
      }
    }
  }, [dialog, remove]);

  const handleErrorDismiss = useCallback(() => {
    setLocalError(null);
    clearError();
  }, [clearError]);

  const renderEmptyState = useMemo(() => {
    if (loading && renderRows.length === 0) {
      return '카테고리를 불러오는 중입니다...';
    }
    if (renderRows.length === 0) {
      return '등록된 카테고리가 없습니다.';
    }
    return null;
  }, [loading, renderRows]);

  const totalCount = useMemo(() => flattened.length, [flattened]);

  return (
    <div className="py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">카테고리 관리</h1>
          <p className="mt-1 text-sm text-slate-600">카테고리 구조를 정리하고 품목 분류 체계를 유지하세요.</p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <label className="relative block text-xs font-semibold uppercase tracking-wide text-slate-600">
            <span className="sr-only">카테고리 검색</span>
            <input
              type="search"
              value={search}
              onChange={handleSearchChange}
              placeholder="카테고리/하위 카테고리 검색"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            새로고침
          </button>
        </div>
      </div>

      {(error || localError) && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-start justify-between gap-4">
            <div className="font-medium">{localError ?? error ?? '처리 중 오류가 발생했습니다.'}</div>
            <button
              type="button"
              className="text-xs font-semibold text-red-600"
              onClick={handleErrorDismiss}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white/80 shadow-sm">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">카테고리 목록</h2>
            <p className="text-xs text-slate-500">총 {totalCount}개</p>
          </div>
        </header>

        <div role="table" className="max-h-[520px] overflow-y-auto">
          <div role="rowgroup" className="min-w-full divide-y divide-slate-200">
            <div
              role="row"
              className="grid grid-cols-[minmax(200px,2fr)_minmax(160px,1.4fr)_minmax(220px,1.6fr)] bg-slate-50 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              <div>카테고리</div>
              <div>하위 카테고리</div>
              <div className="text-right">작업</div>
            </div>

            {renderEmptyState ? (
              <div role="row" className="px-6 py-10 text-center text-sm text-slate-500">
                {renderEmptyState}
              </div>
            ) : (
              renderRows.map((row) => (
                <div
                  key={row.id}
                  role="row"
                  className="grid grid-cols-[minmax(200px,2fr)_minmax(160px,1.4fr)_minmax(220px,1.6fr)] items-center px-6 py-4 text-sm text-slate-700"
                  data-testid={`category-row-${row.id}`}
                >
                  <div className="flex items-center gap-2" style={{ paddingLeft: `${row.depth * 1.5}rem` }}>
                    <div className="flex h-8 items-center">
                      {row.hasChildren ? (
                        <button
                          type="button"
                          onClick={() => handleToggle(row.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs text-slate-500 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600"
                          aria-label={row.isExpanded ? '하위 카테고리 접기' : '하위 카테고리 펼치기'}
                        >
                          {row.isExpanded ? '−' : '+'}
                        </button>
                      ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center text-slate-300">•</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">{row.item.name || '이름 없음'}</span>
                      {(row.item.description ?? '').trim().length > 0 && (
                        <span className="text-xs text-slate-500">{row.item.description}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-slate-600">
                    {row.item.children.length > 0
                      ? `${row.item.children.length.toLocaleString()}개`
                      : '없음'}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenAddChild(row.item)}
                      className="rounded-lg border border-dashed border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50"
                    >
                      하위 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(row.item)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDelete(row.item)}
                      disabled={saving}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 text-sm text-slate-600">
          <div>{saving ? '변경 사항을 저장 중입니다...' : '카테고리 구조를 정리하고 필요에 따라 분류를 추가하세요.'}</div>
          <button
            type="button"
            onClick={handleOpenAddRoot}
            className="rounded-lg border border-dashed border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            + 항목 추가
          </button>
        </footer>
      </section>

      <CategoryManageDialog
        mode="category"
        open={dialog?.type === 'addRoot'}
        onClose={handleDialogClose}
        onCompleted={handleEntryCompleted}
      />

      {dialog?.type === 'addChild' && (
        <CategoryManageDialog
          mode="subCategory"
          open
          initialCategory={dialog.category.name}
          onClose={handleDialogClose}
          onCompleted={handleEntryCompleted}
        />
      )}

      {dialog?.type === 'edit' && (
        <CategoryEditDialog
          open
          category={dialog.category}
          onClose={handleDialogClose}
          onCompleted={handleEntryCompleted}
        />
      )}

      {dialog?.type === 'delete' && (
        <ConfirmDialog
          open
          title="카테고리 삭제"
          message={
            dialog.category.children.length > 0
              ? '하위 카테고리가 존재합니다. 먼저 하위 항목을 삭제한 뒤 다시 시도해주세요.'
              : `'${dialog.category.name}' 카테고리를 삭제하시겠습니까?`
          }
          confirmLabel="삭제"
          confirmTone="danger"
          onCancel={handleDialogClose}
          onConfirm={
            dialog.category.children.length > 0
              ? handleDialogClose
              : handleDeleteConfirm
          }
          confirmDisabled={saving || dialog.category.children.length > 0}
        />
      )}
    </div>
  );
};

export default CategoryManagementPanel;

