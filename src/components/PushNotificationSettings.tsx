import { useEffect, useState } from "react";
import { isNativeApp } from "../api";
import { enableMobilePush,disableMobilePush,pushEnabled } from "../mobile-push";
import { useLanguage } from "../language-context";
export default function PushNotificationSettings(){
 const {t}=useLanguage(),[enabled,setEnabled]=useState(pushEnabled),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{const failed=(event:Event)=>setError((event as CustomEvent<string>).detail);window.addEventListener("stocrant:push-error",failed);return()=>window.removeEventListener("stocrant:push-error",failed);},[]);
 if(!isNativeApp())return null;
 return <section className="notification-device-settings"><strong>{t("Mobile push notifications")}</strong><p>{t("Receive private alerts when the app is in the background. Open the app to read the full message.")}</p>{error&&<p role="alert">{t(error)}</p>}<button type="button" disabled={busy} aria-pressed={enabled} onClick={async()=>{setBusy(true);setError("");try{if(enabled)await disableMobilePush();else await enableMobilePush();setEnabled(pushEnabled());}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>{t(enabled?"Disable push notifications":"Enable push notifications")}</button></section>;
}
