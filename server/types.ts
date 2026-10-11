/** A physical place a person can be assigned to. */
export interface Store {
  id: string;
  /** The company that owns or operates this location. */
  companyId: string;
  name: string;
  kind: "store" | "restaurant" | "office" | "warehouse";
  address: string;
  city: string;
  totalArea: number; // sq m
  floorCount: number;
  status: "open" | "open-limited" | "closed";
  mapLink?: string;
  responsibleEmployee?: string;
  responsibleEmployeeId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  occupancy?: Occupancy;
}

/** One named area inside a store, each with a seat/standee capacity. */
export interface Zone {
  id: string;
  storeId: string;
  name: string;
  kind: "floor" | "dining" | "counter" | "back" | "restroom" | "outdoor" | "storage";
  area: number; // sq m
  capacity: number;
  notes?: string;
}

/** An HR person assigned to a store (and optionally a zone). */
export type PersonStatus = "active" | "leave" | "terminated";
export interface Person {
  id: string;
  name: string;
  role: string;
  storeId: string;
  zoneId?: string;
  status: PersonStatus;
  hireDate: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
}

export interface Occupancy {
  storeId: string;
  storeName: string;
  headCount: number; // people assigned to this store
  capacity: number; // sum of zone capacities
  remaining: number;
  occupancyPct: number;
  overCapacity: boolean;
  zoneUtilization: ZoneOccupancy[];
}

export interface ZoneOccupancy {
  zoneId: string;
  zoneName: string;
  capacity: number;
  assigned: number;
  pct: number;
  over: boolean;
}

export interface StoreSummary {
  storeId: string;
  storeName: string;
  floorCount: number;
  totalArea: number;
  headCount: number;
  capacity: number;
  occupancyPct: number;
  remaining: number;
  overCapacity: boolean;
}

export const STORE_KINDS = ["store", "restaurant", "office", "warehouse"] as const;
export const ZONE_KINDS = ["floor", "dining", "counter", "back", "restroom", "outdoor", "storage"] as const;
export const PERSON_STATUSES = ["active", "leave", "terminated"] as const;
export type StoreStatus = "open" | "open-limited" | "closed";

export const STORE_STATUSES: StoreStatus[] = ["open", "open-limited", "closed"];

/** Action-required notification emitted by the backend. */
export type NotificationType =
  | "registration_request"
  | "message"
  | "overdue_work"
  | "low_stock"
  | "pending_approval"
  | "unauthorized_access"
  | "password_reset"
  | "leave_request";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface Notification {
  response?: string;
  senderId?: string;
  decision?: "approved" | "rejected";
  id: string;
  /** Owner of the alert; null for system-level/unattributed events. */
  userId: string | null;
  user: string;
  type: NotificationType;
  severity: NotificationSeverity;
  message: string;
  target: string | null;
  createdAt: string;
  read: boolean;
}

