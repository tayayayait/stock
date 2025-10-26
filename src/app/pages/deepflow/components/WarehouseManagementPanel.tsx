import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  createLocation,
  createWarehouse,
  deleteWarehouse,
  deleteLocation,
  fetchLocations,
  fetchWarehouses,
  type ApiLocation,
  type ApiWarehouse,
  updateLocation,
  updateWarehouse,
} from '../../../../services/api';
import { generateWarehouseCode } from '../../../../utils/warehouse';

interface WarehouseManagementPanelProps {
  refreshToken: number;
  onRequestReload: () => void;
}

interface CreateWarehouseLocationFormState {
  name: string;
  detailLocation: string;
  memo: string;
}

interface CreateWarehouseLocationFormTouched {
  name: boolean;
  detailLocation: boolean;
  memo: boolean;
}

type WarehouseLocationRow = { warehouse: ApiWarehouse; location: ApiLocation | null };

const INITIAL_CREATE_FORM: CreateWarehouseLocationFormState = {
  name: '',
  detailLocation: '',
  memo: '',
};

const INITIAL_CREATE_TOUCHED: CreateWarehouseLocationFormTouched = {
  name: false,
  detailLocation: false,
  memo: false,
};

const INITIAL_EDIT_FORM: CreateWarehouseLocationFormState = {
  name: '',
  detailLocation: '',
  memo: '',
};

const INITIAL_EDIT_TOUCHED: CreateWarehouseLocationFormTouched = {
  name: false,
  detailLocation: false,
  memo: false,
};

const WarehouseManagementPanel: React.FC<WarehouseManagementPanelProps> = ({ refreshToken, onRequestReload }) => {
  const [warehouses, setWarehouses] = useState<ApiWarehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const [warehousesError, setWarehousesError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateWarehouseLocationFormState>(INITIAL_CREATE_FORM);
  const [createFormTouched, setCreateFormTouched] =
    useState<CreateWarehouseLocationFormTouched>(INITIAL_CREATE_TOUCHED);
  const [createSubmitError, setCreateSubmitError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTargetRow, setEditTargetRow] = useState<WarehouseLocationRow | null>(null);
  const [editForm, setEditForm] = useState<CreateWarehouseLocationFormState>(INITIAL_EDIT_FORM);
  const [editFormTouched, setEditFormTouched] =
    useState<CreateWarehouseLocationFormTouched>(INITIAL_EDIT_TOUCHED);
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [locationsByWarehouse, setLocationsByWarehouse] = useState<Record<string, ApiLocation[]>>({});
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  const [locationRefreshToken, setLocationRefreshToken] = useState(0);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmTargetRow, setConfirmTargetRow] = useState<WarehouseLocationRow | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  const loadWarehouses = useCallback(async (query: string) => {
    setWarehousesLoading(true);
    setWarehousesError(null);
    setSearchError(null);
    try {
      const response = await fetchWarehouses({
        pageSize: 100,
        ...(query ? { q: query } : {}),
      });
      const items = Array.isArray(response.items) ? response.items : [];
      setWarehouses(items);
    } catch (error) {
      const fallback = query ? '검색 결과를 불러오지 못했습니다.' : '창고 목록을 불러오지 못했습니다.';
      const message = error instanceof Error && error.message ? error.message : fallback;
      if (query) {
        setSearchError(message);
      } else {
        setWarehousesError(message);
      }
      setWarehouses([]);
    } finally {
      setWarehousesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWarehouses(searchQuery);
  }, [loadWarehouses, refreshToken, searchQuery]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (warehouses.length === 0) {
        setLocationsByWarehouse({});
        setLocationsError(null);
        setLocationsLoading(false);
        return;
      }

      setLocationsLoading(true);
      setLocationsError(null);
      const results = await Promise.allSettled(
        warehouses.map(async (warehouse) => {
          const response = await fetchLocations(warehouse.code, { pageSize: 200 });
          const items = Array.isArray(response.items) ? response.items : [];
          return { warehouseCode: warehouse.code, items };
        }),
      );

      if (cancelled) {
        return;
      }

      const nextMap: Record<string, ApiLocation[]> = {};
      const failedWarehouses: string[] = [];

      results.forEach((result, index) => {
        const warehouse = warehouses[index];
        if (result.status === 'fulfilled') {
          nextMap[result.value.warehouseCode] = result.value.items;
        } else if (warehouse) {
          failedWarehouses.push(warehouse.name ?? warehouse.code);
        }
      });

      setLocationsByWarehouse(nextMap);

      if (failedWarehouses.length > 0) {
        setLocationsError(`${failedWarehouses.join(', ')} 위치를 불러오지 못했습니다.`);
      }

      setLocationsLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [warehouses, locationRefreshToken, refreshToken]);

  const tableRows = useMemo(() => {
    if (warehouses.length === 0) {
      return [] as Array<WarehouseLocationRow & { id: string }>;
    }

    return warehouses.flatMap((warehouse) => {
      const entries = locationsByWarehouse[warehouse.code] ?? [];
      if (entries.length === 0) {
        return [{ id: `warehouse-${warehouse.id}`, warehouse, location: null }];
      }

      return entries.map((location) => ({
        id: `location-${location.id ?? `${warehouse.code}-${location.code}`}`,
        warehouse,
        location,
      }));
    });
  }, [locationsByWarehouse, warehouses]);

  const handleSearchInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value);
    setSearchError(null);
  }, []);

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = searchInput.trim();
      setSearchInput(trimmed);
      setSearchError(null);
      if (trimmed === searchQuery) {
        void loadWarehouses(trimmed);
        return;
      }
      setSearchQuery(trimmed);
    },
    [loadWarehouses, searchInput, searchQuery],
  );

  const handleSearchReset = useCallback(() => {
    setSearchInput('');
    setSearchError(null);
    if (searchQuery) {
      setSearchQuery('');
      return;
    }
    void loadWarehouses('');
  }, [loadWarehouses, searchQuery]);

  const handleOpenCreateDialog = useCallback(() => {
    setCreateForm(INITIAL_CREATE_FORM);
    setCreateFormTouched(INITIAL_CREATE_TOUCHED);
    setCreateSubmitError(null);
    setCreateDialogOpen(true);
  }, []);

  const handleCloseCreateDialog = useCallback(() => {
    if (createSubmitting) {
      return;
    }
    setCreateDialogOpen(false);
  }, [createSubmitting]);

  const handleCreateFormChange = useCallback(
    (field: keyof CreateWarehouseLocationFormState, value: string) => {
      setCreateForm((prev) => ({ ...prev, [field]: value }));
      setCreateSubmitError(null);
    },
    [],
  );

  const handleCreateFormBlur = useCallback((field: keyof CreateWarehouseLocationFormTouched) => {
    setCreateFormTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handleCreateWarehouseWithLocation = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (createSubmitting) {
        return;
      }

      const trimmedName = createForm.name.trim();
      const trimmedDetailLocation = createForm.detailLocation.trim();
      const trimmedMemo = createForm.memo.trim();

      const nextTouched: CreateWarehouseLocationFormTouched = {
        name: true,
        detailLocation: true,
        memo: true,
      };
      setCreateFormTouched(nextTouched);

      if (!trimmedName) {
        return;
      }

      setCreateSubmitting(true);
      setCreateSubmitError(null);

      try {
        const code = generateWarehouseCode(trimmedName);
        const warehouse = await createWarehouse({
          code,
          name: trimmedName,
          notes: trimmedMemo,
        });
        if (!warehouse?.id) {
          throw new Error('생성된 창고 정보를 확인할 수 없습니다.');
        }

        if (trimmedDetailLocation) {
          await createLocation({
            warehouseCode: warehouse.code,
            code: trimmedDetailLocation,
            description: trimmedMemo,
          });
        }

        setCreateDialogOpen(false);
        setCreateForm(INITIAL_CREATE_FORM);
        setCreateFormTouched(INITIAL_CREATE_TOUCHED);
        setLocationRefreshToken((value) => value + 1);
        onRequestReload();
        await loadWarehouses(searchQuery);
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : '창고를 저장하지 못했습니다. 다시 시도해주세요.';
        setCreateSubmitError(message);
      } finally {
        setCreateSubmitting(false);
      }
    },
    [createForm, createSubmitting, loadWarehouses, onRequestReload, searchQuery],
  );

  const handleManualReload = useCallback(() => {
    setLocationRefreshToken((value) => value + 1);
    onRequestReload();
    void loadWarehouses(searchQuery);
  }, [loadWarehouses, onRequestReload, searchQuery]);

  const resetEditState = useCallback(() => {
    setEditTargetRow(null);
    setEditForm(INITIAL_EDIT_FORM);
    setEditFormTouched(INITIAL_EDIT_TOUCHED);
    setEditSubmitError(null);
  }, []);

  const handleEditRow = useCallback((row: WarehouseLocationRow) => {
    setEditTargetRow(row);
    setEditForm({
      name: row.warehouse.name ?? '',
      detailLocation: row.location?.code ?? '',
      memo: row.location?.description ?? row.warehouse.notes ?? '',
    });
    setEditFormTouched(INITIAL_EDIT_TOUCHED);
    setEditSubmitError(null);
    setEditDialogOpen(true);
  }, []);

  const handleCloseEditDialog = useCallback(() => {
    if (editSubmitting) {
      return;
    }
    setEditDialogOpen(false);
  }, [editSubmitting]);

  useEffect(() => {
    if (!editDialogOpen) {
      resetEditState();
      setEditSubmitting(false);
    }
  }, [editDialogOpen, resetEditState]);

  const handleEditFormChange = useCallback((field: keyof CreateWarehouseLocationFormState, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    setEditSubmitError(null);
  }, []);

  const handleEditFormBlur = useCallback((field: keyof CreateWarehouseLocationFormTouched) => {
    setEditFormTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handleSubmitEditForm = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editTargetRow || editSubmitting) {
        return;
      }

      const trimmedName = editForm.name.trim();
      const trimmedDetailLocation = editForm.detailLocation.trim();
      const trimmedMemo = editForm.memo.trim();
      const editingLocation = Boolean(editTargetRow.location);

      const touched: CreateWarehouseLocationFormTouched = {
        name: true,
        detailLocation: true,
        memo: true,
      };
      setEditFormTouched(touched);

      const nameInvalid = trimmedName === '';
      const detailInvalid = editingLocation && trimmedDetailLocation === '';
      const memoInvalid = editingLocation && trimmedMemo === '';

      if (nameInvalid || detailInvalid || memoInvalid) {
        return;
      }

      setEditSubmitting(true);
      setEditSubmitError(null);
      setWarehousesError(null);
      setLocationsError(null);

      try {
        await updateWarehouse(editTargetRow.warehouse.code, {
          name: trimmedName,
          ...(editingLocation ? {} : { notes: trimmedMemo }),
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : '창고를 수정하지 못했습니다.';
        setWarehousesError(message);
        setEditSubmitError(message);
        setEditSubmitting(false);
        return;
      }

      if (editingLocation && editTargetRow.location) {
        try {
          await updateLocation(editTargetRow.location.code, {
            warehouseCode: editTargetRow.warehouse.code,
            code: trimmedDetailLocation,
            description: trimmedMemo,
          });
        } catch (error) {
          const message =
            error instanceof Error && error.message ? error.message : '위치를 수정하지 못했습니다.';
          setLocationsError(message);
          setEditSubmitError(message);
          setEditSubmitting(false);
          return;
        }
      }

      setLocationRefreshToken((value) => value + 1);

      await loadWarehouses(searchQuery);
      onRequestReload();
      setEditDialogOpen(false);
      setEditSubmitting(false);
    },
    [editForm, editSubmitting, editTargetRow, loadWarehouses, onRequestReload, searchQuery],
  );

  const handleDeleteRow = useCallback((row: WarehouseLocationRow) => {
    setConfirmTargetRow(row);
    setConfirmDialogOpen(true);
  }, []);

  const handleCloseConfirmDialog = useCallback(() => {
    if (confirmSubmitting) {
      return;
    }
    setConfirmDialogOpen(false);
    setConfirmTargetRow(null);
  }, [confirmSubmitting]);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmTargetRow) {
      return;
    }

    const row = confirmTargetRow;
    const locations = locationsByWarehouse[row.warehouse.code] ?? [];
    const isLocationRow = Boolean(row.location);
    const isLastLocation = isLocationRow && locations.length <= 1;

    try {
      setWarehousesError(null);
      setLocationsError(null);
      setConfirmSubmitting(true);

      if (isLocationRow && row.location) {
        await deleteLocation(row.location.code);
        if (isLastLocation) {
          await deleteWarehouse(row.warehouse.code);
        }
      } else {
        await deleteWarehouse(row.warehouse.code);
      }

      setConfirmDialogOpen(false);
      setConfirmTargetRow(null);
      setLocationRefreshToken((value) => value + 1);
      await loadWarehouses(searchQuery);
      onRequestReload();
    } catch (error) {
      const fallbackMessage = isLocationRow
        ? 'Failed to delete location.'
        : 'Failed to delete warehouse.';
      const message = error instanceof Error && error.message ? error.message : fallbackMessage;

      if (isLocationRow) {
        setLocationsError(message);
      } else {
        setWarehousesError(message);
      }
    } finally {
      setConfirmSubmitting(false);
    }
  }, [confirmTargetRow, locationsByWarehouse, loadWarehouses, onRequestReload, searchQuery]);

  const nameError = !createForm.name.trim() && createFormTouched.name ? '창고 이름을 입력해 주세요.' : null;
  const canSubmitCreateForm = createForm.name.trim() !== '' && !createSubmitting;

  const isEditingLocation = Boolean(editTargetRow?.location);
  const editNameError = !editForm.name.trim() && editFormTouched.name ? '창고 이름을 입력해 주세요.' : null;
  const editDetailLocationError =
    isEditingLocation && !editForm.detailLocation.trim() && editFormTouched.detailLocation
      ? '상세 위치 코드를 입력해 주세요.'
      : null;
  const editMemoError =
    isEditingLocation && !editForm.memo.trim() && editFormTouched.memo
      ? '메모를 입력해 주세요.'
      : null;
  const canSubmitEditForm =
    Boolean(editTargetRow) &&
    editForm.name.trim() !== '' &&
    (!isEditingLocation || (editForm.detailLocation.trim() !== '' && editForm.memo.trim() !== '')) &&
    !editSubmitting;

  return (
    <div className="py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">창고 관리</h1>
          <p className="text-sm text-slate-500">창고와 보관 위치를 등록하고 관리하세요.</p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <form className="flex flex-wrap items-center gap-2" onSubmit={handleSearchSubmit}>
              <input
                type="search"
                value={searchInput}
                onChange={handleSearchInputChange}
                className="w-48 rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-slate-700 shadow-inner focus:border-indigo-400 focus:outline-none sm:w-60"
                placeholder="창고명 또는 코드를 입력하세요"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-600"
                >
                  검색
                </button>
                {(searchQuery || searchInput) && (
                  <button
                    type="button"
                    onClick={handleSearchReset}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600"
                  >
                    초기화
                  </button>
                )}
              </div>
            </form>
            <button
              type="button"
              onClick={handleManualReload}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={handleOpenCreateDialog}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            >
              + 창고 추가
            </button>
          </div>
          {searchError && <p className="text-xs text-rose-500">{searchError}</p>}
        </div>
      </div>

      <div className="space-y-8">
        <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">창고 / 상세위치</h2>
              <p className="mt-1 text-xs text-slate-400">창고와 보관 위치를 한 번에 관리하세요.</p>
            </div>
            {(warehousesLoading || locationsLoading) && (
              <span className="text-xs text-indigo-500">불러오는 중...</span>
            )}
          </div>

          {warehousesError && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-600">
              {warehousesError}
            </div>
          )}
          {locationsError && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-600">
              {locationsError}
            </div>
          )}

          {tableRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200/80 p-8 text-center text-sm text-slate-400">
              등록된 창고 또는 위치가 없습니다. 상단의 <span className="font-semibold text-indigo-500">+ 창고 추가</span> 버튼을 눌러 새 데이터를 추가하세요.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/70">
              <table className="min-w-full divide-y divide-slate-200/60 text-sm">
                <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">창고명</th>
                    <th className="px-4 py-3 text-left">상세위치</th>
                    <th className="px-4 py-3 text-left">메모</th>
                    <th className="px-4 py-3 text-left">수정</th>
                    <th className="px-4 py-3 text-left">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80 bg-white/60 text-slate-600">
                  {tableRows.map((row) => {
                    const locationMemo = row.location?.description?.trim();
                    const warehouseMemo = row.warehouse.notes?.trim();
                    const memoText = row.location ? locationMemo || warehouseMemo : warehouseMemo;

                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-slate-700">{row.warehouse.name}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {row.location ? (
                            <div className="font-mono text-sm font-semibold uppercase text-slate-600">
                              {row.location.code}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">등록된 위치가 없습니다.</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-500">
                          {memoText ? (
                            <span className="whitespace-pre-line text-sm text-slate-600">{memoText}</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleEditRow(row)}
                            className="rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:bg-indigo-100"
                          >
                            수정
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(row)}
                            className="rounded-full border border-rose-200 bg-rose-50/80 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>

      {confirmDialogOpen && confirmTargetRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">Delete confirmation</h2>
              <button
                type="button"
                onClick={handleCloseConfirmDialog}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={confirmSubmitting}
              >
                Close
              </button>
            </div>
            <div className="space-y-4 px-5 py-6 text-sm text-slate-700">
              {(() => {
                const row = confirmTargetRow;
                const locations = locationsByWarehouse[row.warehouse.code] ?? [];
                const isLocationRow = Boolean(row.location);
                const isLastLocation = isLocationRow && locations.length <= 1;

                if (isLocationRow) {
                  return (
                    <>
                      <p>
                        Delete location <span className="font-mono font-semibold">{row.location?.code}</span>{' '}
                        in <span className="font-semibold">{row.warehouse.name}</span>?
                      </p>
                      {isLastLocation && (
                        <p className="text-sm text-rose-600">
                          This is the last location for this warehouse. The warehouse will be removed as well.
                        </p>
                      )}
                    </>
                  );
                }

                return (
                  <p>
                    Delete warehouse <span className="font-semibold">{row.warehouse.name}</span>
                    {locations.length > 0 ? ` and its ${locations.length} location(s)` : ''}?
                  </p>
                );
              })()}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseConfirmDialog}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={confirmSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
                  disabled={confirmSubmitting}
                >
                  {confirmSubmitting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editDialogOpen && editTargetRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">창고 정보 수정</h2>
              <button
                type="button"
                onClick={handleCloseEditDialog}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={editSubmitting}
              >
                닫기
              </button>
            </div>
            <form className="space-y-5 px-5 py-6 text-sm text-slate-700" onSubmit={handleSubmitEditForm}>
              <p className="text-slate-500">선택한 창고 또는 상세 위치 정보를 수정하세요.</p>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">창고명</span>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(event) => handleEditFormChange('name', event.target.value)}
                  onBlur={() => handleEditFormBlur('name')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  autoFocus
                />
                {editNameError && <span className="text-xs text-rose-500">{editNameError}</span>}
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">상세위치</span>
                <input
                  type="text"
                  value={editForm.detailLocation}
                  onChange={(event) => handleEditFormChange('detailLocation', event.target.value)}
                  onBlur={() => handleEditFormBlur('detailLocation')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-100"
                  placeholder={isEditingLocation ? '예: 랙 A1' : '상세 위치가 없습니다.'}
                  disabled={!isEditingLocation}
                />
                {editDetailLocationError && <span className="text-xs text-rose-500">{editDetailLocationError}</span>}
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">메모</span>
                <textarea
                  value={editForm.memo}
                  onChange={(event) => handleEditFormChange('memo', event.target.value)}
                  onBlur={() => handleEditFormBlur('memo')}
                  className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  placeholder={isEditingLocation ? '상세 위치 설명을 입력하세요.' : '창고 비고를 입력하세요.'}
                />
                {editMemoError && <span className="text-xs text-rose-500">{editMemoError}</span>}
              </label>
              {editSubmitError && (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">{editSubmitError}</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseEditDialog}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={editSubmitting}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  disabled={!canSubmitEditForm}
                >
                  {editSubmitting ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-800">새 창고 추가</h2>
              <button
                type="button"
                onClick={handleCloseCreateDialog}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={createSubmitting}
              >
                닫기
              </button>
            </div>
            <form className="space-y-5 px-5 py-6 text-sm text-slate-700" onSubmit={handleCreateWarehouseWithLocation}>
              <p className="text-slate-500">창고 기본 정보와 필요한 상세 위치 메모를 입력하세요.</p>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">창고명</span>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(event) => handleCreateFormChange('name', event.target.value)}
                  onBlur={() => handleCreateFormBlur('name')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  placeholder="예: 서울 센터"
                  autoFocus
                />
                {nameError && <span className="text-xs text-rose-500">{nameError}</span>}
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">상세위치 (선택)</span>
                <input
                  type="text"
                  value={createForm.detailLocation}
                  onChange={(event) => handleCreateFormChange('detailLocation', event.target.value)}
                  onBlur={() => handleCreateFormBlur('detailLocation')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  placeholder="예: 랙 A1"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">메모 (선택)</span>
                <textarea
                  value={createForm.memo}
                  onChange={(event) => handleCreateFormChange('memo', event.target.value)}
                  onBlur={() => handleCreateFormBlur('memo')}
                  className="h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  placeholder="상세 위치 설명이나 비고를 입력하세요"
                />
              </label>
              {createSubmitError && (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">{createSubmitError}</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseCreateDialog}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createSubmitting}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  disabled={!canSubmitCreateForm}
                >
                  {createSubmitting ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseManagementPanel;










