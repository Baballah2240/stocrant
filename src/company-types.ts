import type { MobileIconName } from "./components/MobileIcon";

/** Business types a company can be created as. Each one opens with the tools that type of business needs first. */
export type CompanyType = "restaurant" | "hotel" | "shop" | "services" | "mixed";
export interface CompanyTool { label: string; description: string; icon: MobileIconName; path: (companyId: string) => string; section?: string }
export interface CompanyTypeProfile { type: CompanyType; label: string; tagline: string; icon: MobileIconName; tools: CompanyTool[] }

const q = (companyId: string) => `company=${encodeURIComponent(companyId)}`;
const finance: CompanyTool = { label: "Finance", description: "Cash, banks, sales, bills, VAT and financial statements.", icon: "finance", path: id => `/finance?${q(id)}`, section: "finance" };
const people: CompanyTool = { label: "Employees & payroll", description: "Staff, shifts, attendance, leave and salaries.", icon: "people", path: id => `/hr?${q(id)}`, section: "hr" };

export const companyTypes: CompanyTypeProfile[] = [
  { type: "restaurant", label: "Restaurant & café", tagline: "Menu, tables, kitchen stock, daily sales and staff shifts.", icon: "shop", tools: [
    { label: "Menu items", description: "Dishes and drinks with prices, costs and availability.", icon: "files", path: id => `/stores/menuItems/new?${q(id)}`, section: "operations" },
    { label: "Tables", description: "Dining tables, seats, areas and whether each is free.", icon: "home", path: id => `/stores/diningTables/new?${q(id)}`, section: "operations" },
    { label: "Kitchen stock", description: "Ingredients and supplies with reorder levels.", icon: "inventory", path: () => "/warehouse", section: "inventory" },
    { label: "Daily sales", description: "Record sales and see the day's income.", icon: "shop", path: id => `/stores/sales/new?${q(id)}`, section: "finance" },
    people, finance,
  ] },
  { type: "hotel", label: "Hotel & accommodation", tagline: "Rooms, bookings, guests, housekeeping and room revenue.", icon: "home", tools: [
    { label: "Rooms", description: "Room numbers, types, nightly rates and status.", icon: "home", path: id => `/stores/hotelRooms/new?${q(id)}`, section: "operations" },
    { label: "Bookings", description: "Guests, check-in and check-out dates, nights and amounts.", icon: "leave", path: id => `/stores/roomBookings/new?${q(id)}`, section: "operations" },
    { label: "Housekeeping tasks", description: "Assign cleaning and maintenance work to staff.", icon: "work", path: () => "/operations", section: "operations" },
    { label: "Room revenue", description: "Record booking payments as sales and follow balances due.", icon: "finance", path: id => `/finance?tab=Sales&${q(id)}`, section: "finance" },
    people, finance,
  ] },
  { type: "shop", label: "Shop & retail", tagline: "Products, stock, online shop orders, suppliers and sales.", icon: "inventory", tools: [
    { label: "Products & stock", description: "Items, prices, stock levels and reorder points.", icon: "inventory", path: () => "/warehouse", section: "inventory" },
    { label: "Shop orders", description: "Online and in-store orders, receiving and returns.", icon: "shop", path: id => `/shops?${q(id)}`, section: "inventory" },
    { label: "Suppliers & purchases", description: "Purchase orders and supplier bills.", icon: "work", path: id => `/finance?tab=Purchases&${q(id)}`, section: "finance" },
    { label: "Sales", description: "Sales, customer balances and payments.", icon: "finance", path: id => `/finance?tab=Sales&${q(id)}`, section: "finance" },
    people, finance,
  ] },
  { type: "services", label: "Services", tagline: "Service catalogue, appointments, customer requests and invoices.", icon: "support", tools: [
    { label: "Service catalogue", description: "Services you offer with duration and price.", icon: "files", path: id => `/stores/serviceCatalog/new?${q(id)}`, section: "operations" },
    { label: "Appointments & customers", description: "Bookings, questions and replies from customers.", icon: "leave", path: () => "/customer-service", section: "customerService" },
    { label: "Jobs & tasks", description: "Assign and follow work for each customer.", icon: "work", path: () => "/operations", section: "operations" },
    { label: "Invoices", description: "Bill customers and follow what is still owed.", icon: "finance", path: id => `/finance?tab=Sales&${q(id)}`, section: "finance" },
    people, finance,
  ] },
  { type: "mixed", label: "Mixed / other", tagline: "All tools are available; choose what you need from the menu.", icon: "more", tools: [people, finance, { label: "Operations", description: "Tasks, work items and daily operations.", icon: "work", path: () => "/operations", section: "operations" }, { label: "Inventory", description: "Stock and warehouses.", icon: "inventory", path: () => "/warehouse", section: "inventory" }] },
];
export const serviceCategories = ["clinic", "salon", "workshop", "office", "school", "transport", "construction", "other"];

/** Older companies used "store" and "office"; they map to Shop & retail and Services. */
export function companyTypeOf(value: unknown): CompanyTypeProfile {
  const type = value === "store" ? "shop" : value === "office" ? "services" : String(value || "mixed");
  return companyTypes.find(profile => profile.type === type) || companyTypes[companyTypes.length - 1];
}
