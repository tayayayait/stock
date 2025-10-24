import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { type Category } from '../../../../services/categories';
import { useCategoryStore } from '../stores/categoryStore';

interface CategoryFormState {
  name: string;
  description: string;
}

interface RowEntry {
  id: string;
  parentId: string | null;
  isNew: boolean;
  item: Category | null;
}

interface RenderRow extends RowEntry {
  depth: number;
  draft: CategoryFormState;
  isEditing: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
}

const createInitialFormState = (): CategoryFormState => ({
  name: '',
  description: '',
});

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

const getDisplayValues = (
  entry: RowEntry,
  drafts: Record<string, CategoryFormState>,
): CategoryFormState => {
  if (entry.item) {
    return {
      name: entry.item.name,
      description: entry.item.description ?? '',
    };
  }

  return drafts[entry.id] ?? createInitialFormState();
};

const CategoryManagementPanel: React.FC = () => {
  const { items, loading, saving, error, load, create, update, remove, clearError } =
    useCategoryStore();

  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [hierarchy, setHierarchy] = useState<Record<string, string | null>>({});
  const [localRows, setLocalRows] = useState<RowEntry[]>([]);
  const [rowModes, setRowModes] = useState<Record<string, 'view' | 'edit'>>({});
  const [drafts, setDrafts] = useState<Record<string, CategoryFormState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    void load().catch(() => {
      /* handled by store error state */
    });
  }, [load]);

  useEffect(() => {
    setHierarchy((prev) => {
      const next = { ...prev };
      const flattened = flattenCategoryTree(items);
      flattened.forEach(({ item, parentId }) => {
        next[item.id] = parentId ?? null;
      });

      const knownIds = new Set<string>([
        ...flattened.map(({ item }) => item.id),
        ...localRows.map((row) => row.id),
      ]);
      Object.keys(next).forEach((key) => {
        if (!knownIds.has(key)) {
          delete next[key];
        }
      });

      return next;
    });
  }, [items, localRows]);

  useEffect(() => {
    if (!pendingFocusId) {
      return;
    }

    const element = nameRefs.current[pendingFocusId];
    if (element) {
      element.focus();
      element.select?.();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, rowModes]);

  const allRows = useMemo((): RowEntry[] => {
    const entryMap = new Map<string, RowEntry>();

    const flattened = flattenCategoryTree(items);
    flattened.forEach(({ item, parentId }) => {
      const effectiveParentId = hierarchy[item.id] ?? parentId ?? null;
      entryMap.set(item.id, {
        id: item.id,
        parentId: effectiveParentId,
        isNew: false,
        item,
      });
    });

    localRows.forEach((row) => {
      entryMap.set(row.id, {
        ...row,
        parentId: hierarchy[row.id] ?? row.parentId,
      });
    });

    return Array.from(entryMap.values());
  }, [hierarchy, items, localRows]);

  const rowsByParent = useMemo(() => {
    const map = new Map<string | null, RowEntry[]>();
    const ensure = (key: string | null) => {
      if (!map.has(key)) {
        map.set(key, []);
      }
      return map.get(key)!;
    };

    const flattened = flattenCategoryTree(items);
    flattened.forEach(({ item, parentId }) => {
      const effectiveParentId = hierarchy[item.id] ?? parentId ?? null;
      ensure(effectiveParentId).push({
        id: item.id,
        parentId: effectiveParentId,
        isNew: false,
        item,
      });
    });

    localRows.forEach((row) => {
      const parentId = hierarchy[row.id] ?? row.parentId ?? null;
      ensure(parentId).push(row);
    });

    return map;
  }, [hierarchy, items, localRows]);

  const parentLookup = useMemo(() => {
    const map = new Map<string, string | null>();
    allRows.forEach((row) => {
      map.set(row.id, row.parentId ?? null);
    });
    return map;
  }, [allRows]);

  const visibleRowIds = useMemo(() => {
    const query = normalizeText(search);
    if (!query) {
      return new Set(allRows.map((row) => row.id));
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

    allRows.forEach((row) => {
      const values = getDisplayValues(row, drafts);
      const combined = `${values.name} ${values.description}`.toLowerCase();
      if (combined.includes(query)) {
        matches.add(row.id);
        ensureVisible(parentLookup.get(row.id) ?? null);
      }
    });

    return matches;
  }, [allRows, drafts, parentLookup, search]);

  const renderRows = useMemo((): RenderRow[] => {
    const result: RenderRow[] = [];
    const visited = new Set<string>();
    const query = normalizeText(search);

    const walk = (parentId: string | null, depth: number) => {
      const children = rowsByParent.get(parentId) ?? [];
      children.forEach((child) => {
        if (visited.has(child.id)) {
          return;
        }
        visited.add(child.id);

        if (query && !visibleRowIds.has(child.id)) {
          const childEntries = rowsByParent.get(child.id) ?? [];
          const shouldTraverse = childEntries.some((entry) => visibleRowIds.has(entry.id));
          if (!shouldTraverse) {
            return;
          }
        }

        const hasChildren = (rowsByParent.get(child.id) ?? []).length > 0;
        const isExpanded = expanded[child.id] ?? true;
        const isEditing = rowModes[child.id] === 'edit';
        const draft = isEditing
          ? drafts[child.id] ?? getDisplayValues(child, drafts)
          : getDisplayValues(child, drafts);

        result.push({
          ...child,
          depth,
          draft,
          isEditing,
          hasChildren,
          isExpanded,
        });

        if ((isExpanded || query) && hasChildren) {
          walk(child.id, depth + 1);
        }
      });
    };

    walk(null, 0);
    return result;
  }, [drafts, expanded, rowModes, rowsByParent, search, visibleRowIds]);

  const collectDescendants = useCallback(
    (targetId: string): string[] => {
      const collected: string[] = [];
      const stack = [targetId];

      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
          continue;
        }
        const children = rowsByParent.get(current) ?? [];
        children.forEach((child) => {
          collected.push(child.id);
          stack.push(child.id);
        });
      }

      return collected;
    },
    [rowsByParent],
  );

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  }, []);

  const handleRefresh = useCallback(() => {
    void load(search).catch(() => {
      /* handled by store */
    });
  }, [load, search]);

  const registerNameRef = useCallback((id: string, element: HTMLInputElement | null) => {
    nameRefs.current[id] = element;
  }, []);

  const beginEdit = useCallback(
    (id: string, entry: RowEntry) => {
      setRowModes((prev) => ({ ...prev, [id]: 'edit' }));
      setDrafts((prev) => ({
        ...prev,
        [id]: entry.item
          ? { name: entry.item.name, description: entry.item.description ?? '' }
          : prev[id] ?? createInitialFormState(),
      }));
      setFormError(null);
      setPendingFocusId(id);
    },
    [],
  );

  const addRow = useCallback(
    (parentId: string | null) => {
      const newId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const draft = createInitialFormState();
      setLocalRows((prev) => [
        ...prev,
        {
          id: newId,
          parentId,
          isNew: true,
          item: null,
        },
      ]);
      setHierarchy((prev) => ({ ...prev, [newId]: parentId }));
      setRowModes((prev) => ({ ...prev, [newId]: 'edit' }));
      setDrafts((prev) => ({ ...prev, [newId]: draft }));
      if (parentId) {
        setExpanded((prev) => ({ ...prev, [parentId]: true }));
      }
      setPendingFocusId(newId);
    },
    [],
  );

  const handleAddRoot = useCallback(() => {
    addRow(null);
  }, [addRow]);

  const handleAddChild = useCallback(
    (parentId: string) => {
      addRow(parentId);
    },
    [addRow],
  );

  const handleDraftChange = useCallback(
    (id: string, field: keyof CategoryFormState, value: string) => {
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          [field]: value,
        },
      }));
      setFormError(null);
    },
    [],
  );

  const cleanupRowState = useCallback((id: string) => {
    setRowModes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setHierarchy((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExpanded((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleCancel = useCallback(
    (id: string) => {
      const localEntry = localRows.find((row) => row.id === id);
      if (localEntry) {
        const descendants = collectDescendants(id);
        setLocalRows((prev) => prev.filter((row) => row.id !== id && !descendants.includes(row.id)));
        cleanupRowState(id);
        descendants.forEach((childId) => {
          cleanupRowState(childId);
        });
      } else {
        setRowModes((prev) => ({ ...prev, [id]: 'view' }));
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      setFormError(null);
    },
    [cleanupRowState, collectDescendants, localRows],
  );

  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  const handleSave = useCallback(
    async (id: string, entry: RowEntry) => {
      const draft = drafts[id] ?? createInitialFormState();
      const name = draft.name.trim();
      const description = draft.description.trim();

      if (!name) {
        setFormError('카테고리 이름을 입력해 주세요.');
        setPendingFocusId(id);
        return;
      }

      try {
        if (entry.isNew || !entry.item) {
          const created = await create({ name, description, parentId: entry.parentId ?? null });
          setLocalRows((prev) => prev.filter((row) => row.id !== id));
          cleanupRowState(id);
          setHierarchy((prev) => ({ ...prev, [created.id]: created.parentId ?? entry.parentId ?? null }));
          if (entry.parentId) {
            setExpanded((prev) => ({ ...prev, [entry.parentId!]: true }));
          }
        } else {
          await update(entry.id, { name, description, parentId: entry.parentId ?? null });
          setRowModes((prev) => ({ ...prev, [id]: 'view' }));
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
        setFormError(null);
      } catch (submitError) {
        if (submitError instanceof Error && submitError.message) {
          setFormError(submitError.message);
        }
      }
    },
    [cleanupRowState, create, drafts, setHierarchy, update],
  );

  const handleDelete = useCallback(
    async (id: string, entry: RowEntry) => {
      const descendants = collectDescendants(id);
      try {
        if (entry.isNew || !entry.item) {
          setLocalRows((prev) => prev.filter((row) => row.id !== id && !descendants.includes(row.id)));
          cleanupRowState(id);
          descendants.forEach((childId) => {
            cleanupRowState(childId);
          });
        } else {
          await remove(id);
          cleanupRowState(id);
          descendants.forEach((childId) => {
            cleanupRowState(childId);
          });
        }
        setFormError(null);
      } catch (deleteError) {
        if (deleteError instanceof Error && deleteError.message) {
          setFormError(deleteError.message);
        }
      }
    },
    [cleanupRowState, collectDescendants, localRows, remove],
  );

  const handleErrorDismiss = useCallback(() => {
    setFormError(null);
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

  return (
    <div className="py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">카테고리 관리</h1>
          <p className="mt-1 text-sm text-slate-600">
            카테고리 구조를 정리하고 품목과 연계되는 분류 체계를 유지하세요.
          </p>
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

      {(error || formError) && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-start justify-between gap-4">
            <div className="font-medium">{formError ?? error ?? '처리 중 오류가 발생했습니다.'}</div>
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
            <p className="text-xs text-slate-500">총 {items.length}개</p>
          </div>
        </header>

        <div role="table" className="max-h-[520px] overflow-y-auto">
          <div role="rowgroup" className="min-w-full divide-y divide-slate-200">
            <div
              role="row"
              className="grid grid-cols-[minmax(200px,2fr)_minmax(160px,1.4fr)_minmax(220px,1.2fr)] bg-slate-50 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500"
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
              renderRows.map((row) => {
                const values = getDisplayValues(row, drafts);
                const nameValue = row.isEditing ? drafts[row.id]?.name ?? '' : values.name;
                const descriptionValue = row.isEditing
                  ? drafts[row.id]?.description ?? ''
                  : values.description;

                return (
                  <div
                    key={row.id}
                    role="row"
                    className="grid grid-cols-[minmax(200px,2fr)_minmax(160px,1.4fr)_minmax(220px,1.2fr)] items-start px-6 py-4 text-sm text-slate-700"
                    data-testid={`category-row-${row.id}`}
                  >
                    <div className="flex items-start gap-2" style={{ paddingLeft: `${row.depth * 1.5}rem` }}>
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
                      <div className="flex-1">
                        {row.isEditing ? (
                          <input
                            ref={(element) => registerNameRef(row.id, element)}
                            value={nameValue}
                            onChange={(event) => handleDraftChange(row.id, 'name', event.target.value)}
                            placeholder="카테고리를 입력하세요"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        ) : (
                          <div className="font-semibold text-slate-900">{nameValue || '이름 없음'}</div>
                        )}
                      </div>
                    </div>

                    <div className="pr-4">
                      {row.isEditing ? (
                        <textarea
                          value={descriptionValue}
                          onChange={(event) => handleDraftChange(row.id, 'description', event.target.value)}
                          placeholder="하위 카테고리를 입력하세요"
                          rows={2}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      ) : (
                        <div className="text-sm text-slate-600">{descriptionValue || '하위 카테고리 없음'}</div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      {row.isEditing ? (
                        <>
                          {!row.isNew && row.item ? (
                            <button
                              type="button"
                              onClick={() => handleDelete(row.id, row)}
                              disabled={saving}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              삭제
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleCancel(row.id)}
                            disabled={saving}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSave(row.id, row)}
                            disabled={saving}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            저장
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => beginEdit(row.id, row)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row.id, row)}
                            disabled={saving}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 text-sm text-slate-600">
          <div>{saving ? '변경 사항을 저장하는 중입니다…' : '카테고리 구조를 유지하고 필요한 항목을 추가하세요.'}</div>
          <button
            type="button"
            onClick={handleAddRoot}
            className="rounded-lg border border-dashed border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            + 항목 추가
          </button>
        </footer>
      </section>
    </div>
  );
};

export default CategoryManagementPanel;
