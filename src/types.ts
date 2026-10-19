/** Frontend types matching the Express API payload shapes (server/types.ts). */

export type StoreKind = "store" | "restaurant" | "office" | "warehouse";
export type ZoneKind = "floor" | "dining" | "counter" | "back" | "restroom" | "outdoor" | "storage";
export type PersonStatus = "active" | "leave" | "terminated";
export type StoreStatus = "open" | "open-limited" | "closed";

export interface Store {
  id: string;
  companyId: string;
  name: string;
  kind: StoreKind;
  address: string;
  city: string;
  totalArea: number;
  floorCount: number;
  status: StoreStatus;
  mapLink?: string;
  responsibleEmployee?: string;
  responsibleEmployeeId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  occupancy?: Occupancy;
}

export interface Zone {
  id: string;
  storeId: string;
  name: string;
  kind: ZoneKind;
  area: number;
  capacity: number;
  notes?: string;
}

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

export interface ZoneOccupancy {
  zoneId: string;
  zoneName: string;
  capacity: number;
  assigned: number;
  pct: number;
  over: boolean;
}

export interface Occupancy {
  storeId: string;
  storeName: string;
  headCount: number;
  capacity: number;
  remaining: number;
  occupancyPct: number;
  overCapacity: boolean;
  zoneUtilization: ZoneOccupancy[];
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

export const STORE_KINDS: StoreKind[] = ["store", "restaurant", "office", "warehouse"];
export const ZONE_KINDS: ZoneKind[] = ["floor", "dining", "counter", "back", "restroom", "outdoor", "storage"];
export const PERSON_STATUSES: PersonStatus[] = ["active", "leave", "terminated"];
export const STORE_STATUSES: StoreStatus[] = ["open", "open-limited", "closed"];

/** Entity registry types mirrored from server/registry.ts (via /api/collections/meta). */
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
  columns: string[];
  permission: string;
}

export interface ModuleInfo {
  label: string;
}

export interface AuthUser {
  accountStatus?: string;
  position?: string;
  description?: string;
  bio?: string;
  phone?: string;
  avatar?: string;
  id: string;
  email: string;
  username?: string;
  name: string;
  roleId: string;
  employeeId?: string;
  organizationIds: string[];
  tenantOrganizationIds?: string[];
  locationIds: string[];
  ownRecordsOnly: boolean;
  permissions: string[];
}

export type CollectionItem = Record<string, unknown> & {
  id: string;
};

export interface MutationResult {
  pending: boolean;
  item?: CollectionItem;
  request?: CollectionItem;
}

/** Action-required notifications surfaced to the authenticated user in the UI. */
export type NotificationType =
  | "hr_message"
  | "document_expiry"
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
  title?: string; senderName?: string; hrType?: string; priority?: string;
  url?: string; effectiveAt?: string; shiftTime?: string; location?: string;
  acknowledgmentRequired?: boolean; acknowledgedAt?: string; readAt?: string; deliveredAt?: string; remindedAt?: string; campaignId?: string;
  response?: string;
  senderId?: string;
  decision?: "approved" | "rejected";
  id: string;
  userId: string | null;
  user: string;
  type: NotificationType;
  severity: NotificationSeverity;
  message: string;
  target: string | null;
  createdAt: string;
  read: boolean;
}


