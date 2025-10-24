export type ProductRecordMock = {
  productId: string;
  legacyProductId: number;
  sku: string;
  imageUrl: string | null;
  name: string;
  category: string;
  subCategory: string;
  brand: string | null;
  unit: string;
  packCase: string;
  pack: number;
  casePack: number;
  abcGrade: 'A' | 'B' | 'C';
  xyzGrade: 'X' | 'Y' | 'Z';
  bufferRatio: number;
  dailyAvg: number;
  dailyStd: number;
  totalInbound: number;
  totalOutbound: number;
  avgOutbound7d: number;
  isActive: boolean;
  onHand: number;
  reserved: number;
  risk: '정상' | '결품위험' | '과잉';
  expiryDays: number | null;
  supplyPrice: number | null;
  salePrice: number | null;
  referencePrice: number | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
  inventory?: Array<{
    warehouseCode: string;
    locationCode: string;
    onHand: number;
    reserved: number;
  }>;
};

export type ProductCatalogMock = {
  items: readonly ProductRecordMock[];
  count: number;
};

export const productCatalog: ProductCatalogMock = {
  items: [
    {
      productId: 'P-0001',
      legacyProductId: 101,
      sku: 'SKU-DAIRY-001',
      imageUrl: null,
      name: '무항생제 우유 1L',
      category: '냉장식품',
      subCategory: '유제품',
      brand: '프레시팜',
      unit: 'EA',
      packCase: '1/12',
      pack: 1,
      casePack: 12,
      abcGrade: 'A',
      xyzGrade: 'X',
      bufferRatio: 0.25,
      dailyAvg: 180,
      dailyStd: 24,
      totalInbound: 12600,
      totalOutbound: 12180,
      avgOutbound7d: 175,
      isActive: true,
      onHand: 420,
      reserved: 60,
      risk: '정상',
      expiryDays: 14,
      supplyPrice: 1080,
      salePrice: 1450,
      referencePrice: 1500,
      currency: 'KRW',
      createdAt: '2024-10-01T09:00:00+09:00',
      updatedAt: '2025-01-04T12:00:00+09:00',
      inventory: [
        { warehouseCode: 'ICN', locationCode: 'R1-A', onHand: 280, reserved: 40 },
        { warehouseCode: 'PUS', locationCode: 'C2-B', onHand: 140, reserved: 20 },
      ],
    },
    {
      productId: 'P-0002',
      legacyProductId: 204,
      sku: 'SKU-DRY-014',
      imageUrl: null,
      name: '프리미엄 참치캔 150g',
      category: '가공식품',
      subCategory: '통조림',
      brand: '블루오션',
      unit: 'EA',
      packCase: '3/24',
      pack: 3,
      casePack: 24,
      abcGrade: 'B',
      xyzGrade: 'Y',
      bufferRatio: 0.3,
      dailyAvg: 95,
      dailyStd: 12,
      totalInbound: 8800,
      totalOutbound: 8420,
      avgOutbound7d: 98,
      isActive: true,
      onHand: 380,
      reserved: 35,
      risk: '정상',
      expiryDays: 720,
      supplyPrice: 890,
      salePrice: 1290,
      referencePrice: 1350,
      currency: 'KRW',
      createdAt: '2024-08-12T11:25:00+09:00',
      updatedAt: '2025-01-03T15:10:00+09:00',
      inventory: [
        { warehouseCode: 'ICN', locationCode: 'D3-C', onHand: 260, reserved: 20 },
        { warehouseCode: 'PUS', locationCode: 'F1-A', onHand: 120, reserved: 15 },
      ],
    },
    {
      productId: 'P-0003',
      legacyProductId: 318,
      sku: 'SKU-FRZ-027',
      imageUrl: null,
      name: '냉동 닭가슴살 2kg',
      category: '냉동식품',
      subCategory: '축산',
      brand: '헬시밀',
      unit: 'EA',
      packCase: '1/6',
      pack: 1,
      casePack: 6,
      abcGrade: 'A',
      xyzGrade: 'Z',
      bufferRatio: 0.35,
      dailyAvg: 60,
      dailyStd: 15,
      totalInbound: 5400,
      totalOutbound: 4980,
      avgOutbound7d: 64,
      isActive: true,
      onHand: 320,
      reserved: 25,
      risk: '과잉',
      expiryDays: 365,
      supplyPrice: 5200,
      salePrice: 6750,
      referencePrice: 6900,
      currency: 'KRW',
      createdAt: '2024-06-18T08:45:00+09:00',
      updatedAt: '2025-01-02T09:40:00+09:00',
      inventory: [
        { warehouseCode: 'ICN', locationCode: 'F5-D', onHand: 200, reserved: 10 },
        { warehouseCode: 'PUS', locationCode: 'B2-E', onHand: 120, reserved: 15 },
      ],
    },
    {
      productId: 'P-0004',
      legacyProductId: 452,
      sku: 'SKU-BEV-033',
      imageUrl: null,
      name: '콜드브루 원액 500ml',
      category: '음료',
      subCategory: '커피',
      brand: '어반로스터스',
      unit: 'EA',
      packCase: '1/8',
      pack: 1,
      casePack: 8,
      abcGrade: 'A',
      xyzGrade: 'Y',
      bufferRatio: 0.22,
      dailyAvg: 140,
      dailyStd: 18,
      totalInbound: 10100,
      totalOutbound: 9870,
      avgOutbound7d: 142,
      isActive: true,
      onHand: 230,
      reserved: 45,
      risk: '정상',
      expiryDays: 120,
      supplyPrice: 3100,
      salePrice: 4200,
      referencePrice: 4300,
      currency: 'KRW',
      createdAt: '2024-09-05T10:20:00+09:00',
      updatedAt: '2025-01-06T14:30:00+09:00',
      inventory: [
        { warehouseCode: 'ICN', locationCode: 'B1-A', onHand: 150, reserved: 30 },
        { warehouseCode: 'PUS', locationCode: 'E4-B', onHand: 80, reserved: 15 },
      ],
    },
    {
      productId: 'P-0005',
      legacyProductId: 563,
      sku: 'SKU-BAK-041',
      imageUrl: null,
      name: '천연발효 통밀식빵',
      category: '베이커리',
      subCategory: '빵',
      brand: '브레드마스터',
      unit: 'EA',
      packCase: '1/10',
      pack: 1,
      casePack: 10,
      abcGrade: 'B',
      xyzGrade: 'X',
      bufferRatio: 0.28,
      dailyAvg: 75,
      dailyStd: 10,
      totalInbound: 6100,
      totalOutbound: 5880,
      avgOutbound7d: 78,
      isActive: true,
      onHand: 180,
      reserved: 20,
      risk: '결품위험',
      expiryDays: 5,
      supplyPrice: 2100,
      salePrice: 2900,
      referencePrice: 2950,
      currency: 'KRW',
      createdAt: '2024-11-11T06:40:00+09:00',
      updatedAt: '2025-01-05T07:55:00+09:00',
      inventory: [
        { warehouseCode: 'ICN', locationCode: 'A3-C', onHand: 110, reserved: 12 },
        { warehouseCode: 'PUS', locationCode: 'G1-D', onHand: 70, reserved: 8 },
      ],
    },
  ],
  count: 5,
};

export default productCatalog;
