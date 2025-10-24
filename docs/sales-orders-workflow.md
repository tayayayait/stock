# Sales Order Fulfillment Workflow

This document summarizes the backend contract for the reservation-based sales order workflow.

## Common Headers

| Header | Purpose |
| --- | --- |
| `x-user-permissions` | Comma-delimited permission codes used by the RBAC plugin. Include `*` to allow all or specific scopes such as `sales_orders:create`, `sales_orders:confirm`, `sales_orders:pack`, `sales_orders:ship`, and `sales_orders:bulk_status`. |
| `x-user-id` | Optional identifier for audit logging. |
| `idempotency-key` | Optional header supported by confirmation and shipping endpoints to guarantee at-most-once processing. |

## Create Sales Order

`POST /api/sales-orders`

```jsonc
{
  "orderNumber": "SO-24001",
  "customerId": 12,
  "warehouseId": 3,
  "orderDate": "2025-02-15T03:00:00.000Z",
  "shipmentDate": "2025-02-20T03:00:00.000Z",
  "currency": "KRW",
  "totalAmount": "1290000",
  "notes": "Expedite if possible",
  "lines": [
    {
      "productId": 101,
      "quantityOrdered": 5,
      "rate": "99000",
      "discountPercent": "5",
      "taxPercent": "10",
      "lineAmount": "470250",
      "notes": "Include gift wrap"
    },
    {
      "productId": 202,
      "quantityOrdered": 10,
      "rate": "82000",
      "lineAmount": "820000"
    }
  ]
}
```

- Reserves inventory atomically by incrementing `reservedQuantity` on each affected stock level.
- Returns `409 Conflict` when available inventory (`quantity - reservedQuantity`) is insufficient for any line.
- Creates the order in `draft` status and persists reservation rows for future confirmation. Audit logging is not required at this stage because no status transition occurs.

## Confirm Sales Order

`POST /api/sales-orders/:id/confirm`

Headers:

```
x-user-permissions: sales_orders:confirm
idempotency-key: confirm-<uuid>
```

- Requires the `sales_orders:confirm` permission.
- Uses the optional `idempotency-key` header to record `IdempotencyRecord` rows and make the operation safe to retry.
- Validates that all reservations still cover ordered quantities, then atomically moves stock from `reservedQuantity` to actual `quantity`, and transitions the order to `picking`.
- Writes an audit entry recording the status transition.

## Pack Sales Order

`POST /api/sales-orders/:id/pack`

Headers:

```
x-user-permissions: sales_orders:pack
```

- Requires the `sales_orders:pack` permission.
- Verifies the order is currently `picking` and transitions it to `packed` within a transaction, capturing an audit entry.

## Ship Sales Order

`POST /api/sales-orders/:id/ship`

Headers:

```
x-user-permissions: sales_orders:ship
idempotency-key: ship-<uuid>
```

Sample payload:

```jsonc
{
  "shipmentDate": "2025-02-25T03:00:00.000Z",
  "occurredAt": "2025-02-25T02:50:00.000Z",
  "userId": "fulfillment-42",
  "lines": [
    { "lineId": 301, "quantity": 3, "locationId": 55 },
    { "lineId": 302, "quantity": 2 }
  ]
}
```

- Requires the `sales_orders:ship` permission.
- Accepts explicit locations per line; when omitted, the service resolves a default location from the associated warehouse.
- Deducts stock, writes `StockMovement` rows, and updates `quantityFulfilled` on each line. When all lines are fulfilled the order status becomes `shipped` and an audit entry is recorded.
- Returns serialized stock movements and refreshed stock levels so the client can reconcile on-screen quantities.

## Bulk Status Update

`POST /api/sales-orders/bulk/status`

Headers:

```
x-user-permissions: sales_orders:bulk_status
```

Sample payload:

```jsonc
{
  "ids": [12, 15, 19],
  "status": "shipped",
  "shipmentDate": "2025-02-28T09:00:00.000Z"
}
```

- Requires the `sales_orders:bulk_status` permission.
- Validates per-order transitions using the same guardrail matrix as the single-step endpoints and writes audit entries for each status change.

## Audit & RBAC Plugins

- The audit plugin exposes `fastify.audit.log`, which persists structured metadata for each status transition in the workflow.
- The RBAC plugin reads the `x-user-permissions` header and enforces permissions for confirmation, packing, shipping, and bulk status updates.

