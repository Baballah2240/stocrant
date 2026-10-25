# Shop management and connected payments

Open **Shops & orders → Shop settings** for the selected company:

- **Orders & payments:** choose a default Finance account, create a zero-balance account, enable accepted payment methods, require a shipping/collection reference, and optionally require full payment before completing orders.
- **Customer storefront:** publish the shop and manage its storefront, merchandising and customer policies.
- **Shop users:** create Shop Staff or Customer Service logins, edit their details, reset passwords, and suspend access. New passwords must change at first sign-in.
- **Shop connections:** manage scoped integration credentials and the company's store link.
- **Sales dashboard:** all-time shop sales, return credits, collections and actual refunds. Gross profit is net sales minus saved product costs, excluding payroll and operating expenses. Set unit costs under Product costs before dispatch. Costs are frozen at dispatch; historical missing costs make profit unavailable.
- **Shop returns:** an authorized manager can create one full-order return for a fully paid dispatched/delivered order. Check restocking only when all items are resalable. The original sale remains in history; the return creates a linked credit/refund obligation in Finance. Record actual money refunded against that return in Finance. Partial and unpaid-order returns are not supported by this screen.

Use **Print label** on an order, a dashboard sales row or a return to preview and print its customer, item and tracking/reference details. No shipping carrier booking is performed.

Each order has a random unique `SO-…` parent order number. Search it in Orders and choose **Create reverse order**, or enter the number in **Shop returns → Parent order number**. A confirmed full return gets an independent `RV-…` reverse order number linked to the same parent, stock movement and Finance refund record. Existing orders receive stable numbers without changing their internal URLs, sales or payment references. Order numbers are references, not credentials; company access and the private customer receipt token are still required.

Orders reserve stock when placed. Preparing preserves the reservation. Dispatch deducts stock once and creates the linked credit sale. In the order details, **Record confirmed payment** records money already received into the selected account. This is the same Finance transaction, source sale and reference, including partial payments and duplicate/overpayment protection. Completion can require a zero outstanding balance. Payment reversal and refunds use the existing Finance controls.

These are manual payment confirmations after dispatch. This change does not add card processing, a payment gateway, or capture money from customers online.

An assigned Shop Manager controls the shop workflow immediately, including shop sales, payment account creation and confirmed payments even when general approval rules are active. Shop Staff payment requests follow those rules; the manager can review shop-linked payment requests. Unrelated Finance requests continue to follow general approval rules. Managers cannot create platform admins, edit global roles, manage other managers, or access unassigned companies.

Existing default Shop Manager roles receive the expanded permissions. Customized role permissions are preserved; a platform administrator can grant the required shop configuration, account administration and Finance approval permissions explicitly. Removing shop configuration permission revokes the manager-specific authority.

Verification: `npm run check`, plus `node scripts/verify-shop-management.mjs` after building the frontend and backend (requires headless Chrome). Browser checks use a separate temporary database.

Source pushes do not deploy hosting. Deploy the new build through the configured hosting service separately.
