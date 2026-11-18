import { Router } from "express";
import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { accountScopeActive, authenticatedSessionId } from "./auth.js";
import { getCollection, getStore, saveStore, transaction } from "./storage.js";
import type { Notification } from "./types.js";
type Row = Record<string, any>;
const rows = (name: string) => getCollection(name) as Row[];
export const pushConfigured = () => Boolean(process.env.STOCRANT_FCM_SERVICE_ACCOUNT_FILE);
export const mobilePushRouter = Router();
mobilePushRouter.get("/status", (_req, res) => res.json({ android: pushConfigured(), ios: false }));
const deviceInput = z.object({ deviceId: z.string().uuid(), token: z.string().min(20).max(4096), platform: z.literal("android") }).strict();
mobilePushRouter.post("/devices", (req, res) => {
  const input = deviceInput.safeParse(req.body), sessionId = authenticatedSessionId(req);
  if (!input.success || !sessionId) return res.status(400).json({ error: "Enter valid push device details." });
  if (!pushConfigured()) return res.status(503).json({ error: "Mobile push is not configured on this server yet." });
  transaction(() => {
    const kept = rows("pushDevices").filter(row => row.deviceId !== input.data.deviceId && row.token !== input.data.token);
    const own = kept.filter(row => row.userId === req.auth!.id).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const keepIds = new Set(own.slice(0,9).map(row => row.id));
    getStore().collections.pushDevices = [...kept.filter(row => row.userId !== req.auth!.id || keepIds.has(row.id)), { ...input.data, id: randomUUID(), userId: req.auth!.id, sessionId, updatedAt: new Date().toISOString() }]; saveStore(getStore());
  });
  return res.json({ registered: true });
});
mobilePushRouter.delete("/devices/:id", (req, res) => { transaction(() => { getStore().collections.pushDevices = rows("pushDevices").filter(row => !(row.deviceId === req.params.id && row.userId === req.auth!.id)); saveStore(getStore()); }); res.json({ removed: true }); });

/** Durable outbox. It contains IDs only; no sensitive message text. */
export function queueMobilePush(notification: Notification) {
  if (!pushConfigured() || !notification.userId) return;
  const jobs = rows("pushOutbox");
  for (const device of rows("pushDevices").filter(row => row.userId === notification.userId)) {
    if (!jobs.some(job => job.notificationId === notification.id && job.deviceId === device.id)) jobs.push({ id: randomUUID(), notificationId: notification.id, deviceId: device.id, userId: notification.userId, attempts: 0, status: "pending", nextAt: Date.now(), expiresAt: Date.now()+86400000 });
  }
  saveStore(getStore());
}
let access: { value: string; expiresAt: number } | undefined;
async function sendToFCM(device: Row, notification: Row) {
  const service = JSON.parse(readFileSync(process.env.STOCRANT_FCM_SERVICE_ACCOUNT_FILE!, "utf8"));
  if (!/^[a-z0-9-]+$/.test(service.project_id) || !service.client_email || !service.private_key) throw Error("Invalid push service configuration.");
  if (!access || access.expiresAt < Date.now()+60000) {
    const now = Math.floor(Date.now()/1000), encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const jwt = `${encode({alg:"RS256",typ:"JWT"})}.${encode({iss:service.client_email,scope:"https://www.googleapis.com/auth/firebase.messaging",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})}`;
    const assertion = jwt+"."+createSign("RSA-SHA256").update(jwt).sign(service.private_key,"base64url");
    const response = await fetch("https://oauth2.googleapis.com/token", { method:"POST", body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}), signal:AbortSignal.timeout(10000) });
    if (!response.ok) throw Error("Push authorization failed.");
    const token = await response.json() as {access_token:string;expires_in:number}; if(!token.access_token)throw Error("Push authorization failed.");
    access = {value:token.access_token,expiresAt:Date.now()+Math.min(token.expires_in||3600,3600)*1000};
  }
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${service.project_id}/messages:send`, { method:"POST", headers:{Authorization:`Bearer ${access.value}`,"Content-Type":"application/json"}, body:JSON.stringify({message:{token:device.token,notification:{title:"Stocrant",body:"You have a new Stocrant notification. Open the app to view it."},data:{notificationId:notification.id},android:{priority:"high",notification:{channel_id:"stocrant_updates",icon:"ic_stat_stocrant",tag:notification.id},ttl:"86400s"}}}), signal:AbortSignal.timeout(10000) });
  if (response.ok) return;
  const body = await response.json().catch(()=>({})) as {error?:{details?:{errorCode?:string}[]}};
  if(body.error?.details?.some(detail=>detail.errorCode==="UNREGISTERED"))throw Object.assign(Error("Device token expired."),{unregistered:true});
  throw Error("Push delivery failed.");
}
let running=false;
export async function dispatchMobilePush(deliver=sendToFCM) {
  if(running||!pushConfigured())return;running=true;
  try {
    for(const job of rows("pushOutbox").filter(row=>row.status==="pending"&&row.nextAt<=Date.now()).slice(0,25)) {
      const device=rows("pushDevices").find(row=>row.id===job.deviceId&&row.userId===job.userId);
      const account=rows("accessUsers").find(row=>row.id===job.userId&&row.status==="active");
      const notification=rows("notifications").find(row=>row.id===job.notificationId&&row.userId===job.userId&&!row.read);
      const session=device&&rows("sessions").find(row=>row.id===device.sessionId&&row.accountId===job.userId&&Date.parse(row.expiresAt)>Date.now());
      if(!device||!account||!notification||!session||!accountScopeActive(account)||job.expiresAt<Date.now()){job.status="skipped";saveStore(getStore());continue;}
      try {await deliver(device,notification);job.status="sent";job.sentAt=new Date().toISOString();}
      catch(error){job.attempts++;if((error as {unregistered?:boolean}).unregistered){job.status="failed";getStore().collections.pushDevices=rows("pushDevices").filter(row=>row.id!==device.id);}else if(job.attempts>=4)job.status="failed";else job.nextAt=Date.now()+Math.pow(2,job.attempts)*30000;}
      saveStore(getStore());
    }
    const history=rows("pushOutbox");if(history.length>2000){getStore().collections.pushOutbox=[...history.filter(row=>row.status==="pending"),...history.filter(row=>row.status!=="pending").slice(-1000)];saveStore(getStore());}
  } finally {running=false;}
}
