import { test, expect } from '@playwright/test';

test.describe('end-to-end sales regression flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      let counter = 1000;
      if (typeof window !== 'undefined' && window.crypto && 'randomUUID' in window.crypto) {
        Object.defineProperty(window.crypto, 'randomUUID', {
          configurable: true,
          value: () => String(++counter),
        });
      }
    });
  });

  test('adds an item, creates a sales order with mock data, and verifies reports', async ({ page }) => {
    const customer = { id: 200, name: '아크메 무역', email: 'sales@acme.test' };
    const productCatalog = new Map<number, { name: string; sku: string }>();
    const salesOrders = [
      {
        id: 501,
        orderNumber: 'SO-501',
        status: 'draft',
        orderDate: '2024-01-05T00:00:00.000Z',
        shipmentDate: null,
        totalAmount: '450000',
        currency: 'KRW',
        customer,
      },
    ];
    let nextOrderId = 600;

    await page.route('**/api/customers**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [customer] }),
        });
        return;
      }

      await route.fallback();
    });

    await page.route('**/api/sales-orders', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: salesOrders }),
        });
        return;
      }

      if (request.method() === 'POST') {
        const payload = (await request.postDataJSON()) as {
          orderNumber: string;
          customerId: number;
          orderDate?: string;
          totalAmount?: string;
          currency?: string;
          notes?: string;
          lines: Array<{
            productId: number;
            quantityOrdered: number;
            rate: string;
            lineAmount: string;
          }>;
        };

        const id = ++nextOrderId;
        const orderDate = payload.orderDate ?? new Date().toISOString();
        const detail = {
          id,
          orderNumber: payload.orderNumber,
          customerId: payload.customerId,
          orderDate,
          shipmentDate: null,
          status: 'draft' as const,
          totalAmount: payload.totalAmount ?? '0',
          currency: payload.currency ?? 'KRW',
          notes: payload.notes ?? '',
          customer,
          lines: payload.lines.map((line, index) => {
            const product = productCatalog.get(line.productId) ?? {
              name: `제품 ${line.productId}`,
              sku: `SKU-${line.productId}`,
            };

            return {
              id: index + 1,
              productId: line.productId,
              quantityOrdered: line.quantityOrdered,
              quantityFulfilled: 0,
              rate: line.rate,
              lineAmount: line.lineAmount,
              product: { id: line.productId, name: product.name, sku: product.sku },
            };
          }),
        };

        salesOrders.push({
          id,
          orderNumber: detail.orderNumber,
          status: detail.status,
          orderDate: detail.orderDate,
          shipmentDate: detail.shipmentDate,
          totalAmount: detail.totalAmount,
          currency: detail.currency,
          customer: detail.customer,
        });

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(detail),
        });
        return;
      }

      await route.fallback();
    });

    await page.goto('/');

    await page.getByRole('link', { name: 'Items (상품)' }).click();
    await expect(page.getByRole('heading', { name: '재고 현황' })).toBeVisible();

    const productName = '테스트 상품';
    const productSku = 'SKU-001';

    await page.getByRole('button', { name: '제품 추가' }).click();
    await expect(page.getByRole('heading', { name: '새 제품 추가' })).toBeVisible();

    await page.getByLabel(/제품명/).fill(productName);
    await page.getByLabel(/품번/).fill(productSku);
    await page.getByLabel(/단위 \(UOM\)/).fill('EA');
    await page.getByLabel(/리드타임/).fill('5');
    await page.getByLabel(/안전 재고/).fill('10');
    await page.getByLabel(/재주문점/).fill('20');

    await page.getByRole('button', { name: /^제품 추가$/ }).click();
    await expect(page.getByRole('heading', { name: '새 제품 추가' })).not.toBeVisible();
    await expect(page.getByRole('cell', { name: productName })).toBeVisible();

    const numericProductId = await page.evaluate(() => {
      const raw = window.localStorage.getItem('stockwise.products');
      if (!raw) {
        return null;
      }
      try {
        const parsed = JSON.parse(raw);
        const last = Array.isArray(parsed) ? parsed[parsed.length - 1] : null;
        const candidate = last?.id ? Number.parseInt(String(last.id), 10) : Number.NaN;
        return Number.isFinite(candidate) ? candidate : null;
      } catch (error) {
        console.error('Failed to parse stored products', error);
        return null;
      }
    });

    if (numericProductId != null) {
      productCatalog.set(numericProductId, { name: productName, sku: productSku });
    }

    await page.getByRole('link', { name: 'Sales' }).click();
    await expect(page.getByRole('heading', { name: '판매 주문' })).toBeVisible();
    await expect(page.getByRole('row', { name: /SO-501/ })).toBeVisible();

    await page.getByRole('button', { name: '새 주문' }).click();
    await expect(page.getByRole('heading', { name: '새 판매 주문' })).toBeVisible();

    await page.getByLabel('주문 번호').fill('SO-NEW-001');
    await page.getByPlaceholder('고객명을 입력하세요').fill('아크');
    await page.getByRole('button', { name: /아크메 무역/ }).click();

    const productSelect = page.getByLabel('제품');
    await productSelect.selectOption({ label: productName });

    await page.getByLabel('수량').fill('5');
    await page.getByLabel('단가').fill('100000');

    await page.getByRole('button', { name: '출고' }).click();
    await expect(page.getByText('새 판매 주문을 생성했어요.')).toBeVisible();
    await expect(page.getByRole('heading', { name: '새 판매 주문' })).not.toBeVisible();

    await expect(page.getByRole('row', { name: /SO-NEW-001/ })).toBeVisible();

    await page.getByRole('link', { name: 'Reports' }).click();
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '생성 완료 리포트' })).toBeVisible();
  });

  test('prevents negative stock when shipment requests race each other', async ({ page }) => {
    const customer = { id: 301, name: '동시 테스트', email: 'ops@test.example' };
    const orders = [
      {
        id: 901,
        orderNumber: 'SO-901',
        status: 'confirmed' as const,
        orderDate: '2024-02-10T00:00:00.000Z',
        shipmentDate: null,
        totalAmount: '120000',
        currency: 'KRW',
        customer,
      },
    ];

    const detail = {
      id: 901,
      orderNumber: 'SO-901',
      customerId: customer.id,
      status: 'confirmed' as const,
      orderDate: '2024-02-10T00:00:00.000Z',
      shipmentDate: null,
      totalAmount: '120000',
      currency: 'KRW',
      createdAt: '2024-02-10T00:00:00.000Z',
      updatedAt: '2024-02-10T00:00:00.000Z',
      customer,
      lines: [
        {
          id: 1,
          salesOrderId: 901,
          productId: 5001,
          quantityOrdered: 4,
          quantityFulfilled: 0,
          rate: '30000',
          lineAmount: '120000',
          product: { id: 5001, name: '재고 테스트 상품', sku: 'SKU-5001' },
        },
      ],
    };

    let availableStock = 4;
    let shipAttempts = 0;

    await page.route('**/api/sales-orders**', async (route) => {
      const request = route.request();
      if (request.method() === 'GET' && /\/api\/sales-orders(\?.*)?$/.test(request.url())) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: orders }),
        });
        return;
      }

      if (request.method() === 'GET' && request.url().endsWith('/api/sales-orders/901')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(detail),
        });
        return;
      }

      if (request.method() === 'POST' && request.url().endsWith('/api/sales-orders/901/ship')) {
        shipAttempts += 1;
        const headers = request.headers();
        expect(headers['idempotency-key']).toBeTruthy();

        const payload = request.postDataJSON() as { lines: Array<{ quantity: number }> };
        const requested = payload.lines.reduce((total, line) => total + Number(line.quantity ?? 0), 0);

        if (availableStock >= requested) {
          availableStock -= requested;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              idempotent: false,
              order: {
                ...detail,
                status: 'shipped',
                lines: detail.lines.map((line) => ({
                  ...line,
                  quantityFulfilled: line.quantityOrdered,
                })),
              },
              movements: [],
              levels: [
                { productId: 5001, locationId: 1, quantity: availableStock },
              ],
            }),
          });
          return;
        }

        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: '재고가 부족합니다.' } }),
        });
        return;
      }

      await route.fallback();
    });

    await page.route('**/api/levels**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [
              { productId: 5001, locationId: 1, quantity: availableStock },
            ],
          },
        }),
      });
    });

    await page.goto('/sales');
    await expect(page.getByRole('heading', { name: '판매 주문' })).toBeVisible();
    await page.getByRole('row', { name: /SO-901/ }).click();
    await expect(page.getByRole('heading', { name: '주문 SO-901' })).toBeVisible();

    const shipButton = page.getByRole('button', { name: '출고처리' });
    await expect(shipButton).toBeEnabled();

    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find((el) =>
        el.textContent?.trim() === '출고처리',
      );
      button?.click();
      button?.click();
    });

    await expect(page.getByText('출고 처리가 완료됐어요.')).toBeVisible();
    await expect(
      page.getByText('출고 처리를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'),
    ).toBeVisible();

    await expect.poll(() => shipAttempts).toBe(2);
    expect(availableStock).toBeGreaterThanOrEqual(0);
  });
});
