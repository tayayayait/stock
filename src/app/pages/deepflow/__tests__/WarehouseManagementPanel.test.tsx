import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WarehouseManagementPanel from '../components/WarehouseManagementPanel';
import type { ApiLocation, ApiWarehouse } from '../../../../services/api';

const fetchWarehousesMock = vi.hoisted(() => vi.fn());
const fetchLocationsMock = vi.hoisted(() => vi.fn());
const deleteWarehouseMock = vi.hoisted(() => vi.fn());
const deleteLocationMock = vi.hoisted(() => vi.fn());
const createWarehouseMock = vi.hoisted(() => vi.fn());
const createLocationMock = vi.hoisted(() => vi.fn());
const updateWarehouseMock = vi.hoisted(() => vi.fn());
const updateLocationMock = vi.hoisted(() => vi.fn());

type LocationMap = Record<string, ApiLocation[]>;

vi.mock('../../../../services/api', () => ({
  fetchWarehouses: fetchWarehousesMock,
  fetchLocations: fetchLocationsMock,
  deleteWarehouse: deleteWarehouseMock,
  deleteLocation: deleteLocationMock,
  createWarehouse: createWarehouseMock,
  createLocation: createLocationMock,
  updateWarehouse: updateWarehouseMock,
  updateLocation: updateLocationMock,
}));

let warehousesData: ApiWarehouse[];
let locationsData: LocationMap;

const buildWarehouse = (overrides: Partial<ApiWarehouse> = {}): ApiWarehouse => ({
  id: overrides.id ?? 1,
  code: overrides.code ?? 'WH-001',
  name: overrides.name ?? '서울 센터',
  address: overrides.address ?? '서울특별시 송파구',
  notes: overrides.notes ?? null,
});

const buildLocation = (overrides: Partial<ApiLocation> = {}): ApiLocation => ({
  id: overrides.id ?? 'loc-101',
  code: overrides.code ?? 'LOC-001',
  description: overrides.description ?? '랙 A1',
  warehouseCode: overrides.warehouseCode ?? 'WH-001',
});

describe('WarehouseManagementPanel - 삭제 동작', () => {
  beforeEach(() => {
    warehousesData = [buildWarehouse()];
    locationsData = {
      'WH-001': [buildLocation(), buildLocation({ id: 'loc-102', code: 'LOC-002', description: '랙 A2' })],
    };

    fetchWarehousesMock.mockReset();
    fetchWarehousesMock.mockImplementation(async () => ({
      items: warehousesData.map((warehouse) => ({ ...warehouse })),
    }));

    fetchLocationsMock.mockReset();
    fetchLocationsMock.mockImplementation(async (warehouseCode: string) => ({
      items: (locationsData[warehouseCode] ?? []).map((location) => ({ ...location })),
    }));

    deleteLocationMock.mockReset();
    deleteLocationMock.mockImplementation(async (code: string) => {
      Object.keys(locationsData).forEach((warehouseCode) => {
        const nextLocations = (locationsData[warehouseCode] ?? []).filter((location) => location.code !== code);
        locationsData[warehouseCode] = nextLocations;
      });
    });

    deleteWarehouseMock.mockReset();
    deleteWarehouseMock.mockImplementation(async (warehouseCode: string) => {
      warehousesData = warehousesData.filter((warehouse) => warehouse.code !== warehouseCode);
      delete locationsData[warehouseCode];
    });

    createWarehouseMock.mockReset();
    createLocationMock.mockReset();
    updateWarehouseMock.mockReset();
    updateLocationMock.mockReset();
  });

  it('deletes the entire warehouse when removing a location row', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const onRequestReload = vi.fn();
    render(<WarehouseManagementPanel refreshToken={0} onRequestReload={onRequestReload} />);

    await screen.findByText('LOC-001');
    await screen.findByText('LOC-002');

    const targetRow = screen.getByText('LOC-001').closest('tr');
    expect(targetRow).not.toBeNull();

    const deleteButton = within(targetRow as HTMLTableRowElement).getByRole('button', { name: '삭제' });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(deleteWarehouseMock).toHaveBeenCalledWith('WH-001');
    });
    expect(deleteWarehouseMock).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(
      '선택한 창고를 삭제하시겠습니까? 연결된 상세위치도 함께 삭제됩니다. (총 2개)',
    );
    expect(deleteLocationMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByText('LOC-001')).not.toBeInTheDocument();
      expect(screen.queryByText('LOC-002')).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it('deletes a warehouse and removes its placeholder row', async () => {
    locationsData = { 'WH-001': [] } satisfies LocationMap;

    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const onRequestReload = vi.fn();
    render(<WarehouseManagementPanel refreshToken={0} onRequestReload={onRequestReload} />);

    const placeholderRow = (await screen.findByText('등록된 위치가 없습니다.')).closest('tr');
    expect(placeholderRow).not.toBeNull();

    const deleteButton = within(placeholderRow as HTMLTableRowElement).getByRole('button', { name: '삭제' });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(deleteWarehouseMock).toHaveBeenCalledWith('WH-001');
    });
    expect(deleteWarehouseMock).toHaveBeenCalledTimes(1);
    expect(deleteLocationMock).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalledWith(
      '선택한 창고를 삭제하시겠습니까? 연결된 상세위치도 함께 삭제됩니다.',
    );

    await waitFor(() => {
      expect(screen.queryAllByText(/등록된 창고 또는 위치가 없습니다/).length).toBeGreaterThan(0);
    });

    confirmSpy.mockRestore();
  });
});

describe('WarehouseManagementPanel - 수정 동작', () => {
  beforeEach(() => {
    warehousesData = [buildWarehouse({ notes: '창고 기본 메모' })];
    locationsData = {
      'WH-001': [buildLocation({ description: '랙 A1 메모' })],
    } satisfies LocationMap;

    fetchWarehousesMock.mockReset();
    fetchWarehousesMock.mockImplementation(async () => ({
      items: warehousesData.map((warehouse) => ({ ...warehouse })),
    }));

    fetchLocationsMock.mockReset();
    fetchLocationsMock.mockImplementation(async (warehouseCode: string) => ({
      items: (locationsData[warehouseCode] ?? []).map((location) => ({ ...location })),
    }));

    updateWarehouseMock.mockReset();
    updateWarehouseMock.mockImplementation(async (warehouseCode: string, payload: Partial<ApiWarehouse>) => {
      warehousesData = warehousesData.map((warehouse) =>
        warehouse.code === warehouseCode ? { ...warehouse, ...payload } : warehouse,
      );
      return warehousesData.find((warehouse) => warehouse.code === warehouseCode) ?? null;
    });

    updateLocationMock.mockReset();
    updateLocationMock.mockImplementation(async (locationCode: string, payload: Partial<ApiLocation>) => {
      Object.keys(locationsData).forEach((warehouseCode) => {
        locationsData[warehouseCode] = (locationsData[warehouseCode] ?? []).map((location) => {
          if (location.code !== locationCode) {
            return { ...location };
          }
          return {
            ...location,
            ...payload,
            code: payload.code ?? location.code,
            description: payload.description ?? location.description,
            warehouseCode: payload.warehouseCode ?? location.warehouseCode,
          } satisfies ApiLocation;
        });
      });
      return null;
    });

    createWarehouseMock.mockReset();
    createLocationMock.mockReset();
    deleteWarehouseMock.mockReset();
    deleteLocationMock.mockReset();
  });

  it('opens the edit modal for a location row and saves updates', async () => {
    const user = userEvent.setup();
    const onRequestReload = vi.fn();
    render(<WarehouseManagementPanel refreshToken={0} onRequestReload={onRequestReload} />);

    await screen.findByText('LOC-001');

    const targetRow = screen.getByText('LOC-001').closest('tr');
    expect(targetRow).not.toBeNull();
    const editButton = within(targetRow as HTMLTableRowElement).getByRole('button', { name: '수정' });
    await user.click(editButton);

    await screen.findByRole('heading', { name: '창고 정보 수정' });
    const nameInput = screen.getByLabelText('창고명');
    const detailInput = screen.getByLabelText('상세위치');
    const memoInput = screen.getByLabelText('메모');

    expect(nameInput).toHaveValue('서울 센터');
    expect(detailInput).toHaveValue('LOC-001');
    expect(memoInput).toHaveValue('랙 A1 메모');

    await user.clear(nameInput);
    await user.type(nameInput, '서울 센터 2');
    await user.clear(detailInput);
    await user.type(detailInput, 'LOC-010');
    await user.clear(memoInput);
    await user.type(memoInput, '새로운 위치 메모');

    const submitButton = screen.getByRole('button', { name: '저장' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(updateWarehouseMock).toHaveBeenCalledWith('WH-001', { name: '서울 센터 2' });
      expect(updateLocationMock).toHaveBeenCalledWith('LOC-001', {
        warehouseCode: 'WH-001',
        code: 'LOC-010',
        description: '새로운 위치 메모',
      });
    });

    await waitFor(() => {
      expect(fetchWarehousesMock).toHaveBeenCalledTimes(2);
      expect(fetchLocationsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(onRequestReload).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '창고 정보 수정' })).not.toBeInTheDocument();
    });

    await screen.findByText('LOC-010');
    await screen.findByText('새로운 위치 메모');
  });

  it('disables detail location editing when the row has no location and updates warehouse notes', async () => {
    locationsData = { 'WH-001': [] } satisfies LocationMap;

    const user = userEvent.setup();
    const onRequestReload = vi.fn();
    render(<WarehouseManagementPanel refreshToken={0} onRequestReload={onRequestReload} />);

    const placeholderRow = await screen.findByText('등록된 위치가 없습니다.');
    const editButton = within(placeholderRow.closest('tr') as HTMLTableRowElement).getByRole('button', {
      name: '수정',
    });
    await user.click(editButton);

    await screen.findByRole('heading', { name: '창고 정보 수정' });
    const detailInput = screen.getByLabelText('상세위치');
    const memoInput = screen.getByLabelText('메모');

    expect(detailInput).toBeDisabled();
    expect(memoInput).toHaveValue('창고 기본 메모');

    const nameInput = screen.getByLabelText('창고명');
    await user.clear(nameInput);
    await user.type(nameInput, '새로운 창고 이름');
    await user.clear(memoInput);
    await user.type(memoInput, '창고 메모 업데이트');

    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(updateWarehouseMock).toHaveBeenCalledWith('WH-001', {
        name: '새로운 창고 이름',
        notes: '창고 메모 업데이트',
      });
    });
    expect(updateLocationMock).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(fetchWarehousesMock).toHaveBeenCalledTimes(2);
    });
    expect(onRequestReload).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '창고 정보 수정' })).not.toBeInTheDocument();
    });

    await screen.findByText('새로운 창고 이름');
    await screen.findByText('창고 메모 업데이트');
  });

  it('shows validation errors inline when required fields are cleared', async () => {
    const user = userEvent.setup();
    const onRequestReload = vi.fn();
    render(<WarehouseManagementPanel refreshToken={0} onRequestReload={onRequestReload} />);

    await screen.findByText('LOC-001');
    const editButton = within(screen.getByText('LOC-001').closest('tr') as HTMLTableRowElement).getByRole('button', {
      name: '수정',
    });
    await user.click(editButton);

    await screen.findByRole('heading', { name: '창고 정보 수정' });
    const memoInput = screen.getByLabelText('메모');
    await user.clear(memoInput);
    await user.tab();

    expect(await screen.findByText('메모를 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(updateWarehouseMock).not.toHaveBeenCalled();
    expect(updateLocationMock).not.toHaveBeenCalled();
  });

  it('keeps the modal open and surfaces API errors when updating a location fails', async () => {
    updateLocationMock.mockRejectedValueOnce(new Error('위치 수정 실패'));

    const user = userEvent.setup();
    const onRequestReload = vi.fn();
    render(<WarehouseManagementPanel refreshToken={0} onRequestReload={onRequestReload} />);

    await screen.findByText('LOC-001');
    const editButton = within(screen.getByText('LOC-001').closest('tr') as HTMLTableRowElement).getByRole('button', {
      name: '수정',
    });
    await user.click(editButton);

    await screen.findByRole('heading', { name: '창고 정보 수정' });
    const memoInput = screen.getByLabelText('메모');
    await user.clear(memoInput);
    await user.type(memoInput, '오류 발생 메모');

    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(updateWarehouseMock).toHaveBeenCalledTimes(1);
      expect(updateLocationMock).toHaveBeenCalledTimes(1);
    });

    const errorMessages = await screen.findAllByText('위치 수정 실패');
    expect(errorMessages.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('heading', { name: '창고 정보 수정' })).toBeInTheDocument();
    expect(onRequestReload).not.toHaveBeenCalled();
    expect(fetchWarehousesMock).toHaveBeenCalledTimes(1);
    expect(fetchLocationsMock).toHaveBeenCalledTimes(1);
  });
});
