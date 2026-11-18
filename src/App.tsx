import BrandLogo from "./components/BrandLogo";
const CompanyReport = lazy(() => import("./components/CompanyReport"));
const PayrollWorkspace = lazy(() => import("./components/PayrollWorkspace"));
const CompanyProfile = lazy(() => import("./components/CompanyProfile"));
const NotificationHistory = lazy(() => import("./components/NotificationHistory"));
const AppUpdates = lazy(() => import("./components/AppUpdates"));
const HRCommunication = lazy(() => import("./components/HRCommunication"));
const EmployeeInbox = lazy(() => import("./components/EmployeeInbox"));
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { lazy } from "react";
import { PageError } from "./components/ErrorBoundary";
import LandingPage from "./components/LandingPage";
import Layout from "./components/Layout";
const StoreList = lazy(() => import("./components/StoreList"));
const ZoneList = lazy(() => import("./components/ZoneList"));
const PersonList = lazy(() => import("./components/PersonList"));
const Calculator = lazy(() => import("./components/Calculator"));
const ReportView = lazy(() => import("./components/ReportView"));
const EntityList = lazy(() => import("./components/EntityList"));
const EntityDetail = lazy(() => import("./components/EntityDetail"));
const EntityForm = lazy(() => import("./components/EntityForm"));
const AboutPage = lazy(() => import("./components/AboutPage"));
import AuthPage from "./components/AuthPage";
import RegistrationStatus from "./components/RegistrationStatus";
import LockSettings from "./components/LockSettings";
const ResponsiveHome = lazy(() => import("./components/ResponsiveHome"));
const MobilePeople = lazy(() => import("./components/MobilePeople"));
const MobileMore = lazy(() => import("./components/MobileMore"));
const LocationsWorkspace = lazy(() => import("./components/LocationsWorkspace"));
const OperationsWorkspace = lazy(() => import("./components/OperationsWorkspace"));
const InventoryWorkspace = lazy(() => import("./components/InventoryWorkspace"));
const ShopWorkspace = lazy(() => import("./components/ShopWorkspace"));
const FinanceWorkspace = lazy(() => import("./components/FinanceWorkspace"));
const AccessWorkspace = lazy(() => import("./components/AccessWorkspace"));
const HRWorkspace = lazy(() => import("./components/HRWorkspace"));
const ContractsWorkspace = lazy(() => import("./components/ContractsWorkspace"));
const AttendanceWorkspace = lazy(() => import("./components/AttendanceWorkspace"));
const DocumentsWorkspace = lazy(() => import("./components/DocumentsWorkspace"));
const DocumentForm = lazy(() => import("./components/DocumentsWorkspace").then(module => ({ default: module.DocumentForm })));
const DocumentDetail = lazy(() => import("./components/DocumentsWorkspace").then(module => ({ default: module.DocumentDetail })));
const DocumentRequestReview = lazy(() => import("./components/DocumentsWorkspace").then(module => ({ default: module.DocumentRequestReview })));
const CustomerServiceWorkspace = lazy(() => import("./components/CustomerServiceWorkspace"));
const OrganizationWorkspace = lazy(() => import("./components/OrganizationWorkspace"));
import { useSession } from "./session-context";
import ForcedPasswordChange from "./components/ForcedPasswordChange";
import { useLanguage } from "./language-context";
import { MetaProvider } from "./meta-context";
import { isNativeApp } from "./api";

const router = createBrowserRouter([
  { path: "/welcome", element: <Navigate to={isNativeApp() ? "/" : "/workspace"} replace /> },
  {
    path: "/login",
    element: <Navigate to="/workspace" replace />,
  },
  {
    path: "/register",
    element: <Navigate to={isNativeApp() ? "/" : "/workspace"} replace />,
  },
  { path: "/", element: <Navigate to="/workspace" replace /> },
  { path: "/aer", element: isNativeApp() ? <Navigate to="/workspace" replace /> : <LandingPage /> },
  {
    element: <Layout />,
    errorElement: <PageError />,
    children: [
      { path: "workspace", element: <ResponsiveHome /> },
      { path: "notifications", element: <NotificationHistory /> },
      { path: "app-update", element: <main className="page"><AppUpdates /></main> },

      // ── Company locations ──
      { path: "me/attendance", element: <MobilePeople /> },
      { path: "me/leave", element: <MobilePeople /> },
      { path: "me/files", element: <MobilePeople /> },
      { path: "mobile-more", element: <MobileMore /> },
      { path: "security", element: <div className="page"><LockSettings /></div> },
      { path: "locations", element: <LocationsWorkspace /> },
      { path: "stores", element: <StoreList /> }, // Legacy URL retained for bookmarks.
      { path: "places", element: <ZoneList /> },
      { path: "people", element: <PersonList /> },
      { path: "calculator", element: <Calculator /> },
      { path: "report", element: <ReportView /> },

      // ── Module overviews ──
      { path: "organizations", element: <OrganizationWorkspace /> },
      { path: "company-report", element: <CompanyReport /> },
      { path: "organization/companies/:id", element: <CompanyProfile /> },
      { path: "organization/companies/:id/edit", element: <CompanyProfile /> },
      { path: "hr/payroll", element: <PayrollWorkspace /> },
      { path: "me/payroll", element: <PayrollWorkspace /> },
      { path: "hr/payroll/:id", element: <PayrollWorkspace /> },
      { path: "hr", element: <HRWorkspace /> },
      { path: "hr/attendance", element: <AttendanceWorkspace /> },
      { path: "hr/communication", element: <HRCommunication /> },
      { path: "employee-inbox", element: <EmployeeInbox /> },
      { path: "hr/documents", element: <DocumentsWorkspace /> },
      { path: "hr/contracts", element: <ContractsWorkspace /> },
      { path: "hr/documents/new", element: <DocumentForm /> },
      { path: "hr/documents/requests/:id", element: <DocumentRequestReview /> },
      { path: "hr/documents/:id", element: <DocumentDetail /> },
      { path: "hr/documents/:id/edit", element: <DocumentForm /> },
      { path: "operations", element: <OperationsWorkspace /> },
      { path: "operations/work/:id", element: <OperationsWorkspace /> },
      { path: "store", element: <OperationsWorkspace /> }, // Legacy URL retained for bookmarks.
      { path: "warehouse", element: <InventoryWorkspace /> },
      { path: "inventory", element: <InventoryWorkspace /> },
      { path: "shops", element: <ShopWorkspace /> },
      { path: "admin", element: <AccessWorkspace /> },
      { path: "access", element: <AccessWorkspace /> },
      { path: "finance", element: <FinanceWorkspace /> },
      { path: "customer-service", element: <CustomerServiceWorkspace /> },
      { path: "about", element: <AboutPage /> },

      // ── Registry-driven entity CRUD (HR / Stores / Warehouse) ──
      { path: ":module/:collection", element: <EntityList /> },
      { path: ":module/:collection/new", element: <EntityForm /> },
      { path: ":module/:collection/:id", element: <EntityDetail /> },
      { path: ":module/:collection/:id/edit", element: <EntityForm /> },
    ],
  },
]);

export default function App() {
  const { user, loading } = useSession();
  const { t } = useLanguage();

  if (loading) return <main className="stocrant-splash"><BrandLogo/><p role="status">{t("Loading secure workspace…")}</p></main>;
  if (!user) {
    const publicLanding = !isNativeApp() && ["/", "/aer"].includes(window.location.pathname);
    return publicLanding ? <LandingPage /> : <AuthPage />;
  }
  if (user.mustChangePassword) return <ForcedPasswordChange />;
  if (user.accountStatus && user.accountStatus !== "active") return <RegistrationStatus />;
  if (user.roleId !== "role-main-manager" && !(user.roleId === "role-organization-admin" && user.tenantOrganizationIds?.length === 1) && user.organizationIds.length !== 1) return <RegistrationStatus />;
  return <MetaProvider><RouterProvider router={router} /></MetaProvider>;
}
