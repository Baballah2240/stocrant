import { useEffect, useState } from "react";
import { isNativeApp } from "./api";

export function useMobile() {
  const [mobile, setMobile] = useState(() => isNativeApp() || window.matchMedia("(max-width: 700px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(isNativeApp() || media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}
