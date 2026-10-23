import { TEST_DATA_DIR } from "./test-env.js";
import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { Server } from "node:http";
import { createApp } from "./app.js";
import { getCollection, getStore, saveStore, resetTestCache } from "./storage.js";
import { defaultMerchandising, type Merchandising, offeredPrice } from "./storefront-merchandising.js";
type Row = Record<string, any>;
let server: Server, base: string, admin = "", guest = "", company: Row, foreign: Row, tea: Row, bag: Row, settings: Row, keys: string[];
const secret = () => randomBytes(24).toString("hex");
const rows = (name: string) => getCollection(name) as Row[];
async function req(path: string, method = "GET", body?: unknown, cookie = admin) { return fetch(base + "/api" + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : {body: JSON.stringify(body)}) }); }
async function json(response: Response, status = 200): Promise<Row> { assert.equal(response.status,status,await response.clone().text()); return response.json() as Promise<Row>; }
const config = () => `/workspace/storefronts/${company.id}`;
const payload = () => Object.fromEntries(keys.map(key => [key, settings[key]]));
async function configure(m: Merchandising) { settings = (await json(await req(config(), "PUT", {...payload(),merchandising:m}))).settings; }
async function catalog() { return json(await req("/storefront/merch-shop/catalog","GET",undefined,guest)); }
async function quote() { return json(await req("/storefront/merch-shop/quote","POST",{lines:[{productId:tea.id,quantity:2}],method:"delivery"},guest)); }
const offer = (id: string, percent: number, extra: Row = {}) => ({id,title:id,description:"Real offer",target:"all" as const,category:"",productIds:[],percent,enabled:true,visible:true,startsAt:null,endsAt:null,...extra});
const checkout = (q: Row) => ({requestId:randomUUID(),receiptSecret:randomBytes(32).toString("hex"),customer:"Offer customer",email:"buyer@offers.test",phone:"+249912345678",address:"Full delivery address",region:"City",notes:"",consent:true,website:"",quoteToken:q.quoteToken,method:"delivery",lines:[{productId:tea.id,quantity:2}]});
before(async()=>{
  server=createApp().listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const setup=await req("/auth/setup","POST",{name:"Merch owner",email:"owner@merch.test",password:secret(),setupKey:"local-setup"},"");await json(setup,201);admin=setup.headers.get("set-cookie")!.split(";")[0];
  const org=(await json(await req("/collections/organizations","POST",{name:"Merch organization",status:"active"}),201)).item;
  for(const name of ["Merch company","Foreign company"]){const c=(await json(await req("/collections/companies","POST",{name,parentOrganizationId:org.id,status:"active",organizationType:"store",industry:"retail",currency:"SDG"}),201)).item;if(!company)company=c;else foreign=c;}
  [tea,bag]=(await json(await req(`/workspace/shops/${company.id}/products`,"POST",{products:[{sku:"TEA",name:"Tea",price:"10",category:"Tea"},{sku:"BAG",name:"Bag",price:"20",category:"Home"}]}),201)).products;
  for(const p of [tea,bag])await json(await req(`/workspace/shops/${company.id}/receipts`,"POST",{requestId:randomUUID(),productId:p.id,quantity:20,supplier:"Supplier",reference:p.sku}),201);
  settings=(await json(await req(config()))).settings;keys=Object.keys(settings);
  settings=(await json(await req(config(),"PUT",{...settings,slug:"merch-shop",name:"Merch shop",address:"Collection address",contactEmail:"shop@merch.test",deliveryEnabled:true,deliveryRegions:"City",deliveryFee:"3",shippingPolicy:"Delivery",returnsPolicy:"Contact staff",privacyPolicy:"Order use",terms:"Pay on delivery",manualPaymentsAccepted:true,published:true}))).settings;
  const response=await req("/storefront/merch-shop/catalog","GET",undefined,"");await json(response);guest=response.headers.get("set-cookie")!.split(";")[0];
});
after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));const target=resolve(TEST_DATA_DIR);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes("stocrant-test-data-"));rmSync(target,{recursive:true,force:true});});
describe("Workspace-controlled shop merchandising",()=>{
  it("persists ordered sections and category visibility and preserves settings for older clients",async()=>{
    const m=structuredClone(defaultMerchandising);m.categories=[{id:"home",name:"Home",title:"For your home",description:"",visible:false},{id:"tea",name:"Tea",title:"Tea rituals",description:"Pantry",visible:true}];m.sections=[{id:"picks",title:"Our picks",description:"",source:"products",category:"",productIds:[tea.id],visible:true,limit:4,layout:"row"},{id:"draft",title:"Private draft",description:"",source:"all",category:"",productIds:[],visible:false,limit:4,layout:"grid"}];m.display.showHero=false;m.display.layout="list";
    await configure(m);resetTestCache();assert.deepEqual((await json(await req(config()))).settings.merchandising,m);
    const c=await catalog();assert.deepEqual(c.products.map((p:Row)=>p.id),[tea.id]);assert.deepEqual(c.shop.merchandising.sections.map((s:Row)=>s.id),["picks"]);assert.deepEqual(c.shop.merchandising.categories.map((s:Row)=>s.title),["Tea rituals"]);
    await json(await req("/storefront/merch-shop/quote","POST",{lines:[{productId:bag.id,quantity:1}],method:"delivery"},guest),409);
    const legacy={...payload()};delete legacy.merchandising;settings=(await json(await req(config(),"PUT",legacy))).settings;assert.deepEqual(settings.merchandising,m);
  });
  it("validates schedules, references, tenant boundaries and concurrent edits",async()=>{
    const m=structuredClone(defaultMerchandising);
    for(const invalid of [{...m,offers:[offer("bad",91)]},{...m,offers:[offer("dates",10,{startsAt:"2030-01-02T00:00:00Z",endsAt:"2030-01-01T00:00:00Z"})]},{...m,offers:[offer("same",10),offer("same",20)]},{...m,sections:[{id:"bad",title:"Bad",description:"",source:"products",productIds:["missing"],category:"",visible:true,limit:4,layout:"grid"}]}])await json(await req(config(),"PUT",{...payload(),merchandising:invalid}),400);
    await json(await req(config(),"PUT",{...payload(),version:0,merchandising:m}),409);
    const password=secret(), account=(await json(await req("/workspace/access/users","POST",{name:"Other shop admin",email:"other@merch.test",password,roleId:"role-shop-manager",organizationIds:[foreign.id]}),201)).item;
    rows("accessUsers").find(a=>a.id===account.id)!.mustChangePassword=false;saveStore(getStore());const login=await req("/auth/login","POST",{email:account.email,password},"");await json(login);const cookie=login.headers.get("set-cookie")!.split(";")[0];await json(await req(config(),"PUT",payload(),cookie),404);
    await configure(m);
  });
  it("uses only the best active offer with exact currency rounding and exclusive end times",async()=>{
    const now=Date.now(),m=structuredClone(defaultMerchandising);m.offers=[offer("Ten",10),offer("Twenty",20,{target:"category",category:"Tea"}),offer("Future",80,{startsAt:new Date(now+3600000).toISOString()}),offer("Expired",90,{endsAt:new Date(now-1000).toISOString()})];
    await configure(m);const c=await catalog(),p=c.products.find((p:Row)=>p.id===tea.id);assert.equal(p.price,"8.00");assert.equal(p.originalPrice,"10.00");assert.equal(p.offerId,"Twenty");assert.ok(!JSON.stringify(c.shop.merchandising).includes("Future"));assert.ok(!JSON.stringify(c.shop.merchandising).includes("Expired"));
    assert.equal((await quote()).total,"19.00");
    const timed={...m,offers:[offer("Boundary",25,{startsAt:"2026-01-01T00:00:00Z",endsAt:"2026-01-02T00:00:00Z"})]};
    assert.equal(offeredPrice(timed,{...tea,price:"0.10"},"SDG",Date.parse("2026-01-01T12:00:00Z")).price,"0.08");assert.equal(offeredPrice(timed,tea,"SDG",Date.parse("2026-01-02T00:00:00Z")).price,tea.price);
  });
  it("requires review when offers change and keeps order, stock and Finance totals consistent",async()=>{
    const old=await quote(), m=structuredClone(defaultMerchandising);m.offers=[offer("Twenty",20)];await configure(m);
    await json(await req("/storefront/merch-shop/checkout","POST",checkout(old),guest),409);
    const q=await quote(),input=checkout(q);
    await json(await req("/storefront/merch-shop/checkout","POST",{...input,lines:[{productId:tea.id,quantity:2,price:"1"}]},guest),400);
    const order=(await json(await req("/storefront/merch-shop/checkout","POST",input,guest),201)).order;assert.equal(order.total,"19.00");assert.equal(order.lines[0].price,"8.00");
    const stored=rows("shopOrders").find(o=>o.id===order.id)!;assert.equal(stored.lines[0].originalPrice,"10.00");assert.equal(stored.lines[0].offerId,"Twenty");
    const prefix=`/workspace/shops/${company.id}/orders/${order.id}/status`;let next=await json(await req(prefix,"POST",{version:stored.version,status:"preparing"}));next=await json(await req(prefix,"POST",{version:next.version,status:"dispatched",tracking:"OFFER-SHIP"}));assert.equal(rows("sales").find(s=>s.id===next.saleId)!.total,"19.00");assert.equal(rows("financeTransactions").length,0);
    await configure(structuredClone(defaultMerchandising));const retry=(await json(await req("/storefront/merch-shop/checkout","POST",input,guest))).order;assert.equal(retry.id,order.id);assert.equal(retry.total,"19.00");assert.equal(rows("shopProducts").find(p=>p.id===tea.id)!.price,"10.00");
  });
});
