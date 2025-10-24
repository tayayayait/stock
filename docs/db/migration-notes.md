# Migration Notes: Inventory Balances, RBAC, and Audit Logging

## Added Tables
| Table | Description | Key Constraints |
| --- | --- | --- |
| `InventoryBalance` | Tracks on-hand vs. reserved quantities per item/location/lot. | FK `productId` → `Product.id`; FK `locationId` → `Location.id`; unique (`productId`, `locationId`, `lotNo`, `expiryDate`). |
| `Role` | Defines reusable role names for RBAC. | Unique `name`. |
| `Permission` | Canonical permission codes grouped by category. | Unique `code`. |
| `UserRole` | Assigns users (by external identifier) to roles. | FK `roleId` → `Role.id`; unique (`userId`, `roleId`). |
| `RolePermission` | Grants permissions to roles. | Composite PK (`roleId`, `permissionId`); FKs to `Role` and `Permission`. |
| `AuditLog` | Durable audit trail for entity changes and access. | Indexed on (`entity`, `entityId`), `userId`, and `createdAt`. |

## Updated Tables
| Table | Changes | New Constraints |
| --- | --- | --- |
| `Product` | Added `uomBase`, `uomAlt`, `uomAltConversion`, `barcode`, `lotTracking`, `expiryRequired`. | Unique `barcode`. |
| `SalesOrder` | Converted `status` to `SalesOrderStatus` enum with lifecycle values. | Default `Draft`; retains status index. |
| `SalesOrderLine` | Added `qtyReserved` decimal column for allocation tracking. | Default `0.00`. |

## New Enums
| Enum | Values |
| --- | --- |
| `SalesOrderStatus` | `Draft`, `Confirmed`, `Picking`, `Packed`, `Shipped`, `Cancelled` |

## Notes
- All new tables include `createdAt`/`updatedAt` timestamps for traceability.
- Down migration (`down.sql`) provided for clean rollback if needed.
