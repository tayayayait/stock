import { useSyncExternalStore } from 'react';

import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
  type Category,
  type CategoryPayload,
} from '../../../../services/categories';

const ensureCategoryChildren = (category: Category): Category => ({
  ...category,
  parentId: category.parentId ?? null,
  children: Array.isArray(category.children)
    ? category.children.map((child) => ensureCategoryChildren(child))
    : [],
});

const deepCloneCategory = (category: Category): Category => ({
  ...category,
  parentId: category.parentId ?? null,
  children: category.children.map((child) => deepCloneCategory(child)),
});

const findCategoryById = (nodes: Category[], id: string): Category | null => {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findCategoryById(node.children, id);
    if (found) {
      return found;
    }
  }
  return null;
};

const insertCategoryNodeInternal = (
  nodes: Category[],
  category: Category,
): [Category[], boolean] => {
  let inserted = false;
  const next = nodes.map((node) => {
    if (node.id === category.parentId) {
      inserted = true;
      return {
        ...node,
        children: [...node.children, deepCloneCategory({ ...category, parentId: node.id })],
      };
    }

    const [children, childInserted] = insertCategoryNodeInternal(node.children, category);
    if (childInserted) {
      inserted = true;
      return {
        ...node,
        children,
      };
    }

    return node;
  });

  return [inserted ? next : nodes, inserted];
};

const insertCategoryNode = (nodes: Category[], category: Category): Category[] => {
  const normalized = ensureCategoryChildren(category);

  if (!normalized.parentId) {
    return [...nodes, deepCloneCategory({ ...normalized, parentId: null })];
  }

  const [next, inserted] = insertCategoryNodeInternal(nodes, normalized);

  if (inserted) {
    return next;
  }

  return [...nodes, deepCloneCategory({ ...normalized, parentId: null })];
};

const removeCategoryNode = (nodes: Category[], id: string): [Category[], Category | null] => {
  let removed: Category | null = null;
  const next: Category[] = [];

  nodes.forEach((node) => {
    if (node.id === id) {
      removed = node;
      return;
    }
    const [childChildren, childRemoved] = removeCategoryNode(node.children, id);
    if (childRemoved) {
      removed = childRemoved;
      next.push({
        ...node,
        children: childChildren,
      });
    } else {
      next.push(node);
    }
  });

  if (!removed) {
    return [nodes, null];
  }

  return [next, removed];
};

const replaceCategoryNode = (nodes: Category[], category: Category): Category[] => {
  const [without, removed] = removeCategoryNode(nodes, category.id);
  const preservedChildren = removed?.children ?? [];
  const normalized = ensureCategoryChildren(category);
  const mergedChildren = normalized.children.length
    ? normalized.children.map((child) => ensureCategoryChildren(child))
    : preservedChildren.map((child) => ensureCategoryChildren(child));
  const merged: Category = {
    ...normalized,
    children: mergedChildren,
  };
  const targetNodes = without === nodes && !removed ? nodes : without;
  return insertCategoryNode(targetNodes.filter(Boolean) as Category[], merged);
};

type Listener = () => void;

interface CategoryStoreState {
  items: Category[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  lastLoadedAt: number | null;
}

const createInitialState = (): CategoryStoreState => ({
  items: [],
  loading: false,
  saving: false,
  error: null,
  lastLoadedAt: null,
});

class CategoryStore {
  private listeners = new Set<Listener>();

  private state: CategoryStoreState = createInitialState();

  private setState(patch: Partial<CategoryStoreState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  getSnapshot = (): CategoryStoreState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  load = async (query?: string): Promise<void> => {
    this.setState({ loading: true, error: null });
    try {
      const items = await fetchCategories(query);
      this.setState({
        items: items.map((item) => ensureCategoryChildren(item)),
        loading: false,
        lastLoadedAt: Date.now(),
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '카테고리를 불러오지 못했습니다.';
      this.setState({ loading: false, error: message });
      throw error;
    }
  };

  create = async (payload: CategoryPayload): Promise<Category> => {
    this.setState({ saving: true, error: null });
    try {
      const item = await createCategory(payload);
      const normalized = ensureCategoryChildren(item);
      const nextItems = insertCategoryNode(this.state.items, normalized);
      this.setState({ items: nextItems, saving: false });
      return normalized;
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '카테고리를 생성하지 못했습니다.';
      this.setState({ saving: false, error: message });
      throw error;
    }
  };

  update = async (categoryId: string, payload: CategoryPayload): Promise<Category> => {
    this.setState({ saving: true, error: null });
    try {
      const existing = findCategoryById(this.state.items, categoryId);
      const item = await updateCategory(categoryId, payload);
      const normalizedItem = ensureCategoryChildren(item);
      const mergedChildren = normalizedItem.children.length
        ? normalizedItem.children.map((child) => ensureCategoryChildren(child))
        : (existing?.children ?? []).map((child) => ensureCategoryChildren(child));
      const merged: Category = {
        ...normalizedItem,
        children: mergedChildren,
      };
      const nextItems = replaceCategoryNode(this.state.items, merged);
      this.setState({
        items: nextItems,
        saving: false,
      });
      return merged;
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '카테고리를 수정하지 못했습니다.';
      this.setState({ saving: false, error: message });
      throw error;
    }
  };

  remove = async (categoryId: string): Promise<void> => {
    this.setState({ saving: true, error: null });
    try {
      const existing = findCategoryById(this.state.items, categoryId);
      if (existing && existing.children.length > 0) {
        const message = '하위 카테고리가 있는 분류는 삭제할 수 없습니다.';
        this.setState({ saving: false, error: message });
        throw new Error(message);
      }
      await deleteCategory(categoryId);
      const [items] = removeCategoryNode(this.state.items, categoryId);
      this.setState({
        items,
        saving: false,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '카테고리를 삭제하지 못했습니다.';
      this.setState({ saving: false, error: message });
      throw error;
    }
  };

  clearError = (): void => {
    if (this.state.error) {
      this.setState({ error: null });
    }
  };

  reset = (): void => {
    this.state = createInitialState();
    this.emit();
  };

  hydrate = (state: Partial<CategoryStoreState>): void => {
    this.state = { ...this.state, ...state };
    this.emit();
  };
}

export const categoryStore = new CategoryStore();

export const useCategoryStore = () => {
  const state = useSyncExternalStore(categoryStore.subscribe, categoryStore.getSnapshot);

  return {
    ...state,
    load: categoryStore.load,
    create: categoryStore.create,
    update: categoryStore.update,
    remove: categoryStore.remove,
    clearError: categoryStore.clearError,
  };
};

export const __test__ = {
  createInitialState,
  hydrate: (state: Partial<CategoryStoreState>) => categoryStore.hydrate(state),
};
