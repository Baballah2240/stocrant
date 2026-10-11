import { useMobile } from "../use-mobile";
import MobilePeople from "./MobilePeople";
import WorkspaceDashboard from "./WorkspaceDashboard";

export default function ResponsiveHome() {
  return useMobile() ? <MobilePeople /> : <WorkspaceDashboard />;
}
