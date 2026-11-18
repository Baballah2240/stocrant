import { Navigate } from "react-router-dom";
import { useSession } from "../session-context";
import { useMobile } from "../use-mobile";
import MobilePeople from "./MobilePeople";
import WorkspaceDashboard from "./WorkspaceDashboard";
import { hasManagerDashboard } from "../manager-role";

export default function ResponsiveHome() {
  const mobile = useMobile();
  const { user } = useSession();
  const manager = hasManagerDashboard(user?.roleId);
  if (user?.roleId === "role-shop-manager") return <Navigate to="/shops" replace />;
  return mobile && !manager ? <MobilePeople /> : <WorkspaceDashboard />;
}
