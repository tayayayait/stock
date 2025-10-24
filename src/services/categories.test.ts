import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./http', () => ({
  request: httpRequestMock,
}));

import {
  __test__,
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
  type CategoryPayload,
} from './categories';

const { buildPayload, normalizeCategoryRecord } = __test__;

describe('categories service helpers', () => {
  it('normalizes category records', () => {
    const record = normalizeCategoryRecord({
      id: 42 as unknown as string,
      name: '  식품  ',
      description: '  가공품  ',
      productCount: 12,
      parentId: 'root-1',
      children: [
        {
          id: 'child-1',
          name: '  과자  ',
          description: '  스낵  ',
          productCount: 4,
        },
      ],
    });

    expect(record).toEqual({
      id: '42',
      name: '식품',
      description: '가공품',
      productCount: 12,
      parentId: 'root-1',
      children: [
        {
          id: 'child-1',
          name: '과자',
          description: '스낵',
          productCount: 4,
          parentId: '42',
          children: [],
          createdAt: undefined,
          updatedAt: undefined,
        },
      ],
      createdAt: undefined,
      updatedAt: undefined,
    });
  });

  it('builds payloads with trimmed values', () => {
    const payload: CategoryPayload = { name: '  생필품  ', description: '  화장지  ', parentId: '  root-1  ' };
    expect(buildPayload(payload)).toEqual({ name: '생필품', description: '화장지', parentId: 'root-1' });
  });

  it('converts empty descriptions to null', () => {
    const payload: CategoryPayload = { name: '주방', description: '   ', parentId: '' };
    expect(buildPayload(payload)).toEqual({ name: '주방', description: null, parentId: null });
  });
});

describe('categories service endpoints', () => {
  beforeEach(() => {
    httpRequestMock.mockReset();
  });

  it('requests the categories list with an optional query', async () => {
    httpRequestMock.mockResolvedValue({ items: [] });

    await fetchCategories('음료');

    expect(httpRequestMock).toHaveBeenCalledWith('/categories?q=%EC%9D%8C%EB%A3%8C', {
      method: 'GET',
    });
  });

  it('normalizes flat category responses into a tree', async () => {
    httpRequestMock.mockResolvedValue({
      items: [
        { id: 'root-1', name: '식품', description: null, parentId: null },
        { id: 'child-1', name: '과자', description: null, parentId: 'root-1' },
      ],
    });

    const result = await fetchCategories();

    expect(result).toEqual([
      {
        id: 'root-1',
        name: '식품',
        description: '',
        productCount: 0,
        parentId: null,
        children: [
          {
            id: 'child-1',
            name: '과자',
            description: '',
            productCount: 0,
            parentId: 'root-1',
            children: [],
            createdAt: undefined,
            updatedAt: undefined,
          },
        ],
        createdAt: undefined,
        updatedAt: undefined,
      },
    ]);
  });

  it('creates a category using POST', async () => {
    httpRequestMock.mockResolvedValue({
      item: { id: 'cat-1', name: '가전', description: null, productCount: 0, parentId: null },
    });

    const result = await createCategory({ name: '가전', parentId: null });

    expect(httpRequestMock).toHaveBeenCalledWith('/categories', {
      method: 'POST',
      body: { name: '가전', description: null, parentId: null },
    });
    expect(result).toMatchObject({ id: 'cat-1', name: '가전' });
  });

  it('updates a category using PUT', async () => {
    httpRequestMock.mockResolvedValue({
      item: {
        id: 'cat-2',
        name: '생활용품',
        description: '세제',
        productCount: 3,
        parentId: 'root-1',
      },
    });

    const result = await updateCategory('cat-2', {
      name: '생활용품',
      description: '세제',
      parentId: 'root-1',
    });

    expect(httpRequestMock).toHaveBeenCalledWith('/categories/cat-2', {
      method: 'PUT',
      body: { name: '생활용품', description: '세제', parentId: 'root-1' },
    });
    expect(result).toMatchObject({ id: 'cat-2', description: '세제' });
  });

  it('deletes a category using DELETE', async () => {
    httpRequestMock.mockResolvedValue({});

    await deleteCategory('cat-3');

    expect(httpRequestMock).toHaveBeenCalledWith('/categories/cat-3', {
      method: 'DELETE',
    });
  });
});
