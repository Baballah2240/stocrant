# Shop customer service

Customer service for shops is separate from the general Customer Service workspace and website inquiries.

- Visitors use **Customer service** in the storefront navigation, footer or Contact page. They can submit product, order, delivery, return or other questions and read or add replies in the same browser. Email or phone is required for contact context; the app does not send email or SMS.
- Staff use **Shops & orders → Shop customer service**, scoped to the selected company. The inbox supports search, status filtering, paging, threaded replies, Reply & resolve and opening a linked order. New customer messages reopen the request; staff replies mark it waiting for the customer or resolved. Both views refresh every 30 seconds while visible and have a manual refresh action.
- Shop view permissions and company access are required to read the inbox. Shop edit permission (or both inventory and operations edit) is required to reply. General Customer Service permissions alone do not grant access.
- A signed HttpOnly guest cookie owns each customer conversation. Ticket IDs alone do not grant access. Linked orders must belong to the same storefront and guest checkout cookie. Clearing cookies, switching browsers, cookie expiry or changing the signing secret removes customer access to that browser history. Staff retain company-scoped records.
- Requests use UUID retry keys, content comparison, version checks, rate limits, a 3,000-character message limit and a 100-message conversation limit. Customer history returns the latest 50 requests; the staff inbox pages through all matching requests. Draft/unavailable storefronts do not accept public support.
- Tickets are stored in the existing persistent JSON store under `shopSupportTickets`, outside generic collection APIs. Public responses omit contact information, guest hashes, fingerprints and staff account IDs. Staff reply actions are audited.

Validation: `npm run check` plus `node scripts/verify-shop-support.mjs` and the merchandising browser regression. Browser checks use isolated data and capture local QA screenshots in `.local-preview/qa/shop-support/`. No native build, email delivery or phone installation is involved.
