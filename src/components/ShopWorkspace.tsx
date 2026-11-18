import ShopOperationsSettings, {type ShopOperationSettings,type ShopPaymentAccount} from "./ShopOperationsSettings";
import ShopOrderPayment, {type ShopPayment} from "./ShopOrderPayment";
import { ShopOrderMessages } from "./StorefrontAlerts";
import ShopStorefrontStats from "./ShopStorefrontStats";
import ShopTransferReview, {type TransferOrder} from "./ShopTransferReview";
import ShopStaffSettings from "./ShopStaffSettings";
import ShopOrderProgress from "./ShopOrderProgress";
import ShopSalesDashboard,{type ShopReport} from "./ShopSalesDashboard";
import ShopReturns,{type ShopReturn} from "./ShopReturns";
import ShopLabel from "./ShopLabel";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import "../shop-workspace.css";
import StorefrontSettings from "./StorefrontSettings";
import CompanyStoreLink from "./CompanyStoreLink";
import ShopSupportInbox from "./ShopSupportInbox";
import ProductPhotos, { ShopImage } from "./ProductPhotos";

type Company = { id: string; name: string; currency: string };
type Product = {
  category?: string;
  id: string;
  sku: string;
  name: string;
  description: string;
  image: string;
  images?: string[];
  warranty?: boolean;
  warrantyDetails?: string;
  variantGroup?: string;
  size?: string;
  color?: string;
  price: string;
  currency: string;
  onHand: number;
  reserved: number;
  available: number;
  active: boolean;
  version: number;
  unitCost?:string;
};
type Order = TransferOrder & { messages?: Parameters<typeof ShopOrderMessages>[0]["messages"];
  id: string;
  orderNumber?:string;
  customer: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: string;
  version: number;
  total: string;
  currency: string;
  tracking?: string;
  saleId?: string;
  settlement?: { paid: string; outstanding: string };
  lines: { name: string; quantity: number; price: string; total: string }[];
  events: { status: string; at: string; actor: string }[];
};
type Receipt = {
  purchaseId?:string;
  id: string;
  productId: string;
  supplier: string;
  quantity: number;
  reference: string;
  createdAt: string;
};
type Connector = { id: string; name: string; active: boolean };
type Snapshot = {
  report?:ShopReport;
  returns?:ShopReturn[];
  settings?:ShopOperationSettings;
  paymentAccounts?:ShopPaymentAccount[];
  payments?:ShopPayment[];
  financeDate?:string;
  purchases?:{id:string;label:string;supplier:string;currency:string}[];
  categories?: {name: string; title: string}[];
  products: Product[];
  orders: Order[];
  receipts: Receipt[];
  connectors: Connector[];
};
type ProductDraft = {
  sku: string;
  name: string;
  price: string;
  description?: string;
  image?: string;
  images?: string[];
  stockLocation?: string;
  category?: string;
};
const empty: Snapshot = {
  products: [],
  orders: [],
  receipts: [],
  connectors: [],
};
const newProduct = () => ({
  sku: "",
  name: "",
  price: "",
  description: "",
  image: "",
  images: [] as string[],
  stockLocation: "Main stock",
  category: "Collection",
  warranty: false,
  warrantyDetails: "",
  variantGroup: "",
  size: "",
  color: "",
});

export default function ShopWorkspace() {
  const location = useLocation();
  const { t } = useLanguage(),
    { user } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]),
    [companyId, setCompany] = useState("");
  const [data, setData] = useState<Snapshot>(empty),
    [tab, setTab] = useState("products"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [product, setProduct] = useState(newProduct),
    [preview, setPreview] = useState<ProductDraft[]>([]),
    [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(""),
    [tracking, setTracking] = useState("");
  const [label,setLabel]=useState<{id:string;reference?:string}|null>(null);
  const [reverseParent,setReverseParent]=useState("");
  const [key, setKey] = useState(""),
    [connectionName, setConnectionName] = useState("");
  const [receipt, setReceipt] = useState({
    productId: "", purchaseId:"",
    quantity: "1",
    supplier: "",
    reference: "",
    notes: "",
  });
  const [order, setOrder] = useState({
    customer: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    delivery: "0",
    discount: "0",
  });
  const [lines, setLines] = useState([{ productId: "", quantity: 1 }]);
  const requestIds = useRef({
    receipt: crypto.randomUUID(),
    order: crypto.randomUUID(),
  });
  const generation = useRef(0);
  const [photoBusy, setPhotoBusy] = useState(false), [productFilter, setProductFilter] = useState("all"), [orderSearch, setOrderSearch] = useState(""), [orderFilter, setOrderFilter] = useState("all");
  const permits = (section: string, action: string) =>
    user?.roleId === "role-main-manager" ||
    user?.permissions.some((p) =>
      ["*", `${section}.*`, `${section}.${action}`].includes(p),
    );
  const canCreate =
      permits("inventory", "create") && permits("operations", "create"),
    canEdit = permits("inventory", "edit") && permits("operations", "edit"),
    canConnect = canEdit && (permits("access", "edit") || permits("shops", "configure"));
  const c = companies.find((c) => c.id === companyId),
    base = `/workspace/shops/${companyId}`;
  useEffect(() => {
    const requestedTab=new URLSearchParams(location.search).get("tab");
    if(requestedTab&&["products","receiving","orders","support","settings","storefront","connections","shop-users","dashboard","returns"].includes(requestedTab))setTab(requestedTab);
    const requestedCompany = new URLSearchParams(location.search).get("company");
    if (requestedCompany && companies.some(company => company.id === requestedCompany)) setCompany(requestedCompany);
  }, [location.search, companies]);
  useEffect(() => {
    let active = true;
    request<{ companies: Company[] }>("/workspace/shops")
      .then((result) => {
        if (active) {
          setCompanies(result.companies);
          setCompany(
            result.companies.find((company) => /amal/i.test(company.name))
              ?.id ||
              result.companies[0]?.id ||
              "",
          );
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const token = ++generation.current;
    setData(empty);
    setKey("");
    setPreview([]);
    setSelectedOrder("");
    setLabel(null);
    setReverseParent("");
    setEditingProduct(null);
    setPhotoBusy(false);
    setProductFilter("all"); setOrderFilter("all"); setSearch(""); setOrderSearch("");
    setProduct(newProduct());
    setReceipt({
      productId: "", purchaseId:"",
      quantity: "1",
      supplier: "",
      reference: "",
      notes: "",
    });
    setLines([{ productId: "", quantity: 1 }]);
    setOrder({
      customer: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
      delivery: "0",
      discount: "0",
    });
    requestIds.current = {
      receipt: crypto.randomUUID(),
      order: crypto.randomUUID(),
    };
    if (!companyId) return;
    setLoading(true);
    request<Snapshot>(base)
      .then((result) => {
        if (token === generation.current) {
          setData(result);
          const requestedOrder = new URLSearchParams(location.search).get("order");
          if (requestedOrder && result.orders.some(order => order.id === requestedOrder)) { setTab("orders"); setSelectedOrder(requestedOrder); }
        }
      })
      .catch((e) => {
        if (token === generation.current) setError(e.message);
      })
      .finally(() => {
        if (token === generation.current) setLoading(false);
      });
  }, [companyId, base, location.search]);
  async function action(fn: () => Promise<void>) {
    if (busy || photoBusy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      setData(await request<Snapshot>(base));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const post = <T,>(path: string, body: unknown, method = "POST") =>
    request<T>(base + path, { method, body: JSON.stringify(body) });
  function field(
    label: string,
    value: string,
    update: (v: string) => void,
    type = "text",
    required = true,
  ) {
    return (
      <label className="form-field">
        <span>{t(label)}</span>
        <input
          type={type}
          required={required}
          value={value}
          step={type === "number" ? "any" : undefined}
          list={label === "Category" ? "shop-category-options" : undefined}
          maxLength={label === "Warranty details (optional)" ? 240 : undefined}
          onChange={(e) => update(e.target.value)}
        />
      </label>
    );
  }
  const submit = (fn: () => Promise<void>) => (event: FormEvent) => {
    event.preventDefault();
    void action(fn);
  };
  function variantFields(value: { variantGroup?: string; size?: string; color?: string }, update: (changes: { variantGroup?: string; size?: string; color?: string }) => void) { return <fieldset className="shop-variant-fields"><legend>{t("Size & colour (optional)")}</legend><label>{t("Product group")}<input list="shop-variant-groups" maxLength={100} value={value.variantGroup || ""} onChange={event => update({ variantGroup: event.target.value })} placeholder={t("e.g. Summer dress")} /></label><label>{t("Size")}<input maxLength={40} value={value.size || ""} onChange={event => update({ size: event.target.value })} placeholder="S, M, 42…" /></label><label>{t("Colour")}<input maxLength={40} value={value.color || ""} onChange={event => update({ color: event.target.value })} placeholder={t("e.g. Blue")} /></label><datalist id="shop-variant-groups">{[...new Set(data?.products.map(p => p.variantGroup).filter(Boolean))].map(g => <option key={g} value={g} />)}</datalist><small className="hint">{t("Products with the same group show as one product in the shop, with size and colour choices. Each keeps its own SKU, price and stock.")}</small></fieldset>; }
  function warrantyFields(enabled: boolean, details: string, update: (warranty: boolean, warrantyDetails: string) => void) { return <div className="shop-warranty-fields"><label className="merch-check"><input type="checkbox" checked={enabled} onChange={event=>update(event.target.checked,event.target.checked ? details : "")} />{t("Product has a warranty")}</label>{enabled && field("Warranty details (optional)",details,value=>update(true,value),"text",false)}</div>; }
  const selected = data.orders.find((o) => o.id === selectedOrder);
  const visibleProducts = data.products.filter(p => (`${p.name} ${p.sku} ${p.category || ""}`).toLowerCase().includes(search.toLowerCase()) && (productFilter === "all" || productFilter === "active" && p.active || productFilter === "paused" && !p.active || productFilter === "out" && p.available === 0));
  const visibleOrders = data.orders.filter(o => (orderFilter === "all" || o.status === orderFilter) && (`${o.customer} ${o.phone} ${o.orderNumber||""} ${o.id} ${o.tracking || ""}`).toLowerCase().includes(orderSearch.toLowerCase()));
  const completionBlocked = Boolean(selected?.status === "dispatched" && data.settings?.requirePaymentBeforeCompletion && (!selected.settlement || selected.settlement.outstanding == null || Number(selected.settlement.outstanding) > 0));
  async function importExcel(file?: File) {
    if (!file) return;
    setPreview([]);
    await action(async () => {
      if (!/\.xlsx$/i.test(file.name) || file.size > 2 * 1024 * 1024)
        throw new Error(t("Choose an .xlsx file up to 2 MB."));
      const { readSheet } = await import("read-excel-file/browser");
      const cells = await readSheet(file);
      if (cells.length < 2 || cells.length > 501)
        throw new Error(t("Use the first sheet with 1 to 500 products."));
      const headers = cells[0].map((v) =>
        String(v ?? "")
          .trim()
          .toLowerCase(),
      );
      if (
        !["sku", "name", "price"].every((h) => headers.includes(h)) ||
        new Set(headers).size !== headers.length
      )
        throw new Error(
          t(
            "Required column headers: sku, name, price. Optional: description, image, stocklocation.",
          ),
        );
      const drafts: ProductDraft[] = cells
        .slice(1)
        .filter((row) => row.some((v) => v !== null))
        .map((row) => {
          const value = (h: string) =>
            String(row[headers.indexOf(h)] ?? "").trim();
          return {
            sku: value("sku"),
            name: value("name"),
            price: value("price"),
            description: value("description"),
            image: value("image"),
            stockLocation: value("stocklocation") || "Main stock",
            category: value("category") || "Collection",
          };
        });
      const result = await post<{ products: ProductDraft[] }>(
        "/products/preview",
        { products: drafts },
      );
      setPreview(
        result.products.map(
          ({
            sku,
            name,
            price,
            description,
            image,
            stockLocation,
            category,
          }) => ({
            sku,
            name,
            price,
            description,
            image,
            stockLocation,
            category,
          }),
        ),
      );
    });
  }
  const renderGeneration = generation.current;
  return (
    <main className="page shop-workspace">
      {label&&data.orders.find(order=>order.id===label.id)&&<ShopLabel company={c?.name||""} order={data.orders.find(order=>order.id===label.id)!} reference={label.reference} onClose={()=>setLabel(null)}/>}
      <datalist id="shop-category-options">{[...new Set([...(data.categories || []).map(c=>c.name), ...data.products.map(p=>p.category || "Collection")])].map(name=><option key={name} value={name}>{data.categories?.find(c=>c.name===name)?.title || name}</option>)}</datalist>
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("CONNECTED COMMERCE")}</p>
          <h1>{t("Shops & orders")}</h1>
          <p>
            {t("Products, stock and customer orders in one company workspace.")}
          </p>
        </div>
        {(user?.roleId === "role-main-manager" || companies.length > 1) && <label className="form-field">
          <span>{t("Company")}</span>
          <select
            aria-label={t("Company")}
            value={companyId}
            disabled={busy || photoBusy || !companies.length}
            onChange={(e) => {
              setError("");
              setCompany(e.target.value);
            }}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.currency}
              </option>
            ))}
          </select>
        </label>}
      </header>
      {error && (
        <p className="error" role="alert">
          {t(error)}
        </p>
      )}
      {loading && <p role="status">{t("Loading…")}</p>}
      {!loading && !companies.length && (
        <section className="card">
          <h2>{t("Start with a company")}</h2>
          <p>
            {t(
              "An administrator must create and assign your company before you can manage its shop.",
            )}
          </p>
          <Link to="/organizations">{t("Organizations")}</Link>
        </section>
      )}
      {companyId && (
        <>
          <section className="shop-metrics" aria-label={t("Shop overview")}>
            {[
              ["Products", data.products.length],
              [
                "Open orders",
                data.orders.filter((o) =>
                  ["reserved", "preparing", "dispatched"].includes(o.status),
                ).length,
              ],
              [
                "Available units",
                data.products.reduce((n, p) => n + p.available, 0),
              ],
              [
                "Reserved units",
                data.products.reduce((n, p) => n + p.reserved, 0),
              ],
            ].map(([label, value]) => (
              <article className="card" key={label}>
                <span>{t(String(label))}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
          <nav className="shop-tabs" aria-label={t("Shop sections")}>
            {[
              "products",
              "receiving",
              "orders",
              ...(canConnect ? ["settings"] : []),
              "support",
            ].map((name) => (
              <button
                type="button"
                key={name}
                aria-current={tab === name || name === "settings" && ["storefront","connections","shop-users","dashboard","returns"].includes(tab) ? "page" : undefined}
                disabled={busy || photoBusy}
                onClick={() => setTab(name)}
              >
                {t(
                  name === "products"
                    ? "Products"
                    : name === "receiving"
                      ? "Incoming shipments"
                      : name === "orders"
                        ? "Orders"
                        : name === "storefront"
                          ? "Customer storefront"
                          : name === "settings" ? "Shop settings" : name === "support" ? "Shop customer service" : "Shop connections",
                )}
              </button>
            ))}
          </nav>
          {tab === "orders" && <nav className="shop-order-stages" aria-label={t("Order stages")}>
            {["all", "reserved", "preparing", "dispatched", "delivered"].map(status => <button key={status} type="button" aria-pressed={orderFilter === status} disabled={busy || loading} onClick={() => {setOrderFilter(status);setOrderSearch("");setSelectedOrder("");}}><span>{t(status === "all" ? "All orders" : status)}</span><strong>{data.orders.filter(order => status === "all" || order.status === status).length}</strong></button>)}
          </nav>}
          <fieldset disabled={busy || loading || photoBusy} className="shop-controls">
            {canConnect && ["settings", "storefront", "connections", "shop-users","dashboard","returns"].includes(tab) && (
              <section className="card shop-settings-hub" aria-labelledby="shop-settings-title">
                <h2 id="shop-settings-title">{t("Shop settings")}</h2>
                <p>{t("Manage all settings for this company's shop and online store in one place.")}</p>
                <nav className="shop-settings-tabs" aria-label={t("Shop settings")}>
                  {[
                    ["dashboard", "Sales dashboard", "Shop sales, returns, collections and gross profit."],
                    ["settings", "Orders & payments", "Payment accounts, accepted methods, tracking and order completion."],
                    ["storefront", "Customer storefront", "Store details, publishing, delivery, pickup, policies, layout and offers."],
                    ["shop-users", "Shop users", "Create shop staff, manage access and reset passwords."],
                    ["connections", "Shop connections", "Store link, integration keys and connected shops."],
                    ["returns", "Shop returns", "Return paid orders, restock items and track Finance refunds."],
                  ].filter(([key]) => key !== "shop-users" || permits("access", "create")).map(([key, label, description]) => (
                    <article key={key} className={tab === key ? "selected" : undefined}>
                      <button type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{t(label)}</button>
                      <p>{t(description)}</p>
                    </article>
                  ))}
                </nav>
              </section>
            )}
            {tab==="dashboard"&&canConnect&&<ShopStorefrontStats companyId={companyId}/>}
            {tab==="dashboard"&&canConnect&&<ShopSalesDashboard companyId={companyId} report={data.report} orders={data.orders} products={data.products} canConfigure={Boolean(permits("shops","configure")&&permits("finance","approve"))} onSaved={async()=>{const result=await request<Snapshot>(base);if(renderGeneration===generation.current)setData(result);}} openOrder={id=>{setSelectedOrder(id);setOrderFilter("all");setOrderSearch("");setTab("orders");}} print={id=>setLabel({id})}/>}
            {tab==="returns"&&canConnect&&<ShopReturns key={companyId} initialParent={reverseParent} openOrder={id=>{setSelectedOrder(id);setOrderFilter("all");setOrderSearch("");setTab("orders");}} companyId={companyId} orders={data.orders} returns={data.returns||[]} canManage={Boolean(permits("shops","configure")&&permits("finance","approve")&&permits("finance","create"))} onSaved={async()=>{const result=await request<Snapshot>(base);if(renderGeneration===generation.current)setData(result);window.dispatchEvent(new Event("stocrant:finance-changed"));}} print={(id,reference)=>setLabel({id,reference})}/>}
            {tab==="settings"&&canConnect&&<ShopOperationsSettings key={companyId} companyId={companyId} currency={c?.currency||""} settings={data.settings} accounts={data.paymentAccounts||[]} onSaved={async()=>{const result=await request<Snapshot>(base);if(renderGeneration===generation.current)setData(result);}}/>}
            {tab==="shop-users"&&canConnect&&permits("access","create")&&<ShopStaffSettings key={companyId} companyId={companyId}/>}
            {tab === "products" && (
              <>
                <section className="card shop-catalog">
                  <div className="shop-section-title">
                    <h2>{t("Product catalog")}</h2>
                    {field(
                      "Search products",
                      search,
                      setSearch,
                      "search",
                      false,
                    )}
                  </div>
                  <div className="shop-catalog-toolbar"><label className="form-field"><span>{t("Product status")}</span><select value={productFilter} onChange={event => setProductFilter(event.target.value)}>{["all","active","paused","out"].map(value => <option key={value} value={value}>{t(value === "all" ? "All products" : value === "active" ? "Active products" : value === "paused" ? "Paused products" : "Out of stock")}</option>)}</select></label><p className="hint">{t("Select Edit product to update details and photos.")}</p></div>
                  <div className="shop-products">
                    {visibleProducts.map((p) => (
                        <article className="shop-product" key={p.id}>
                          <div className="shop-product-image">
                            {p.image ? (
                              <ShopImage src={p.image} alt={p.name} />
                            ) : (
                              <span aria-hidden="true">◇</span>
                            )}
                          </div>
                          <div>
                            <div className="shop-product-meta"><small dir="ltr">{p.sku}</small><span className={`shop-status ${p.active ? "status-active" : "status-paused"}`}>{t(p.active ? "Active" : "Paused")}</span></div>
                            <h3>{p.name}</h3>
                            <p>
                              {p.price} {p.currency}
                            </p>
                            <dl>
                              <div>
                                <dt>{t("On hand")}</dt>
                                <dd>{p.onHand}</dd>
                              </div>
                              <div>
                                <dt>{t("Reserved")}</dt>
                                <dd>{p.reserved}</dd>
                              </div>
                              <div>
                                <dt>{t("Available")}</dt>
                                <dd>{p.available}</dd>
                              </div>
                            </dl>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => setEditingProduct(p)}
                              >
                                {t("Edit product")}
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() =>
                                  void action(async () => {
                                    await post(
                                      `/products/${p.id}`,
                                      {
                                        version: p.version,
                                        name: p.name,
                                        description: p.description,
                                        image: p.image,
                                        price: p.price,
                                        active: !p.active,
                                      },
                                      "PATCH",
                                    );
                                  })
                                }
                              >
                                {t(p.active ? "Pause sales" : "Resume sales")}
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                  </div>
                  {data.products.length > 0 && !visibleProducts.length && <p className="empty">{t("No products match your search.")}</p>}
                  {!data.products.length && (
                    <p className="empty">
                      {t(
                        "Add your first product, then receive stock before accepting orders.",
                      )}
                    </p>
                  )}
                </section>
                {editingProduct && canEdit && (
                  <section className="card shop-edit-product">
                    <h2>
                      {t("Edit product")}: {editingProduct.sku}
                    </h2>
                    <form
                      className="shop-form"
                      onSubmit={submit(async () => {
                        const {
                          version,
                          name,
                          description,
                          image,
                          price,
                          active,
                        } = editingProduct;
                        await post(
                          `/products/${editingProduct.id}`,
                          {
                            version,
                            name,
                            description,
                            image,
                            images: editingProduct.images || (image ? [image] : []),
                            price,
                            active,
                            category: editingProduct.category || "Collection",
                            warranty: editingProduct.warranty === true,
                            warrantyDetails: editingProduct.warrantyDetails || "",
                            variantGroup: editingProduct.variantGroup || "",
                            size: editingProduct.size || "",
                            color: editingProduct.color || "",
                          },
                          "PATCH",
                        );
                        setEditingProduct(null);
                      })}
                    >
                      {field("Product name", editingProduct.name, (value) =>
                        setEditingProduct({ ...editingProduct, name: value }),
                      )}
                      {field(
                        "Category",
                        editingProduct.category || "Collection",
                        (value) =>
                          setEditingProduct({
                            ...editingProduct,
                            category: value,
                          }),
                      )}
                      {field(
                        "Price",
                        editingProduct.price,
                        (value) =>
                          setEditingProduct({
                            ...editingProduct,
                            price: value,
                          }),
                        "number",
                      )}
                      {field(
                        "Description",
                        editingProduct.description,
                        (value) =>
                          setEditingProduct({
                            ...editingProduct,
                            description: value,
                          }),
                        "text",
                        false,
                      )}
                      {variantFields(editingProduct, changes => setEditingProduct({ ...editingProduct, ...changes }))}
                      {warrantyFields(editingProduct.warranty === true,editingProduct.warrantyDetails || "",(warranty,warrantyDetails)=>setEditingProduct({...editingProduct,warranty,warrantyDetails}))}
                      <ProductPhotos key={companyId + editingProduct.id} companyId={companyId} value={editingProduct.images || (editingProduct.image ? [editingProduct.image] : [])} onBusy={setPhotoBusy} onChange={images => setEditingProduct({ ...editingProduct, images, image: images[0] || "" })} />
                      <button className="btn primary">
                        {t("Save product")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProduct(null)}
                      >
                        {t("Cancel")}
                      </button>
                    </form>
                  </section>
                )}
                {canCreate && (
                  <div className="shop-two-columns shop-product-tools">
                    <section className="card shop-add-product">
                      <h2>{t("Add product")}</h2>
                      <form
                        className="shop-form"
                        onSubmit={submit(async () => {
                          await post("/products", { products: [product] });
                          setProduct(newProduct());
                        })}
                      >
                        {field("SKU", product.sku, (v) =>
                          setProduct({ ...product, sku: v }),
                        )}
                        {field("Product name", product.name, (v) =>
                          setProduct({ ...product, name: v }),
                        )}
                        {field(
                          `Price`,
                          product.price,
                          (v) => setProduct({ ...product, price: v }),
                          "number",
                        )}
                        {field("Category", product.category, (value) =>
                          setProduct({ ...product, category: value }),
                        )}
                        {field("Stock location", product.stockLocation, (v) =>
                          setProduct({ ...product, stockLocation: v }),
                        )}
                        {variantFields(product, changes => setProduct({ ...product, ...changes }))}
                        {warrantyFields(product.warranty,product.warrantyDetails,(warranty,warrantyDetails)=>setProduct({...product,warranty,warrantyDetails}))}
                        <ProductPhotos key={companyId} companyId={companyId} value={product.images} onBusy={setPhotoBusy} onChange={images => setProduct({ ...product, images, image: images[0] || "" })} />
                        <label className="form-field">
                          <span>{t("Description")}</span>
                          <textarea
                            value={product.description}
                            onChange={(e) =>
                              setProduct({
                                ...product,
                                description: e.target.value,
                              })
                            }
                          />
                        </label>
                        <p className="hint">
                          {t(
                            "Prices use the company currency. Stock starts at zero or links to the existing SKU.",
                          )}{" "}
                          {c?.currency}
                        </p>
                        <button className="btn primary">
                          {t("Add product")}
                        </button>
                      </form>
                    </section>
                    <section className="card shop-excel-panel">
                      <h2>{t("Import Excel products")}</h2>
                      <p>{t("Use the first sheet with 1 to 500 products.")}</p>
                      <p className="hint">
                        {t(
                          "Required column headers: sku, name, price. Optional: description, image, stocklocation.",
                        )}
                      </p>
                      <p>
                        {t(
                          "Import creates products only. Record opening stock through Incoming shipments.",
                        )}
                      </p>
                      <label className="form-field">
                        <span>{t("Choose Excel file")}</span>
                        <input
                          type="file"
                          accept=".xlsx"
                          onChange={(e) => {
                            void importExcel(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {preview.length > 0 && (
                        <>
                          <p role="status">
                            {t("Review products before importing")}:{" "}
                            {preview.length}
                          </p>
                          <div className="shop-import-preview">
                            {preview.map((p) => (
                              <p key={p.sku}>
                                <b>{p.sku}</b> · {p.name} · {p.price}{" "}
                                {c?.currency}
                              </p>
                            ))}
                          </div>
                          <button
                            className="btn primary"
                            type="button"
                            onClick={() =>
                              void action(async () => {
                                await post("/products", { products: preview });
                                setPreview([]);
                              })
                            }
                          >
                            {t("Confirm import")}
                          </button>
                          <button type="button" onClick={() => setPreview([])}>
                            {t("Cancel")}
                          </button>
                        </>
                      )}
                    </section>
                  </div>
                )}
              </>
            )}
            {tab === "receiving" && (
              <div className="shop-two-columns">
                {canCreate && (
                  <section className="card">
                    <h2>{t("Receive a shipment")}</h2>
                    <form
                      className="shop-form"
                      onSubmit={submit(async () => {
                        await post("/receipts", {
                          ...receipt,
                          quantity: Number(receipt.quantity),
                          requestId: requestIds.current.receipt,
                        });
                        requestIds.current.receipt = crypto.randomUUID();
                        setReceipt({
                          productId: "", purchaseId:"",
                          quantity: "1",
                          supplier: "",
                          reference: "",
                          notes: "",
                        });
                      })}
                    >
                      <label className="form-field">
                        <span>{t("Product")}</span>
                        <select
                          required
                          value={receipt.productId}
                          onChange={(e) =>
                            setReceipt({
                              ...receipt,
                              productId: e.target.value,
                            })
                          }
                        >
                          <option value="">{t("Choose product")}</option>
                          {data.products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} · {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-field"><span>{t("Linked purchase (optional)")}</span><select value={receipt.purchaseId} onChange={e=>{const purchase=data.purchases?.find(p=>p.id===e.target.value);setReceipt({...receipt,purchaseId:e.target.value,supplier:purchase?.supplier||receipt.supplier});}}><option value="">{t("No purchase linked")}</option>{data.purchases?.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label><p className="hint">{t("Receiving updates stock. Supplier payments are recorded against the purchase in Finance.")}</p>
                      {(
                        [
                          ["Quantity", "quantity", "number"],
                          ["Supplier", "supplier", "text"],
                          ["Shipment reference", "reference", "text"],
                          ["Notes", "notes", "text"],
                        ] as const
                      ).map(([label, name, type]) => (
                        <div key={name}>
                          {field(
                            label,
                            receipt[name],
                            (v) => setReceipt({ ...receipt, [name]: v }),
                            type,
                            name !== "notes",
                          )}
                        </div>
                      ))}
                      <button className="btn primary">
                        {t("Confirm receipt")}
                      </button>
                    </form>
                  </section>
                )}
                <section className="card">
                  <h2>{t("Shipment history")}</h2>
                  {data.receipts.map((r) => (
                    <article className="shop-history" key={r.id}>
                      <strong>
                        {data.products.find((p) => p.id === r.productId)?.name}{" "}
                        · +{r.quantity}
                      </strong>
                      <p>
                        {r.supplier} · {r.reference}
                      </p>
                      {r.purchaseId&&<Link to={`/stores/purchases/${encodeURIComponent(r.purchaseId)}`}>{t("Linked purchase")}</Link>}<small>{new Date(r.createdAt).toLocaleString()}</small>
                    </article>
                  ))}
                  {!data.receipts.length && (
                    <p>{t("No shipments received yet.")}</p>
                  )}
                </section>
              </div>
            )}
            {tab === "orders" && (
              <div className="shop-order-layout">
                <section className="card shop-order-list-panel">
                  <h2>{t("Customer orders")}</h2><div className="shop-order-filters">{field("Search orders", orderSearch, setOrderSearch, "search", false)}<label className="form-field"><span>{t("Order status")}</span><select value={orderFilter} onChange={event => setOrderFilter(event.target.value)}>{["all","reserved","preparing","dispatched","delivered","cancelled","expired"].map(value => <option key={value} value={value}>{t(value === "all" ? "All orders" : value)}</option>)}</select></label></div>
                  <div className="shop-orders">
                    {visibleOrders.map((o) => (
                      <button
                        type="button"
                        aria-pressed={selectedOrder === o.id}
                        className={selectedOrder === o.id ? "selected" : ""}
                        key={o.id}
                        onClick={() => {
                          setSelectedOrder(o.id);
                          setTracking(o.tracking || "");
                        }}
                      >
                        <span>
                          <strong>{o.customer}</strong>
                          <small dir="ltr">{o.orderNumber||`#${o.id.slice(0, 8)}`}</small>
                        </span>
                        <span className={`shop-status status-${o.status}`}>{t(o.status)}</span>
                        <strong>
                          {o.total} {o.currency}
                        </strong>
                      </button>
                    ))}
                  </div>
                  {data.orders.length > 0 && !visibleOrders.length && <p className="empty">{t("No orders match your search.")}</p>}
                  {!data.orders.length && (
                    <p>
                      {t(
                        "No orders yet. Add a manual order to test the workflow.",
                      )}
                    </p>
                  )}
                </section>
                {selected && (
                  <section className="card shop-order-detail" aria-live="polite">
                    <div className="shop-section-title">
                      <h2>{selected.customer}</h2>
                      <strong dir="ltr">{selected.orderNumber}</strong>
                      <button type="button" onClick={()=>setLabel({id:selected.id})}>{t("Print label")}</button>
                      {canConnect&&permits("finance","approve")&&["dispatched","delivered"].includes(selected.status)&&<button type="button" onClick={()=>{setReverseParent(selected.orderNumber||"");setTab("returns");}}>{t("Create reverse order")}</button>}
                      <span className={`shop-status status-${selected.status}`}>{t(selected.status)}</span>
                    </div>
                    <ShopOrderProgress status={selected.status} paymentRequired={Boolean(data.settings?.requirePaymentBeforeCompletion)} outstanding={selected.settlement?.outstanding}/>
                    {(data.returns||[]).filter(item=>item.shopOrderId===selected.id).map(item=><p key={item.id}>{t("Reverse order number")}: <button type="button" onClick={()=>{setReverseParent(selected.orderNumber||"");setTab("returns");}}>{item.reverseOrderNumber||item.rmaNumber}</button></p>)}
                    <p className="shop-contact-line">
                      <a dir="ltr" href={`tel:${selected.phone.replace(/[^+\d]/g, "")}`}>{selected.phone}</a>
                      {selected.email && <a dir="ltr" href={`mailto:${selected.email}`}>{selected.email}</a>}
                    </p>
                    <p dir="auto">{selected.address}</p>
                  {selected.tracking && <p><strong>{t("Shipment reference")}:</strong> {selected.tracking}</p>}
                    <p>{selected.notes}</p>
                    <div className="shop-line-items" aria-label={t("Order items")}>{selected.lines.map((l, i) => (
                      <div key={i}><span><strong>{l.name}</strong><small>{l.quantity} × {l.price} {selected.currency}</small></span><strong>{l.total} {selected.currency}</strong></div>
                    ))}</div>
                    <strong className="shop-order-total">
                      {t("Total")}: {selected.total} {selected.currency}
                    </strong>
                    {selected.saleId && (
                      <p>
                        {t(
                          "A sale is linked. Record customer payments here; Finance keeps the same reference.",
                        )}{" "}
                        <Link to={`/finance?${new URLSearchParams({tab:"Sales",company:companyId,currency:selected.currency,source:String(selected.saleId)})}`}>{t("Finance")}</Link>
                      </p>
                    )}
                    {selected.settlement && (
                      <p>
                        {t("Paid")}: {selected.settlement.paid} ·{" "}
                        {t("Outstanding")}: {selected.settlement.outstanding}
                      </p>
                    )}
                    <ShopOrderMessages messages={selected.messages} />
                    <ShopTransferReview companyId={companyId} order={selected} canReview={Boolean(canEdit)} onChanged={async()=>{const result=await request<Snapshot>(base);if(renderGeneration===generation.current)setData(result);}}/>
                    {selected.saleId&&<ShopOrderPayment transferReference={selected.transferStatus==="verified"?(selected.transferProofs||[]).slice(-1)[0]?.reference||"":undefined} key={companyId+selected.id} companyId={companyId} orderId={selected.id} saleId={selected.saleId} currency={selected.currency} outstanding={selected.settlement?.outstanding} accounts={data.paymentAccounts||[]} settings={data.settings} payments={data.payments||[]} date={data.financeDate||""} canRecord={Boolean(permits("finance","create")&&canEdit)} onSaved={async()=>{const result=await request<Snapshot>(base);if(renderGeneration===generation.current)setData(result);window.dispatchEvent(new Event("stocrant:finance-changed"));}}/>}
                    {canEdit && (
                      <div className="shop-order-actions">
                        {selected.status === "preparing" &&
                          field(
                            "Shipment or collection reference",
                            tracking,
                            setTracking,
                            "text",
                            data.settings?.requireTracking !== false,
                          )}
                        {(
                          {
                            reserved: ["preparing", "cancelled"],
                            preparing: ["dispatched", "cancelled"],
                            dispatched: ["delivered"],
                          } as Record<string, string[]>
                        )[selected.status]?.map((status) => (
                          <button
                            type="button"
                            key={status}
                            className={status === "cancelled" ? "shop-cancel-order" : "primary"}
                            disabled={status === "delivered" && completionBlocked || status === "dispatched" && data.settings?.requireTracking !== false && !tracking.trim()}
                            onClick={() =>
                              void action(async () => {
                                await post(`/orders/${selected.id}/status`, {
                                  status,
                                  version: selected.version,
                                  tracking,
                                });
                              })
                            }
                          >
                            {t(
                              status === "preparing"
                                ? "Start preparing"
                                : status === "dispatched"
                                  ? "Dispatch order"
                                  : status === "delivered"
                                    ? "Confirm delivery"
                                    : "Cancel order",
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {completionBlocked && <p className="hint" role="status">{t("Full payment is required before this order can be completed.")}</p>}
                    <details>
                      <summary>{t("Order history")}</summary>
                      {selected.events.map((e, i) => (
                        <p key={i}>
                          {t(e.status)} · {e.actor} ·{" "}
                          {new Date(e.at).toLocaleString()}
                        </p>
                      ))}
                    </details>
                  </section>
                )}
                {!selected && <section className="card shop-order-detail shop-order-placeholder"><span aria-hidden="true">&#9636;</span><h2>{t("Select an order")}</h2><p className="hint">{t("View customer details, items and delivery progress here.")}</p></section>}
                {canCreate && (
                  <section className="card shop-create-order">
                    <h2>{t("Create order")}</h2>
                    <p>
                      {t(
                        "Orders reserve available stock. No payment is recorded at this step.",
                      )}
                    </p>
                    <form
                      className="shop-form"
                      onSubmit={submit(async () => {
                        const result = await post<Order>("/orders", {
                          ...order,
                          lines,
                          requestId: requestIds.current.order,
                        });
                        requestIds.current.order = crypto.randomUUID();
                        setSelectedOrder(result.id);
                        setOrderFilter("all");
                        setOrderSearch("");
                        setTracking("");
                        setLines([{ productId: "", quantity: 1 }]);
                        setOrder({
                          customer: "",
                          email: "",
                          phone: "",
                          address: "",
                          notes: "",
                          delivery: "0",
                          discount: "0",
                        });
                      })}
                    >
                      <div className="shop-two-columns">
                        {(
                          [
                            ["Customer name", "customer", "text"],
                            ["Email", "email", "email"],
                            ["Mobile number", "phone", "tel"],
                            ["Delivery address", "address", "text"],
                            ["Delivery charge", "delivery", "number"],
                            ["Discount", "discount", "number"],
                          ] as const
                        ).map(([label, name, type]) => (
                          <div key={name}>
                            {field(
                              label,
                              order[name],
                              (v) => setOrder({ ...order, [name]: v }),
                              type,
                              !["email", "address"].includes(name),
                            )}
                          </div>
                        ))}
                      </div>
                      {lines.map((line, i) => (
                        <div className="shop-order-line" key={i}>
                          <label className="form-field">
                            <span>{t("Product")}</span>
                            <select
                              required
                              value={line.productId}
                              onChange={(e) =>
                                setLines(
                                  lines.map((l, n) =>
                                    n === i
                                      ? { ...l, productId: e.target.value }
                                      : l,
                                  ),
                                )
                              }
                            >
                              <option value="">{t("Choose product")}</option>
                              {data.products
                                .filter((p) => p.active)
                                .map((p) => (
                                  <option value={p.id} key={p.id}>
                                    {p.name} · {p.price} {p.currency} ·{" "}
                                    {t("Available")}: {p.available}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="form-field">
                            <span>{t("Quantity")}</span>
                            <input
                              required
                              min="1"
                              step="1"
                              type="number"
                              value={line.quantity}
                              onChange={(e) =>
                                setLines(
                                  lines.map((l, n) =>
                                    n === i
                                      ? {
                                          ...l,
                                          quantity: Number(e.target.value),
                                        }
                                      : l,
                                  ),
                                )
                              }
                            />
                          </label>
                          {lines.length > 1 && (
                            <button
                              type="button"
                              aria-label={t("Remove item")}
                              onClick={() =>
                                setLines(lines.filter((_, n) => n !== i))
                              }
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          setLines([...lines, { productId: "", quantity: 1 }])
                        }
                      >
                        {t("Add item")}
                      </button>
                      <button className="btn primary">
                        {t("Create order")}
                      </button>
                    </form>
                  </section>
                )}
              </div>
            )}
            {tab === "storefront" && canConnect && (
              <StorefrontSettings key={companyId} companyId={companyId} products={data.products} onSaved={() => { void request<Snapshot>(base).then(result => { if (renderGeneration === generation.current) setData(result); }).catch(e => { if (renderGeneration === generation.current) setError(e.message); }); }} />
            )}
            {tab === "support" && <ShopSupportInbox key={companyId} companyId={companyId} openOrder={id=>{void request<Snapshot>(base).then(result=>{if(renderGeneration===generation.current){setData(result);setSelectedOrder(id);setOrderFilter("all");setOrderSearch("");setTab("orders");}}).catch(e=>{if(renderGeneration===generation.current)setError(e.message);});}}/>}
            {tab === "connections" && canConnect && (
              <section className="card">
                <CompanyStoreLink key={companyId} companyId={companyId} companyName={companies.find(company => company.id === companyId)?.name || ""} configure={() => setTab("storefront")} />
                <h2>{t("Connect your custom shop")}</h2>
                <p>
                  {t(
                    "Your shop server can read the catalog, submit orders and check their status. Each connection belongs to this company.",
                  )}
                </p>
                <p>
                  {t(
                    "Keep connection keys on your shop server. Never place them in public website code.",
                  )}
                </p>
                <p>
                  {t(
                    "Creating a connection does not publish a shop, configure a domain or enable payment processing.",
                  )}
                </p>
                <form
                  className="shop-form"
                  onSubmit={submit(async () => {
                    const result = await post<{ key: string }>("/connectors", {
                      name: connectionName,
                    });
                    setKey(result.key);
                    setConnectionName("");
                  })}
                >
                  {field("Connection name", connectionName, setConnectionName)}
                  <button className="btn primary">
                    {t("Create connection key")}
                  </button>
                </form>
                {key && (
                  <div className="shop-key" role="status">
                    <p>{t("Copy this key now. It is only shown once.")}</p>
                    <code>{key}</code>
                    <button type="button" onClick={() => setKey("")}>
                      {t("Hide key")}
                    </button>
                  </div>
                )}
                <ul className="shop-connection-list">
                  {data.connectors.map((r) => (
                    <li key={r.id}>
                      <span>
                        {r.name} · {t(r.active ? "Active" : "Revoked")}
                      </span>
                      {r.active && (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                t(
                                  "Revoke this shop connection? New requests will stop immediately.",
                                ),
                              )
                            )
                              void action(async () => {
                                await post(`/connectors/${r.id}`, {}, "DELETE");
                                setKey("");
                              });
                          }}
                        >
                          {t("Revoke")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>{t("Integration endpoints")}</summary>
                  <p>
                    <code>GET /api/shop-connection/catalog</code>
                  </p>
                  <p>
                    <code>POST /api/shop-connection/orders</code>
                  </p>
                  <p>
                    <code>GET /api/shop-connection/orders/:id</code>
                  </p>
                </details>
              </section>
            )}
          </fieldset>
        </>
      )}
    </main>
  );
}
