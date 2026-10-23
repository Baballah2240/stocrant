# Amal: connected customer shop

Amal is the first customer storefront. It uses the same STOCRANT backend and company inventory; visitors receive neither a workspace session nor an integration key. The source lives in `shop-website/`, independently built to `shop-website/dist/`. The shared workspace remains in `src/`.

## What is implemented

- Responsive product catalog, category filters, search, sorting, product detail pages, quantities and an editable bag stored separately for each shop.
- English/Arabic interface and light/dark appearance. Merchant-entered product names, descriptions and policy text remain as entered.
- Colorful product cards and desktop hover focus: the active product stays clear and clickable above a soft page veil, while other products blur. Keyboard focus receives equivalent emphasis. Touch browsing stays clear without requiring hover, and reduced-motion preferences stop decorative movement and card lift.
- Guest checkout with contact details, collection or delivery, configured delivery regions and fees, policy consent and no account requirement.
- Server-calculated, currency-exact quotes bound to the guest and shop configuration for ten minutes. Price, stock or configuration changes require review rather than silently accepting a different total.
- Atomic order reservation in the existing company workflow. The order appears in **Shops & orders** and follows preparation, dispatch and delivery. Dispatch creates the existing linked unpaid sale; actual receipts are confirmed in Finance.
- Durable checkout request IDs and private tracking secrets. A lost checkout response can be retried without creating a duplicate. The browser retains only product IDs/quantities in its bag and request/receipt identifiers in session storage; contact forms are not persisted in browser storage.
- Private receipt links put the secret in the URL fragment, which is not sent in the HTTP page request. The server stores only its hash. Receipt responses omit customer contact details and workspace identifiers.
- Each accepted guest checkout sends one in-app alert to the administrator who authorized the storefront. Retrying the checkout does not duplicate that alert. The alert opens the correct company and order; its summary omits customer contact details.
- Configurable 1–168-hour reservations, default 24 hours. Only unprepared guest orders expire. The application scans once per minute and before shop requests/stock mutations, so downtime is caught up on restart/next access. Prepared orders remain reserved until staff dispatch or cancel them.
- Manager configuration of name, slug, logo URL, descriptions, contact details, collection address, delivery settings, reservation duration and four required policies. Draft preview is restricted to permitted signed-in users; guest checkout is disabled in draft mode.
- Company-scoped hosted connectors, current-owner permission checks, connection revocation, basic request/checkout limits, same-host checkout checks, signed HttpOnly guest cookies and current quote verification.

## Set up Amal in a real workspace

Company Managers now receive the shipped full company administration permissions, including Finance, Payroll, approvals and shop configuration. Organization Admins manage the companies under their assigned organization. Existing explicitly customized role permissions and individual account restrictions remain unchanged. Neither role gains platform administration or unrelated companies.

To delegate shop management, open **Access & Settings > Users**, edit a company user and select **Shop Manager**, disable own-record-only access, then save with role defaults. Alternatively, enable individual permissions and choose **Full shop access**. This grants product, receiving, order and dispatch access together with storefront configuration and shop connection management; it includes the Operations, Inventory and Finance permissions needed by the shared workflow. It does not grant user administration. Keep the employee assigned to the intended company; location restrictions still apply. Approval policies remain enforced.

Managers can choose **Customize dashboard** to reorder cards by dragging or arrows, show/hide cards, choose one-third/half/two-thirds/full widths and adjust card heights. **Automatic height** restores natural content height. **Save layout** persists only that account's layout; **Cancel** discards edits and **Reset layout** prepares the defaults for saving. Phones use a single column, and fixed-height content can be scrolled. Company tools provides shortcuts to company records, HR, shops, Finance, Payroll and user management when permitted.

The chosen example company is **Amal Retail**. The tests create it only in isolated data; no production company, stock, contact information or legal policy is invented by deployment. Use a real existing retail company if appropriate, or have the organization administrator create Amal Retail under the correct organization. Do not reuse an unrelated company's inventory.

1. Open **Shops & orders** and choose the owning company. The page prefers an existing company named Amal when available. Set its currency before adding products.
2. Add real product details, prices, categories and HTTPS image URLs, or import `.xlsx` rows. Optional `category` is now supported alongside the previous headers. One SKU represents one variant; use separate SKUs for distinct sizes/colors. Receive actual stock through Incoming shipments.
3. Open **Customer storefront**. Save the identity as **Amal**, slug **amal**. Supply actual customer-service contact details and the collection address.
4. Select collection/delivery and configure delivery regions separated with English commas. Set the delivery fee in the company currency.
5. Write the company's actual shipping, return, privacy and sale terms. They are required to publish; the implementation does not invent legal or refund commitments.
6. Confirm that the company accepts payment on collection/delivery, then save and preview. Publishing is an explicit manager action. The shop URL on the existing hosting service is `/shop/amal`.
7. Run an explicitly labeled trial order, confirm the right company/stock/sale, and reconcile any cash only when actually collected. Test from a fresh browser and phone before sharing the URL.

The local browser fixture uses illustrative products, example regions, `.test` contact addresses and clearly marked preview policies. It is never loaded by production startup or a deployment.

To review the complete shop locally, run `npm run preview:shop` and open the printed loopback URL (normally `http://127.0.0.1:3015/shop/amal`). This creates **Amal Retail** in a separate persistent `.local-preview/amal-storefront/` store, never the live database. Local preview workspace credentials are generated once in that ignored directory, without being printed or committed. Stop the preview with Ctrl+C.

## Domain and Render deployment

`npm run build:full` now builds the marketing website, customer shop, workspace and API. The existing Render build command remains `npm ci --include=dev && npm run build:full`, with `node dist/index.js` as the start command. GitHub Actions includes the customer shop in its build artifact.

The existing public domain can serve `/shop/amal` after the code deploys and the owning company publishes its configuration. To use **amal.mohbaba.online**, configure that hostname in Render, add the DNS record Render provides, wait for TLS verification and set this server-only environment variable:

```text
STOCRANT_SHOP_HOSTS=amal.mohbaba.online=amal
```

For several shops, use comma-separated `hostname=slug` bindings. Mapped hostnames serve the shop at `/`, `/product/:id`, `/bag`, `/checkout`, `/order/:id` and policy/contact pages; the existing workspace/marketing hostname is unchanged. Never bind the workspace hostname to a shop. Requests can also use `/shop/:slug` without a custom hostname.

No DNS records, Render custom domains or live publication are changed by a GitHub push. Verify the configured live address, a fresh checkout, private tracking, fulfilment and cash handling separately after deployment. Keep one service instance with the existing persistent disk until storage is migrated to a database.

## Current boundaries

- **Payment on delivery/collection only.** No card data is collected and no bank receipt is fabricated. A payment provider must be chosen, integrated with verified callbacks and tested before adding online payment options.
- Delivery is configured regions/fees plus staff-entered shipment references. No courier booking, courier payment or live carrier tracking is claimed.
- Taxes and refunds follow the existing documented finance workflow and the merchant's policies. Automatic tax calculation, online refunds, returns authorization and promotional discount codes are not implemented.
- Finance create-approval policies still block dispatch in the current commerce foundation. Public quotes/checkouts pause under that policy too; do not enable public sales for that policy until a dedicated approved-sale dispatch workflow is implemented.
- Confirmation appears on screen with a private tracking link. Email/SMS confirmations are not sent; no customer notification delivery is claimed.
- The shop currently has guest checkout, without customer accounts, wishlists or public reviews. Product images are supplied as HTTPS URLs. Draft/unconfigured pages are not automatically exposed as live shops, and the build defaults to `noindex` during this launch-preparation phase.

## Verification

- `npm run check`: all existing checks, eight storefront API scenarios, storefront type/build and Arabic-copy tests, and production serving checks for all three frontends.
- `npm run test:storefront`: a real Chrome journey through manager settings, anonymous catalog/search/categories/sort, product quantities, bag, delivery quote, a deliberately lost checkout response and safe retry, private receipt reload, manager fulfilment and unpaid sale. Verify EN/AR, light/dark and 320/390/768/1440px catalog/product/bag/checkout/policy layouts.
- `npm run test:commerce`: retain existing Excel, receiving, stock and workspace-order regression checks.
