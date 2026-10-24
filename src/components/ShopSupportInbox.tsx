import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import { useSession } from "../session-context";
import { useLanguage } from "../language-context";
import type { ShopSupportTicket } from "../shop-support-types";

type Inbox = {tickets:ShopSupportTicket[];total:number;open:number};
export default function ShopSupportInbox({companyId,openOrder}:{companyId:string;openOrder:(id:string)=>void}) {
  const {t}=useLanguage(),{user}=useSession();
  const [data,setData]=useState<Inbox>({tickets:[],total:0,open:0}),[status,setStatus]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1),[selected,setSelected]=useState(""),[reply,setReply]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const key=useRef({signature:"",id:""});
  const permits=(section:string,action:string)=>Boolean(user?.permissions.some(p=>["*",`${section}.*`,`${section}.${action}`].includes(p)));
  const canReply=permits("shops","edit")||permits("inventory","edit")&&permits("operations","edit");
  const base=`/workspace/storefronts/${encodeURIComponent(companyId)}/support`;
  async function load(){try{const result=await request<Inbox>(`${base}?${new URLSearchParams({status,search,page:String(page)})}`);setData(result);setError("");}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{let active=true;setLoading(true);const refresh=async()=>{try{const result=await request<Inbox>(`${base}?${new URLSearchParams({status,search,page:String(page)})}`);if(active){setData(result);setError("");}}catch(e){if(active)setError((e as Error).message);}finally{if(active)setLoading(false);}};void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh();},30000);return()=>{active=false;clearInterval(timer);};},[base,status,search,page]);
  const ticket=data.tickets.find(ticket=>ticket.id===selected)||data.tickets[0];
  useEffect(()=>setReply(""),[ticket?.id]);
  async function send(resolve:boolean){if(!ticket||busy||!reply.trim())return;setBusy(true);setError("");try{const body={version:ticket.version,message:reply.trim(),status:resolve?"resolved":"waiting"};const signature=JSON.stringify({ticket:ticket.id,...body});if(key.current.signature!==signature)key.current={signature,id:crypto.randomUUID()};await request(`${base}/${ticket.id}/reply`,{method:"POST",body:JSON.stringify({...body,requestId:key.current.id})});setReply("");await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="card shop-support-inbox"><div className="shop-section-title"><div><h2>{t("Shop customer service")}</h2><p>{t("Private customer conversations for this company's shop only. Replies appear in the customer's shop support page.")}</p></div><strong>{t("Needs reply")}: {data.open}</strong></div>
    <div className="workspace-toolbar"><input type="search" maxLength={160} aria-label={t("Search support requests")} placeholder={t("Search support requests")} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/><select aria-label={t("Support status")} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">{t("All statuses")}</option>{["open","waiting","resolved"].map(s=><option key={s} value={s}>{t(s)}</option>)}</select><button type="button" onClick={()=>void load()}>{t("Refresh")}</button></div>
    {error&&<p className="error" role="alert">{t(error)}</p>}{loading&&<p role="status">{t("Loading…")}</p>}
    <div className="shop-support-grid"><div className="shop-support-requests">{data.tickets.map(item=><button key={item.id} type="button" aria-pressed={ticket?.id===item.id} onClick={()=>{setSelected(item.id);setReply("");}}><strong>{item.subject}</strong><span>{item.customer} · {t(item.status)}</span><small>{new Date(item.updatedAt).toLocaleString()}</small></button>)}{!loading&&!data.total&&<p>{t("No shop support requests yet.")}</p>}</div>
    {ticket&&<article className="shop-support-thread"><h3>{ticket.subject}</h3><p>{ticket.customer} · {t(ticket.category)} · {t(ticket.status)}</p><p dir="auto">{ticket.email} {ticket.phone}</p><small>{ticket.id}</small>{ticket.orderId&&<p><button type="button" onClick={()=>openOrder(ticket.orderId)}>{t("View linked order")}</button></p>}
      <div className="shop-support-messages">{ticket.messages.map(message=><blockquote key={message.id} data-sender={message.from}><strong>{t(message.from==="store"?"Shop team":"Customer")}</strong><small>{new Date(message.at).toLocaleString()}</small><p dir="auto">{message.message}</p></blockquote>)}</div>
      {canReply&&<div className="shop-form"><label>{t("Reply to customer")}<textarea rows={4} maxLength={3000} value={reply} onChange={e=>setReply(e.target.value)}/></label><div className="inline-actions"><button type="button" className="primary" disabled={busy||!reply.trim()} onClick={()=>void send(false)}>{t("Send shop reply")}</button><button type="button" disabled={busy||!reply.trim()} onClick={()=>void send(true)}>{t("Reply & resolve")}</button></div></div>}
    </article>}</div><div className="workspace-pagination"><button type="button" disabled={page===1} onClick={()=>setPage(page-1)}>{t("Previous")}</button><span>{page} / {Math.max(1,Math.ceil(data.total/20))}</span><button type="button" disabled={page*20>=data.total} onClick={()=>setPage(page+1)}>{t("Next")}</button></div>
  </section>;
}
