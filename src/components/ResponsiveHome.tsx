import { useSession } from "../session-context";
import { useMobile } from "../use-mobile";
import MobilePeople from "./MobilePeople";
import WorkspaceDashboard from "./WorkspaceDashboard";

export default function ResponsiveHome() {
  const mobile = useMobile();
  const { user } = useSession();
  return mobile && user?.roleId !== "role-main-manager" ? <MobilePeople /> : <WorkspaceDashboard />;
}
