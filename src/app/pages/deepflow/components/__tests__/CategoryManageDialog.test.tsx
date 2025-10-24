import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CategoryManageDialog from '../CategoryManageDialog';

const createMock = vi.fn();
const clearErrorMock = vi.fn();

const useCategoryStoreMock = vi.fn();

vi.mock('../../stores/categoryStore', () => ({
  useCategoryStore: () => useCategoryStoreMock(),
}));

describe('CategoryManageDialog', () => {
  beforeEach(() => {
    createMock.mockReset();
    clearErrorMock.mockReset();
    useCategoryStoreMock.mockReturnValue({
      items: [],
      create: createMock,
      saving: false,
      error: null,
      clearError: clearErrorMock,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('prefills the category input when opened', () => {
    render(
      <CategoryManageDialog
        mode="category"
        open
        onClose={vi.fn()}
        onCompleted={vi.fn()}
        initialCategory="식품"
      />,
    );

    const categoryInput = screen.getByLabelText('카테고리 이름') as HTMLInputElement;
    expect(categoryInput.value).toBe('식품');
    expect(clearErrorMock).toHaveBeenCalled();
  });

  it('shows validation error when category is empty', async () => {
    const onCompleted = vi.fn();
    render(<CategoryManageDialog mode="category" open onClose={vi.fn()} onCompleted={onCompleted} />);

    const [submitButton] = screen.getAllByRole('button', { name: '저장' });
    fireEvent.click(submitButton);

    expect(await screen.findByText('카테고리 이름을 입력해 주세요.')).toBeDefined();
    expect(createMock).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it('creates a category when in category mode', async () => {
    const onClose = vi.fn();
    const onCompleted = vi.fn();
    createMock.mockResolvedValue({ id: 'cat-1', name: '가전', parentId: null, children: [] });

    render(
      <CategoryManageDialog
        mode="category"
        open
        onClose={onClose}
        onCompleted={onCompleted}
        initialCategory="식품"
      />,
    );

    const [submitButton] = screen.getAllByRole('button', { name: '저장' });
    fireEvent.click(submitButton);

    await waitFor(() => expect(createMock).toHaveBeenCalledWith({ name: '식품' }));
    expect(onCompleted).toHaveBeenCalledWith({ category: '가전' });
    expect(onClose).toHaveBeenCalled();
  });

  it('requires a subcategory in subCategory mode', async () => {
    const onCompleted = vi.fn();

    useCategoryStoreMock.mockReturnValue({
      items: [
        { id: 'root-1', name: '식품', description: '', productCount: 0, parentId: null, children: [] },
      ],
      create: createMock,
      saving: false,
      error: null,
      clearError: clearErrorMock,
    });

    render(
      <CategoryManageDialog
        mode="subCategory"
        open
        onClose={vi.fn()}
        onCompleted={onCompleted}
        initialCategory="식품"
      />,
    );

    const [submitButton] = screen.getAllByRole('button', { name: '저장' });
    fireEvent.click(submitButton);

    expect(await screen.findByText('하위 카테고리 이름을 입력해 주세요.')).toBeDefined();
    expect(createMock).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it('creates a subcategory when in subCategory mode', async () => {
    const onClose = vi.fn();
    const onCompleted = vi.fn();

    useCategoryStoreMock.mockReturnValue({
      items: [
        { id: 'root-1', name: '식품', description: '', productCount: 0, parentId: null, children: [] },
      ],
      create: createMock,
      saving: false,
      error: null,
      clearError: clearErrorMock,
    });

    createMock.mockResolvedValue({
      id: 'child-1',
      name: '간식',
      description: '',
      productCount: 0,
      parentId: 'root-1',
      children: [],
    });

    render(
      <CategoryManageDialog
        mode="subCategory"
        open
        onClose={onClose}
        onCompleted={onCompleted}
        initialCategory="식품"
      />,
    );

    fireEvent.change(screen.getByLabelText('하위 카테고리'), {
      target: { value: '간식' },
    });

    const [submitButton] = screen.getAllByRole('button', { name: '저장' });
    fireEvent.click(submitButton);

    await waitFor(() => expect(createMock).toHaveBeenCalledWith({ name: '간식', parentId: 'root-1' }));
    expect(onCompleted).toHaveBeenCalledWith({ category: '식품', subCategory: '간식' });
    expect(onClose).toHaveBeenCalled();
  });
});
