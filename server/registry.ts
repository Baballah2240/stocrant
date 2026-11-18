/** Entity registry: field metadata + validation for every module.
 * Single source of truth shared by the API (Zod) and the UI (via /api/meta).
 */

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "time"
  | "select"
  | "email"
  | "tel"
  | "currency"
  | "percent"
  | "password";

export interface FieldSpec {
  readOnly?: boolean;
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
}

export type ModuleKey = "organization" | "admin" | "hr" | "stores" | "warehouse";

export interface EntitySpec {
  collection: string;
  label: string;
  singular: string;
  module: ModuleKey;
  fields: FieldSpec[];
  columns: string[]; // field keys shown in the table
  permission: string; // e.g. "hr.employees.read"
}

export const MODULES: Record<ModuleKey, { label: string }> = {
  organization: { label: "Organizations" },
  admin: { label: "Access & Settings" },
  hr: { label: "Workforce & HR" },
  stores: { label: "Operations" },
  warehouse: { label: "Warehouse" },
};

export const registry: EntitySpec[] = [];
registry.push({
  collection: "organizations", label: "Organizations", singular: "Organization", module: "organization", permission: "organizations.view",
  fields: [
    { key: "name", label: "Organization name", type: "text", required: true },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "tel" },
    { key: "address", label: "Address", type: "textarea" },
    { key: "status", label: "Status", type: "select", options: ["active", "inactive"], required: true },
  ], columns: ["name", "email", "phone", "status"],
});

// ── Organizations ───────────────────────────────────────────────────────────
registry.push({
  collection: "companies", label: "Companies", singular: "Company",
  module: "organization", permission: "organization.companies.read",
  fields: [
    { key: "name", label: "Company name", type: "text", required: true },
    { key: "parentOrganizationId", label: "Organization", type: "select", required: true },
    { key: "tradeName", label: "Trading name", type: "text" },
    { key: "logo", label: "Company logo URL", type: "text", placeholder: "https://example.com/logo.png" },
    { key: "organizationType", label: "Organization type", type: "select", options: ["shop", "store", "office", "restaurant", "mixed"], required: true },
    { key: "industry", label: "Industry", type: "select", options: ["restaurant", "retail", "hospitality", "services", "mixed"], required: true },
    { key: "taxId", label: "Tax / registration ID", type: "text" },
    { key: "contactName", label: "Primary contact", type: "text" },
    { key: "contactEmail", label: "Contact email", type: "email" },
    { key: "contactPhone", label: "Contact phone", type: "tel" },
    { key: "country", label: "Country", type: "text" },
    { key: "currency", label: "Primary currency", type: "select", options: ["USD", "EUR", "GBP", "KRW", "QAR", "AED", "SAR", "KWD", "BHD", "OMR", "EGP", "SDG"], required: true },
    // Accounting & finance settings used by Payroll, Finance reports and document due dates.
    { key: "salaryCountingBasis", label: "Salary counting", type: "select", options: ["from payroll period start", "from assignment date", "from last salary paid"] },
    { key: "fiscalYearStart", label: "Fiscal year starts in", type: "select", options: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] },
    { key: "defaultPaymentTerms", label: "Default payment terms", type: "select", options: ["immediate", "net7", "net15", "net30", "net45", "net60", "net90"] },
    { key: "vatRate", label: "VAT rate %", type: "percent", min: 0, max: 100 },
    { key: "vatNumber", label: "VAT registration number", type: "text" },
    { key: "booksLockedUntil", label: "Books closed through", type: "date" },
    { key: "gratuityDaysPerYear", label: "End-of-service: days of salary per year (first 5 years)", type: "number", min: 0, max: 90 },
    { key: "gratuityDaysAfterFiveYears", label: "End-of-service: days of salary per year after 5 years", type: "number", min: 0, max: 90 },
    { key: "gratuityMinimumYears", label: "End-of-service: minimum years of service", type: "number", min: 0, max: 10 },
    { key: "status", label: "Status", type: "select", options: ["active", "inactive"], required: true },
    { key: "linkedLocations", label: "Linked locations", type: "text", placeholder: "Location IDs or names" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
  columns: ["name", "organizationType", "contactName", "country", "currency", "status"],
});

// ── People & HR ─────────────────────────────────────────────────────────────
registry.push(
  {
    collection: "departments", label: "Departments", singular: "Department",
    module: "hr", permission: "hr.departments.read",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text" },
      { key: "manager", label: "Manager", type: "text" },
      { key: "kind", label: "Structure type", type: "select", options: ["department", "section"] },
      { key: "status", label: "Status", type: "select", options: ["active", "inactive"] },
      { key: "costCenter", label: "Cost center", type: "text" },
      { key: "headcount", label: "Headcount", type: "number", min: 0 },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    columns: ["name", "code", "manager", "headcount"],
  },
  {
    collection: "employees", label: "Employees", singular: "Employee",
    module: "hr", permission: "hr.employees.read",
    fields: [
      { key: "employeeCode", label: "Employee ID", type: "text", readOnly: true },
      { key: "name", label: "Full name", type: "text", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "department", label: "Department", type: "text" },
      { key: "jobTitle", label: "Job title", type: "text" },
      { key: "employmentType", label: "Employment", type: "select", options: ["full-time", "part-time", "contract", "intern"] },
      { key: "status", label: "Status", type: "select", options: ["active", "probation", "on-leave", "terminated"], required: true },
      { key: "hireDate", label: "Hire date", type: "date", required: true },
      { key: "birthday", label: "Birthday", type: "date" },
      { key: "organizationId", label: "Company", type: "select", required: true },
      { key: "locationId", label: "Location ID", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "salary", label: "Base salary", type: "currency", min: 0 },
      { key: "terminationDate", label: "Leaving date", type: "date" },
      { key: "salaryPaymentMethod", label: "Salary paid by", type: "select", options: ["bank", "mobile money", "cash", "cheque"] },
      { key: "bankName", label: "Bank name", type: "text" },
      { key: "bankAccount", label: "Bank account / IBAN", type: "text" },
      { key: "mobileWalletProvider", label: "Mobile wallet provider", type: "text", placeholder: "Bankak, Fawry, M-Pesa…" },
      { key: "mobileWalletNumber", label: "Mobile wallet number", type: "tel" },
      { key: "manager", label: "Manager", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    columns: ["employeeCode", "name", "department", "jobTitle", "status", "hireDate"],
  },
  {
    collection: "attendance", label: "Attendance", singular: "Attendance",
    module: "hr", permission: "hr.attendance.read",
    fields: [
      { key: "employee", label: "Employee", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "checkIn", label: "Check in", type: "time" },
      { key: "checkOut", label: "Check out", type: "time" },
      { key: "workMode", label: "Work mode", type: "select", options: ["office", "remote", "hybrid"] },
      { key: "status", label: "Status", type: "select", options: ["present", "absent", "late", "remote", "half-day"], required: true },
      { key: "hours", label: "Hours worked", type: "number", min: 0, max: 24 },
    ],
    columns: ["employee", "date", "checkIn", "checkOut", "status", "hours"],
  },
  {
    collection: "shifts", label: "Shifts", singular: "Shift",
    module: "hr", permission: "hr.shifts.read",
    fields: [
      { key: "name", label: "Shift name", type: "text", required: true },
      { key: "start", label: "Start", type: "time", required: true },
      { key: "end", label: "End", type: "time", required: true },
      { key: "days", label: "Days", type: "text", placeholder: "Mon–Fri" },
      { key: "breakMinutes", label: "Break (min)", type: "number", min: 0 },
      { key: "assignedTo", label: "Assigned to", type: "text" },
    ],
    columns: ["name", "start", "end", "days", "assignedTo"],
  },
  {
    collection: "leaveRequests", label: "Leave", singular: "Leave request",
    module: "hr", permission: "hr.leave.read",
    fields: [
      { key: "employee", label: "Employee", type: "text", required: true },
      { key: "type", label: "Type", type: "select", options: ["annual", "sick", "personal", "unpaid", "maternity"], required: true },
      { key: "from", label: "From", type: "date", required: true },
      { key: "to", label: "To", type: "date", required: true },
      { key: "days", label: "Days", type: "number", min: 0 },
      { key: "status", label: "Status", type: "select", options: ["pending", "approved", "rejected", "cancelled"], required: true },
      { key: "reason", label: "Reason", type: "textarea" },
    ],
    columns: ["employee", "type", "from", "to", "days", "status"],
  },
  {
    collection: "documents", label: "Documents", singular: "Document",
    module: "hr", permission: "hr.documents.read",
    fields: [
      { key: "category", label: "Document category", type: "select", options: ["employee", "company"], required: true },
      { key: "organizationId", label: "Company", type: "select", required: true },
      { key: "employeeId", label: "Employee", type: "select" },
      { key: "employee", label: "Employee", type: "text", readOnly: true },
      { key: "type", label: "Document type", type: "select", required: true },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "issuedOn", label: "Issued on", type: "date" },
      { key: "expiresOn", label: "Expires on", type: "date" },
      { key: "fileUrl", label: "File link", type: "text" },
      { key: "documentNumber", label: "Document number / reference", type: "text" },
      { key: "issuingAuthority", label: "Issuing authority", type: "text" },
      { key: "visibility", label: "Visibility", type: "select", options: ["hr", "employee", "company"] },
    ],
    columns: ["title", "employee", "category", "type", "issuedOn", "expiresOn"],
  },
  {
    collection: "contracts", label: "Contracts", singular: "Contract",
    module: "hr", permission: "hr.contracts.read",
    fields: [
      { key: "employee", label: "Employee", type: "text", required: true },
      { key: "type", label: "Type", type: "select", options: ["permanent", "fixed-term", "probation", "internship"], required: true },
      { key: "startDate", label: "Start", type: "date", required: true },
      { key: "endDate", label: "End", type: "date" },
      { key: "salary", label: "Salary", type: "currency", min: 0 },
      { key: "probationEnds", label: "Probation ends", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["draft", "active", "expired", "terminated"], required: true },
    ],
    columns: ["employee", "type", "startDate", "endDate", "salary", "status"],
  },
  {
    collection: "payroll", label: "Payroll", singular: "Payslip",
    module: "hr", permission: "hr.payroll.read",
    fields: [
      { key: "employee", label: "Employee", type: "text", required: true },
      { key: "period", label: "Period", type: "text", placeholder: "2026-01", required: true },
      { key: "basic", label: "Basic", type: "currency", min: 0 },
      { key: "allowances", label: "Allowances", type: "currency", min: 0 },
      { key: "deductions", label: "Deductions", type: "currency", min: 0 },
      { key: "tax", label: "Tax", type: "currency", min: 0 },
      { key: "netPay", label: "Net pay", type: "currency", min: 0 },
      { key: "status", label: "Status", type: "select", options: ["draft", "approved", "paid"], required: true },
    ],
    columns: ["employee", "period", "basic", "deductions", "netPay", "status"],
  },
  {
    collection: "tasks", label: "Tasks", singular: "Task",
    module: "hr", permission: "hr.tasks.read",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "assignee", label: "Assignee", type: "text", required: true },
      { key: "project", label: "Project", type: "text" },
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high", "urgent"] },
      { key: "status", label: "Status", type: "select", options: ["todo", "in-progress", "review", "done"], required: true },
      { key: "dueDate", label: "Due", type: "date" },
      { key: "progress", label: "Progress %", type: "percent", min: 0, max: 100 },
    ],
    columns: ["title", "assignee", "priority", "status", "dueDate", "progress"],
  },
  {
    collection: "performanceReviews", label: "Performance", singular: "Review",
    module: "hr", permission: "hr.performance.read",
    fields: [
      { key: "employee", label: "Employee", type: "text", required: true },
      { key: "period", label: "Period", type: "text", required: true },
      { key: "reviewer", label: "Reviewer", type: "text" },
      { key: "rating", label: "Rating (1–5)", type: "number", min: 1, max: 5 },
      { key: "goalsMet", label: "Goals met %", type: "percent", min: 0, max: 100 },
      { key: "status", label: "Status", type: "select", options: ["draft", "submitted", "calibrated", "final"] },
      { key: "summary", label: "Summary", type: "textarea" },
    ],
    columns: ["employee", "period", "reviewer", "rating", "goalsMet", "status"],
  },
  {
    collection: "employeeHistory", label: "History", singular: "History entry",
    module: "hr", permission: "hr.history.read",
    fields: [
      { key: "employee", label: "Employee", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "event", label: "Event", type: "select", options: ["hired", "promotion", "transfer", "salary-change", "leave", "termination", "review"] },
      { key: "details", label: "Details", type: "textarea" },
      { key: "changedBy", label: "Changed by", type: "text" },
    ],
    columns: ["employee", "date", "event", "details", "changedBy"],
  },
);

// ── Operations ──────────────────────────────────────────────────────────────
registry.push(
  {
    collection: "branches", label: "Branches", singular: "Branch",
    module: "stores", permission: "stores.branches.read",
    fields: [
      { key: "name", label: "Branch name", type: "text", required: true },
      { key: "company", label: "Company", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "manager", label: "Manager", type: "text" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "city", label: "City", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["operational", "renovating", "closed"], required: true },
    ],
    columns: ["name", "company", "location", "manager", "city", "status"],
  },
  {
    collection: "suppliers", label: "Suppliers", singular: "Supplier",
    module: "stores", permission: "stores.suppliers.read",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "contact", label: "Contact person", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "category", label: "Category", type: "text" },
      { key: "paymentTerms", label: "Payment terms", type: "select", options: ["net-15", "net-30", "net-60", "cod"] },
      { key: "status", label: "Status", type: "select", options: ["active", "on-hold", "blacklisted"], required: true },
    ],
    columns: ["name", "contact", "category", "paymentTerms", "status"],
  },
  {
    collection: "customers", label: "Customers", singular: "Customer",
    module: "stores", permission: "stores.customers.read",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "segment", label: "Segment", type: "select", options: ["retail", "vip", "wholesale", "corporate"] },
      { key: "city", label: "City", type: "text" },
      { key: "lifetimeValue", label: "Lifetime value", type: "currency", min: 0 },
      { key: "status", label: "Status", type: "select", options: ["active", "inactive"], required: true },
    ],
    columns: ["name", "segment", "city", "lifetimeValue", "status"],
  },
  {
    collection: "products", label: "Products", singular: "Product",
    module: "stores", permission: "stores.products.read",
    fields: [
        { key: "awb", label: "AWB number", type: "text", readOnly: true, placeholder: "Generated automatically" },
        { key: "organizationId", label: "Company", type: "select", required: true },
      { key: "sku", label: "SKU", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "category", label: "Category", type: "text" },
      { key: "unit", label: "Unit", type: "select", options: ["each", "kg", "litre", "box", "pack"] },
      { key: "cost", label: "Cost price", type: "currency", min: 0 },
      { key: "price", label: "Selling price", type: "currency", min: 0, required: true },
      { key: "taxRate", label: "Tax %", type: "percent", min: 0, max: 100 },
      { key: "reorderPoint", label: "Reorder point", type: "number", min: 0 },
      { key: "status", label: "Status", type: "select", options: ["active", "discontinued", "out-of-stock"], required: true },
    ],
      columns: ["awb", "sku", "name", "category", "cost", "price", "status"],
  },
  {
    collection: "sales", label: "Sales", singular: "Sale",
    module: "stores", permission: "stores.sales.read",
    fields: [
      { key: "invoiceNo", label: "Invoice #", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "customer", label: "Customer", type: "text" },
      { key: "channel", label: "Channel", type: "select", options: ["in-store", "online", "delivery", "wholesale"] },
      { key: "items", label: "Items", type: "number", min: 0 },
      { key: "subtotal", label: "Subtotal", type: "currency", min: 0 },
      { key: "tax", label: "Tax", type: "currency", min: 0 },
      { key: "total", label: "Total", type: "currency", min: 0, required: true },
      { key: "payment", label: "Payment", type: "select", options: ["cash", "card", "transfer", "mobile money", "credit"] },
      { key: "paymentTerms", label: "Payment terms", type: "select", options: ["immediate", "net7", "net15", "net30", "net45", "net60", "net90"] },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["completed", "pending", "refunded", "cancelled"], required: true },
    ],
    columns: ["invoiceNo", "date", "customer", "channel", "total", "status"],
  },
  {
    collection: "expenses", label: "Expenses", singular: "Expense",
    module: "stores", permission: "stores.expenses.read",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "category", label: "Category", type: "select", options: ["rent", "utilities", "salaries", "marketing", "maintenance", "supplies", "other"] },
      { key: "store", label: "Store", type: "text" },
      { key: "amount", label: "Amount", type: "currency", min: 0, required: true },
      { key: "paymentMethod", label: "Paid via", type: "select", options: ["cash", "card", "transfer", "mobile money"] },
      { key: "tax", label: "VAT / input tax", type: "currency", min: 0 },
      { key: "paymentTerms", label: "Payment terms", type: "select", options: ["immediate", "net7", "net15", "net30", "net45", "net60", "net90"] },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["approved", "pending", "reimbursed"], required: true },
    ],
    columns: ["title", "date", "category", "store", "amount", "status"],
  },
  {
    collection: "taxes", label: "Taxes", singular: "Tax",
    module: "stores", permission: "stores.taxes.read",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text" },
      { key: "rate", label: "Rate %", type: "percent", min: 0, max: 100, required: true },
      { key: "jurisdiction", label: "Jurisdiction", type: "text" },
      { key: "appliesTo", label: "Applies to", type: "select", options: ["all", "food", "services", "goods"] },
      { key: "status", label: "Status", type: "select", options: ["active", "inactive"], required: true },
    ],
    columns: ["name", "code", "rate", "jurisdiction", "status"],
  },
  {
    collection: "purchases", label: "Purchases", singular: "Purchase",
    module: "stores", permission: "stores.purchases.read",
    fields: [
      { key: "poNumber", label: "PO #", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "items", label: "Items", type: "number", min: 0 },
      { key: "subtotal", label: "Subtotal", type: "currency", min: 0 },
      { key: "total", label: "Total", type: "currency", min: 0, required: true },
      { key: "status", label: "Status", type: "select", options: ["draft", "ordered", "received", "partial", "cancelled"], required: true },
      { key: "tax", label: "VAT / input tax", type: "currency", min: 0 },
      { key: "paymentTerms", label: "Payment terms", type: "select", options: ["immediate", "net7", "net15", "net30", "net45", "net60", "net90"] },
      { key: "dueDate", label: "Due date", type: "date" },
    ],
    columns: ["poNumber", "date", "supplier", "items", "total", "status"],
  },
  {
    collection: "returns", label: "Returns", singular: "Return",
    module: "stores", permission: "stores.returns.read",
    fields: [
      { key: "rmaNumber", label: "RMA #", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "invoiceNo", label: "Invoice #", type: "text" },
      { key: "customer", label: "Customer", type: "text" },
      { key: "reason", label: "Reason", type: "select", options: ["damaged", "wrong-item", "defective", "change-of-mind", "expired"] },
      { key: "refund", label: "Refund", type: "currency", min: 0 },
      { key: "status", label: "Status", type: "select", options: ["requested", "approved", "refused", "refunded"], required: true },
    ],
    columns: ["rmaNumber", "date", "invoiceNo", "customer", "refund", "status"],
  },
);

// ── Warehouse ───────────────────────────────────────────────────────────────
registry.push(
  {
    collection: "warehouses", label: "Warehouses", singular: "Warehouse",
    module: "warehouse", permission: "warehouse.list.read",
    fields: [
      { key: "code", label: "Code", type: "text", required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "manager", label: "Manager", type: "text" },
      { key: "capacity", label: "Capacity (pallets)", type: "number", min: 0 },
      { key: "type", label: "Type", type: "select", options: ["distribution", "cold-chain", "bonded", "retail-back"] },
      { key: "status", label: "Status", type: "select", options: ["operational", "maintenance", "closed"], required: true },
    ],
    columns: ["code", "name", "location", "manager", "capacity", "status"],
  },
  {
    collection: "warehouseZones", label: "Zones & aisles", singular: "Zone",
    module: "warehouse", permission: "warehouse.zones.read",
    fields: [
      { key: "warehouse", label: "Warehouse", type: "text", required: true },
      { key: "name", label: "Zone name", type: "text", required: true },
      { key: "aisle", label: "Aisle", type: "text" },
      { key: "tempClass", label: "Temperature", type: "select", options: ["ambient", "chilled", "frozen", "hazardous"] },
      { key: "bins", label: "Bin count", type: "number", min: 0 },
      { key: "status", label: "Status", type: "select", options: ["active", "blocked"], required: true },
    ],
    columns: ["warehouse", "name", "aisle", "tempClass", "bins", "status"],
  },
  {
    collection: "bins", label: "Shelves / bins", singular: "Bin",
    module: "warehouse", permission: "warehouse.bins.read",
    fields: [
      { key: "code", label: "Bin code", type: "text", required: true },
      { key: "zone", label: "Zone", type: "text", required: true },
      { key: "shelf", label: "Shelf", type: "text" },
      { key: "level", label: "Level", type: "text" },
      { key: "capacity", label: "Capacity", type: "number", min: 0 },
      { key: "status", label: "Status", type: "select", options: ["free", "occupied", "reserved", "damaged"], required: true },
    ],
    columns: ["code", "zone", "shelf", "level", "capacity", "status"],
  },
  {
    collection: "inventory", label: "Stock levels", singular: "Stock item",
    module: "warehouse", permission: "warehouse.inventory.read",
    fields: [
      { key: "sku", label: "SKU", type: "text", required: true },
      { key: "product", label: "Product", type: "text", required: true },
      { key: "warehouse", label: "Warehouse", type: "text" },
      { key: "bin", label: "Bin", type: "text" },
      { key: "qty", label: "Quantity", type: "number", min: 0, required: true },
      { key: "reorderPoint", label: "Reorder point", type: "number", min: 0 },
      { key: "unitCost", label: "Unit cost", type: "currency", min: 0 },
      { key: "batch", label: "Batch / lot", type: "text" },
      { key: "expiry", label: "Expiry", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["in-stock", "low-stock", "out-of-stock", "quarantine"], required: true },
    ],
    columns: ["sku", "product", "warehouse", "bin", "qty", "status"],
  },
  {
    collection: "stockMovements", label: "Stock movements", singular: "Movement",
    module: "warehouse", permission: "warehouse.movements.read",
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "type", label: "Type", type: "select", options: ["received", "transfer", "dispatch", "damaged", "expired", "return", "adjustment"], required: true },
      { key: "sku", label: "SKU", type: "text", required: true },
      { key: "product", label: "Product", type: "text" },
      { key: "qty", label: "Quantity", type: "number", required: true },
      { key: "from", label: "From", type: "text" },
      { key: "to", label: "To", type: "text" },
      { key: "reference", label: "Reference", type: "text" },
      { key: "performedBy", label: "By", type: "text" },
    ],
    columns: ["date", "type", "product", "qty", "from", "to", "reference"],
  },
  {
    collection: "stockTransfers", label: "Transfers", singular: "Transfer",
    module: "warehouse", permission: "warehouse.transfers.read",
    fields: [
      { key: "reference", label: "Reference", type: "text", required: true },
      { key: "fromWarehouse", label: "From", type: "text", required: true },
      { key: "toWarehouse", label: "To", type: "text", required: true },
      { key: "items", label: "Item count", type: "number", min: 0 },
      { key: "requestedBy", label: "Requested by", type: "text" },
      { key: "dispatchedOn", label: "Dispatched", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["draft", "in-transit", "received", "cancelled"], required: true },
    ],
    columns: ["reference", "fromWarehouse", "toWarehouse", "items", "status"],
  },
  {
    collection: "warehouseOrders", label: "Purchase orders", singular: "PO",
    module: "warehouse", permission: "warehouse.orders.read",
    fields: [
      { key: "poNumber", label: "PO #", type: "text", required: true },
      { key: "supplier", label: "Supplier", type: "text", required: true },
      { key: "warehouse", label: "Ship to", type: "text" },
      { key: "orderDate", label: "Order date", type: "date", required: true },
      { key: "expectedOn", label: "Expected", type: "date" },
      { key: "items", label: "Item count", type: "number", min: 0 },
      { key: "total", label: "Total", type: "currency", min: 0 },
      { key: "status", label: "Status", type: "select", options: ["draft", "sent", "partial", "received", "cancelled"], required: true },
    ],
    columns: ["poNumber", "supplier", "warehouse", "orderDate", "total", "status"],
  },
);

// ── Admin / RBAC ────────────────────────────────────────────────────────────
registry.push(
  {
    collection: "roles", label: "Roles", singular: "Role",
    module: "admin", permission: "admin.roles.read",
    fields: [
      { key: "name", label: "Role name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "access", label: "Access level", type: "select", options: ["full", "department", "read-only"], required: true },
      { key: "userCount", label: "Users", type: "number", min: 0 },
    ],
    columns: ["name", "access", "userCount", "description"],
  },
  {
    collection: "users", label: "Users", singular: "User",
    module: "admin", permission: "admin.users.read",
    fields: [
      { key: "name", label: "Full name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "role", label: "Role", type: "select", options: ["admin", "manager", "staff"], required: true },
      { key: "department", label: "Department", type: "text" },
      { key: "lastActive", label: "Last active", type: "date" },
      { key: "status", label: "Status", type: "select", options: ["active", "invited", "suspended"], required: true },
    ],
    columns: ["name", "email", "role", "department", "status"],
  },
);

// Accounting registers: fixed assets with straight-line depreciation, and HR financial custody (العهدة).
registry.push(
  {
    collection: "fixedAssets", label: "Fixed assets", singular: "Fixed asset",
    module: "stores", permission: "stores.fixedAssets.read",
    fields: [
      { key: "name", label: "Asset name", type: "text", required: true },
      { key: "category", label: "Category", type: "select", options: ["machinery", "vehicles", "equipment", "computers", "furniture", "buildings", "other"], required: true },
      { key: "serialNumber", label: "Serial / tag number", type: "text" },
      { key: "purchaseDate", label: "Purchase date", type: "date", required: true },
      { key: "cost", label: "Purchase cost", type: "currency", min: 0, required: true },
      { key: "salvageValue", label: "Salvage value", type: "currency", min: 0 },
      { key: "usefulLifeYears", label: "Useful life (years)", type: "number", min: 1, max: 100, required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["in use", "idle", "disposed"], required: true },
      { key: "disposalDate", label: "Disposal date", type: "date" },
      { key: "disposalProceeds", label: "Sale proceeds", type: "currency", min: 0 },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    columns: ["name", "category", "purchaseDate", "cost", "usefulLifeYears", "status"],
  },
  {
    collection: "employeeCustody", label: "Financial custody", singular: "Custody item",
    module: "hr", permission: "hr.custody.read",
    fields: [
      { key: "employee", label: "Employee", type: "text", required: true },
      { key: "custodyType", label: "Custody type", type: "select", options: ["cash", "laptop", "phone", "vehicle", "tools", "equipment", "card", "other"], required: true },
      { key: "description", label: "Description", type: "text", required: true },
      { key: "value", label: "Value", type: "currency", min: 0, required: true },
      { key: "issueDate", label: "Issue date", type: "date", required: true },
      { key: "dueDate", label: "Settle by", type: "date" },
      { key: "settledAmount", label: "Settled / returned amount", type: "currency", min: 0 },
      { key: "settlementDate", label: "Settlement date", type: "date" },
      { key: "settlementMethod", label: "Settled by", type: "select", options: ["expense receipts", "cash returned", "salary deduction", "item returned"] },
      { key: "status", label: "Status", type: "select", options: ["open", "partially settled", "settled", "returned", "lost"], required: true },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    columns: ["employee", "custodyType", "description", "value", "issueDate", "status"],
  },
);
