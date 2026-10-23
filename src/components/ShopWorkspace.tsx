import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { request } from "../api";
import { useLanguage } from "../language-context";
import { useSession } from "../session-context";
import "../shop-workspace.css";

type Company = { id: string; name: string; currency: string };
type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  image: string;
  price: string;
  currency: string;
  onHand: number;
  reserved: number;
  available: number;
  active: boolean;
  version: number;
};
type Order = {
  id: string;
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
  id: string;
  productId: string;
  supplier: string;
  quantity: number;
  reference: string;
  createdAt: string;
};
type Connector = { id: string; name: string; active: boolean };
type Snapshot = {
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
  stockLocation?: string;
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
  stockLocation: "Main stock",
});

export default function ShopWorkspace() {
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
  const [key, setKey] = useState(""),
    [connectionName, setConnectionName] = useState("");
  const [receipt, setReceipt] = useState({
    productId: "",
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
  const permits = (section: string, action: string) =>
    user?.roleId === "role-main-manager" ||
    user?.permissions.some((p) =>
      ["*", `${section}.*`, `${section}.${action}`].includes(p),
    );
  const canCreate =
      permits("inventory", "create") && permits("operations", "create"),
    canEdit = permits("inventory", "edit") && permits("operations", "edit"),
    canConnect = canEdit && permits("access", "edit");
  const c = companies.find((c) => c.id === companyId),
    base = `/workspace/shops/${companyId}`;
  useEffect(() => {
    let active = true;
    request<{ companies: Company[] }>("/workspace/shops")
      .then((result) => {
        if (active) {
          setCompanies(result.companies);
          setCompany(result.companies[0]?.id || "");
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
    setEditingProduct(null);
    setProduct(newProduct());
    setReceipt({
      productId: "",
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
        if (token === generation.current) setData(result);
      })
      .catch((e) => {
        if (token === generation.current) setError(e.message);
      })
      .finally(() => {
        if (token === generation.current) setLoading(false);
      });
  }, [companyId, base]);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
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
          onChange={(e) => update(e.target.value)}
        />
      </label>
    );
  }
  const submit = (fn: () => Promise<void>) => (event: FormEvent) => {
    event.preventDefault();
    void action(fn);
  };
  const selected = data.orders.find((o) => o.id === selectedOrder);
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
          };
        });
      const result = await post<{ products: ProductDraft[] }>(
        "/products/preview",
        { products: drafts },
      );
      setPreview(
        result.products.map(
          ({ sku, name, price, description, image, stockLocation }) => ({
            sku,
            name,
            price,
            description,
            image,
            stockLocation,
          }),
        ),
      );
    });
  }
  return (
    <main className="page shop-workspace">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("CONNECTED COMMERCE")}</p>
          <h1>{t("Shops & orders")}</h1>
          <p>
            {t("Products, stock and customer orders in one company workspace.")}
          </p>
        </div>
        <label className="form-field">
          <span>{t("Company")}</span>
          <select
            aria-label={t("Company")}
            value={companyId}
            disabled={busy || !companies.length}
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
        </label>
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
                  ["reserved", "preparing"].includes(o.status),
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
              ...(canConnect ? ["connections"] : []),
            ].map((name) => (
              <button
                type="button"
                key={name}
                aria-current={tab === name ? "page" : undefined}
                onClick={() => setTab(name)}
              >
                {t(
                  name === "products"
                    ? "Products"
                    : name === "receiving"
                      ? "Incoming shipments"
                      : name === "orders"
                        ? "Orders"
                        : "Shop connections",
                )}
              </button>
            ))}
          </nav>
          <fieldset disabled={busy || loading} className="shop-controls">
            {tab === "products" && (
              <>
                <section className="card">
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
                  <div className="shop-products">
                    {data.products
                      .filter((p) =>
                        `${p.name} ${p.sku}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <article className="shop-product" key={p.id}>
                          <div className="shop-product-image">
                            {p.image ? (
                              <img src={p.image} alt="" loading="lazy" />
                            ) : (
                              <span aria-hidden="true">◇</span>
                            )}
                          </div>
                          <div>
                            <small dir="ltr">{p.sku}</small>
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
                  {!data.products.length && (
                    <p className="empty">
                      {t(
                        "Add your first product, then receive stock before accepting orders.",
                      )}
                    </p>
                  )}
                </section>
                {editingProduct && canEdit && (
                  <section className="card">
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
                          { version, name, description, image, price, active },
                          "PATCH",
                        );
                        setEditingProduct(null);
                      })}
                    >
                      {field("Product name", editingProduct.name, (value) =>
                        setEditingProduct({ ...editingProduct, name: value }),
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
                      {field(
                        "Product image URL",
                        editingProduct.image,
                        (value) =>
                          setEditingProduct({
                            ...editingProduct,
                            image: value,
                          }),
                        "url",
                        false,
                      )}
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
                  <div className="shop-two-columns">
                    <section className="card">
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
                        {field("Stock location", product.stockLocation, (v) =>
                          setProduct({ ...product, stockLocation: v }),
                        )}
                        {field(
                          "Product image URL",
                          product.image,
                          (v) => setProduct({ ...product, image: v }),
                          "url",
                          false,
                        )}
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
                    <section className="card">
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
                          productId: "",
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
                      <small>{new Date(r.createdAt).toLocaleString()}</small>
                    </article>
                  ))}
                  {!data.receipts.length && (
                    <p>{t("No shipments received yet.")}</p>
                  )}
                </section>
              </div>
            )}
            {tab === "orders" && (
              <>
                <section className="card">
                  <h2>{t("Customer orders")}</h2>
                  <div className="shop-orders">
                    {data.orders.map((o) => (
                      <button
                        type="button"
                        className={selectedOrder === o.id ? "selected" : ""}
                        key={o.id}
                        onClick={() => {
                          setSelectedOrder(o.id);
                          setTracking(o.tracking || "");
                        }}
                      >
                        <span>
                          <strong>{o.customer}</strong>
                          <small>{o.id.slice(0, 8)}</small>
                        </span>
                        <span>{t(o.status)}</span>
                        <strong>
                          {o.total} {o.currency}
                        </strong>
                      </button>
                    ))}
                  </div>
                  {!data.orders.length && (
                    <p>
                      {t(
                        "No orders yet. Add a manual order to test the workflow.",
                      )}
                    </p>
                  )}
                </section>
                {selected && (
                  <section className="card">
                    <div className="shop-section-title">
                      <h2>{selected.customer}</h2>
                      <span>{t(selected.status)}</span>
                    </div>
                    <p>
                      {selected.phone} · {selected.email}
                    </p>
                    <p>{selected.address}</p>
                    <p>{selected.notes}</p>
                    {selected.lines.map((l, i) => (
                      <p key={i}>
                        {l.name} × {l.quantity} · {l.total} {selected.currency}
                      </p>
                    ))}
                    <strong>
                      {t("Total")}: {selected.total} {selected.currency}
                    </strong>
                    {selected.saleId && (
                      <p>
                        {t(
                          "A sale is linked. Confirm payments and refunds in Finance.",
                        )}{" "}
                        <Link to="/finance">{t("Finance")}</Link>
                      </p>
                    )}
                    {selected.settlement && (
                      <p>
                        {t("Paid")}: {selected.settlement.paid} ·{" "}
                        {t("Outstanding")}: {selected.settlement.outstanding}
                      </p>
                    )}
                    {canEdit && (
                      <div className="shop-order-actions">
                        {selected.status === "preparing" &&
                          field(
                            "Shipment or collection reference",
                            tracking,
                            setTracking,
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
                {canCreate && (
                  <section className="card">
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
              </>
            )}
            {tab === "connections" && canConnect && (
              <section className="card">
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
