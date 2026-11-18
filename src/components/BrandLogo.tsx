import dark from "../assets/branding/stocrant-logo-dark.svg";
import light from "../assets/branding/stocrant-logo-light.svg";
import icon from "../assets/branding/stocrant-icon.svg";
import "../brand-logo.css";

export default function BrandLogo({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return <span className={`stocrant-logo ${compact ? "is-compact" : ""} ${className}`} role="img" aria-label="Stocrant">
    <img className="stocrant-logo-light" src={light} alt="" aria-hidden="true" width="180" height="36"/>
    <img className="stocrant-logo-dark" src={dark} alt="" aria-hidden="true" width="180" height="36"/>
    <img className="stocrant-logo-icon" src={icon} alt="" aria-hidden="true" width="36" height="36"/>
  </span>;
}
