import type {
  CollectionItem,
  EntitySpec,
  ModuleInfo,
  ModuleKey,
  Notification,
  Occupancy,
  Person,
  Store,
  StoreSummary,
  Zone,
  AuthUser,
  MutationResult,
} from "./types";

export type {
  CollectionItem,
  EntitySpec,
  ModuleInfo,
  ModuleKey,
  Notification,
  NotificationSeverity,
  NotificationType,
  Occupancy,
  Person,
  PersonStatus,
  Store,
  StoreKind,
  StoreStatus,
  StoreSummary,
  Zone,
  ZoneKind,
  AuthUser,
  MutationResult,
} from "./types";

const API = "/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(API + path, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/health"),

  auth: {
    status: () => request<{ authenticated: boolean; setupRequired: boolean; setupKeyConfigured: boolean; user: AuthUser | null }>("/auth/status"),
    setup: (input: { name: string; email: string; password: string; setupKey: string }) => request<{ user: AuthUser }>("/auth/setup", { method: "POST", body: JSON.stringify(input) }),
    login: (input: { email: string; password: string }) => request<{ user: AuthUser }>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
    logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
    me: () => request<{ user: AuthUser }>("/auth/me"),
  },

  stores: {
    list: () => request<{ stores: Store[] }>("/stores"),
    get: (id: string) =>
      request<{ store: Store & { occupancy: Occupancy } }>(`/stores/${id}`),
    create: (input: Omit<Store, "id" | "createdAt" | "updatedAt" | "occupancy">) =>
      request<{ store: Store }>("/stores", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, input: Partial<Omit<Store, "id" | "createdAt" | "updatedAt" | "occupancy">>) =>
      request<{ store: Store }>(`/stores/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      request<{ ok: true; storesRemaining: number }>(`/stores/${id}`, { method: "DELETE" }),
  },

  zones: {
    list: () => request<{ zones: Zone[] }>("/zones"),
    get: (id: string) => request<{ zone: Zone }>(`/zones/${id}`),
    create: (input: Omit<Zone, "id">) =>
      request<{ zone: Zone }>("/zones", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<Omit<Zone, "id">>) =>
      request<{ zone: Zone }>(`/zones/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      request<{ ok: true; zonesRemaining: number }>(`/zones/${id}`, { method: "DELETE" }),
  },

  people: {
    list: (storeId?: string) =>
      request<{ people: Person[] }>(`/people${storeId ? `?store=${storeId}` : ""}`),
    get: (id: string) => request<{ person: Person }>(`/people/${id}`),
    create: (input: Omit<Person, "id" | "createdAt">) =>
      request<{ person: Person }>("/people", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<Omit<Person, "id" | "createdAt">>) =>
      request<{ person: Person }>(`/people/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      request<{ ok: true; peopleRemaining: number }>(`/people/${id}`, { method: "DELETE" }),
  },

  occupancy: {
    list: () => request<{ stores: StoreSummary[] }>("/occupancy"),
    get: (storeId: string) => request<{ store: Occupancy }>(`/occupancy/${storeId}`),
    calculate: (storeId: string, headCount: number) =>
      request<{ store: Occupancy }>("/occupancy", {
        method: "POST",
        body: JSON.stringify({ storeId, headCount }),
      }),
  },

  collections: {
    meta: () =>
      request<{ modules: Record<ModuleKey, ModuleInfo>; entities: EntitySpec[] }>(
        "/collections/meta",
      ),
    list: (collection: string) =>
      request<{ items: CollectionItem[]; entity: string }>(`/collections/${collection}`),
    get: (collection: string, id: string) =>
      request<{ item: CollectionItem }>(`/collections/${collection}/${id}`),
    create: (collection: string, input: Record<string, unknown>) =>
      request<MutationResult>(`/collections/${collection}`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (collection: string, id: string, input: Record<string, unknown>) =>
      request<MutationResult>(`/collections/${collection}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    remove: (collection: string, id: string) =>
      request<MutationResult & { ok?: boolean; entity: string }>(
        `/collections/${collection}/${id}`,
        { method: "DELETE" },
      ),
  },

  workspace: {
    overview: () => request<{ organizations: number; locations: number; activeEmployees: number; work: { total: number; overdue: number }; inventory: { lowStockCount: number }; finance: { net: number }; pendingApprovals: number }>("/workspace/overview"),
    exportCollection: (collection: string) => request<{ filename: string; csv: string }>(`/workspace/export/${encodeURIComponent(collection)}`),
    locations: () => request<{ items: CollectionItem[] }>("/workspace/locations"),
    addLocationUpdate: (id: string, input: { note: string; status?: string }) => request<MutationResult>(`/workspace/locations/${id}/updates`, { method: "POST", body: JSON.stringify(input) }),
    birthdays: () => request<{ items: CollectionItem[] }>("/workspace/hr/birthdays"),
    work: (view = "all") => request<{ items: CollectionItem[]; activity: CollectionItem[] }>(`/workspace/work?view=${encodeURIComponent(view)}`),
    createWork: (input: Record<string, unknown>) => request<MutationResult>("/workspace/work", { method: "POST", body: JSON.stringify(input) }),
    updateWork: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/work/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    addWorkActivity: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/work/${id}/activity`, { method: "POST", body: JSON.stringify(input) }),
    inventory: () => request<{ items: CollectionItem[]; movements: CollectionItem[]; lowStockCount: number }>("/workspace/inventory"),
    createInventoryItem: (input: Record<string, unknown>) => request<MutationResult>("/workspace/inventory/items", { method: "POST", body: JSON.stringify(input) }),
    createInventoryMovement: (input: Record<string, unknown>) => request<MutationResult>("/workspace/inventory/movements", { method: "POST", body: JSON.stringify(input) }),
    finance: () => request<{ accounts: CollectionItem[]; transactions: CollectionItem[]; income: number; expenses: number; salaries: number; net: number }>("/workspace/finance"),
    createAccount: (input: Record<string, unknown>) => request<MutationResult>("/workspace/finance/accounts", { method: "POST", body: JSON.stringify(input) }),
    createTransaction: (input: Record<string, unknown>) => request<MutationResult & { items?: CollectionItem[] }>("/workspace/finance/transactions", { method: "POST", body: JSON.stringify(input) }),
    roles: () => request<{ items: CollectionItem[] }>("/workspace/access/roles"),
    updateRole: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/access/roles/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    users: () => request<{ items: CollectionItem[] }>("/workspace/access/users"),
    approvalRules: () => request<{ items: CollectionItem[] }>("/workspace/access/approval-rules"),
    saveApprovalRule: (input: Record<string, unknown>) => request<MutationResult>("/workspace/access/approval-rules", { method: "POST", body: JSON.stringify(input) }),
    updateApprovalRule: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/access/approval-rules/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    createUser: (input: Record<string, unknown>) => request<{ item: CollectionItem }>("/workspace/access/users", { method: "POST", body: JSON.stringify(input) }),
    updateUser: (id: string, input: Record<string, unknown>) => request<{ item: CollectionItem }>(`/workspace/access/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    approvals: () => request<{ items: CollectionItem[] }>("/workspace/approvals"),
    decideApproval: (id: string, input: { decision: "approve" | "reject"; note?: string }) => request<{ item: CollectionItem }>(`/workspace/approvals/${id}`, { method: "POST", body: JSON.stringify(input) }),
    audit: () => request<{ items: CollectionItem[] }>("/workspace/audit"),
  },

  notifications: {
    list: () => request<{ items: Notification[] }>("/notifications"),
    readAll: () =>
      request<{ success: true; count: number }>("/notifications/read-all", { method: "POST" }),
    markAsRead: (id: string) =>
      request<{ success: true; item: Notification }>(`/notifications/${id}/read`, { method: "POST" }),
  },
};

