/** Seed data for the generic module collections (HR / Stores / Warehouse / Admin).
 *  Kept separate from storage.ts so the core store stays easy to read.
 */
export const SEED_COLLECTIONS: Record<string, unknown[]> = {
  companies: [
    {
      id: "company-primary",
      name: "STOCRANT Operations",
      tradeName: "STOCRANT",
      industry: "mixed",
      country: "South Korea",
      currency: "KRW",
      status: "active",
      createdAt: "2026-01-05T00:00:00Z",
      updatedAt: "2026-01-05T00:00:00Z",
    },
  ],
  roles: [
    { id: "role-admin", name: "Main Admin", access: "full", userCount: 1, description: "Full access to every module and settings." },
    { id: "role-mgr", name: "Manager", access: "department", userCount: 4, description: "Read/write across HR, Stores and Warehouse." },
    { id: "role-staff", name: "Staff", access: "read-only", userCount: 12, description: "Read-only, can update assigned tasks." },
  ],
  users: [
    { id: "u-1", name: "Ava Chen", email: "ava@stocrant.io", role: "admin", department: "Operations", status: "active", lastActive: "2026-04-10" },
    { id: "u-2", name: "Marco Silva", email: "marco@stocrant.io", role: "manager", department: "Retail", status: "active", lastActive: "2026-04-09" },
    { id: "u-3", name: "Priya Nair", email: "priya@stocrant.io", role: "manager", department: "Warehouse", status: "active", lastActive: "2026-04-08" },
    { id: "u-4", name: "Tom Becker", email: "tom@stocrant.io", role: "staff", department: "Sales", status: "invited", lastActive: "2026-04-01" },
  ],
  departments: [
    { id: "dep-1", name: "Operations", code: "OPS", manager: "Ava Chen", headcount: 12, costCenter: "CC-100" },
    { id: "dep-2", name: "Retail", code: "RTL", manager: "Marco Silva", headcount: 24, costCenter: "CC-200" },
    { id: "dep-3", name: "Warehouse", code: "WHS", manager: "Priya Nair", headcount: 18, costCenter: "CC-300" },
  ],
  employees: [
    { id: "e-1", employeeCode: "EMP-001", name: "Kim Minji", email: "minji@stocrant.io", phone: "010-1111-0001", department: "Retail", jobTitle: "Store Manager", employmentType: "full-time", status: "active", hireDate: "2024-03-11", salary: 5200000, manager: "Marco Silva" },
    { id: "e-2", employeeCode: "EMP-002", name: "Lee Jihoon", email: "jihoon@stocrant.io", phone: "010-1111-0002", department: "Retail", jobTitle: "Captain", employmentType: "full-time", status: "active", hireDate: "2024-06-01", salary: 4100000, manager: "Kim Minji" },
    { id: "e-3", employeeCode: "EMP-003", name: "Priya Nair", email: "priya@stocrant.io", phone: "010-1111-0003", department: "Warehouse", jobTitle: "Warehouse Lead", employmentType: "full-time", status: "active", hireDate: "2023-09-04", salary: 4800000, manager: "Ava Chen" },
    { id: "e-4", employeeCode: "EMP-004", name: "Tom Becker", email: "tom@stocrant.io", phone: "010-1111-0004", department: "Sales", jobTitle: "Sales Associate", employmentType: "part-time", status: "probation", hireDate: "2026-02-15", salary: 2900000, manager: "Marco Silva" },
    { id: "e-5", employeeCode: "EMP-005", name: "Sara Okafor", email: "sara@stocrant.io", phone: "010-1111-0005", department: "Operations", jobTitle: "Ops Analyst", employmentType: "full-time", status: "on-leave", hireDate: "2025-01-20", salary: 4500000, manager: "Ava Chen" },
  ],
  attendance: [
    { id: "a-1", employee: "Kim Minji", date: "2026-04-10", checkIn: "08:55", checkOut: "18:05", status: "present", hours: 8.5, workMode: "office" },
    { id: "a-2", employee: "Lee Jihoon", date: "2026-04-10", checkIn: "09:12", checkOut: "18:00", status: "late", hours: 8, workMode: "office" },
    { id: "a-3", employee: "Priya Nair", date: "2026-04-10", checkIn: "08:00", checkOut: "16:30", status: "present", hours: 8, workMode: "hybrid" },
    { id: "a-4", employee: "Tom Becker", date: "2026-04-10", status: "remote", hours: 7.5, workMode: "remote" },
    { id: "a-5", employee: "Sara Okafor", date: "2026-04-10", status: "absent", hours: 0 },
  ],
  leaveRequests: [
    { id: "lv-1", employee: "Sara Okafor", type: "annual", from: "2026-04-06", to: "2026-04-17", days: 10, status: "approved", reason: "Family vacation" },
    { id: "lv-2", employee: "Tom Becker", type: "sick", from: "2026-04-02", to: "2026-04-03", days: 2, status: "pending", reason: "Flu" },
    { id: "lv-3", employee: "Lee Jihoon", type: "personal", from: "2026-05-01", to: "2026-05-01", days: 1, status: "approved", reason: "Appointment" },
  ],
  payroll: [
    { id: "pr-1", employee: "Kim Minji", period: "2026-03", basic: 5200000, allowances: 400000, deductions: 210000, tax: 260000, netPay: 5130000, status: "paid" },
    { id: "pr-2", employee: "Lee Jihoon", period: "2026-03", basic: 4100000, allowances: 300000, deductions: 160000, tax: 180000, netPay: 4060000, status: "paid" },
    { id: "pr-3", employee: "Tom Becker", period: "2026-03", basic: 2900000, allowances: 150000, deductions: 90000, tax: 90000, netPay: 2870000, status: "approved" },
  ],
  tasks: [
    { id: "t-1", title: "Q2 inventory audit", assignee: "Priya Nair", priority: "high", status: "in-progress", dueDate: "2026-04-30", progress: 45, project: "Warehouse" },
    { id: "t-2", title: "Launch spring menu", assignee: "Kim Minji", priority: "medium", status: "review", dueDate: "2026-04-18", progress: 90, project: "Retail" },
    { id: "t-3", title: "Onboard new associate", assignee: "Marco Silva", priority: "low", status: "todo", dueDate: "2026-04-25", progress: 0 },
    { id: "t-4", title: "Renew fire license", assignee: "Ava Chen", priority: "urgent", status: "in-progress", dueDate: "2026-04-12", progress: 60, project: "Compliance" },
  ],
  performanceReviews: [
    { id: "pf-1", employee: "Kim Minji", period: "2025-H2", reviewer: "Marco Silva", rating: 5, goalsMet: 96, status: "final", summary: "Exceeded sales targets two quarters running." },
    { id: "pf-2", employee: "Lee Jihoon", period: "2025-H2", reviewer: "Kim Minji", rating: 4, goalsMet: 88, status: "calibrated", summary: "Strong floor leadership." },
    { id: "pf-3", employee: "Tom Becker", period: "2025-H2", reviewer: "Marco Silva", rating: 3, goalsMet: 70, status: "submitted", summary: "Good progress during probation." },
  ],
  employeeHistory: [
    { id: "h-1", employee: "Kim Minji", date: "2026-01-01", event: "promotion", details: "Promoted to Store Manager", changedBy: "Ava Chen" },
    { id: "h-2", employee: "Tom Becker", date: "2026-02-15", event: "hired", details: "Joined as Sales Associate", changedBy: "Marco Silva" },
  ],
  shifts: [
    { id: "sh-1", name: "Morning", start: "08:00", end: "16:00", days: "Mon–Fri", breakMinutes: 45 },
    { id: "sh-2", name: "Evening", start: "16:00", end: "00:00", days: "Mon–Sat", breakMinutes: 30 },
  ],
  documents: [
    { id: "d-1", employee: "Kim Minji", type: "id", title: "National ID", issuedOn: "2020-05-01", expiresOn: "2030-05-01" },
    { id: "d-2", employee: "Priya Nair", type: "visa", title: "Work visa", issuedOn: "2024-01-10", expiresOn: "2026-06-30" },
  ],
  contracts: [
    { id: "c-1", employee: "Kim Minji", type: "permanent", startDate: "2024-03-11", salary: 5200000, status: "active" },
    { id: "c-2", employee: "Tom Becker", type: "probation", startDate: "2026-02-15", probationEnds: "2026-05-15", salary: 2900000, status: "active" },
  ],

  // ── Stores ──
  branches: [
    { id: "br-1", name: "Downtown Plaza", store: "Downtown Plaza", manager: "Kim Minji", city: "Seoul", status: "operational", phone: "02-111-2222" },
    { id: "br-2", name: "Gangnam Flagship", store: "Gangnam Branch", manager: "Lee Jihoon", city: "Seoul", status: "operational", phone: "02-333-4444" },
    { id: "br-3", name: "Hongdae Kiosk", store: "Gangnam Branch", manager: "Tom Becker", city: "Seoul", status: "renovating" },
  ],
  suppliers: [
    { id: "sup-1", name: "FreshFarm Co.", contact: "Hana Jung", category: "Produce", paymentTerms: "net-30", status: "active", email: "sales@freshfarm.kr" },
    { id: "sup-2", name: "MeatLine Ltd.", contact: "Daniel Park", category: "Meat", paymentTerms: "net-15", status: "active" },
    { id: "sup-3", name: "PackRight", contact: "Uma Rao", category: "Packaging", paymentTerms: "net-60", status: "active" },
    { id: "sup-4", name: "ChillSys", contact: "Leo Kim", category: "Equipment", paymentTerms: "cod", status: "on-hold" },
  ],
  customers: [
    { id: "cu-1", name: "Walk-in Retail", segment: "retail", city: "Seoul", lifetimeValue: 12500000, status: "active" },
    { id: "cu-2", name: "Han Corp Catering", segment: "corporate", city: "Seoul", lifetimeValue: 88000000, status: "active" },
    { id: "cu-3", name: "Yuna Kim", segment: "vip", city: "Busan", lifetimeValue: 4300000, status: "active" },
    { id: "cu-4", name: "Seoul Grocers", segment: "wholesale", city: "Seoul", lifetimeValue: 31000000, status: "inactive" },
  ],
  products: [
    { id: "p-1", sku: "FD-001", name: "Signature Burger", category: "Mains", unit: "each", cost: 3200, price: 9800, taxRate: 10, status: "active" },
    { id: "p-2", sku: "FD-002", name: "Garden Salad", category: "Mains", unit: "each", cost: 1800, price: 7200, taxRate: 10, status: "active" },
    { id: "p-3", sku: "BV-001", name: "Cold Brew 500ml", category: "Beverages", unit: "each", cost: 900, price: 4500, taxRate: 10, status: "active" },
    { id: "p-4", sku: "PK-001", name: "Takeaway Box", category: "Packaging", unit: "box", cost: 400, price: 0, taxRate: 0, status: "active", reorderPoint: 500 },
    { id: "p-6", sku: "ING-011", name: "Beef Patty 150g", category: "Ingredients", unit: "kg", cost: 11000, price: 0, taxRate: 0, status: "active", reorderPoint: 40 },
  ],
  sales: [
    { id: "sa-1", invoiceNo: "INV-1001", date: "2026-04-10", customer: "Yuna Kim", channel: "in-store", items: 3, subtotal: 21500, tax: 2150, total: 23650, payment: "card", status: "completed" },
    { id: "sa-2", invoiceNo: "INV-1002", date: "2026-04-10", customer: "Walk-in Retail", channel: "in-store", items: 1, subtotal: 9800, tax: 980, total: 10780, payment: "cash", status: "completed" },
    { id: "sa-3", invoiceNo: "INV-1003", date: "2026-04-09", customer: "Han Corp Catering", channel: "wholesale", items: 120, subtotal: 780000, tax: 78000, total: 858000, payment: "transfer", status: "completed" },
    { id: "sa-4", invoiceNo: "INV-1004", date: "2026-04-09", customer: "Walk-in Retail", channel: "online", items: 2, subtotal: 14400, tax: 1440, total: 15840, payment: "card", status: "pending" },
    { id: "sa-5", invoiceNo: "INV-1005", date: "2026-04-08", customer: "Yuna Kim", channel: "delivery", items: 4, subtotal: 34200, tax: 3420, total: 37620, payment: "card", status: "refunded" },
  ],
  expenses: [
    { id: "ex-1", title: "April rent", date: "2026-04-01", category: "rent", store: "Downtown Plaza", amount: 4500000, status: "approved", paymentMethod: "transfer" },
    { id: "ex-2", title: "Electricity", date: "2026-04-05", category: "utilities", store: "Gangnam Branch", amount: 620000, status: "pending" },
    { id: "ex-3", title: "Social ads", date: "2026-04-07", category: "marketing", store: "Downtown Plaza", amount: 800000, status: "approved" },
    { id: "ex-4", title: "Kitchen repair", date: "2026-04-09", category: "maintenance", store: "Downtown Plaza", amount: 1250000, status: "pending" },
  ],
  taxes: [
    { id: "tx-1", name: "VAT", code: "VAT", rate: 10, jurisdiction: "South Korea", appliesTo: "all", status: "active" },
    { id: "tx-2", name: "Service tax", code: "SVC", rate: 5, jurisdiction: "Seoul", appliesTo: "services", status: "active" },
    { id: "tx-3", name: "Withholding", code: "WHT", rate: 3, jurisdiction: "South Korea", appliesTo: "all", status: "inactive" },
  ],
  purchases: [
    { id: "pu-1", poNumber: "PO-2001", date: "2026-04-05", supplier: "FreshFarm Co.", items: 12, subtotal: 1240000, total: 1364000, status: "received" },
    { id: "pu-2", poNumber: "PO-2002", date: "2026-04-08", supplier: "MeatLine Ltd.", items: 8, subtotal: 2400000, total: 2640000, status: "ordered" },
    { id: "pu-3", poNumber: "PO-2003", date: "2026-04-10", supplier: "PackRight", items: 5, subtotal: 400000, total: 440000, status: "draft" },
  ],
  returns: [
    { id: "rt-1", rmaNumber: "RMA-01", date: "2026-04-09", invoiceNo: "INV-1005", customer: "Yuna Kim", reason: "wrong-item", refund: 37620, status: "refunded" },
    { id: "rt-2", rmaNumber: "RMA-02", date: "2026-04-10", invoiceNo: "INV-1004", customer: "Walk-in Retail", reason: "damaged", refund: 7200, status: "pending" },
  ],

  // ── Warehouse ──
  warehouses: [
    { id: "wh-1", code: "WH-SEO", name: "Seoul Distribution", location: "Seoul, Guui", manager: "Priya Nair", capacity: 1200, type: "distribution", status: "operational" },
    { id: "wh-2", code: "WH-BUS", name: "Busan Cold Store", location: "Busan, Haeundae", manager: "Daniel Park", capacity: 600, type: "cold-chain", status: "operational" },
    { id: "wh-3", code: "WH-BND", name: "Incheon Bonded", location: "Incheon, Nam-gu", manager: "Uma Rao", capacity: 900, type: "bonded", status: "maintenance" },
  ],
  warehouseZones: [
    { id: "wz-1", warehouse: "Seoul Distribution", name: "Aisle A", aisle: "A", tempClass: "ambient", bins: 40, status: "active" },
    { id: "wz-2", warehouse: "Seoul Distribution", name: "Aisle B", aisle: "B", tempClass: "chilled", bins: 30, status: "active" },
    { id: "wz-3", warehouse: "Busan Cold Store", name: "Freezer 1", aisle: "F", tempClass: "frozen", bins: 24, status: "active" },
    { id: "wz-4", warehouse: "Incheon Bonded", name: "Hazmat Bay", aisle: "H", tempClass: "hazardous", bins: 12, status: "blocked" },
  ],
  bins: [
    { id: "bn-1", code: "A-01-01", zone: "Aisle A", shelf: "01", level: "L1", capacity: 200, status: "occupied" },
    { id: "bn-2", code: "A-01-02", zone: "Aisle A", shelf: "01", level: "L2", capacity: 200, status: "free" },
    { id: "bn-3", code: "B-02-01", zone: "Aisle B", shelf: "02", level: "L1", capacity: 150, status: "reserved" },
    { id: "bn-4", code: "F-01-01", zone: "Freezer 1", shelf: "01", level: "L1", capacity: 100, status: "occupied" },
    { id: "bn-5", code: "A-02-01", zone: "Aisle A", shelf: "02", level: "L1", capacity: 200, status: "free" },
  ],
  inventory: [
    { id: "in-1", sku: "ING-011", product: "Beef Patty 150g", warehouse: "Seoul Distribution", bin: "A-01-01", qty: 320, reorderPoint: 120, unitCost: 11000, status: "in-stock", batch: "B-2401", expiry: "2026-07-01" },
    { id: "in-2", sku: "PK-001", product: "Takeaway Box", warehouse: "Seoul Distribution", bin: "A-02-01", qty: 850, reorderPoint: 500, unitCost: 400, status: "in-stock" },
    { id: "in-3", sku: "FD-002", product: "Garden Salad", warehouse: "Busan Cold Store", bin: "F-01-01", qty: 45, reorderPoint: 60, unitCost: 1800, status: "low-stock", expiry: "2026-04-15" },
    { id: "in-4", sku: "BV-001", product: "Cold Brew 500ml", warehouse: "Seoul Distribution", bin: "B-02-01", qty: 0, reorderPoint: 100, unitCost: 900, status: "out-of-stock" },
    { id: "in-5", sku: "ING-022", product: "Chicken Thigh", warehouse: "Busan Cold Store", bin: "F-01-01", qty: 90, reorderPoint: 50, unitCost: 8500, status: "quarantine", expiry: "2026-04-12" },
  ],
  stockMovements: [
    { id: "sm-1", date: "2026-04-10", type: "received", sku: "ING-011", product: "Beef Patty 150g", qty: 200, to: "Seoul Distribution", reference: "PO-2001", performedBy: "Priya Nair" },
    { id: "sm-2", date: "2026-04-10", type: "dispatch", sku: "PK-001", product: "Takeaway Box", qty: 150, from: "Seoul Distribution", to: "Downtown Plaza", reference: "REQ-88" },
    { id: "sm-3", date: "2026-04-09", type: "transfer", sku: "FD-002", product: "Garden Salad", qty: 40, from: "Seoul Distribution", to: "Busan Cold Store", reference: "TRF-12" },
    { id: "sm-4", date: "2026-04-09", type: "damaged", sku: "ING-022", product: "Chicken Thigh", qty: 12, from: "Busan Cold Store", reference: "DMG-03", performedBy: "Daniel Park" },
    { id: "sm-5", date: "2026-04-08", type: "expired", sku: "FD-003", product: "Seasonal Soup", qty: 8, from: "Seoul Distribution", reference: "EXP-01" },
    { id: "sm-6", date: "2026-04-07", type: "return", sku: "FD-001", product: "Signature Burger", qty: 3, to: "Seoul Distribution", reference: "RMA-01" },
  ],
  stockTransfers: [
    { id: "st-1", reference: "TRF-12", fromWarehouse: "Seoul Distribution", toWarehouse: "Busan Cold Store", items: 4, requestedBy: "Priya Nair", dispatchedOn: "2026-04-09", status: "received" },
    { id: "st-2", reference: "TRF-13", fromWarehouse: "Busan Cold Store", toWarehouse: "Seoul Distribution", items: 2, requestedBy: "Daniel Park", dispatchedOn: "2026-04-10", status: "in-transit" },
    { id: "st-3", reference: "TRF-14", fromWarehouse: "Seoul Distribution", toWarehouse: "Incheon Bonded", items: 6, status: "draft" },
  ],
  warehouseOrders: [
    { id: "wo-1", poNumber: "PO-2001", supplier: "FreshFarm Co.", warehouse: "Seoul Distribution", orderDate: "2026-04-05", expectedOn: "2026-04-11", items: 12, total: 1364000, status: "received" },
    { id: "wo-2", poNumber: "PO-2002", supplier: "MeatLine Ltd.", warehouse: "Seoul Distribution", orderDate: "2026-04-08", expectedOn: "2026-04-14", items: 8, total: 2640000, status: "sent" },
    { id: "wo-3", poNumber: "PO-2004", supplier: "ChillSys", warehouse: "Busan Cold Store", orderDate: "2026-04-10", expectedOn: "2026-04-20", items: 3, total: 980000, status: "draft" },
  ],
};




