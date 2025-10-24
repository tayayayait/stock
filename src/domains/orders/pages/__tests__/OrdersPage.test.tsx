import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Partner,
  PurchaseOrder,
  PurchaseOrderSummary,
  SalesOrder,
} from '../../../../services/orders';
import type { Product } from '../../../../domains/products';
import type { OrdersLocation, OrdersWarehouse } from '../../components/types';
import OrdersPage from '../OrdersPage';
import { ToastProvider } from '../../../../components/Toaster';

const navigateMock = vi.hoisted(() => vi.fn());
const listPartnersMock = vi.hoisted(() => vi.fn());
const createPartnerMock = vi.hoisted(() => vi.fn());
const listPurchaseOrdersMock = vi.hoisted(() => vi.fn());
const getPurchaseOrderMock = vi.hoisted(() => vi.fn());
const recordPurchaseReceiptMock = vi.hoisted(() => vi.fn());
const createPurchaseOrderMock = vi.hoisted(() => vi.fn());
const listSalesOrdersMock = vi.hoisted(() => vi.fn());
const getSalesOrderMock = vi.hoisted(() => vi.fn());
const recordSalesShipmentMock = vi.hoisted(() => vi.fn());
const createSalesOrderMock = vi.hoisted(() => vi.fn());
const fetchWarehousesMock = vi.hoisted(() => vi.fn());
const fetchLocationsMock = vi.hoisted(() => vi.fn());
const fetchProductsMock = vi.hoisted(() => vi.fn());
const submitMovementMock = vi.hoisted(() => vi.fn());

const TEXT = {
  formTitle: '\uC0C8 \uC8FC\uBB38 \uC791\uC131',
  purchaseSubmit: '\uC785\uACE0',
  salesSubmit: '\uCD9C\uACE0',
  salesToggle: '\uCD9C\uACE0 \uC8FC\uBB38\uC11C',
  warehouseLabel: '\uCC3D\uACE0',
  locationLabel: '\uC0C1\uC138 \uC704\uCE58',
  partnerLabel: '\uAC70\uB798\uCC98',
  inboundDateLabel: '\uC785\uACE0\uC77C',
  outboundDateLabel: '\uCD9C\uACE0\uC77C',
  productLabel: '\uC0C1\uD488',
  quantityLabel: '\uC218\uB7C9 / \uB2E8\uC704',
  warehouseFirst: '\uBA3C\uC800 \uCC3D\uACE0\uB97C \uC120\uD0DD\uD558\uC138\uC694',
  locationSelect: '\uC0C1\uC138 \uC704\uCE58 \uC120\uD0DD',
  warehouseSelect: '\uCC3D\uACE0 \uC120\uD0DD',
  requireWarehouse: '\uCC3D\uACE0\uC640 \uC0C1\uC138\uC704\uCE58\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.',
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../components/WarehouseLocationSelect', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: ({ value, warehouses, locationsByWarehouse, onChange, onClear, onRequestLocations }: any) => {
      const [warehouseCode, setWarehouseCode] = ReactModule.useState<string>(value.warehouseCode ?? '');
      const [locationCode, setLocationCode] = ReactModule.useState<string>(value.locationCode ?? '');

      const locations: OrdersLocation[] = warehouseCode ? locationsByWarehouse[warehouseCode] ?? [] : [];

      return (
        <div>
          <select
            aria-label={TEXT.warehouseLabel}
            value={warehouseCode}
            onChange={(event) => {
              const code = event.target.value;
              setWarehouseCode(code);
              setLocationCode('');
              if (code) {
                void onRequestLocations?.(code);
              }
              if (!code) {
                onClear?.();
              }
            }}
          >
            <option value="">{TEXT.warehouseSelect}</option>
            {warehouses.map((warehouse: OrdersWarehouse) => (
              <option key={warehouse.code} value={warehouse.code}>
                {warehouse.name} ({warehouse.code})
              </option>
            ))}
          </select>
          <select
            aria-label={TEXT.locationLabel}
            value={locationCode}
            onChange={(event) => {
              const next = event.target.value;
              setLocationCode(next);
              if (!next) {
                onClear?.();
                return;
              }
              const warehouse = warehouses.find((entry: OrdersWarehouse) => entry.code === warehouseCode);
              const location = locations.find((entry) => entry.code === next);
              if (warehouse && location) {
                onChange?.({
                  warehouseId: warehouse.id,
                  warehouseCode: warehouse.code,
                  locationId: location.id,
                  locationCode: location.code,
                });
              }
            }}
          >
            <option value="">{warehouseCode ? TEXT.locationSelect : TEXT.warehouseFirst}</option>
            {locations.map((location) => (
              <option key={location.code} value={location.code}>
                {(location.name ?? location.code) + ` (${location.code})`}
              </option>
            ))}
          </select>
        </div>
      );
    },
  };
});

vi.mock('../../../../services/products', async () => {
  const actual = await vi.importActual<typeof import('../../../../services/products')>(
    '../../../../services/products',
  );
  return {
    ...actual,
    fetchProducts: fetchProductsMock,
  };
});

vi.mock('../../../../services/orders', async () => {
  const actual = await vi.importActual<typeof import('../../../../services/orders')>(
    '../../../../services/orders',
  );
  return {
    ...actual,
    listPartners: listPartnersMock,
    createPartner: createPartnerMock,
    createPurchaseOrder: createPurchaseOrderMock,
    listPurchaseOrders: listPurchaseOrdersMock,
    getPurchaseOrder: getPurchaseOrderMock,
    recordPurchaseReceipt: recordPurchaseReceiptMock,
    listSalesOrders: listSalesOrdersMock,
    getSalesOrder: getSalesOrderMock,
    recordSalesShipment: recordSalesShipmentMock,
    createSalesOrder: createSalesOrderMock,
  };
});

vi.mock('../../../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../../../services/api')>(
    '../../../../services/api',
  );
  return {
    ...actual,
    fetchWarehouses: fetchWarehousesMock,
    fetchLocations: fetchLocationsMock,
  };
});

vi.mock('../../../../services/movements', async () => {
  const actual = await vi.importActual<typeof import('../../../../services/movements')>(
    '../../../../services/movements',
  );
  return {
    ...actual,
    submitMovement: submitMovementMock,
  };
});

const renderOrdersPage = () =>
  render(
    <ToastProvider>
      <OrdersPage />
    </ToastProvider>,
  );

const warehouses: OrdersWarehouse[] = [
  {
    id: 'wh-icn',
    code: 'WHS-ICN',
    name: 'Incheon Distribution Center',
    address: 'Incheon Jung-gu Airport Rd',
    notes: 'Primary inbound warehouse',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'wh-gsn',
    code: 'WHS-GSN',
    name: 'Gangseo Delivery Hub',
    address: 'Seoul Gangseo-gu',
    notes: 'Outbound focused',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
];

const locationsByWarehouse: Record<string, OrdersLocation[]> = {
  'WHS-ICN': [
    {
      id: 'loc-icn-01',
      code: 'LOC-ICN-01',
      name: 'Inbound Zone 1',
      warehouseCode: 'WHS-ICN',
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'loc-icn-02',
      code: 'LOC-ICN-02',
      name: 'Inbound Zone 2',
      warehouseCode: 'WHS-ICN',
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  'WHS-GSN': [
    {
      id: 'loc-gsn-01',
      code: 'LOC-GSN-01',
      name: 'Outbound Zone 1',
      warehouseCode: 'WHS-GSN',
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
};

const productCatalog: Product[] = [
  {
    productId: 'prod-apple',
    legacyProductId: 1,
    sku: 'ING-APPLE-10KG',
    name: 'Apples 10kg',
    category: 'Fruit',
    subCategory: 'Apple',
    brand: '',
    unit: 'EA',
    packCase: '1/10',
    pack: 1,
    casePack: 10,
    abcGrade: 'A',
    xyzGrade: 'X',
    bufferRatio: 0.2,
    dailyAvg: 10,
    dailyStd: 1,
    totalInbound: 0,
    totalOutbound: 0,
    avgOutbound7d: 0,
    isActive: true,
    onHand: 100,
    reserved: 10,
    risk: 'Normal',
    supplyPrice: null,
    salePrice: null,
    referencePrice: null,
    currency: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    inventory: [],
  },
];

const purchaseSummary: PurchaseOrderSummary = {
  id: 'po-test-1',
  partnerId: 'partner-s-test',
  partnerName: 'Smart Supplier',
  status: 'OPEN',
  createdAt: '2025-01-10T09:00:00.000Z',
  scheduledAt: '2025-01-12T00:00:00.000Z',
  totalQty: 60,
  receivedQty: 20,
  warehouseId: warehouses[0].id,
  warehouseCode: warehouses[0].code,
  detailedLocationId: locationsByWarehouse['WHS-ICN'][0].id,
  detailedLocationCode: locationsByWarehouse['WHS-ICN'][0].code,
};

const purchaseDetail: PurchaseOrder = {
  ...purchaseSummary,
  type: 'PURCHASE',
  memo: 'Initial order',
  items: [
    {
      orderId: purchaseSummary.id,
      sku: 'ING-APPLE-10KG',
      qty: 60,
      unit: 'BOX',
      receivedQty: 12,
      warehouseCode: warehouses[0].code,
      locationCode: locationsByWarehouse['WHS-ICN'][0].code,
    },
  ],
  events: [],
};

const salesDetail: SalesOrder = {
  id: 'so-test-1',
  type: 'SALES',
  partnerId: 'partner-c-test',
  status: 'OPEN',
  createdAt: '2025-02-10T09:00:00.000Z',
  scheduledAt: '2025-02-12T00:00:00.000Z',
  memo: 'Sales order',
  warehouseId: warehouses[1].id,
  warehouseCode: warehouses[1].code,
  detailedLocationId: locationsByWarehouse['WHS-GSN'][0].id,
  detailedLocationCode: locationsByWarehouse['WHS-GSN'][0].code,
  items: [
    {
      orderId: 'so-test-1',
      sku: 'ING-APPLE-10KG',
      qty: 10,
      unit: 'BOX',
      shippedQty: 0,
      warehouseCode: warehouses[1].code,
      locationCode: locationsByWarehouse['WHS-GSN'][0].code,
    },
  ],
  events: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const resolveWarehouseResponse = () => ({
  total: warehouses.length,
  count: warehouses.length,
  items: warehouses.map((warehouse, index) => ({
    id: index + 1,
    code: warehouse.code,
    name: warehouse.name,
    address: warehouse.address,
    notes: warehouse.notes,
    isActive: warehouse.isActive,
    createdAt: warehouse.createdAt,
    updatedAt: warehouse.updatedAt,
  })),
});

const resolveLocationResponse = (code: string) => {
  const items = locationsByWarehouse[code] ?? [];
  return {
    total: items.length,
    count: items.length,
    items: items.map((location, index) => ({
      id: index + 1,
      code: location.code,
      description: location.name,
      warehouseCode: location.warehouseCode,
      warehouse: null,
      isActive: location.isActive,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    })),
  };
};

const renderAndPrime = async () => {
  renderOrdersPage();
  await screen.findByText(TEXT.formTitle);
};

const fillCommonFields = async () => {
  const form = await screen.findByRole('form', { name: TEXT.formTitle });
  const withinForm = within(form);

  const partnerSelect = withinForm.getByLabelText(TEXT.partnerLabel) as HTMLSelectElement;
  fireEvent.change(partnerSelect, { target: { value: 'partner-s-test' } });

  const dateInput = withinForm.getByLabelText(TEXT.inboundDateLabel) as HTMLInputElement;
  fireEvent.change(dateInput, { target: { value: '2025-05-05' } });

  const searchInput = await withinForm.findByPlaceholderText(/SKU/);
  fireEvent.change(searchInput, { target: { value: 'apple' } });

  const productSelect = (await withinForm.findAllByLabelText(TEXT.productLabel))[0] as HTMLSelectElement;
  fireEvent.change(productSelect, { target: { value: 'ING-APPLE-10KG' } });

  const quantityInput = withinForm.getByLabelText(TEXT.quantityLabel) as HTMLInputElement;
  fireEvent.change(quantityInput, { target: { value: '12' } });

  const unitSelect = withinForm.getByRole('combobox', { name: /단위|Units/ }) as HTMLSelectElement;
  fireEvent.change(unitSelect, { target: { value: 'BOX' } });

  return { withinForm };
};

beforeEach(() => {
  listPartnersMock.mockReset();
  listPartnersMock.mockResolvedValue([
    {
      id: 'partner-s-test',
      type: 'SUPPLIER',
      name: 'Smart Supplier',
      isActive: true,
      isSample: false,
    } satisfies Partner,
    {
      id: 'partner-c-test',
      type: 'CUSTOMER',
      name: 'Smart Customer',
      isActive: true,
      isSample: false,
    } satisfies Partner,
  ]);
  createPartnerMock.mockReset();

  createPurchaseOrderMock.mockReset();
  createPurchaseOrderMock.mockResolvedValue(purchaseDetail);
  listPurchaseOrdersMock.mockReset();
  listPurchaseOrdersMock.mockResolvedValue([purchaseSummary]);
  getPurchaseOrderMock.mockReset();
  getPurchaseOrderMock.mockResolvedValue(purchaseDetail);
  recordPurchaseReceiptMock.mockReset();

  createSalesOrderMock.mockReset();
  createSalesOrderMock.mockResolvedValue(salesDetail);
  listSalesOrdersMock.mockReset();
  listSalesOrdersMock.mockResolvedValue([]);
  getSalesOrderMock.mockReset();
  getSalesOrderMock.mockResolvedValue(undefined);
  recordSalesShipmentMock.mockReset();
  recordSalesShipmentMock.mockResolvedValue(salesDetail);

  fetchWarehousesMock.mockReset();
  fetchWarehousesMock.mockResolvedValue(resolveWarehouseResponse());
  fetchLocationsMock.mockReset();
  fetchLocationsMock.mockImplementation(async (code: string) => resolveLocationResponse(code));

  fetchProductsMock.mockReset();
  fetchProductsMock.mockResolvedValue(productCatalog);

  submitMovementMock.mockReset();

  navigateMock.mockReset();
});

describe('OrdersPage purchase flow', () => {
  it('requires warehouse selection before submitting a purchase order', async () => {
    await renderAndPrime();
    const { withinForm } = await fillCommonFields();

    const submitButton = withinForm.getByRole('button', { name: TEXT.purchaseSubmit });
    fireEvent.click(submitButton);

    expect(createPurchaseOrderMock).not.toHaveBeenCalled();
    expect(submitMovementMock).not.toHaveBeenCalled();
  });

  it('creates purchase order and posts receipt movement', async () => {
    await renderAndPrime();
    const { withinForm } = await fillCommonFields();

    const warehouseSelect = withinForm.getByLabelText(TEXT.warehouseLabel) as HTMLSelectElement;
    fireEvent.change(warehouseSelect, { target: { value: warehouses[0].code } });

    const locationSelect = withinForm.getByLabelText(TEXT.locationLabel) as HTMLSelectElement;
    await waitFor(() => {
      expect(locationSelect.options.length).toBeGreaterThan(1);
    });
    fireEvent.change(locationSelect, { target: { value: locationsByWarehouse['WHS-ICN'][0].code } });

    const submitButton = withinForm.getByRole('button', { name: TEXT.purchaseSubmit });
    fireEvent.click(submitButton);

    try {
      await waitFor(() => expect(createPurchaseOrderMock).toHaveBeenCalledTimes(1));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('createPurchaseOrderMock calls', createPurchaseOrderMock.mock.calls.length);
      throw error;
    }
    const orderPayload = createPurchaseOrderMock.mock.calls[0][0];
    expect(orderPayload.status).toBe('RECEIVED');

    try {
      await waitFor(() => expect(submitMovementMock).toHaveBeenCalledTimes(1));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('submitMovementMock calls', submitMovementMock.mock.calls.length);
      throw error;
    }
    const movementPayload = submitMovementMock.mock.calls[0][0];
    expect(movementPayload).toMatchObject({
      type: 'RECEIPT',
      sku: 'ING-APPLE-10KG',
      qty: 12,
      toWarehouse: warehouses[0].code,
      toLocation: locationsByWarehouse['WHS-ICN'][0].code,
      refNo: purchaseDetail.id,
    });
  });
});

describe('OrdersPage sales flow', () => {
  it('creates sales order and posts shipment movement', async () => {
    await renderAndPrime();

    const form = await screen.findByRole('form', { name: TEXT.formTitle });
    const withinForm = within(form);

    const salesToggle = withinForm.getByRole('button', { name: TEXT.salesToggle });
    fireEvent.click(salesToggle);

    const partnerSelect = withinForm.getByLabelText(TEXT.partnerLabel) as HTMLSelectElement;
    fireEvent.change(partnerSelect, { target: { value: 'partner-c-test' } });

    const dateInput = withinForm.getByLabelText(TEXT.outboundDateLabel) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2025-06-10' } });

    const searchInput = await withinForm.findByPlaceholderText(/SKU/);
    fireEvent.change(searchInput, { target: { value: 'apple' } });

    const productSelect = (await withinForm.findAllByLabelText(TEXT.productLabel))[0] as HTMLSelectElement;
    fireEvent.change(productSelect, { target: { value: 'ING-APPLE-10KG' } });

    const quantityInput = withinForm.getByLabelText(TEXT.quantityLabel) as HTMLInputElement;
    fireEvent.change(quantityInput, { target: { value: '7' } });

    const warehouseSelect = withinForm.getByLabelText(TEXT.warehouseLabel) as HTMLSelectElement;
    fireEvent.change(warehouseSelect, { target: { value: warehouses[1].code } });

    const locationSelect = withinForm.getByLabelText(TEXT.locationLabel) as HTMLSelectElement;
    await waitFor(() => {
      expect(locationSelect.options.length).toBeGreaterThan(1);
    });
    fireEvent.change(locationSelect, { target: { value: locationsByWarehouse['WHS-GSN'][0].code } });

    const submitButton = withinForm.getByRole('button', { name: TEXT.salesSubmit });
    fireEvent.click(submitButton);

    await waitFor(() => expect(createSalesOrderMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(recordSalesShipmentMock).toHaveBeenCalledTimes(1));
    expect(recordSalesShipmentMock).toHaveBeenCalledWith(
      'so-test-1',
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            sku: 'ING-APPLE-10KG',
            quantity: 7,
            warehouseCode: warehouses[1].code,
            locationCode: locationsByWarehouse['WHS-GSN'][0].code,
          }),
        ],
      }),
    );
    await waitFor(() => expect(submitMovementMock).toHaveBeenCalledTimes(1));
    expect(submitMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ISSUE',
        sku: 'ING-APPLE-10KG',
        qty: 7,
        fromWarehouse: warehouses[1].code,
        fromLocation: locationsByWarehouse['WHS-GSN'][0].code,
      }),
    );
  });
});
