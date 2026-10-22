import { useSession } from "../session-context";
import { useMobile } from "../use-mobile";
import MobilePeople from "./MobilePeople";
import WorkspaceDashboard from "./WorkspaceDashboard";
import { hasManagerDashboard } from "../manager-role";

export default function ResponsiveHome() {
  const mobile = useMobile();
  const { user } = useSession();
  const manager = hasManagerDashboard(user?.roleId);
  return mobile && !manager ? <MobilePeople /> : <WorkspaceDashboard />;
}
