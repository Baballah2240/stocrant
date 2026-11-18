import { migrateOperations } from "./operations-migration.js";
import { assertFinanceIntegrity } from "./finance-integrity.js";
import { migrateFinance } from "./finance-migration.js";
import { migratePayroll } from "./payroll-migration.js";
import { migrateEmployeeIdentities, assertEmployeeIdentities } from "./employee-identity.js";
import { migrateAccountEmployeeLinks } from "./account-link-migration.js";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { Person, Store, Zone } from "./types.js";
import { SEED_COLLECTIONS } from "./seed-collections.js";
import { newProductAwb } from "./product-awb.js";
import { migrateOrganizations } from "./organization-model.js";
import { migrateDocuments } from "./document-model.js";

const DEFAULT_COMPANY_ID = "company-primary";
if (process.env.NODE_TEST_CONTEXT && !process.env.STOCRANT_DATA_DIR?.includes("stocrant-test-data-")) {
  throw new Error("API tests must initialize their isolated data directory before importing storage.");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.STOCRANT_DATA_DIR
  ? join(process.env.STOCRANT_DATA_DIR, "data")
  : join(__dirname, "..", "data");

export interface StoreData {
  stores: Store[];
  zones: Zone[];
  people: Person[];
  /** Generic module collections (HR / Stores / Warehouse / Admin). */
  collections: Record<string, unknown[]>;
}

const STORE_FILE = join(DATA_DIR, "stocrant.json");
const MIGRATION_BACKUP_FILE = join(DATA_DIR, "stocrant.pre-v2-backup.json");

/** Keeps the newest daily snapshots so backups cannot fill the data disk. */
function pruneDailyBackups(backupDir: string) {
  const keep = Number(process.env.STOCRANT_BACKUP_DAYS);
  const limit = Number.isInteger(keep) && keep > 0 ? keep : 30;
  const daily = readdirSync(backupDir).filter(name => /^stocrant-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  for (const name of daily.slice(0, Math.max(0, daily.length - limit))) rmSync(join(backupDir, name), { force: true });
}

/** Default demo data so STOCRANT is usable out of the box. */
export const SEED_DATA: StoreData = {
  stores: [
    {
      id: "st-001",
      companyId: DEFAULT_COMPANY_ID,
      name: "Downtown Plaza",
      kind: "restaurant",
      address: "12 Main Street",
      city: "Seoul",
      totalArea: 320,
      floorCount: 1,
      status: "open",
      createdAt: "2026-01-05T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
    {
      id: "st-002",
      companyId: DEFAULT_COMPANY_ID,
      name: "Gangnam Branch",
      kind: "restaurant",
      address: "45 Yeonhui-ro",
      city: "Seoul",
      totalArea: 480,
      floorCount: 1,
      status: "open",
      createdAt: "2026-01-05T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
    {
      id: "st-003",
      companyId: DEFAULT_COMPANY_ID,
      name: "Tech Office HQ",
      kind: "office",
      address: "8 Digital Square",
      city: "Seoul",
      totalArea: 640,
      floorCount: 5,
      status: "open-limited",
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-10T00:00:00Z",
    },
  ],
  zones: [
    { id: "z-001", storeId: "st-001", name: "Dining Floor", kind: "dining", area: 240, capacity: 96 },
    { id: "z-002", storeId: "st-001", name: "Bar & Counter", kind: "counter", area: 40, capacity: 24 },
    { id: "z-003", storeId: "st-001", name: "Kitchen & Back Hall", kind: "back", area: 40, capacity: 12 },
    { id: "z-004", storeId: "st-002", name: "Main Dining", kind: "dining", area: 320, capacity: 140 },
    { id: "z-005", storeId: "st-002", name: "Smoking & Lounge", kind: "floor", area: 80, capacity: 40 },
    { id: "z-006", storeId: "st-003", name: "Open Plan Desks", kind: "floor", area: 240, capacity: 120 },
    { id: "z-007", storeId: "st-003", name: "Conference Rooms", kind: "back", area: 120, capacity: 40 },
    { id: "z-008", storeId: "st-003", name: "Break Room", kind: "back", area: 60, capacity: 24 },
  ],
  people: [
    { id: "p-001", name: "Kim Minji", role: "Service Manager", storeId: "st-001", zoneId: "z-001", status: "active", hireDate: "2025-11-03", createdAt: "2025-11-03T00:00:00Z", email: "minji@example.com", phone: "010-1234-0001" },
    { id: "p-002", name: "Lee Jihoon", role: "Captain", storeId: "st-001", zoneId: "z-001", status: "active", hireDate: "2025-11-03", createdAt: "2025-11-03T00:00:00Z", email: "jihoon@example.com", phone: "010-1234-0002" },
    { id: "p-003", name: "Park Soojin", role: "Cook", storeId: "st-001", zoneId: "z-003", status: "leave", hireDate: "2026-01-12", createdAt: "2026-01-12T00:00:00Z" },
    { id: "p-004", name: "Choi Hyunwoo", role: "Service Lead", storeId: "st-002", zoneId: "z-004", status: "active", hireDate: "2026-01-05", createdAt: "2026-01-05T00:00:00Z" },
    { id: "p-005", name: "Jung Yuna", role: "Captain", storeId: "st-002", zoneId: "z-004", status: "active", hireDate: "2026-02-01", createdAt: "2026-02-01T00:00:00Z" },
    { id: "p-006", name: "Han Seo", role: "Admin", storeId: "st-003", zoneId: "z-006", status: "active", hireDate: "2026-01-15", createdAt: "2026-01-15T00:00:00Z" },
    { id: "p-007", name: "Yoon Taeho", role: "Engineer", storeId: "st-003", zoneId: "z-006", status: "active", hireDate: "2026-02-20", createdAt: "2026-02-20T00:00:00Z" },
    { id: "p-008", name: "Kang Mira", role: "Team Lead", storeId: "st-003", zoneId: "z-007", status: "active", hireDate: "2025-12-01", createdAt: "2025-12-01T00:00:00Z" },
  ],
  collections: structuredClone(SEED_COLLECTIONS),
};

function ensureDir() {
  mkdirSync(DATA_DIR, { recursive: true });
}

function defaultCompany() {
  return {
    id: DEFAULT_COMPANY_ID,
    name: "STOCRANT Operations",
    tradeName: "STOCRANT",
    industry: "mixed",
    country: "South Korea",
    currency: "KRW",
    status: "active",
  };
}

/**
 * Adds the company hierarchy to data created by earlier STOCRANT versions.
 * Existing locations are retained and attached to a primary company; nothing
 * is deleted during this migration.
 */
function migrateCompanyHierarchy(data: StoreData): boolean {
  let changed = false;
  if (!data.collections) {
    data.collections = structuredClone(SEED_COLLECTIONS);
    changed = true;
  }
  const companies = data.collections.companies as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(companies) || (companies.length === 0 && data.stores.length > 0)) {
    data.collections.companies = [defaultCompany()];
    changed = true;
  }
  for (const location of data.stores) {
    if (!location.companyId) {
      location.companyId = DEFAULT_COMPANY_ID;
      changed = true;
    }
  }
  return changed;
}

type Row = Record<string, unknown>;

function collectionRows(data: StoreData, name: string): Row[] {
  const current = data.collections[name];
  if (!Array.isArray(current)) {
    data.collections[name] = [];
  }
  return data.collections[name] as Row[];
}

function systemRoles(): Row[] {
  return [
    {
      id: "role-main-manager",
      name: "Super Admin",
      permissions: ["*"],
      isSystem: true,
      dataClassification: "system",
      description: "Full administration, approval and export authority.",
    },
    {
      id: "role-manager",
      name: "Manager",
      permissions: [
        "organizations.view", "locations.view", "locations.create", "locations.edit",
        "hr.view", "hr.create", "hr.edit", "operations.*", "inventory.*",
        "finance.view", "finance.create", "finance.edit", "approvals.view", "approvals.approve",
      ],
      isSystem: true,
      dataClassification: "system",
      description: "Runs assigned business areas and can approve configured work.",
    },
    {
      id: "role-customer-service",
      name: "Customer Service",
      permissions: ["organizations.view", "locations.view", "customerService.view", "customerService.create", "customerService.edit", "customerService.reply"],
      isSystem: true,
      dataClassification: "system",
      description: "Manages customer appointments, questions and permitted local replies within the assigned company.",
    },
    {
      id: "role-employee",
      name: "Employee",
      permissions: ["organizations.view", "locations.view", "hr.view", "operations.view", "operations.create", "operations.edit", "inventory.view"],
      ownRecordsOnly: true,
      isSystem: true,
      dataClassification: "system",
      description: "Limited to assigned locations and own operational records.",
    },
  ];
}

function mapLegacyTask(task: Row): Row {
  const statusMap: Record<string, string> = {
    todo: "Planned",
    "in-progress": "In Progress",
    review: "Awaiting Approval",
    done: "Completed",
  };
  return {
    id: `legacy-${String(task.id ?? nextCollectionId("workItems"))}`,
    title: task.title ?? "Untitled work",
    assignee: task.assignee ?? "",
    priority: task.priority ?? "Medium",
    status: statusMap[String(task.status)] ?? "Planned",
    dueDate: task.dueDate ?? "",
    progress: typeof task.progress === "number" ? task.progress : 0,
    workflow: task.project ?? "General",
    comments: "Imported from legacy tasks.",
    attachments: "",
    source: "legacy",
    dataClassification: "demo",
  };
}

function mapLegacyInventory(item: Row): Row {
  const qty = typeof item.qty === "number" ? item.qty : 0;
  return {
    id: `legacy-${String(item.id ?? nextCollectionId("inventoryItems"))}`,
    sku: item.sku ?? "",
    name: item.product ?? item.name ?? "Unnamed item",
    unit: "unit",
    stockLocation: item.warehouse ?? "Unassigned",
    openingStock: qty,
    reorderPoint: typeof item.reorderPoint === "number" ? item.reorderPoint : 0,
    allowNegative: false,
    source: "legacy",
    dataClassification: "demo",
  };
}

/**
 * Version 2 evolves a local single-user workspace into a real authenticated
 * business workspace. It only adds collections/fields; no existing business
 * arrays are removed or overwritten.
 */
function migrateSecureWorkspace(data: StoreData): boolean {
  let changed = false;
  const products = [...collectionRows(data, "products"), ...collectionRows(data, "inventoryItems")];
  const usedAwbs = new Set(products.map(row => String(row.awb ?? "")));
  for (const product of products) if (!product.awb) { product.awb = newProductAwb(usedAwbs); changed = true; }
  const required = [
    "accessRoles", "accessUsers", "sessions", "approvalRules", "approvalRequests", "auditLog", "onboardingEmails", "employeeIdentities",
    "locationUpdates", "workItems", "workActivity", "companyNotes", "inventoryItems", "inventoryMovements",
    "financeAccounts", "financeTransactions", "workspaceSettings", "attendanceSettings", "attendanceCorrectionRequests", "attendancePayrollAdjustments",
  ];
  for (const name of required) {
    if (!Array.isArray(data.collections[name])) {
      data.collections[name] = [];
      changed = true;
    }
  }

  const roles = collectionRows(data, "accessRoles");
  for (const role of systemRoles()) {
    if (!roles.some((row) => row.id === role.id)) {
      roles.push(role);
      changed = true;
    }
  }

  const settings = collectionRows(data, "workspaceSettings");
  if (!settings.some((row) => row.id === "workspace-settings")) {
    settings.push({
      id: "workspace-settings",
      schemaVersion: 2,
      demoDataSeparated: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    changed = true;
  }

  for (const company of collectionRows(data, "companies")) {
    if (!company.organizationType) {
      company.organizationType = typeof company.industry === "string" && ["restaurant", "retail"].includes(company.industry)
        ? company.industry === "retail" ? "shop" : "restaurant"
        : company.industry === "hospitality" ? "hotel" : company.industry === "services" ? "services" : "mixed";
      changed = true;
    }
    // Earlier company types: "store" is now Shop & retail and "office" is now Services.
    if (company.organizationType === "store" || company.organizationType === "office") {
      if (company.organizationType === "office" && !company.serviceCategory) company.serviceCategory = "office";
      company.organizationType = company.organizationType === "store" ? "shop" : "services";
      changed = true;
    }
  }

  for (const location of data.stores) {
    const row = location as unknown as Row;
    if (!row.dataClassification) {
      row.dataClassification = "demo";
      changed = true;
    }
  }
  for (const person of data.people) {
    const row = person as unknown as Row;
    if (!row.dataClassification) {
      row.dataClassification = "demo";
      changed = true;
    }
  }

  const workItems = collectionRows(data, "workItems");
  if (workItems.length === 0) {
    const legacyTasks = collectionRows(data, "tasks");
    if (legacyTasks.length) {
      workItems.push(...legacyTasks.map(mapLegacyTask));
      changed = true;
    }
  }

  const inventoryItems = collectionRows(data, "inventoryItems");
  if (inventoryItems.length === 0) {
    const legacyInventory = collectionRows(data, "inventory");
    if (legacyInventory.length) {
      inventoryItems.push(...legacyInventory.map(mapLegacyInventory));
      changed = true;
    }
  }

  const accounts = collectionRows(data, "financeAccounts");
  if (accounts.length === 0 && process.env.NODE_ENV !== "production") {
    accounts.push({ id: "account-operating", name: "Operating account", organizationId: DEFAULT_COMPANY_ID, type: "bank", currency: "KRW", openingBalance: 0, dataClassification: "demo" });
    changed = true;
  }

  return changed;
}

function read(): StoreData {
  ensureDir();
  try {
    if (!existsSync(STORE_FILE)) {
      const seeded: StoreData = process.env.NODE_ENV === "production"
        ? { stores: [], zones: [], people: [], collections: Object.fromEntries(Object.keys(SEED_COLLECTIONS).map(name => [name, []])) }
        : structuredClone(SEED_DATA);
      migrateCompanyHierarchy(seeded);
      migrateSecureWorkspace(seeded);
      migrateOrganizations(seeded);
      migrateDocuments(seeded);
      migrateEmployeeIdentities(seeded);
      migratePayroll(seeded);
      migrateFinance(seeded);
      migrateOperations(seeded);
      write(seeded);
      return seeded;
    }
    const raw = readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreData;
    if (!Array.isArray(parsed.stores) || !Array.isArray(parsed.zones) || !Array.isArray(parsed.people) || (parsed.collections !== undefined && (!parsed.collections || typeof parsed.collections !== "object" || Array.isArray(parsed.collections)))) throw new Error("Invalid business data structure.");
    const hierarchyChanged = migrateCompanyHierarchy(parsed);
    const workspaceChanged = migrateSecureWorkspace(parsed);
    const organizationsChanged = migrateOrganizations(parsed);
    const documentsChanged = migrateDocuments(parsed);
    const identitiesChanged = migrateEmployeeIdentities(parsed);
    const payrollChanged = migratePayroll(parsed);
    const financeChanged = migrateFinance(parsed);
    const operationsChanged = migrateOperations(parsed);
    const accountLinksChanged = migrateAccountEmployeeLinks(parsed);
    if (hierarchyChanged || workspaceChanged || organizationsChanged || documentsChanged || identitiesChanged || payrollChanged || financeChanged || operationsChanged || accountLinksChanged) {
      // Capture the on-disk original before its first v2 migration. The backup
      // stays beside the JSON store and is ignored by Git with the data folder.
      if (!existsSync(MIGRATION_BACKUP_FILE)) copyFileSync(STORE_FILE, MIGRATION_BACKUP_FILE);
      if (documentsChanged && !existsSync(join(DATA_DIR, "stocrant.pre-documents-v4-backup.json"))) copyFileSync(STORE_FILE, join(DATA_DIR, "stocrant.pre-documents-v4-backup.json"));
      if (organizationsChanged && !existsSync(join(DATA_DIR, "stocrant.pre-organizations-v3-backup.json"))) copyFileSync(STORE_FILE, join(DATA_DIR, "stocrant.pre-organizations-v3-backup.json"));
      if (identitiesChanged && !existsSync(join(DATA_DIR, "stocrant.pre-identities-v5-backup.json"))) copyFileSync(STORE_FILE, join(DATA_DIR, "stocrant.pre-identities-v5-backup.json"));
      if (payrollChanged && !existsSync(join(DATA_DIR, "stocrant.pre-payroll-v6-backup.json"))) copyFileSync(STORE_FILE, join(DATA_DIR, "stocrant.pre-payroll-v6-backup.json"));
      if (financeChanged && !existsSync(join(DATA_DIR, "stocrant.pre-finance-v7-backup.json"))) copyFileSync(STORE_FILE, join(DATA_DIR, "stocrant.pre-finance-v7-backup.json"));
      if (operationsChanged && !existsSync(join(DATA_DIR, "stocrant.pre-operations-v8-backup.json"))) copyFileSync(STORE_FILE, join(DATA_DIR, "stocrant.pre-operations-v8-backup.json"));
      if (accountLinksChanged && !existsSync(join(DATA_DIR, "stocrant.pre-account-links-v9-backup.json"))) copyFileSync(STORE_FILE, join(DATA_DIR, "stocrant.pre-account-links-v9-backup.json"));
      write(parsed);
    }
    return parsed;
  } catch (error) {
    throw new Error("STOCRANT cannot read its business data. Restore a verified backup before starting; existing data has not been replaced.", { cause: error });
  }
}

function write(data: StoreData) {
  assertEmployeeIdentities(data);
  assertFinanceIntegrity(data);
  ensureDir();
  // Keep a daily snapshot of the previous on-disk state before the first write.
  // Backups remain private alongside the data, outside the web asset directory.
  if (existsSync(STORE_FILE)) {
    const backupDir = join(DATA_DIR, "backups");
    mkdirSync(backupDir, { recursive: true });
    const dailyBackup = join(backupDir, `stocrant-${new Date().toISOString().slice(0, 10)}.json`);
    if (!existsSync(dailyBackup)) {
      copyFileSync(STORE_FILE, dailyBackup);
      pruneDailyBackups(backupDir);
    }
  }
  const tmp = `${STORE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", flush: true });
  try {
    renameSync(tmp, STORE_FILE);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}



let cache: StoreData | null = null;
let transactionDepth = 0;

export function getStore(): StoreData {
  if (!cache) cache = read();
  return cache;
}
export function getDataDirectory(): string { return DATA_DIR; }

export function saveStore(data: StoreData) {
  if (!transactionDepth) { try { write(data); } catch (error) { cache = null; throw error; } }
  cache = data;
}

/** Synchronous multi-record changes commit once, including audit/history. */
export function transaction<T>(operation: () => T): T {
  if (transactionDepth) return operation();
  const original = structuredClone(getStore());
  transactionDepth++;
  try {
    const result = operation();
    write(getStore());
    return result;
  } catch (error) { cache = original; throw error; }
  finally { transactionDepth--; }
}

/** Returns a usable company id for locations created by legacy API clients. */
export function getPrimaryCompanyId(): string {
  const data = getStore();
  const companies = data.collections?.companies as Array<Record<string, unknown>> | undefined;
  const existingId = companies?.find((company) => typeof company.id === "string")?.id;
  if (typeof existingId === "string") return existingId;
  if (!data.collections) data.collections = {};
  data.collections.companies = [defaultCompany()];
  saveStore(data);
  return DEFAULT_COMPANY_ID;
}

/** Generic collection access for HR / Stores / Warehouse / Admin entities. */
export function getCollection(name: string): unknown[] {
  const data = getStore();
  if (!data.collections) data.collections = structuredClone(SEED_COLLECTIONS);
  if (!data.collections[name]) data.collections[name] = [];
  return data.collections[name];
}

export function saveCollection(name: string, items: unknown[]) {
  const data = getStore();
  if (!data.collections) data.collections = {};
  data.collections[name] = items;
  saveStore(data);
}

export function nextCollectionId(name: string): string {
  return `${name}-${randomUUID()}`;
}

export function upsertStore(store: Store) {
  const data = getStore();
  const idx = data.stores.findIndex((s) => s.id === store.id);
  if (idx >= 0) {
    data.stores[idx] = { ...data.stores[idx], ...store, updatedAt: new Date().toISOString() };
  } else {
    data.stores.push({ ...store, createdAt: store.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  saveStore(data);
  return data.stores[data.stores.length - 1];
}

export function upsertZone(zone: Zone) {
  const data = getStore();
  const idx = data.zones.findIndex((z) => z.id === zone.id);
  if (idx >= 0) {
    data.zones[idx] = { ...data.zones[idx], ...zone };
  } else {
    data.zones.push(zone);
  }
  saveStore(data);
  return data.zones[data.zones.length - 1];
}

export function upsertPerson(person: Person) {
  const data = getStore();
  const idx = data.people.findIndex((p) => p.id === person.id);
  if (idx >= 0) {
    data.people[idx] = { ...data.people[idx], ...person };
  } else {
    data.people.push({ ...person, createdAt: new Date().toISOString() });
  }
  saveStore(data);
  return data.people[data.people.length - 1];
}

export function deleteZone(id: string) {
  const data = getStore();
  const before = data.zones.length;
  data.zones = data.zones.filter((z) => z.id !== id);
  if (data.zones.length < before) saveStore(data);
  return data.zones.length;
}

export function deletePerson(id: string) {
  const data = getStore();
  const before = data.people.length;
  data.people = data.people.filter((p) => p.id !== id);
  if (data.people.length < before) saveStore(data);
  return data.people.length;
}

export function deleteStore(id: string) {
  const data = getStore();
  data.stores = data.stores.filter((s) => s.id !== id);
  data.zones = data.zones.filter((z) => z.storeId !== id);
  data.people = data.people.filter((p) => p.storeId !== id);
  saveStore(data);
  return data.stores.length;
}

/** Generic collection helpers used by the metadata-driven CRUD engine. */
export type CollectionRow = Record<string, unknown> & { id?: string };

function rows(name: string): CollectionRow[] {
  return getCollection(name) as CollectionRow[];
}

export function listCollection(name: string): CollectionRow[] {
  return rows(name);
}

export function getCollectionItem(name: string, id: string): CollectionRow | undefined {
  return rows(name).find((row) => row.id === id);
}

export function upsertCollectionItem(
  name: string,
  item: CollectionRow,
): CollectionRow {
  const data = getStore();
  if (!data.collections) data.collections = {};
  const list = (data.collections[name] ?? []) as CollectionRow[];
  const id = typeof item.id === "string" && item.id ? item.id : nextCollectionId(name);
  const now = new Date().toISOString();
  const idx = list.findIndex((row) => row.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...item, id, updatedAt: now };
    data.collections[name] = list;
    saveStore(data);
    return list[idx];
  }
  const created: CollectionRow = { ...item, id, createdAt: now, updatedAt: now };
  data.collections[name] = [...list, created];
  saveStore(data);
  return created;
}

export function deleteCollectionItem(name: string, id: string): number {
  const data = getStore();
  if (!data.collections) data.collections = {};
  const list = (data.collections[name] ?? []) as CollectionRow[];
  data.collections[name] = list.filter((row) => row.id !== id);
  saveStore(data);
  return data.collections[name].length;
}

export function resetTestCache() {
  cache = null;
}

