import type { PackageMock } from './packages';
import { packages } from './packages';
import type { ReportMock } from './reports';
import { reports } from './reports';
import type { ProductCatalogMock, ProductRecordMock } from './products';
import { productCatalog } from './products';
import type { SaleMock } from './sales';
import { sales } from './sales';

const collections = {
  sales,
  packages,
  reports,
  products: productCatalog,
} as const;

export type MockCollections = typeof collections;
export type MockCollectionName = keyof MockCollections;

export function isMockCollectionName(name: string): name is MockCollectionName {
  return Object.prototype.hasOwnProperty.call(collections, name);
}

export function getMockCollection<TName extends MockCollectionName>(name: TName): MockCollections[TName] | undefined {
  return collections[name];
}

export function listMockCollections(): MockCollections {
  return collections;
}

export type { SaleMock, PackageMock, ReportMock, ProductRecordMock, ProductCatalogMock };

export default collections;
