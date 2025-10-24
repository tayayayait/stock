export type PackageMock = {
  id: string;
  code: string;
  name: string;
  weightKg: number;
  dimensionsCm: { width: number; height: number; depth: number };
  status: 'ready' | 'in_transit' | 'delivered' | 'returned';
  updatedAt: string;
};

export const packages: PackageMock[] = [
  {
    id: 'pkg-001',
    code: 'PKG-2401-001',
    name: '냉장 식품 세트',
    weightKg: 12.4,
    dimensionsCm: { width: 45, height: 35, depth: 28 },
    status: 'delivered',
    updatedAt: '2025-01-03T15:30:00+09:00',
  },
  {
    id: 'pkg-002',
    code: 'PKG-2401-002',
    name: '프리미엄 과일 패키지',
    weightKg: 8.2,
    dimensionsCm: { width: 40, height: 30, depth: 25 },
    status: 'in_transit',
    updatedAt: '2025-01-04T11:12:00+09:00',
  },
  {
    id: 'pkg-003',
    code: 'PKG-2401-003',
    name: '가공식품 묶음',
    weightKg: 15.6,
    dimensionsCm: { width: 55, height: 38, depth: 33 },
    status: 'ready',
    updatedAt: '2025-01-05T09:05:00+09:00',
  },
  {
    id: 'pkg-004',
    code: 'PKG-2401-004',
    name: '건강식 세트',
    weightKg: 10.1,
    dimensionsCm: { width: 48, height: 36, depth: 26 },
    status: 'ready',
    updatedAt: '2025-01-05T16:45:00+09:00',
  },
  {
    id: 'pkg-005',
    code: 'PKG-2401-005',
    name: '해외 직구 패키지',
    weightKg: 18.9,
    dimensionsCm: { width: 60, height: 42, depth: 35 },
    status: 'in_transit',
    updatedAt: '2025-01-06T12:22:00+09:00',
  },
  {
    id: 'pkg-006',
    code: 'PKG-2401-006',
    name: '정기배송 상품',
    weightKg: 6.8,
    dimensionsCm: { width: 38, height: 28, depth: 22 },
    status: 'delivered',
    updatedAt: '2025-01-07T10:18:00+09:00',
  },
  {
    id: 'pkg-007',
    code: 'PKG-2401-007',
    name: '소형 가전 패키지',
    weightKg: 9.3,
    dimensionsCm: { width: 50, height: 32, depth: 30 },
    status: 'returned',
    updatedAt: '2025-01-07T18:02:00+09:00',
  },
  {
    id: 'pkg-008',
    code: 'PKG-2401-008',
    name: '생활용품 세트',
    weightKg: 7.5,
    dimensionsCm: { width: 42, height: 34, depth: 24 },
    status: 'delivered',
    updatedAt: '2025-01-08T09:40:00+09:00',
  },
  {
    id: 'pkg-009',
    code: 'PKG-2401-009',
    name: '친환경 식품 상자',
    weightKg: 11.2,
    dimensionsCm: { width: 46, height: 33, depth: 28 },
    status: 'in_transit',
    updatedAt: '2025-01-08T14:55:00+09:00',
  },
  {
    id: 'pkg-010',
    code: 'PKG-2401-010',
    name: '수출 견본품 세트',
    weightKg: 5.9,
    dimensionsCm: { width: 35, height: 26, depth: 20 },
    status: 'ready',
    updatedAt: '2025-01-09T08:48:00+09:00',
  },
];

export default packages;
