import { PushNotifications } from "@capacitor/push-notifications";
import { request } from "./api";
import { hasNativePushSetup, isAndroidDevice } from "./device-actions";
const deviceKey="stocrant.pushDeviceId", enabledKey="stocrant.pushEnabled";
export function pushEnabled(){return localStorage.getItem(enabledKey)==="true";}
function deviceId(){let value=localStorage.getItem(deviceKey);if(!value){value=crypto.randomUUID();localStorage.setItem(deviceKey,value);}return value;}
export async function disableMobilePush(){
  localStorage.removeItem(enabledKey);
  const id=localStorage.getItem(deviceKey);
  if(id)await request(`/workspace/mobile-push/devices/${encodeURIComponent(id)}`,{method:"DELETE"}).catch(()=>{});
  if(isAndroidDevice())await PushNotifications.unregister().catch(()=>{});
}
export async function enableMobilePush(){
  if(!isAndroidDevice())throw Error("Push notifications are currently prepared for Android. iOS requires APNs setup.");
  if(!await hasNativePushSetup())throw Error("This Android build needs Firebase configuration before push can be enabled.");
  const status=await request<{android:boolean}>("/workspace/mobile-push/status");
  if(!status.android)throw Error("Mobile push is not configured on this server yet.");
  const permission=await PushNotifications.requestPermissions();
  if(permission.receive!=="granted")throw Error("Allow notifications in the device settings to receive alerts.");
  localStorage.setItem(enabledKey,"true");
  await PushNotifications.createChannel({id:"stocrant_updates",name:"Stocrant updates",description:"New messages and business updates",importance:4,visibility:0});
  await PushNotifications.register();
}
export async function listenMobilePush(onOpen:(id:string)=>void,onError:(message:string)=>void){
  if(!isAndroidDevice())return()=>{};
  const listeners=await Promise.all([
    PushNotifications.addListener("registration",token=>{if(pushEnabled())void request("/workspace/mobile-push/devices",{method:"POST",body:JSON.stringify({deviceId:deviceId(),token:token.value,platform:"android"})}).catch(()=>onError("Could not register this device for push notifications."));}),
    PushNotifications.addListener("registrationError",()=>onError("Could not register this device for push notifications.")),
    PushNotifications.addListener("pushNotificationReceived",()=>window.dispatchEvent(new Event("stocrant:notifications-changed"))),
    PushNotifications.addListener("pushNotificationActionPerformed",event=>{const id=event.notification.data?.notificationId;if(typeof id==="string"&&/^ntf_[a-z0-9_]+$/i.test(id))onOpen(id);}),
  ]);
  if(pushEnabled())await enableMobilePush().catch(()=>{});
  return()=>{for(const listener of listeners)void listener.remove();};
}
