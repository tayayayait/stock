import * as React from 'react';

import type { OrdersLocation, OrdersWarehouse } from './types';
import { formatWarehouseLocationLabel } from '../../../utils/warehouse';

type SelectionValue = {
  warehouseId: string | null;
  warehouseCode: string | null;
  locationId: string | null;
  locationCode: string | null;
};

interface WarehouseLocationSelectProps {
  id?: string;
  value: SelectionValue;
  selectedLabel?: string;
  warehouses: OrdersWarehouse[];
  locationsByWarehouse: Record<string, OrdersLocation[]>;
  loadingLocations: Record<string, boolean>;
  disabled?: boolean;
  onChange: (value: {
    warehouseId: string;
    warehouseCode: string;
    locationId: string;
    locationCode: string;
  }) => void;
  onClear?: () => void;
  onRequestLocations: (warehouseCode: string) => Promise<void> | void;
  placeholder?: string;
  emptyLabel?: string;
  searchPlaceholder?: string;
  onManage?: () => void;
  manageDisabled?: boolean;
}

type WarehouseOption = {
  key: string;
  warehouseId: string;
  warehouseCode: string;
  locationId: string;
  locationCode: string;
  label: string;
  secondary: string;
  searchText: string;
};

type WarehouseOptionGroup = {
  warehouse: OrdersWarehouse;
  options: WarehouseOption[];
  loading: boolean;
};

const buildOptionLabel = (warehouse: OrdersWarehouse, location: OrdersLocation) => {
  const warehouseLabel = warehouse.name ?? warehouse.code;
  const locationLabel = location.name ?? location.description ?? location.code;
  return formatWarehouseLocationLabel(warehouseLabel, locationLabel ?? location.code);
};

const WarehouseLocationSelect: React.FC<WarehouseLocationSelectProps> = ({
  id,
  value,
  selectedLabel,
  warehouses,
  locationsByWarehouse,
  loadingLocations,
  disabled,
  onChange,
  onClear,
  onRequestLocations,
  placeholder = '창고와 상세위치를 선택하세요',
  emptyLabel = '등록된 창고가 없습니다.',
  searchPlaceholder = '창고명 또는 상세위치 검색',
  onManage,
  manageDisabled,
}) => {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleManageClick = React.useCallback(() => {
    if (!onManage || manageDisabled) {
      return;
    }
    setOpen(false);
    setSearchTerm('');
    onManage();
  }, [manageDisabled, onManage]);

  const groups = React.useMemo<WarehouseOptionGroup[]>(() => {
    return warehouses.map((warehouse) => {
      const locations = locationsByWarehouse[warehouse.code] ?? [];
      const options: WarehouseOption[] = locations.map((location) => {
        const label = buildOptionLabel(warehouse, location);
        const searchText = `${warehouse.name ?? ''} ${warehouse.code ?? ''} ${location.name ?? ''} ${location.description ?? ''} ${
          location.code ?? ''
        }`
          .toLowerCase()
          .trim();
        return {
          key: `${warehouse.code}:${location.code}`,
          warehouseId: warehouse.id,
          warehouseCode: warehouse.code,
          locationId: location.id,
          locationCode: location.code,
          label,
          secondary: location.code,
          searchText,
        };
      });
      return {
        warehouse,
        options,
        loading: Boolean(loadingLocations[warehouse.code]),
      };
    });
  }, [warehouses, locationsByWarehouse, loadingLocations]);

  const filteredGroups = React.useMemo(() => {
    const trimmed = searchTerm.trim().toLowerCase();

    if (!trimmed) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => option.searchText.includes(trimmed)),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, searchTerm]);

  const hasAnyOptions = React.useMemo(() => groups.some((group) => group.options.length > 0), [groups]);

  const selectedOptionLabel = React.useMemo(() => {
    if (selectedLabel) {
      return selectedLabel;
    }
    if (!value.warehouseCode || (!value.locationId && !value.locationCode)) {
      return '';
    }
    const warehouse = warehouses.find(
      (entry) => entry.code === value.warehouseCode || (value.warehouseId && entry.id === value.warehouseId),
    );
    const locationList = locationsByWarehouse[value.warehouseCode] ?? [];
    const location = locationList.find(
      (entry) => entry.id === value.locationId || entry.code === value.locationCode,
    );
    if (!warehouse) {
      if (value.warehouseCode && value.locationCode) {
        return formatWarehouseLocationLabel(value.warehouseCode, value.locationCode);
      }
      return '';
    }
    if (!location) {
      if (value.locationCode) {
        return formatWarehouseLocationLabel(warehouse.name ?? warehouse.code, value.locationCode);
      }
      return '';
    }
    return buildOptionLabel(warehouse, location);
  }, [selectedLabel, value, warehouses, locationsByWarehouse]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    warehouses.forEach((warehouse) => {
      if ((locationsByWarehouse[warehouse.code] ?? []).length > 0) {
        return;
      }
      if (loadingLocations[warehouse.code]) {
        return;
      }
      void onRequestLocations(warehouse.code);
    });
  }, [open, warehouses, locationsByWarehouse, loadingLocations, onRequestLocations]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current || containerRef.current.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const handleToggle = () => {
    if (disabled) {
      return;
    }
    setOpen((prev) => !prev);
  };

  const handleSelect = (option: WarehouseOption) => {
    onChange({
      warehouseId: option.warehouseId,
      warehouseCode: option.warehouseCode,
      locationId: option.locationId,
      locationCode: option.locationCode,
    });
    setOpen(false);
    setSearchTerm('');
  };

  const handleClear = () => {
    onClear?.();
    setOpen(false);
    setSearchTerm('');
  };

  const showNoResult = filteredGroups.length === 0 && searchTerm.trim().length > 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        id={id}
        onClick={handleToggle}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-50"
      >
        <span className="truncate">
          {selectedOptionLabel || placeholder}
        </span>
        <svg
          className="ml-2 h-4 w-4 text-slate-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {value.warehouseId && value.locationId ? (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-slate-500 transition hover:text-rose-500"
              >
                초기화
              </button>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto py-2">
            {showNoResult ? (
              <p className="px-4 py-3 text-sm text-slate-400">검색 결과가 없습니다.</p>
            ) : null}
            {!showNoResult && filteredGroups.length === 0 && !hasAnyOptions ? (
              <div className="space-y-2 px-4 py-3 text-sm text-slate-400">
                <p>{emptyLabel}</p>
                {onManage ? (
                  <button
                    type="button"
                    onClick={handleManageClick}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:text-slate-300"
                    disabled={manageDisabled}
                  >
                    창고 추가
                  </button>
                ) : null}
              </div>
            ) : null}
            {!showNoResult && filteredGroups.length === 0 && hasAnyOptions ? (
              <p className="px-4 py-3 text-sm text-slate-400">창고의 상세위치를 먼저 등록하세요.</p>
            ) : null}
            {filteredGroups.map((group) => {
              const warehouseLabel = group.warehouse.name ?? group.warehouse.code;
              return (
                <div key={group.warehouse.id} className="px-3 py-2">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {`${warehouseLabel} > 상세위치`}
                  </div>
                  {group.loading && group.options.length === 0 ? (
                    <p className="px-1 py-1 text-xs text-indigo-500">상세위치를 불러오는 중...</p>
                  ) : null}
                  {!group.loading && group.options.length === 0 ? (
                    <p className="px-1 py-1 text-xs text-slate-400">등록된 상세위치가 없습니다.</p>
                  ) : null}
                  <ul className="space-y-1">
                    {group.options.map((option) => (
                      <li key={option.key}>
                        <button
                          type="button"
                          onClick={() => handleSelect(option)}
                          className="w-full rounded-md px-2 py-2 text-left text-sm text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-slate-400">{option.secondary}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {onManage ? (
            <div className="flex justify-end border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={handleManageClick}
                disabled={manageDisabled}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                창고 추가
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default WarehouseLocationSelect;
