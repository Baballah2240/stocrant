import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout";
import StoreList from "./components/StoreList";
import ZoneList from "./components/ZoneList";
import PersonList from "./components/PersonList";
import Calculator from "./components/Calculator";
import ReportView from "./components/ReportView";
import EntityList from "./components/EntityList";
import EntityDetail from "./components/EntityDetail";
import EntityForm from "./components/EntityForm";
import ModuleOverview from "./components/ModuleOverview";
import AboutPage from "./components/AboutPage";
import AuthPage from "./components/AuthPage";
import RegistrationStatus from "./components/RegistrationStatus";
import ResponsiveHome from "./components/ResponsiveHome";
import MobilePeople from "./components/MobilePeople";
import MobileMore from "./components/MobileMore";
import LocationsWorkspace from "./components/LocationsWorkspace";
import OperationsWorkspace from "./components/OperationsWorkspace";
import InventoryWorkspace from "./components/InventoryWorkspace";
import FinanceWorkspace from "./components/FinanceWorkspace";
import AccessWorkspace from "./components/AccessWorkspace";
import HRWorkspace from "./components/HRWorkspace";
import { useSession } from "./session-context";
import { MetaProvider } from "./meta-context";

const router = createBrowserRouter([
  { path: "/welcome", element: <Navigate to="/" replace /> },
  {
    path: "/login",
    element: <Navigate to="/" replace />,
  },
  {
    path: "/register",
    element: <Navigate to="/" replace />,
  },
  {
    element: <Layout />,
    children: [
      { index: true, element: <ResponsiveHome /> },

      // ── Company locations ──
      { path: "me/attendance", element: <MobilePeople /> },
      { path: "me/leave", element: <MobilePeople /> },
      { path: "me/files", element: <MobilePeople /> },
      { path: "mobile-more", element: <MobileMore /> },
      { path: "locations", element: <LocationsWorkspace /> },
      { path: "stores", element: <StoreList /> }, // Legacy URL retained for bookmarks.
      { path: "places", element: <ZoneList /> },
      { path: "people", element: <PersonList /> },
      { path: "calculator", element: <Calculator /> },
      { path: "report", element: <ReportView /> },

      // ── Module overviews ──
      { path: "organizations", element: <ModuleOverview module="organization" /> },
      { path: "hr", element: <HRWorkspace /> },
      { path: "operations", element: <OperationsWorkspace /> },
      { path: "store", element: <OperationsWorkspace /> }, // Legacy URL retained for bookmarks.
      { path: "warehouse", element: <InventoryWorkspace /> },
      { path: "inventory", element: <InventoryWorkspace /> },
      { path: "admin", element: <AccessWorkspace /> },
      { path: "access", element: <AccessWorkspace /> },
      { path: "finance", element: <FinanceWorkspace /> },
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
  if (loading) return <main className="auth-page"><p className="hint">Loading secure workspace…</p></main>;
  if (!user) return <AuthPage />;
  if (user.accountStatus && user.accountStatus !== "active") return <RegistrationStatus />;
  return <MetaProvider><RouterProvider router={router} /></MetaProvider>;
}
