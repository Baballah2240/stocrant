# Connected shops: STOCRANT foundation

The first phase adds `/shops` to the shared website/mobile workspace and expands the public `/services/shop-websites` page in English and Arabic. The Amal customer storefront is now implemented; see [AMAL_STOREFRONT.md](AMAL_STOREFRONT.md) for configuration, publication, supported checkout behavior and deployment boundaries. Publishing source does not configure DNS, couriers or online payment providers.

## Company workflow

1. Create an organization and company through the existing administrator workflow. Set the company's currency before creating products.
2. Open **Shops & orders**, choose the company, then add products or import an `.xlsx` file. Required first-sheet headers: `sku`, `name`, `price`. Optional headers: `description`, `image` (HTTPS URL), `stocklocation`. Headers are case insensitive. Import supports up to 500 products and files up to 2 MB, previews all rows on the server, and revalidates the entire batch at confirmation. Duplicate SKUs or invalid prices reject the whole batch. Legacy `.xls` files must be saved as `.xlsx` first.
3. Products link to an accessible existing inventory item with the same company/SKU, or create a zero-stock item. Imports do not overwrite stock or silently create a supplier bill. Existing ambiguous SKUs must be resolved first. One SKU represents one sellable variant; use distinct SKUs for different sizes/colors.
4. Record **Incoming shipments** with product, quantity, supplier, shipment reference and notes. This creates an immutable incoming movement in the existing inventory system. Reusing a receipt request ID returns the original receipt; reusing the same product/supplier/shipment reference is rejected. Receipt entry does not confirm a supplier payment or create a purchase bill.
5. Create a customer order with integer quantities, contact details, address, delivery charge and discount. Prices are frozen from the catalog. Exact currency arithmetic supports SDG and all existing ledger currencies. Discounts cannot exceed the product subtotal. The current order total is products plus delivery minus discount; automated tax calculations are not included in this foundation.
6. Accepted orders reserve stock. Move through **reserved → preparing → dispatched → delivered**. Cancel before dispatch to release the reservation. Dispatch requires a shipment/collection reference, inventory create permission and finance create permission; it atomically creates outgoing movements and a linked completed sale. It does not invent a paid ledger entry. Dispatched orders cannot be cancelled to silently undo delivered stock or cash.
7. Record confirmed customer receipts against the linked sale in **Finance**. Existing settlement, duplicate-payment, outstanding-balance and reversal rules remain authoritative. Returns/refunds must use the established Finance source/reversal workflow with separately authorized stock returns; automatic return authorization and courier workflows are future storefront scope.

Product names, descriptions, images, prices and active state can be edited with version checks. Existing order prices remain frozen. Pausing sales prevents new orders for that product. Changing a company currency requires a reviewed product/finance migration; products with a different currency are rejected for new orders.

## Access and approval boundaries

- Viewing the shop requires both inventory and operations view permission; writes require both create/edit permissions. Company, location, item allowlists and own-record restrictions are checked server side. Employee-only accounts cannot use a company shop as a source of customer data.
- If an inventory/operations approval rule is active, the corresponding shop write requires that section's approve permission. These are immediate authorized actions, recorded in the audit log, rather than pending generic approvals.
- Dispatch is intentionally blocked while Finance create approvals are active. A future dedicated sales approval flow must be implemented before enabling shop dispatch for that policy; this module does not bypass that policy.
- Dedicated shop records are not exposed by generic collection CRUD. Linked stock identities/opening quantities and shop-generated stock movements/sales are protected against generic changes. Other inventory movements cannot consume stock reserved for orders, including when a delayed approval executes.
- On-hand stock and reservations are separate. Inventory's existing Available column represents physical stock; Shops shows on-hand, reserved and sellable available units explicitly.
- Data changes are synchronous, atomic transactions in the existing persistent JSON store. Keep Render at one instance with the configured persistent disk. Multiple application writers require a database migration before scaling out.

## Custom shop server connection

An administrator with access edit and shop edit permission can create a named company connection. Copy the one-time key into the **future shop server's environment**, never a browser bundle or source control. STOCRANT stores only its SHA-256 hash. Revoke a connection from the workspace to stop its requests immediately. Removing/deactivating its owner or removing the owner's current permissions also stops access. Rotate by issuing a new key, updating the server, testing it, then revoking the old key.

The shop's server sends `Authorization: Bearer <key>` over HTTPS. Browser-origin requests are rejected. Keys have catalog/order scope for one company, not HR or Finance access. Current limit: 120 authenticated requests per key per minute (single-process window, HTTP 429 with Retry-After). Public storefront abuse limits and checkout validation belong on the shop server too.

| Endpoint                              | Behavior                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/shop-connection/catalog`    | Active products: ID, SKU, name, description, image URL, price, currency, currently available quantity. Availability is rechecked atomically when submitting the order. |
| `POST /api/shop-connection/orders`    | Validate, price and reserve an order for the connection's company. No client-supplied company, prices, payment status or fulfilment status accepted.                   |
| `GET /api/shop-connection/orders/:id` | Status, tracking reference, total and currency for orders created through that exact connection. No customer contact records returned.                                 |

Example order body (IDs and amounts are illustrative):

```json
{
  "requestId": "8c13bab2-3391-49a7-b74e-a2d746b82353",
  "externalReference": "STORE-1001",
  "customer": "Customer name",
  "phone": "+249 912345678",
  "email": "customer@example.com",
  "address": "Delivery address",
  "lines": [{ "productId": "catalog-product-id", "quantity": 2 }],
  "delivery": "0",
  "discount": "0",
  "notes": "Delivery instructions"
}
```

Persist one UUID per checkout and reuse it for identical retries. An identical accepted retry returns the same order, including after server restart; a changed body using the same ID returns 409. The shop server must authenticate its own customers and map their IDs to order IDs before exposing order status publicly. Never proxy arbitrary order IDs or expose the connection key. Price/stock conflicts must be shown for customer review. Manual and external-connector orders do not expire automatically; staff cancel abandoned reservations. Orders placed through the hosted Amal storefront now have configurable expiry while unprepared.

## Storefront phase and launch gates

The next build needs the merchant's company, shop name/branding, product categories/variants, delivery regions, tax rules, refund policy and chosen payment provider. A shop subdomain can share a base domain with STOCRANT while using a distinct hostname; actual DNS, TLS and hosting must be configured and verified separately. Shared-domain hosting is not a substitute for company isolation.

The Amal implementation now includes catalog/search/filtering, product pages, cart, guest checkout/contact, private order tracking and policy/contact pages. Integrate payments with provider-verified server callbacks and idempotency; add stock expiry, refunds and delivery integration according to the agreed business rules. Verify live payments, shipping, email delivery, backups and restore procedures before a public launch. Do not describe the foundation as a complete production checkout.

## Verification

- `npm run check` includes isolated commerce API tests and existing application checks.
- `npm run test:commerce` builds all assets and runs real Chrome checks: manual product creation, an actual XLSX preview/import, shipment receipt, order preparation/dispatch/delivery, unpaid sale linking, one-time key display, persisted data and responsive English/Arabic light/dark layouts at 320–1440px.
- API tests cover atomic imports, currency precision, shipment and order retries, simultaneous oversell attempts, cancellation release, signed stock adjustments, stale versions, linked-sale settlement, excess/duplicate cash, isolated connections, revocation, browser rejection, tenant scope and Finance approval blocking.
- No live company/customer records or real payments are created by these tests.
