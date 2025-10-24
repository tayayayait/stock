import type { Product } from '../../../services/products';

export interface WarehouseInventoryLocationSlot {
  code?: string;
  onHand: number;
}

export interface WarehouseInventoryItem {
  sku: string;
  name: string;
  onHand: number;
  locations: WarehouseInventoryLocationSlot[];
}

export type WarehouseInventoryIndex = Record<string, WarehouseInventoryItem[]>;

type InventoryAccumulator = Map<string, WarehouseInventoryItem>;

const ensureWarehouseBucket = (
  buckets: Map<string, InventoryAccumulator>,
  warehouseCode: string,
): InventoryAccumulator => {
  const existing = buckets.get(warehouseCode);
  if (existing) {
    return existing;
  }
  const next = new Map<string, WarehouseInventoryItem>();
  buckets.set(warehouseCode, next);
  return next;
};

const upsertInventoryItem = (
  bucket: InventoryAccumulator,
  sku: string,
  item: { name: string; onHand: number; locationCode?: string | null },
) => {
  const locationCode = item.locationCode?.trim() || undefined;
  const existing = bucket.get(sku);
  if (!existing) {
    const locations: WarehouseInventoryLocationSlot[] = item.onHand > 0
      ? [{ code: locationCode, onHand: item.onHand }]
      : [];
    bucket.set(sku, { sku, name: item.name, onHand: Math.max(0, item.onHand), locations });
    return;
  }

  existing.onHand = Math.max(0, existing.onHand + item.onHand);
  if (!locationCode) {
    if (item.onHand <= 0) {
      return;
    }
    const unassigned = existing.locations.find((slot) => !slot.code);
    if (unassigned) {
      unassigned.onHand = Math.max(0, unassigned.onHand + item.onHand);
    } else {
      existing.locations.push({ code: undefined, onHand: item.onHand });
    }
    return;
  }

  const slot = existing.locations.find((candidate) => candidate.code === locationCode);
  if (slot) {
    slot.onHand = Math.max(0, slot.onHand + item.onHand);
  } else if (item.onHand > 0) {
    existing.locations.push({ code: locationCode, onHand: item.onHand });
  }
};

const finalizeBuckets = (buckets: Map<string, InventoryAccumulator>): WarehouseInventoryIndex => {
  const record: WarehouseInventoryIndex = {};
  buckets.forEach((bucket, warehouseCode) => {
    const items = Array.from(bucket.values())
      .map<WarehouseInventoryItem>((entry) => {
        const locations = entry.locations
          .map((slot) => ({ ...slot, onHand: Math.max(0, slot.onHand) }))
          .filter((slot) => slot.onHand > 0)
          .sort((a, b) => {
            if (!a.code && b.code) return -1;
            if (a.code && !b.code) return 1;
            return (a.code ?? '').localeCompare(b.code ?? '', 'ko-KR');
          });
        const totalOnHand = locations.reduce((sum, slot) => sum + slot.onHand, 0);
        return {
          sku: entry.sku,
          name: entry.name,
          onHand: totalOnHand,
          locations,
        };
      })
      .filter((entry) => entry.onHand > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));

    record[warehouseCode] = items;
  });
  return record;
};

export const buildWarehouseInventoryIndex = (products: Product[]): WarehouseInventoryIndex => {
  const buckets = new Map<string, InventoryAccumulator>();

  products.forEach((product) => {
    if (!product?.inventory?.length) {
      return;
    }

    product.inventory.forEach((entry) => {
      if (!entry?.warehouseCode) {
        return;
      }
      const warehouseCode = entry.warehouseCode.trim();
      if (!warehouseCode) {
        return;
      }

      const qty = Number(entry.onHand) || 0;
      if (qty <= 0) {
        return;
      }

      const bucket = ensureWarehouseBucket(buckets, warehouseCode);
      upsertInventoryItem(bucket, product.sku, {
        name: product.name,
        onHand: qty,
        locationCode: entry.locationCode,
      });
    });
  });

  return finalizeBuckets(buckets);
};

export const adjustWarehouseInventory = (
  index: WarehouseInventoryIndex,
  warehouseCode: string,
  sku: string,
  delta: number,
  options?: { fallbackName?: string; locationCode?: string | null },
): WarehouseInventoryIndex => {
  const currentItems = index[warehouseCode] ?? [];
  const nextItems = [...currentItems];
  const targetIndex = nextItems.findIndex((item) => item.sku === sku);

  if (targetIndex === -1 && delta <= 0) {
    return index;
  }

  const locationCode = options?.locationCode?.trim() || undefined;

  if (targetIndex === -1) {
    const name = options?.fallbackName ?? sku;
    const locations: WarehouseInventoryLocationSlot[] =
      delta > 0 ? [{ code: locationCode, onHand: Math.max(0, delta) }] : [];
    nextItems.push({ sku, name, onHand: Math.max(0, delta), locations });
  } else {
    const current = nextItems[targetIndex];
    const updatedLocations = current.locations.map((slot) => ({ ...slot }));

    if (locationCode) {
      const slotIndex = updatedLocations.findIndex((slot) => slot.code === locationCode);
      if (slotIndex === -1) {
        if (delta > 0) {
          updatedLocations.push({ code: locationCode, onHand: delta });
        }
      } else {
        updatedLocations[slotIndex].onHand = Math.max(0, updatedLocations[slotIndex].onHand + delta);
        if (updatedLocations[slotIndex].onHand <= 0) {
          updatedLocations.splice(slotIndex, 1);
        }
      }
    } else if (delta !== 0) {
      if (delta > 0) {
        const slotIndex = updatedLocations.findIndex((slot) => !slot.code);
        if (slotIndex === -1) {
          updatedLocations.push({ code: undefined, onHand: delta });
        } else {
          updatedLocations[slotIndex].onHand = Math.max(0, updatedLocations[slotIndex].onHand + delta);
        }
      } else {
        let remaining = Math.abs(delta);
        updatedLocations.sort((a, b) => (b.onHand ?? 0) - (a.onHand ?? 0));
        for (const slot of updatedLocations) {
          if (remaining <= 0) {
            break;
          }
          const reduction = Math.min(slot.onHand, remaining);
          slot.onHand -= reduction;
          remaining -= reduction;
        }
        for (let i = updatedLocations.length - 1; i >= 0; i -= 1) {
          if (updatedLocations[i].onHand <= 0) {
            updatedLocations.splice(i, 1);
          }
        }
      }
    }

    const totalOnHand = updatedLocations.reduce((sum, slot) => sum + slot.onHand, 0);
    if (totalOnHand <= 0) {
      nextItems.splice(targetIndex, 1);
    } else {
      nextItems[targetIndex] = {
        ...current,
        onHand: totalOnHand,
        locations: updatedLocations
          .filter((slot) => slot.onHand > 0)
          .sort((a, b) => {
            if (!a.code && b.code) return -1;
            if (a.code && !b.code) return 1;
            return (a.code ?? '').localeCompare(b.code ?? '', 'ko-KR');
          }),
      };
    }
  }

  nextItems.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));

  return {
    ...index,
    [warehouseCode]: nextItems,
  };
};
