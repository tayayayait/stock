export const generateWarehouseCode = (name: string) => {
  const normalized = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  const base = normalized || 'AUTO';
  const random = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'XXXX';
  return `WH-${base}-${random}`;
};

export const formatWarehouseLocationLabel = (warehouseName?: string | null, locationName?: string | null) => {
  const warehouseLabel = warehouseName?.trim() ? warehouseName.trim() : '미지정 창고';
  const locationLabel = locationName?.trim() ? locationName.trim() : '미지정 위치';
  return `${warehouseLabel} > ${locationLabel}`;
};
