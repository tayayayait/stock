export type SaleMock = {
  id: string;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  currency: string;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  orderedAt: string;
};

export const sales: SaleMock[] = [
  {
    id: 'sale-001',
    orderNumber: 'SO-202501-001',
    customerName: '한성무역',
    totalAmount: 1280000,
    currency: 'KRW',
    status: 'completed',
    orderedAt: '2025-01-03T09:15:00+09:00',
  },
  {
    id: 'sale-002',
    orderNumber: 'SO-202501-002',
    customerName: '세림유통',
    totalAmount: 986000,
    currency: 'KRW',
    status: 'pending',
    orderedAt: '2025-01-04T13:42:00+09:00',
  },
  {
    id: 'sale-003',
    orderNumber: 'SO-202501-003',
    customerName: 'Global Foods',
    totalAmount: 2145000,
    currency: 'KRW',
    status: 'completed',
    orderedAt: '2025-01-05T10:08:00+09:00',
  },
  {
    id: 'sale-004',
    orderNumber: 'SO-202501-004',
    customerName: '에이스몰',
    totalAmount: 540000,
    currency: 'KRW',
    status: 'pending',
    orderedAt: '2025-01-06T16:25:00+09:00',
  },
  {
    id: 'sale-005',
    orderNumber: 'SO-202501-005',
    customerName: 'Dawon Trading',
    totalAmount: 1789000,
    currency: 'KRW',
    status: 'completed',
    orderedAt: '2025-01-07T11:30:00+09:00',
  },
  {
    id: 'sale-006',
    orderNumber: 'SO-202501-006',
    customerName: '한빛마트',
    totalAmount: 760000,
    currency: 'KRW',
    status: 'cancelled',
    orderedAt: '2025-01-08T08:55:00+09:00',
  },
  {
    id: 'sale-007',
    orderNumber: 'SO-202501-007',
    customerName: 'Bright Retail',
    totalAmount: 1540000,
    currency: 'KRW',
    status: 'completed',
    orderedAt: '2025-01-08T14:10:00+09:00',
  },
  {
    id: 'sale-008',
    orderNumber: 'SO-202501-008',
    customerName: '메가스토어',
    totalAmount: 960000,
    currency: 'KRW',
    status: 'pending',
    orderedAt: '2025-01-09T09:48:00+09:00',
  },
  {
    id: 'sale-009',
    orderNumber: 'SO-202501-009',
    customerName: 'Skyline Imports',
    totalAmount: 2380000,
    currency: 'KRW',
    status: 'refunded',
    orderedAt: '2025-01-09T15:22:00+09:00',
  },
  {
    id: 'sale-010',
    orderNumber: 'SO-202501-010',
    customerName: '프라임디스트리뷰션',
    totalAmount: 1125000,
    currency: 'KRW',
    status: 'completed',
    orderedAt: '2025-01-10T10:55:00+09:00',
  },
];

export default sales;
