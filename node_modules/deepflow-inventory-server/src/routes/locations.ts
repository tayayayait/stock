import type { FastifyInstance } from 'fastify';

import {
  createLocation,
  deleteLocation,
  ensureLocationSeedData,
  findLocationByCode,
  listLocations,
  renameLocation,
  updateLocation,
  type LocationPayload,
  type LocationRecord,
} from '../stores/locationsStore.js';
import { findWarehouseByCode } from '../stores/warehousesStore.js';
import { updateInventoryWarehouseForLocation } from '../stores/inventoryStore.js';

interface ValidationSuccess {
  success: true;
  value: LocationPayload;
}

interface ValidationFailure {
  success: false;
  errors: string[];
}

type ValidationResult = ValidationSuccess | ValidationFailure;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateLocationPayload(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { success: false, errors: ['요청 본문이 객체가 아닙니다.'] };
  }

  const candidate = input as Record<string, unknown>;
  const errors: string[] = [];

  (['code', 'warehouseCode', 'description'] as Array<keyof LocationPayload>).forEach((field) => {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${String(field)} 필드는 비어있을 수 없습니다.`);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    value: {
      code: normalize(candidate.code),
      warehouseCode: normalize(candidate.warehouseCode),
      description: normalize(candidate.description),
    },
  };
}

function toResponse(record: LocationRecord): LocationRecord {
  return { ...record };
}

export default async function locationsRoutes(server: FastifyInstance) {
  ensureLocationSeedData();

  server.get('/', async (request, reply) => {
    const { warehouseCode } = (request.query ?? {}) as { warehouseCode?: string };
    const items = listLocations().filter((item) =>
      warehouseCode ? item.warehouseCode === warehouseCode : true,
    );
    return reply.send({ items: items.map((item) => toResponse(item)), count: items.length });
  });

  server.get('/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const record = findLocationByCode(code);
    if (!record) {
      return reply.code(404).send({ error: '요청한 로케이션을 찾을 수 없습니다.' });
    }

    return reply.send({ item: toResponse(record) });
  });

  server.post('/', async (request, reply) => {
    const validation = validateLocationPayload(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: '유효하지 않은 입력입니다.', details: validation.errors });
    }

    const { value } = validation;
    if (!findWarehouseByCode(value.warehouseCode)) {
      return reply.code(400).send({ error: '연결된 물류센터를 찾을 수 없습니다.' });
    }

    if (findLocationByCode(value.code)) {
      return reply.code(409).send({ error: '이미 존재하는 로케이션 코드입니다.' });
    }

    const record = createLocation(value);
    return reply.code(201).send({ item: toResponse(record) });
  });

  server.put('/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const existing = findLocationByCode(code);
    if (!existing) {
      return reply.code(404).send({ error: '요청한 로케이션을 찾을 수 없습니다.' });
    }

    const validation = validateLocationPayload(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: '유효하지 않은 입력입니다.', details: validation.errors });
    }

    const { value } = validation;
    if (value.code !== code && findLocationByCode(value.code)) {
      return reply.code(409).send({ error: '이미 존재하는 로케이션 코드입니다.' });
    }

    if (!findWarehouseByCode(value.warehouseCode)) {
      return reply.code(400).send({ error: '연결된 물류센터를 찾을 수 없습니다.' });
    }

    let updated: LocationRecord;
    if (value.code !== code) {
      updated = renameLocation(code, value);
    } else {
      if (existing.warehouseCode !== value.warehouseCode) {
        updateInventoryWarehouseForLocation(code, value.warehouseCode);
      }

      updated = updateLocation(code, {
        warehouseCode: value.warehouseCode,
        description: value.description,
      });
    }
    return reply.send({ item: toResponse(updated) });
  });

  server.delete('/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const existing = findLocationByCode(code);
    if (!existing) {
      return reply.code(404).send({ error: '요청한 로케이션을 찾을 수 없습니다.' });
    }

    deleteLocation(code);
    return reply.code(204).send();
  });
}

export { validateLocationPayload };
