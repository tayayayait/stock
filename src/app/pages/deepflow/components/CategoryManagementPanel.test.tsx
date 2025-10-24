import * as React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type Category } from '../../../../services/categories';
import CategoryManagementPanel from './CategoryManagementPanel';

vi.mock('../stores/categoryStore', async () => {
  await vi.importActual<typeof import('../stores/categoryStore')>('../stores/categoryStore');
  const listeners = new Set<() => void>();

  interface MockState {
    items: Category[];
    loading: boolean;
    saving: boolean;
    error: string | null;
  }

  let state: MockState = {
    items: [],
    loading: false,
    saving: false,
    error: null,
  };

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  const setState = (patch: Partial<MockState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const load = vi.fn(async () => {});

  const addCategoryToTree = (nodes: Category[], category: Category): Category[] => {
    if (!category.parentId) {
      return [...nodes, category];
    }
    return nodes.map((node) => {
      if (node.id === category.parentId) {
        return {
          ...node,
          children: [...node.children, category],
        };
      }
      return {
        ...node,
        children: addCategoryToTree(node.children, category),
      };
    });
  };

  const updateCategoryInTree = (
    nodes: Category[],
    id: string,
    updater: (category: Category) => Category,
  ): Category[] => {
    return nodes.map((node) => {
      if (node.id === id) {
        return updater(node);
      }
      return {
        ...node,
        children: updateCategoryInTree(node.children, id, updater),
      };
    });
  };

  const removeCategoryFromTree = (nodes: Category[], id: string): Category[] => {
    return nodes
      .filter((node) => node.id !== id)
      .map((node) => ({
        ...node,
        children: removeCategoryFromTree(node.children, id),
      }));
  };

  const create = vi.fn(async (payload: { name: string; description?: string; parentId?: string | null }) => {
    const newItem: Category = {
      id: `mock-${Math.random().toString(36).slice(2, 8)}`,
      name: payload.name,
      description: payload.description ?? '',
      productCount: 0,
      parentId: payload.parentId ?? null,
      children: [],
      createdAt: undefined,
      updatedAt: undefined,
    };
    setState({ items: addCategoryToTree(state.items, newItem) });
    return newItem;
  });

  const update = vi.fn(
    async (id: string, payload: { name: string; description?: string; parentId?: string | null }) => {
      let updatedItem: Category | null = null;
      const nextItems = updateCategoryInTree(state.items, id, (category) => {
        updatedItem = {
          ...category,
          name: payload.name,
          description: payload.description ?? '',
          parentId: payload.parentId ?? category.parentId ?? null,
        };
        return updatedItem!;
      });
      setState({ items: nextItems });
      return (
        updatedItem ?? {
          id,
          name: payload.name,
          description: payload.description ?? '',
          productCount: 0,
          parentId: payload.parentId ?? null,
          children: [],
        }
      );
    },
  );

  const remove = vi.fn(async (id: string) => {
    setState({ items: removeCategoryFromTree(state.items, id) });
  });
  const clearError = vi.fn(() => {
    setState({ error: null });
  });

  const useCategoryStore = () => {
    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };
    const snapshot = React.useSyncExternalStore(subscribe, () => state);
    return {
      ...snapshot,
      load,
      create,
      update,
      remove,
      clearError,
    };
  };

  const setMockState = (next: Partial<MockState>) => {
    state = { ...state, ...next };
    emit();
  };

  const resetMockState = () => {
    state = {
      items: [],
      loading: false,
      saving: false,
      error: null,
    };
    listeners.clear();
    load.mockClear();
    create.mockClear();
    update.mockClear();
    remove.mockClear();
    clearError.mockClear();
  };

  const appendMockItem = (item: (typeof state.items)[number]) => {
    setState({ items: addCategoryToTree(state.items, item) });
  };

  return {
    useCategoryStore,
    __mock__: {
      setMockState,
      resetMockState,
      appendMockItem,
      load,
      create,
      update,
      remove,
      clearError,
    },
  };
});

interface MockStoreApi {
  setMockState: (state: Partial<{
    items: Category[];
    loading: boolean;
    saving: boolean;
    error: string | null;
  }>) => void;
  resetMockState: () => void;
  appendMockItem: (item: Category) => void;
  load: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
}

const getStoreMock = async (): Promise<MockStoreApi> => {
  const module = (await import('../stores/categoryStore')) as unknown as {
    __mock__: MockStoreApi;
  };
  return module.__mock__;
};

describe('CategoryManagementPanel', () => {

  beforeEach(async () => {
    const store = await getStoreMock();
    store.resetMockState();
  });

  it('allows inline creation of a new root category', async () => {
    const store = await getStoreMock();
    store.setMockState({ items: [] });

    render(<CategoryManagementPanel />);

    expect(store.load).toHaveBeenCalled();

    const addButton = await screen.findByRole('button', { name: '+ 항목 추가' });
    fireEvent.click(addButton);

    const nameInput = screen.getByPlaceholderText('카테고리를 입력하세요');
    fireEvent.change(nameInput, { target: { value: '  신선 식품  ' } });

    const rowElement = nameInput.closest('[data-testid^="category-row-"]');
    expect(rowElement).not.toBeNull();
    const rowWithin = within(rowElement as HTMLElement);

    const descriptionInput = rowWithin.getByPlaceholderText('하위 카테고리를 입력하세요');
    fireEvent.change(descriptionInput, { target: { value: '냉장 보관이 필요한 상품' } });

    fireEvent.click(rowWithin.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(store.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: '신선 식품', description: '냉장 보관이 필요한 상품' }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('신선 식품')).not.toBeNull();
    });
  });

  it('supports inline editing and saving of existing categories', async () => {
    const store = await getStoreMock();
    store.setMockState({
      items: [
        {
          id: 'cat-1',
          name: '식품',
          description: '모든 식품',
          productCount: 4,
          parentId: null,
          children: [],
        },
      ],
    });

    render(<CategoryManagementPanel />);

    const [row] = await screen.findAllByTestId('category-row-cat-1');
    fireEvent.click(within(row).getByRole('button', { name: '수정' }));

    const nameInput = within(row).getByPlaceholderText('카테고리를 입력하세요');
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.change(nameInput, { target: { value: '식품 재고' } });

    const descriptionInput = within(row).getByPlaceholderText('하위 카테고리를 입력하세요');
    fireEvent.change(descriptionInput, { target: { value: '' } });
    fireEvent.change(descriptionInput, { target: { value: '신선 식품과 일반 식품' } });

    fireEvent.click(within(row).getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(store.update).toHaveBeenCalledWith('cat-1', {
        name: '식품 재고',
        description: '신선 식품과 일반 식품',
        parentId: null,
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText('식품 재고').length).toBeGreaterThan(0);
    });
  });

  it('removes existing rows through inline delete action', async () => {
    const store = await getStoreMock();
    store.setMockState({
      items: [
        {
          id: 'cat-2',
          name: '생활용품',
          description: '생활 필수품',
          productCount: 2,
          parentId: null,
          children: [],
        },
      ],
    });

    render(<CategoryManagementPanel />);

    const row = await screen.findByTestId('category-row-cat-2');
    fireEvent.click(within(row).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(store.remove).toHaveBeenCalledWith('cat-2');
    });

    await waitFor(() => {
      expect(screen.queryByTestId('category-row-cat-2')).toBeNull();
    });
  });

});
