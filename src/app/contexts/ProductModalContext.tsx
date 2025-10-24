import React, { createContext, useContext } from 'react';
import { Product } from '../../../types';

export interface ProductModalContextValue {
  openAddProduct: () => void;
  openEditProduct: (product: Product) => void;
  closeModal: () => void;
}

const ProductModalContext = createContext<ProductModalContextValue | undefined>(undefined);

export const ProductModalProvider = ProductModalContext.Provider;

export const useProductModal = () => {
  const context = useContext(ProductModalContext);
  if (!context) {
    throw new Error('useProductModal must be used within a ProductModalProvider');
  }

  return context;
};

export default ProductModalContext;
