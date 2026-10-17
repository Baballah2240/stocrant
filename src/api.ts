import { notifyAction, actionMessage } from "./action-feedback";
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

/**
 * API origin resolution.
 *
 * The browser build is served by the same Express process as the API, so a
 * relative "/api" is correct and keeps credentials same-origin. A native
 * WebView is served from capacitor:// or https://localhost, where "/api"
 * resolves to nothing, so the origin must be supplied:
 *
 *   1. SERVER_URL saved from the in-app server settings (stored on device)
 *   2. VITE_API_BASE_URL baked in at build time
 *   3. "" â†’ same-origin relative requests (browser / hosted deployment)
 */
const RUNTIME_OVERRIDE_KEY = "stocrant.serverUrl";
const RUNTIME_SESSION_KEY = "stocrant.mobileSession";

function buildTimeBase(): string {
  const fromEnv = (import.meta.env?.VITE_API_BASE_URL ?? "").trim();
  return fromEnv.replace(/\/+$/, "");
}

function readRuntimeOverride(): string {
  try {
    return (localStorage.getItem(RUNTIME_OVERRIDE_KEY) ?? "").trim().replace(/\/+$/, "");
  } catch {
    // Storage can be unavailable (private mode, locked-down WebView).
    return "";
  }
}

/** True when the app is packaged as a native app rather than a browser tab. */
export function isNativeApp(): boolean {
  return Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
  );
}

export const serverUrl = {
  key: RUNTIME_OVERRIDE_KEY,
  /** Origin the app is currently calling; "" means same-origin. */
  current(): string {
    return readRuntimeOverride() || buildTimeBase();
  },
  /** Persist a device-level override. Pass "" to fall back to build-time. */
  save(origin: string): string {
    const normalized = origin.trim().replace(/\/+$/, "");
    try {
      if (normalized) localStorage.setItem(RUNTIME_OVERRIDE_KEY, normalized);
      else localStorage.removeItem(RUNTIME_OVERRIDE_KEY);
    } catch {
      // Ignore storage failures; the build-time value still applies.
    }
    return this.current();
  },
  clear(): void {
    try {
      localStorage.removeItem(RUNTIME_OVERRIDE_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};

/**
 * Browser users retain HTTP-only cookies. Native WebViews send this signed
 * session value as a bearer credential to their configured STOCRANT server.
 */
export const mobileSession = {
  current(): string {
    if (!isNativeApp()) return "";
    try {
      return localStorage.getItem(RUNTIME_SESSION_KEY) ?? "";
    } catch {
      return "";
    }
  },
  save(token: string | undefined): void {
    if (!isNativeApp() || !token) return;
    try {
      localStorage.setItem(RUNTIME_SESSION_KEY, token);
    } catch {
      // If storage is unavailable, the WebView can still try its cookie session.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(RUNTIME_SESSION_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};

const API = "/api";
/** Resolved per call so a server change takes effect without a rebuild. */
function apiBase(): string {
  return `${serverUrl.current()}${API}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const action = !["GET", "HEAD"].includes(method) || path.startsWith("/workspace/export/");
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (isNativeApp()) {
    headers.set("X-STOCRANT-NATIVE", "1");
    const token = mobileSession.current();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  // The native shell loads from capacitor://, so it cannot rely on a
  // same-origin policy for cookies; explicit credentials keep sessions alive.
  let res: Response;
  try { res = await fetch(apiBase() + path, { ...init, headers, credentials: "include" }); }
  catch (error) { if (action) notifyAction("Could not complete the action. Check your connection and try again.", "error"); throw error; }
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore non-JSON error bodies
    }
    if (action) notifyAction(message, "error");
    throw new Error(message);
  }
  const result = (await res.json()) as T;
  if (action) {
    let input: unknown;
    try { input = typeof init.body === "string" ? JSON.parse(init.body) : undefined; } catch { /* No request metadata needed. */ }
    notifyAction(res.status === 202 || (result && typeof result === "object" && "pending" in result && result.pending) ? "Submitted for approval." : actionMessage(path, method, input), "success", !path.startsWith("/notifications/") && !path.startsWith("/auth/login") && !path.startsWith("/auth/logout"));
  }
  return result;
}

export const api = {
  health: () => request<{ ok: boolean; service: string }>("/health"),

  auth: {
    companies: () => request<{ companies: { id: string; name: string }[] }>("/auth/companies"),
    register: (input: { name: string; email: string; password: string }) => request<{ ok: boolean; message: string }>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
    forgotPassword: (email: string) => request<{ ok: boolean; message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
    updateProfile: (input: { name: string; email: string; phone: string; avatar: string; bio?: string; currentPassword?: string }) => request<{ user: AuthUser }>("/auth/profile", { method: "PATCH", body: JSON.stringify(input) }),
    changePassword: (input: { currentPassword: string; newPassword: string }) => request<{ ok: boolean }>("/auth/password", { method: "POST", body: JSON.stringify(input) }),
    status: () => request<{ authenticated: boolean; setupRequired: boolean; setupKeyConfigured: boolean; user: AuthUser | null }>("/auth/status"),
    setup: (input: { name: string; email: string; password: string; setupKey: string }) => request<{ user: AuthUser; sessionToken?: string }>("/auth/setup", { method: "POST", body: JSON.stringify(input) }),
    login: (input: { email: string; password: string }) => request<{ user: AuthUser; sessionToken?: string }>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
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
    overview: () => request<{ organizations: number; locations: number; activeEmployees: number; work: { total: number; overdue: number }; inventory: { lowStockCount: number }; finance: { net: number }; pendingApprovals: number; personal: { registered: boolean; attendanceEnabled: boolean; profile: { name: string; email: string; [key: string]: unknown }; lastLoginAt?: unknown; attendance: Record<string, unknown> | null; shift: Record<string, unknown> | null; leave: CollectionItem[]; pendingLeaveCount: number; work: CollectionItem[]; workCount: number; overdueWorkCount: number; notifications: Notification[]; unreadNotificationCount: number; policyUpdates: { id: string; title: string; publishedAt: string; fileUrl: string; isNew: boolean }[]; newPolicyCount: number } }>("/workspace/overview"),
    hrCompanies: () => request<{ companies: CollectionItem[]; employees: CollectionItem[] }>("/workspace/hr/companies"),
    hrOverview: () => request<{ today: string; metrics: { totalEmployees: number; activeEmployees: number; onLeaveEmployees: number; presentEmployees: number; attendanceRecorded: number; pendingLeave: number; pendingApprovals: number }; attendance: CollectionItem[]; leaveRequests: CollectionItem[]; birthdays: CollectionItem[]; activity: CollectionItem[]; approvals: CollectionItem[] }>("/workspace/hr/overview"),
    exportCollection: (collection: string) => request<{ filename: string; csv: string }>(`/workspace/export/${encodeURIComponent(collection)}`),
    locations: () => request<{ items: CollectionItem[]; companies: CollectionItem[] }>("/workspace/locations"),
    addLocationUpdate: (id: string, input: { note: string; status?: string }) => request<MutationResult>(`/workspace/locations/${id}/updates`, { method: "POST", body: JSON.stringify(input) }),
    birthdays: () => request<{ items: CollectionItem[] }>("/workspace/hr/birthdays"),
    work: (view = "all") => request<{ companies: CollectionItem[]; items: CollectionItem[]; activity: CollectionItem[] }>(`/workspace/work?view=${encodeURIComponent(view)}`),
    createWork: (input: Record<string, unknown>) => request<MutationResult>("/workspace/work", { method: "POST", body: JSON.stringify(input) }),
    updateWork: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/work/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    addWorkActivity: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/work/${id}/activity`, { method: "POST", body: JSON.stringify(input) }),
    selfService: () => request<{ employee: CollectionItem | null; attendance: CollectionItem[]; leave: CollectionItem[]; documents: CollectionItem[] }>("/workspace/self-service"),
    requestLeave: (input: { type: string; from: string; to: string; reason: string }) => request<{ item: CollectionItem }>("/workspace/self-service/leave", { method: "POST", body: JSON.stringify(input) }),
    cancelLeave: (id: string) => request<{ ok: boolean }>(`/workspace/self-service/leave/${id}/cancel`, { method: "POST" }),
    checkIn: () => request<{ item: CollectionItem }>("/workspace/attendance/check-in", { method: "POST" }),
    checkOut: () => request<{ item: CollectionItem }>("/workspace/attendance/check-out", { method: "POST" }),
    inventory: () => request<{ items: CollectionItem[]; movements: CollectionItem[]; lowStockCount: number; companies: CollectionItem[]; employees: CollectionItem[]; history: CollectionItem[] }>("/workspace/inventory"),
    createInventoryItem: (input: Record<string, unknown>) => request<MutationResult>("/workspace/inventory/items", { method: "POST", body: JSON.stringify(input) }),
    updateInventoryItem: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/inventory/items/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    createInventoryMovement: (input: Record<string, unknown>) => request<MutationResult>("/workspace/inventory/movements", { method: "POST", body: JSON.stringify(input) }),
    finance: () => request<{ companies: CollectionItem[]; people: CollectionItem[]; accounts: CollectionItem[]; transactions: CollectionItem[]; income: number; expenses: number; salaries: number; net: number }>("/workspace/finance"),
    createAccount: (input: Record<string, unknown>) => request<MutationResult>("/workspace/finance/accounts", { method: "POST", body: JSON.stringify(input) }),
    createTransaction: (input: Record<string, unknown>) => request<MutationResult & { items?: CollectionItem[] }>("/workspace/finance/transactions", { method: "POST", body: JSON.stringify(input) }),
    customerService: () => request<{ customers: CollectionItem[]; appointments: CollectionItem[]; questions: CollectionItem[]; replies: CollectionItem[]; companies: CollectionItem[]; employees: CollectionItem[] }>("/workspace/customer-service"),
    createAppointment: (input: Record<string, unknown>) => request<MutationResult>("/workspace/customer-service/appointments", { method: "POST", body: JSON.stringify(input) }),
    updateAppointment: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/customer-service/appointments/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    createQuestion: (input: Record<string, unknown>) => request<MutationResult>("/workspace/customer-service/questions", { method: "POST", body: JSON.stringify(input) }),
    replyToQuestion: (id: string, input: { message: string; resolve: boolean }) => request<MutationResult>(`/workspace/customer-service/questions/${id}/replies`, { method: "POST", body: JSON.stringify(input) }),
    roles: () => request<{ items: CollectionItem[] }>("/workspace/access/roles"),
    updateRole: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/access/roles/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    users: () => request<{ items: CollectionItem[] }>("/workspace/access/users"),
    approvalRules: () => request<{ items: CollectionItem[] }>("/workspace/access/approval-rules"),
    saveApprovalRule: (input: Record<string, unknown>) => request<MutationResult>("/workspace/access/approval-rules", { method: "POST", body: JSON.stringify(input) }),
    updateApprovalRule: (id: string, input: Record<string, unknown>) => request<MutationResult>(`/workspace/access/approval-rules/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    createUser: (input: Record<string, unknown>) => request<{ item: CollectionItem }>("/workspace/access/users", { method: "POST", body: JSON.stringify(input) }),
    updateUser: (id: string, input: Record<string, unknown>) => request<{ item: CollectionItem }>(`/workspace/access/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    deleteUser: (id: string) => request<{ ok: boolean }>(`/workspace/access/users/${id}`, { method: "DELETE" }),
    approvals: () => request<{ items: CollectionItem[] }>("/workspace/approvals"),
    decideApproval: (id: string, input: { decision: "approve" | "reject"; note?: string }) => request<{ item: CollectionItem }>(`/workspace/approvals/${id}`, { method: "POST", body: JSON.stringify(input) }),
    audit: () => request<{ items: CollectionItem[] }>("/workspace/audit"),
  },

  notifications: {
    detail: (id: string) => request<{ item: Notification; details: Record<string, unknown>; canDecide: boolean; canReply: boolean }>(`/notifications/${encodeURIComponent(id)}`),
    remove: (id: string) => request<{ success: boolean }>(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }),
    respond: (id: string, action: "approve" | "reject" | "comment", comment: string) => request<{ success: boolean }>(`/notifications/${encodeURIComponent(id)}/respond`, { method: "POST", body: JSON.stringify({ action, comment }) }),
    list: () => request<{ items: Notification[] }>("/notifications"),
    readAll: () =>
      request<{ success: true; count: number }>("/notifications/read-all", { method: "POST" }),
    markAsRead: (id: string) =>
      request<{ success: true; item: Notification }>(`/notifications/${id}/read`, { method: "POST" }),
  },
};

