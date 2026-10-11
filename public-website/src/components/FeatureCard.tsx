import { useId, useState } from "react";
import MobileIcon, { type MobileIconName } from "./MobileIcon";

const details: Record<MobileIconName, string[]> = {
  moon: [], sun: [],
  companies: ["Company profiles", "Locations and activity", "Company-specific records"],
  people: ["Employee profiles and positions", "Daily check-in and check-out", "Leave requests for admin review"],
  work: ["Assigned tasks and deadlines", "Progress and activity updates", "Views for your permitted work"],
  inventory: ["Company and item types", "Selected employee access", "Search, history and printing"],
  finance: ["Company and employee movements", "Account balances and filters", "Printable transaction reports"],
  settings: ["Main-admin user management", "Role and account permissions", "Recorded changes in the audit"],
  home: [], attendance: [], leave: [], more: [], files: [], locations: [], profile: [], refresh: [], chevron: [], info: [], logout: [],
};
export default function FeatureCard({ feature }: { feature: { icon: MobileIconName; name: string; text: string } }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  const id = useId();
  return <article className={`public-feature-card ${open ? "feature-open" : ""}`} onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={() => setHovered(false)} onKeyDown={event => { if (event.key === "Escape") { setPinned(false); setHovered(false); } }}>
    <span className="mobile-service-icon"><MobileIcon name={feature.icon} /></span>
    <h3>{feature.name}</h3><p>{feature.text}</p>
    <button className="public-feature-expand" aria-expanded={open} aria-controls={id} onClick={() => { setPinned(!open); setHovered(false); }}><span>{open ? "Hide details" : "Explore features"}</span><span className="feature-expand-symbol" aria-hidden="true">{open ? "−" : "+"}</span></button>
    <div id={id} className="public-feature-detail" aria-hidden={!open}><ul>{details[feature.icon].map(text => <li key={text}><span aria-hidden="true">✓</span>{text}</li>)}</ul></div>
  </article>;
}
