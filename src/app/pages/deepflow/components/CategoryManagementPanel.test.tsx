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
    const [, forceRender] = React.useReducer((value) => value + 1, 0);
    React.useEffect(() => {
      const listener = () => forceRender();
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, []);

    return {
      ...state,
      load,
      create,
      update,
      remove,
      clearError,
    };
  };

  const resetMockState = () => {
    state = {
      items: [],
      loading: false,
      saving: false,
      error: null,
    };
    load.mockClear();
    create.mockClear();
    update.mockClear();
    remove.mockClear();
    clearError.mockClear();
    listeners.clear();
  };

  const setMockState = (patch: Partial<MockState>) => {
    state = { ...state, ...patch };
    emit();
  };

  return {
    useCategoryStore,
    __mock__: {
      resetMockState,
      setMockState,
      load,
      create,
      update,
      remove,
      clearError,
    },
  };
});

interface MockStoreApi {
  resetMockState: () => void;
  setMockState: (patch: Partial<{ items: Category[]; loading: boolean; saving: boolean; error: string | null }>) => void;
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

const openDialogByRoleName = async (name: RegExp) => {
  return waitFor(() => screen.getByRole('dialog', { name }));
};

describe('CategoryManagementPanel', () => {
  beforeEach(async () => {
    const store = await getStoreMock();
    store.resetMockState();
  });

  it('opens the root category dialog and creates an entry', async () => {
    const store = await getStoreMock();
    store.setMockState({ items: [] });

    render(<CategoryManagementPanel />);

    expect(store.load).toHaveBeenCalled();

    const addButton = await screen.findByRole('button', { name: /\+ 항목 추가/ });
    fireEvent.click(addButton);

    const dialog = await openDialogByRoleName(/카테고리/);
    const inputs = within(dialog).getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: '신선 식품' } });

    const form = dialog.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ name: '신선 식품' }));
    });

    await waitFor(() => {
      expect(screen.getByText('신선 식품')).toBeTruthy();
    });
  });

  it('creates a subcategory via the modal workflow', async () => {
    const store = await getStoreMock();
    store.setMockState({
      items: [
        {
          id: 'cat-parent',
          name: '가공 식품',
          description: '',
          parentId: null,
          productCount: 0,
          children: [],
        },
      ],
    });

    render(<CategoryManagementPanel />);

    const row = await screen.findByTestId('category-row-cat-parent');
    fireEvent.click(within(row).getByRole('button', { name: /하위 추가/ }));

    const dialog = await openDialogByRoleName(/카테고리/);
    const inputs = within(dialog).getAllByRole('textbox');
    expect((inputs[0] as HTMLInputElement).value).toBe('가공 식품');

    fireEvent.change(inputs[1], { target: { value: '과자' } });
    const form = dialog.querySelector('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(store.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: '과자', parentId: 'cat-parent' }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('과자')).toBeTruthy();
    });
  });

  it('edits an existing category through the edit dialog', async () => {
    const store = await getStoreMock();
    store.setMockState({
      items: [
        {
          id: 'cat-1',
          name: '잡화',
          description: '생활 잡화',
          parentId: null,
          productCount: 0,
          children: [],
        },
      ],
    });

    render(<CategoryManagementPanel />);

    const row = await screen.findByTestId('category-row-cat-1');
    fireEvent.click(within(row).getByRole('button', { name: /수정/ }));

    const dialog = await openDialogByRoleName(/카테고리/);
    const [nameInput, descriptionInput] = within(dialog).getAllByRole('textbox');

    fireEvent.change(nameInput, { target: { value: '생활 잡화' } });
    fireEvent.change(descriptionInput, { target: { value: '가정용 생활 잡화' } });

    const form = dialog.querySelector('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(store.update).toHaveBeenCalledWith('cat-1', {
        name: '생활 잡화',
        description: '가정용 생활 잡화',
        parentId: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('생활 잡화')).toBeTruthy();
    });
  });

  it('confirms deletion through the dialog', async () => {
    const store = await getStoreMock();
    store.setMockState({
      items: [
        {
          id: 'cat-2',
          name: '문구류',
          description: '',
          parentId: null,
          productCount: 0,
          children: [],
        },
      ],
    });

    render(<CategoryManagementPanel />);

    const row = await screen.findByTestId('category-row-cat-2');
    fireEvent.click(within(row).getByRole('button', { name: /삭제/ }));

    const dialog = await openDialogByRoleName(/삭제/);
    const confirmButton = within(dialog).getByRole('button', { name: /삭제/ });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(store.remove).toHaveBeenCalledWith('cat-2');
    });
  });

  it('blocks deletion when a category has children', async () => {
    const store = await getStoreMock();
    store.setMockState({
      items: [
        {
          id: 'cat-root',
          name: '주류',
          description: '',
          parentId: null,
          productCount: 0,
          children: [
            {
              id: 'cat-child',
              name: '와인',
              description: '',
              parentId: 'cat-root',
              productCount: 0,
              children: [],
            },
          ],
        },
      ],
    });

    render(<CategoryManagementPanel />);

    const row = await screen.findByTestId('category-row-cat-root');
    fireEvent.click(within(row).getByRole('button', { name: /삭제/ }));

    const dialog = await openDialogByRoleName(/삭제/);
    const confirmButton = within(dialog).getByRole('button', { name: /삭제/ }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    expect(store.remove).not.toHaveBeenCalled();
  });
});

