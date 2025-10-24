import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { categoryStore, __test__ as categoryStoreTest } from './categoryStore';

import * as CategoryService from '../../../../services/categories';

vi.mock('../../../../services/categories', async () => {
  const actual = await vi.importActual<typeof CategoryService>(
    '../../../../services/categories',
  );
  return {
    ...actual,
    fetchCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  };
});

const fetchCategoriesMock = CategoryService.fetchCategories as unknown as Mock;
const createCategoryMock = CategoryService.createCategory as unknown as Mock;
const updateCategoryMock = CategoryService.updateCategory as unknown as Mock;
const deleteCategoryMock = CategoryService.deleteCategory as unknown as Mock;

describe('categoryStore', () => {
  beforeEach(() => {
    fetchCategoriesMock.mockReset();
    createCategoryMock.mockReset();
    updateCategoryMock.mockReset();
    deleteCategoryMock.mockReset();
    categoryStore.reset();
  });

  it('loads categories and updates state', async () => {
    fetchCategoriesMock.mockResolvedValue([
      {
        id: 'cat-1',
        name: '식품',
        description: '',
        productCount: 2,
        parentId: null,
        children: [
          { id: 'cat-1-1', name: '과자', description: '', productCount: 1, parentId: 'cat-1', children: [] },
        ],
      },
    ]);

    const promise = categoryStore.load();
    expect(categoryStore.getSnapshot().loading).toBe(true);

    await promise;

    const state = categoryStore.getSnapshot();
    expect(state.loading).toBe(false);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe('식품');
    expect(state.items[0].children).toHaveLength(1);
    expect(state.lastLoadedAt).not.toBeNull();
  });

  it('captures errors during load', async () => {
    fetchCategoriesMock.mockRejectedValue(new Error('network error'));

    await expect(categoryStore.load()).rejects.toThrow('network error');

    const state = categoryStore.getSnapshot();
    expect(state.loading).toBe(false);
    expect(state.error).toBe('network error');
  });

  it('appends created categories as root nodes by default', async () => {
    createCategoryMock.mockResolvedValue({
      id: 'cat-2',
      name: '생활용품',
      description: '',
      productCount: 0,
      parentId: null,
      children: [],
    });

    const result = await categoryStore.create({ name: '생활용품' });

    const state = categoryStore.getSnapshot();
    expect(createCategoryMock).toHaveBeenCalled();
    expect(state.items).toContainEqual(result);
    expect(state.saving).toBe(false);
  });

  it('inserts created child categories under their parent', async () => {
    categoryStore.reset();
    categoryStoreTest.hydrate({
      items: [
        { id: 'root-1', name: '식품', description: '', productCount: 0, parentId: null, children: [] },
      ],
    });

    createCategoryMock.mockResolvedValue({
      id: 'child-1',
      name: '과자',
      description: '',
      productCount: 0,
      parentId: 'root-1',
      children: [],
    });

    const created = await categoryStore.create({ name: '과자', parentId: 'root-1' });

    const state = categoryStore.getSnapshot();
    expect(created.parentId).toBe('root-1');
    expect(state.items[0].children).toContainEqual(created);
  });

  it('updates existing categories and preserves children when not returned', async () => {
    categoryStore.reset();
    categoryStoreTest.hydrate({
      items: [
        {
          id: 'cat-3',
          name: '주방',
          description: '도마',
          productCount: 1,
          parentId: null,
          children: [
            {
              id: 'cat-3-1',
              name: '조리도구',
              description: '',
              productCount: 0,
              parentId: 'cat-3',
              children: [],
            },
          ],
        },
      ],
    });

    updateCategoryMock.mockResolvedValue({
      id: 'cat-3',
      name: '주방/조리',
      description: '조리도구',
      productCount: 1,
      parentId: null,
      children: [],
    });

    const updated = await categoryStore.update('cat-3', {
      name: '주방/조리',
      description: '조리도구',
    });

    const state = categoryStore.getSnapshot();
    expect(updateCategoryMock).toHaveBeenCalledWith('cat-3', {
      name: '주방/조리',
      description: '조리도구',
    });
    expect(state.items[0]).toEqual(updated);
    expect(state.items[0].children).toHaveLength(1);
    expect(state.items[0].children[0].id).toBe('cat-3-1');
  });

  it('prevents deletion when children remain', async () => {
    categoryStore.reset();
    categoryStoreTest.hydrate({
      items: [
        {
          id: 'cat-4',
          name: '의류',
          description: '',
          productCount: 0,
          parentId: null,
          children: [
            {
              id: 'cat-4-1',
              name: '아우터',
              description: '',
              productCount: 0,
              parentId: 'cat-4',
              children: [],
            },
          ],
        },
      ],
    });

    await expect(categoryStore.remove('cat-4')).rejects.toThrow('하위 카테고리가 있는 분류는 삭제할 수 없습니다.');
    expect(deleteCategoryMock).not.toHaveBeenCalled();
  });

  it('removes categories without descendants', async () => {
    categoryStore.reset();
    categoryStoreTest.hydrate({
      items: [
        {
          id: 'cat-5',
          name: '신발',
          description: '',
          productCount: 0,
          parentId: null,
          children: [],
        },
      ],
    });

    deleteCategoryMock.mockResolvedValue(undefined);

    await categoryStore.remove('cat-5');

    const state = categoryStore.getSnapshot();
    expect(deleteCategoryMock).toHaveBeenCalledWith('cat-5');
    expect(state.items).toHaveLength(0);
  });
});
