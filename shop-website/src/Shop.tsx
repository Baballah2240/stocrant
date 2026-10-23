import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { ar } from "./language";
type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  image: string;
  images?: string[];
  price: string;
  currency: string;
  available: number;
  category: string;
};
type Settings = {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  logo: string;
  currency: string;
  preview: boolean;
  address: string;
  phone: string;
  contactEmail: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryRegions: string;
  deliveryFee: string;
  shippingPolicy: string;
  returnsPolicy: string;
  privacyPolicy: string;
  terms: string;
  manualPaymentsAccepted: boolean;
};
type Line = { productId: string; quantity: number };
type Quote = {
  lines: {
    productId: string;
    quantity: number;
    name: string;
    price: string;
    total: string;
  }[];
  subtotal: string;
  delivery: string;
  total: string;
  currency: string;
  quoteToken: string;
};
type Receipt = {
  id: string;
  status: string;
  currency: string;
  subtotal: string;
  delivery: string;
  total: string;
  lines: { name: string; quantity: number; price: string; total: string }[];
  method: string;
  tracking: string;
  reservationExpiresAt: string;
  events: { status: string; at: string }[];
};
class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  const data = await res.json();
  if (!res.ok)
    throw new HttpError(data.error || "Shop unavailable", res.status);
  return data;
}
function load<T>(key: string, fallback: T, session = false): T {
  try {
    return (
      JSON.parse(
        (session ? sessionStorage : localStorage).getItem(key) || "null",
      ) ?? fallback
    );
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown, session = false) {
  try {
    (session ? sessionStorage : localStorage).setItem(
      key,
      JSON.stringify(value),
    );
  } catch {
    /* Shopping also works without browser storage. */
  }
}
function receiptSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
const digits = (currency: string) =>
  ["JPY", "KRW"].includes(currency)
    ? 0
    : ["KWD", "BHD", "OMR"].includes(currency)
      ? 3
      : 2;
function units(value: string, currency: string) {
  const [whole, part = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(digits(currency)) +
    BigInt(part.padEnd(digits(currency), "0") || "0")
  );
}
function decimal(value: bigint, currency: string) {
  const d = digits(currency),
    scale = 10n ** BigInt(d);
  return `${value / scale}${d ? "." + (value % scale).toString().padStart(d, "0") : ""}`;
}
function Basket() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="m5 8 1 12h12l1-12H5Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </svg>
  );
}
function Placeholder({ seed = 0 }: { seed?: number }) {
  return (
    <div className={`product-placeholder tone-${seed % 4}`} aria-hidden="true">
      <svg viewBox="0 0 220 220" fill="none">
        <ellipse
          cx="112"
          cy="185"
          rx="52"
          ry="7"
          fill="currentColor"
          opacity=".08"
        />
        <path
          d="M76 78h70l-6 86a15 15 0 0 1-15 14H96a15 15 0 0 1-15-14L76 78Z"
          fill="currentColor"
          opacity=".16"
        />
        <path
          d="M91 80V65a20 20 0 0 1 40 0v15"
          stroke="currentColor"
          strokeWidth="5"
        />
        <path
          d="M105 124c16-30 37-27 37-27s0 27-37 27Zm0 0c-22-24-37-15-37-15s4 24 37 15Z"
          fill="currentColor"
          opacity=".45"
        />
        <path d="M105 124v31" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}
export default function Shop() {
  const [location, setLocation] = useState(
      window.location.pathname + window.location.hash,
    ),
    [slug, setSlug] = useState(
      () => window.location.pathname.match(/^\/shop\/([^/]+)/)?.[1] || "",
    );
  const [shop, setShop] = useState<Settings | null>(null),
    [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [theme, setTheme] = useState(() =>
    load(
      "amal.theme",
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    ),
  );
  const [language, setLanguage] = useState<"en" | "ar">(() =>
      load("amal.language", "en"),
    ),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [sort, setSort] = useState("featured");
  const [cart, setCart] = useState<Line[]>([]),
    [cartReady, setCartReady] = useState(false),
    [quantity, setQuantity] = useState(1),
    [method, setMethod] = useState("pickup"),
    [quote, setQuote] = useState<Quote | null>(null),
    [quoteBusy, setQuoteBusy] = useState(false),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    customer: "",
    email: "",
    phone: "",
    address: "",
    region: "",
    notes: "",
    consent: false,
    website: "",
  });
  const [order, setOrder] = useState<Receipt | null>(null),
    [refreshQuote, setRefreshQuote] = useState(0),
    [refreshReceipt, setRefreshReceipt] = useState(0);
  const pending = useRef<{
    requestId: string;
    receiptSecret: string;
    body?: Record<string, unknown>;
  } | null>(null);
  const t = (text: string) => (language === "ar" ? ar[text] || text : text);
  const base =
      window.location.pathname.startsWith("/shop/") && slug
        ? `/shop/${slug}`
        : "",
    path = location.split("#")[0].slice(base.length).replace(/\/$/, "") || "/",
    apiBase = `/api/storefront/${slug}`;
  function navigate(target: string) {
    history.pushState(null, "", base + target);
    setLocation(window.location.pathname + window.location.hash);
    setError("");
    setNotice("");
    setQuantity(1);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (target.endsWith("#collection"))
      requestAnimationFrame(() =>
        document
          .getElementById("collection")
          ?.scrollIntoView({ behavior: "smooth" }),
      );
  }
  useEffect(() => {
    const pop = () => {
      setLocation(window.location.pathname + window.location.hash);
      setError("");
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!slug)
      api<{ slug: string }>("/api/storefront/resolve")
        .then((r) => setSlug(r.slug))
        .catch(() => {
          setError("This shop is not published yet. Please check back soon.");
          setLoading(false);
        });
  }, [slug]);
  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    api<{ shop: Settings; products: Product[] }>(apiBase + "/catalog")
      .then((r) => {
        if (!active) return;
        setShop(r.shop);
        setProducts(r.products);
        setMethod(r.shop.pickupEnabled ? "pickup" : "delivery");
        const stored = load<unknown>(`amal.cart.${slug}`, []);
        setCart(
          Array.isArray(stored)
            ? stored
                .filter(
                  (l): l is Line =>
                    l &&
                    typeof l.productId === "string" &&
                    Number.isInteger(l.quantity) &&
                    l.quantity > 0 &&
                    l.quantity <= 99,
                )
                .slice(0, 50)
            : [],
        );
        setCartReady(true);
        pending.current = load(`amal.pending.${slug}`, null, true);
        document.title = `${r.shop.name} — ${r.shop.tagline}`;
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, apiBase]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save("amal.theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    save("amal.language", language);
  }, [language]);
  useEffect(() => {
    if (cartReady) save(`amal.cart.${slug}`, cart);
  }, [cart, cartReady, slug]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (path !== "/checkout" || !shop || shop.preview || !cart.length) return;
    const controller = new AbortController();
    setQuoteBusy(true);
    setQuote(null);
    api<Quote>(apiBase + "/quote", { lines: cart, method }, controller.signal)
      .then(setQuote)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteBusy(false);
      });
    return () => controller.abort();
  }, [path, apiBase, cart, method, refreshQuote, shop]);
  useEffect(() => {
    if (!path.startsWith("/order/") || !slug) return;
    const token = location.split("#")[1];
    setOrder(null);
    if (!/^[a-f0-9]{64}$/.test(token || "")) {
      setError("Use your private tracking link to open this order.");
      return;
    }
    let active = true;
    setBusy(true);
    api<{ order: Receipt }>(apiBase + "/receipt", {
      orderId: path.split("/")[2],
      receiptSecret: token,
    })
      .then((r) => {
        if (active) setOrder(r.order);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [path, location, slug, apiBase, refreshReceipt]);
  const count = cart.reduce((n, l) => n + l.quantity, 0),
    visible = products
      .filter(
        (p) =>
          (category === "All" || p.category === category) &&
          `${p.name} ${p.sku} ${p.description}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : sort === "low"
            ? Number(a.price) - Number(b.price)
            : sort === "high"
              ? Number(b.price) - Number(a.price)
              : 0,
      );
  const invalidCart = cart.some(
    (l) =>
      !products.some((p) => p.id === l.productId && p.available >= l.quantity),
  );
  const estimated = shop
    ? decimal(
        cart.reduce((n, l) => {
          const p = products.find((p) => p.id === l.productId);
          return (
            n + (p ? units(p.price, shop.currency) * BigInt(l.quantity) : 0n)
          );
        }, 0n),
        shop.currency,
      )
    : "0";
  function updateCart(id: string, q: number) {
    setCart((lines) =>
      q <= 0
        ? lines.filter((l) => l.productId !== id)
        : lines.some((l) => l.productId === id)
          ? lines.map((l) =>
              l.productId === id ? { ...l, quantity: Math.min(99, q) } : l,
            )
          : [...lines, { productId: id, quantity: Math.min(99, q) }],
    );
    setQuote(null);
  }
  function add(p: Product, q = 1) {
    const next = (cart.find((l) => l.productId === p.id)?.quantity || 0) + q;
    if (next > p.available || next > 99) {
      setNotice("Only a few left");
      return;
    }
    updateCart(p.id, next);
    setNotice("Added to your bag");
  }
  function link(target: string, label: ReactNode, className = "") {
    return (
      <a
        href={base + target}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          navigate(target);
        }}
      >
        {label}
      </a>
    );
  }
  function moneyLabel(value: string) {
    const currency =
      path.startsWith("/order/") && order
        ? order.currency
        : path === "/checkout" && quote
          ? quote.currency
          : shop?.currency;
    return (
      <span className="amount" dir="ltr">
        {value} <small>{currency}</small>
      </span>
    );
  }
  function clearPending() {
    pending.current = null;
    save(`amal.pending.${slug}`, null, true);
  }
  function confirm(order: Receipt, token: string) {
    setCart([]);
    clearPending();
    navigate(`/order/${order.id}#${token}`);
  }
  async function recover() {
    if (!pending.current) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ order: Receipt }>(apiBase + "/receipt", {
        requestId: pending.current.requestId,
        receiptSecret: pending.current.receiptSecret,
      });
      confirm(r.order, pending.current.receiptSecret);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (!quote || busy || !form.consent || shop?.preview) return;
    setBusy(true);
    setError("");
    const attempt = pending.current || {
      requestId: crypto.randomUUID(),
      receiptSecret: receiptSecret(),
    };
    if (attempt.body) {
      const {
        requestId: _id,
        receiptSecret: _secret,
        quoteToken: _quote,
        ...original
      } = attempt.body;
      if (
        JSON.stringify(original) !==
        JSON.stringify({ ...form, lines: cart, method })
      ) {
        try {
          const recovered = await api<{ order: Receipt }>(
            apiBase + "/receipt",
            {
              requestId: attempt.requestId,
              receiptSecret: attempt.receiptSecret,
            },
          );
          confirm(recovered.order, attempt.receiptSecret);
        } catch (e) {
          if (e instanceof HttpError && e.status === 404) {
            clearPending();
            setError(
              "Review your updated total before placing the order again.",
            );
            setRefreshQuote((v) => v + 1);
          } else
            setError(
              "We could not confirm the result. Retry with the same checkout to avoid duplicate orders.",
            );
        } finally {
          setBusy(false);
        }
        return;
      }
    }
    const body = attempt.body || {
      ...form,
      requestId: attempt.requestId,
      receiptSecret: attempt.receiptSecret,
      quoteToken: quote.quoteToken,
      lines: cart,
      method,
    };
    pending.current = { ...attempt, body };
    save(
      `amal.pending.${slug}`,
      { requestId: attempt.requestId, receiptSecret: attempt.receiptSecret },
      true,
    );
    try {
      const result = await api<{ order: Receipt }>(apiBase + "/checkout", body);
      confirm(result.order, attempt.receiptSecret);
    } catch (e) {
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) {
        try {
          const recovered = await api<{ order: Receipt }>(
            apiBase + "/receipt",
            {
              requestId: attempt.requestId,
              receiptSecret: attempt.receiptSecret,
            },
          );
          confirm(recovered.order, attempt.receiptSecret);
          return;
        } catch (recovery) {
          if (!(recovery instanceof HttpError) || recovery.status !== 404) {
            setError(
              "We could not confirm the result. Retry with the same checkout to avoid duplicate orders.",
            );
            return;
          }
        }
        clearPending();
        setError(
          e.status === 409
            ? "Review your updated total before placing the order again."
            : e.message,
        );
        setRefreshQuote((v) => v + 1);
      } else
        setError(
          "We could not confirm the result. Retry with the same checkout to avoid duplicate orders.",
        );
    } finally {
      setBusy(false);
    }
  }
  function input(
    label: string,
    name: "customer" | "email" | "phone" | "address" | "notes",
    type = "text",
    required = true,
  ) {
    return (
      <label className="field">
        <span>{t(label)}</span>
        <input
          name={name}
          type={type}
          required={required}
          autoComplete={
            name === "customer"
              ? "name"
              : name === "phone"
                ? "tel"
                : name === "address"
                  ? "street-address"
                  : name === "email"
                    ? "email"
                    : "off"
          }
          value={form[name]}
          maxLength={name === "notes" ? 1000 : 180}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        />
      </label>
    );
  }
  if (loading)
    return (
      <main className="shop-message">
        <span className="wordmark">
          Amal<span>•</span>
        </span>
        <p role="status">{t("Loading the shop…")}</p>
      </main>
    );
  if (!shop)
    return (
      <main className="shop-message">
        <span className="wordmark">
          Amal<span>•</span>
        </span>
        <h1>{t("Shop unavailable")}</h1>
        <p>
          {t(
            error || "This shop is not published yet. Please check back soon.",
          )}
        </p>
        <button onClick={() => window.location.reload()}>
          {t("Try again")}
        </button>
      </main>
    );
  const product = path.startsWith("/product/")
    ? products.find((p) => p.id === path.split("/")[2])
    : null;
  return (
    <div className="amal">
      <a className="skip" href="#content">
        {t("Skip to content")}
      </a>
      <div className="announcement">
        {shop.preview
          ? t("Preview only. Checkout is disabled until the shop is published.")
          : shop.tagline}
      </div>
      <header className="shop-header">
        {link(
          "/",
          <>
            {shop.logo && <img src={shop.logo} alt="" />}
            {shop.name}
            <span>•</span>
          </>,
          "wordmark",
        )}
        <nav aria-label={t("Collection")}>
          {link("/#collection", t("Collection"))}
          {link("/about", t("About"))}
          {link("/contact", t("Contact"))}
        </nav>
        <div className="header-actions">
          <button
            className="language"
            aria-label={t("Switch theme")}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              {theme === "light" ? (
                <path d="M20 14a8 8 0 0 1-10-10A8 8 0 1 0 20 14Z" />
              ) : (
                <>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
                </>
              )}
            </svg>
          </button>
          <button
            className="language"
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            aria-label={t("Change language")}
          >
            {language === "en" ? "العربية" : "English"}
          </button>
          {link(
            "/bag",
            <>
              <Basket />
              <span className="bag-label">{t("Bag")}</span>
              <span className="bag-count">{count}</span>
            </>,
            "bag-link",
          )}
        </div>
      </header>
      <div className="product-focus-veil" aria-hidden="true" />
      <main id="content">
        {error && (
          <div className="error-banner" role="alert">
            {t(error)}
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            {t(notice)}
          </div>
        )}
        {path === "/" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">
                  {t("Thoughtfully chosen")} / {shop.name}
                </p>
                <h1>
                  {t("A little more care.")}
                  <br />
                  <em>{t("In everything you choose.")}</em>
                </h1>
                <p>{shop.description}</p>
                <a className="primary" href="#collection">
                  {t("Shop the collection")} <span aria-hidden="true">↗</span>
                </a>
                <div className="hero-note">
                  <span>01 /</span>
                  <p>{t("Choose your next everyday favourite.")}</p>
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="art-disc" />
                <svg viewBox="0 0 420 460" fill="none">
                  <ellipse
                    cx="214"
                    cy="388"
                    rx="124"
                    ry="18"
                    fill="#244c40"
                    opacity=".09"
                  />
                  <path
                    d="M138 183h159l-17 166a26 26 0 0 1-26 24h-77a26 26 0 0 1-26-24l-13-166Z"
                    fill="#d1a76e"
                  />
                  <path
                    d="M170 184v-42a46 46 0 0 1 92 0v42"
                    stroke="#254b3f"
                    strokeWidth="11"
                  />
                  <path
                    d="M210 280c44-97 119-96 119-96s-6 92-119 96Z"
                    fill="#46684d"
                  />
                  <path
                    d="M212 277c-57-83-123-64-123-64s23 82 123 64Z"
                    fill="#76917a"
                  />
                  <path d="M211 277v57" stroke="#244c40" strokeWidth="4" />
                  <circle cx="313" cy="127" r="14" fill="#e5bd82" />
                </svg>
                <span className="art-caption">
                  {shop.name}
                  <small>{t("Built for your everyday.")}</small>
                </span>
              </div>
            </section>
            <section id="collection" className="collection">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{t("Explore the collection")}</p>
                  <h2>{t("Find your everyday favourites.")}</h2>
                </div>
                <span>
                  {products.length.toString().padStart(2, "0")} /{" "}
                  {t("Collection")}
                </span>
              </div>
              <div className="catalog-tools">
                <label className="search">
                  <span className="sr-only">{t("Search products")}</span>
                  <input
                    type="search"
                    placeholder={t("Search products")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span aria-hidden="true">⌕</span>
                </label>
                <div className="categories" aria-label={t("Collection")}>
                  {["All", ...new Set(products.map((p) => p.category))].map(
                    (c) => (
                      <button
                        key={c}
                        aria-pressed={category === c}
                        onClick={() => setCategory(c)}
                      >
                        {t(c)}
                      </button>
                    ),
                  )}
                </div>
                <label className="sort">
                  <span className="sr-only">{t("Sort by")}</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="featured">{t("Featured")}</option>
                    <option value="low">{t("Price: low to high")}</option>
                    <option value="high">{t("Price: high to low")}</option>
                    <option value="name">{t("Name")}</option>
                  </select>
                </label>
              </div>
              <div className="product-grid">
                {visible.map((p, i) => (
                  <article className="product-card" key={p.id} data-product-id={p.id}>
                    <a
                      href={base + `/product/${p.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/product/${p.id}`);
                      }}
                      className="product-image"
                      aria-label={`${t("View product")}: ${p.name}`}
                    >
                      {p.image ? (
                        <img src={p.image} alt={p.name} loading="lazy" />
                      ) : (
                        <Placeholder seed={i} />
                      )}
                      <span className="product-tag">
                        {p.available ? t(p.category) : t("Sold out")}
                      </span>
                      <span className="product-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </a>
                    <div className="product-caption">
                      <div>
                        <h3>{link(`/product/${p.id}`, p.name)}</h3>
                        {moneyLabel(p.price)}
                      </div>
                      <button
                        className="add-circle"
                        aria-label={`${t("Add to bag")}: ${p.name}`}
                        disabled={!p.available}
                        onClick={() => add(p)}
                      >
                        +
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!visible.length && (
                <div className="empty-state">
                  <h3>{t("No products found.")}</h3>
                  <p>
                    {t("Try another search or return soon for new arrivals.")}
                  </p>
                </div>
              )}
            </section>
            <section className="shop-story">
              <p className="eyebrow">
                {shop.name} / {t("Our story")}
              </p>
              <h2>{t("Built for your everyday.")}</h2>
              <p>{shop.description}</p>
              {link("/about", t("About") + " ↗")}
            </section>
          </>
        ) : product ? (
          <section className="product-detail">
            <ProductGallery key={product.id} product={product} t={t} />
            <div className="detail-copy">
              {link("/", "← " + t("Back to collection"), "text-link")}
              <p className="eyebrow">
                {product.sku} / {t(product.category)}
              </p>
              <h1>{product.name}</h1>
              <p className="detail-price">{moneyLabel(product.price)}</p>
              <p>{product.description}</p>
              <p className="stock">
                ●{" "}
                {product.available
                  ? `${product.available} ${t("Available")}`
                  : t("Sold out")}
              </p>
              <label className="field">
                <span>{t("Quantity")}</span>
                <input
                  aria-label={t("Quantity")}
                  type="number"
                  min="1"
                  max={Math.min(99, product.available)}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.max(1, Math.min(99, Number(e.target.value) || 1)),
                    )
                  }
                />
              </label>
              <button
                className="primary"
                disabled={!product.available || quantity > product.available}
                onClick={() => add(product, quantity)}
              >
                {t("Add to bag")} <span>+</span>
              </button>
              <p className="fineprint">
                {t("No online payment is collected.")}
              </p>
              <details>
                <summary>{t("Shipping")}</summary>
                <p>
                  {shop.shippingPolicy ||
                    t("Policy information is not available yet.")}
                </p>
              </details>
              <details>
                <summary>{t("Returns")}</summary>
                <p>
                  {shop.returnsPolicy ||
                    t("Policy information is not available yet.")}
                </p>
              </details>
            </div>
          </section>
        ) : path === "/bag" ? (
          <section className="shopping-page">
            <p className="eyebrow">
              {t("Your bag")} / {count}
            </p>
            <h1>{t("A few good choices.")}</h1>
            {!cart.length ? (
              <div className="empty-state">
                <Basket />
                <h2>{t("Your bag is empty.")}</h2>
                {link("/", t("Continue shopping"), "primary")}
              </div>
            ) : (
              <div className="checkout-grid">
                <div className="bag-lines">
                  {cart.map((l, i) => {
                    const p = products.find((p) => p.id === l.productId);
                    return (
                      <article className="bag-row" key={l.productId}>
                        <div className="bag-image">
                          {p?.image ? (
                            <img src={p.image} alt="" />
                          ) : (
                            <Placeholder seed={i} />
                          )}
                        </div>
                        <div>
                          <h2>{p?.name || t("Unavailable item")}</h2>
                          {p && moneyLabel(p.price)}
                          <label className="field">
                            <span>{t("Quantity")}</span>
                            <input
                              aria-label={`${t("Quantity")}: ${p?.name || ""}`}
                              type="number"
                              min="1"
                              max={Math.min(99, p?.available || 99)}
                              value={l.quantity}
                              onChange={(e) =>
                                updateCart(
                                  l.productId,
                                  Math.max(1, Number(e.target.value) || 1),
                                )
                              }
                            />
                          </label>
                          {(!p || l.quantity > p.available) && (
                            <p className="error">
                              {t("Update your bag before checkout.")}
                            </p>
                          )}
                          <button
                            className="text-link"
                            onClick={() => updateCart(l.productId, 0)}
                          >
                            {t("Remove")}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <aside className="order-summary">
                  <h2>{t("Order summary")}</h2>
                  <dl>
                    <div>
                      <dt>{t("Subtotal")}</dt>
                      <dd>{moneyLabel(estimated)}</dd>
                    </div>
                    <div>
                      <dt>{t("Delivery")}</dt>
                      <dd>{t("Calculated at checkout")}</dd>
                    </div>
                  </dl>
                  {invalidCart ? (
                    <p role="alert">
                      {t(
                        "Remove unavailable items or reduce quantities to continue.",
                      )}
                    </p>
                  ) : shop.preview ? (
                    <p>
                      {t(
                        "Preview only. Checkout is disabled until the shop is published.",
                      )}
                    </p>
                  ) : (
                    link("/checkout", t("Checkout") + " ↗", "primary")
                  )}
                  <p className="fineprint">
                    {t("No online payment is collected.")}
                  </p>
                  {link("/", t("Continue shopping"), "text-link")}
                </aside>
              </div>
            )}
          </section>
        ) : path === "/checkout" ? (
          <section className="shopping-page">
            <p className="eyebrow">{t("Checkout")}</p>
            <h1>{t("Your details. Your next step.")}</h1>
            {!cart.length || shop.preview ? (
              <div className="empty-state">
                <p>
                  {t(
                    shop.preview
                      ? "Preview only. Checkout is disabled until the shop is published."
                      : "Your bag is empty.",
                  )}
                </p>
                {link("/", t("Continue shopping"), "primary")}
              </div>
            ) : (
              <form className="checkout-grid" onSubmit={checkout}>
                <fieldset className="checkout-fields" disabled={busy}>
                  {pending.current && (
                    <div className="pending-checkout">
                      <p>{t("Previous checkout")}</p>
                      <button type="button" onClick={() => void recover()}>
                        {t("Check previous order")}
                      </button>
                    </div>
                  )}
                  <h2>{t("How would you like your order?")}</h2>
                  <div className="delivery-options">
                    {shop.pickupEnabled && (
                      <label>
                        <input
                          type="radio"
                          name="method"
                          checked={method === "pickup"}
                          onChange={() => setMethod("pickup")}
                        />
                        <span>
                          {t("Collect from the shop")}
                          <small>{shop.address}</small>
                        </span>
                      </label>
                    )}
                    {shop.deliveryEnabled && (
                      <label>
                        <input
                          type="radio"
                          name="method"
                          checked={method === "delivery"}
                          onChange={() => setMethod("delivery")}
                        />
                        <span>
                          {t("Delivery")}
                          <small>{moneyLabel(shop.deliveryFee)}</small>
                        </span>
                      </label>
                    )}
                  </div>
                  {input("Customer name", "customer")}
                  {input("Email (optional)", "email", "email", false)}
                  {input("Mobile number", "phone", "tel")}
                  {method === "delivery" && (
                    <>
                      {input("Delivery address", "address")}
                      <label className="field">
                        <span>{t("Delivery region")}</span>
                        <select
                          required
                          value={form.region}
                          onChange={(e) =>
                            setForm({ ...form, region: e.target.value })
                          }
                        >
                          <option value="">{t("Choose a region")}</option>
                          {shop.deliveryRegions
                            .split(",")
                            .map((r) => r.trim())
                            .filter(Boolean)
                            .map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                        </select>
                      </label>
                    </>
                  )}
                  {input("Order notes (optional)", "notes", "text", false)}
                  <div className="honeypot" aria-hidden="true">
                    <label>
                      Website
                      <input
                        tabIndex={-1}
                        autoComplete="off"
                        value={form.website}
                        onChange={(e) =>
                          setForm({ ...form, website: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="consent">
                    <input
                      type="checkbox"
                      required
                      checked={form.consent}
                      onChange={(e) =>
                        setForm({ ...form, consent: e.target.checked })
                      }
                    />
                    <span>
                      {t("I agree to the terms and privacy policy.")}{" "}
                      {link("/policies/terms", t("Terms"))} ·{" "}
                      {link("/policies/privacy", t("Privacy"))}
                    </span>
                  </label>
                </fieldset>
                <aside className="order-summary">
                  <h2>{t("Order summary")}</h2>
                  {quote ? (
                    <>
                      <div className="summary-products">
                        {quote.lines.map((l) => (
                          <p key={l.productId}>
                            <span>
                              {l.name} × {l.quantity}
                            </span>
                            {moneyLabel(l.total)}
                          </p>
                        ))}
                      </div>
                      <dl>
                        <div>
                          <dt>{t("Subtotal")}</dt>
                          <dd>{moneyLabel(quote.subtotal)}</dd>
                        </div>
                        <div>
                          <dt>{t("Delivery")}</dt>
                          <dd>{moneyLabel(quote.delivery)}</dd>
                        </div>
                        <div className="summary-total">
                          <dt>{t("Total")}</dt>
                          <dd>{moneyLabel(quote.total)}</dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <p role="status">{t("Reviewing availability…")}</p>
                  )}
                  <p className="payment-method">
                    ◌{" "}
                    {t(
                      method === "pickup"
                        ? "Pay on collection"
                        : "Pay on delivery",
                    )}
                  </p>
                  <button
                    type="submit"
                    className="primary"
                    disabled={busy || quoteBusy || !quote || !form.consent}
                  >
                    {t(busy ? "Placing your order…" : "Place order")} ↗
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setRefreshQuote((v) => v + 1);
                    }}
                  >
                    {t("Refresh total")}
                  </button>
                  <p className="fineprint">
                    {t("No online payment is collected.")}{" "}
                    {t("Tax and delivery details follow the shop policies.")}
                  </p>
                  {link("/bag", t("Your bag"), "text-link")}
                </aside>
              </form>
            )}
          </section>
        ) : path.startsWith("/order/") ? (
          <section className="receipt-page">
            <p className="eyebrow">
              {t("Order reference")} / {order?.id.slice(0, 8) || "…"}
            </p>
            <h1>{t(order ? "Order received." : "Order tracking")}</h1>
            <p>{t("A little closer to your door.")}</p>
            {busy && <p role="status">{t("Reviewing availability…")}</p>}
            {order && (
              <>
                <div className="receipt-top">
                  <div>
                    <p>{t("Keep this private link to follow your order.")}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard
                          .writeText(window.location.href)
                          .then(() => setNotice("Link copied"))
                          .catch(() =>
                            setNotice(
                              "Keep this private link to follow your order.",
                            ),
                          );
                      }}
                    >
                      {t("Copy tracking link")}
                    </button>
                    <button
                      onClick={() => {
                        setError("");
                        setRefreshReceipt((v) => v + 1);
                      }}
                    >
                      {t("Refresh status")}
                    </button>
                  </div>
                  <strong className="status-badge">{t(order.status)}</strong>
                </div>
                <ol className="order-journey" aria-label={t("Order journey")}>
                  {order.events.map((e, i) => (
                    <li key={i}>
                      <span className="journey-dot" />
                      <div>
                        <strong>{t(e.status)}</strong>
                        <small>
                          {new Date(e.at).toLocaleString(
                            language === "ar" ? "ar" : "en",
                          )}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="order-summary receipt-summary">
                  {order.lines.map((l, i) => (
                    <p key={i}>
                      <span>
                        {l.name} × {l.quantity}
                      </span>
                      {moneyLabel(l.total)}
                    </p>
                  ))}
                  <dl>
                    <div>
                      <dt>{t("Delivery")}</dt>
                      <dd>{moneyLabel(order.delivery)}</dd>
                    </div>
                    <div className="summary-total">
                      <dt>{t("Total")}</dt>
                      <dd>{moneyLabel(order.total)}</dd>
                    </div>
                  </dl>
                  <p>
                    {t(
                      order.method === "pickup"
                        ? "Pay on collection"
                        : "Pay on delivery",
                    )}
                  </p>
                  <p className="fineprint">
                    {t(
                      "No payment was collected online. Arrange payment with the shop.",
                    )}
                  </p>
                </div>
                {order.tracking && (
                  <p>
                    {t("Shipment reference")}: {order.tracking}
                  </p>
                )}
                {order.status === "reserved" && (
                  <p>
                    {t("Reservation held until")}:{" "}
                    {new Date(order.reservationExpiresAt).toLocaleString(
                      language === "ar" ? "ar" : "en",
                    )}
                  </p>
                )}
                <p>
                  {t(
                    "The shop will confirm preparation and contact you if needed.",
                  )}
                </p>
                {link("/contact", t("Contact"), "text-link")}
              </>
            )}
          </section>
        ) : path === "/about" ? (
          <section className="text-page">
            <p className="eyebrow">
              {shop.name} / {t("Our story")}
            </p>
            <h1>{t("Built for your everyday.")}</h1>
            <p>{shop.description}</p>
            <div className="story-illustration">
              <Placeholder />
            </div>
            {link("/", t("Browse products"), "primary")}
          </section>
        ) : path === "/contact" ? (
          <section className="text-page">
            <p className="eyebrow">{t("Contact")}</p>
            <h1>{t("Good things start with a conversation.")}</h1>
            <div className="contact-grid">
              {shop.contactEmail && (
                <article>
                  <h2>{t("Email")}</h2>
                  <a href={`mailto:${shop.contactEmail}`}>
                    {shop.contactEmail}
                  </a>
                </article>
              )}
              {shop.phone && (
                <article>
                  <h2>{t("Phone")}</h2>
                  <a
                    href={`tel:${shop.phone.replace(/[^+\d]/g, "")}`}
                    dir="ltr"
                  >
                    {shop.phone}
                  </a>
                </article>
              )}
              <article>
                <h2>{t("Visit or collect")}</h2>
                <p>{shop.address}</p>
              </article>
            </div>
          </section>
        ) : path.startsWith("/policies/") ? (
          <section className="text-page policy-page">
            <p className="eyebrow">
              {shop.name} / {t("Our policies")}
            </p>
            <h1>
              {t(
                (
                  {
                    shipping: "Shipping",
                    returns: "Returns",
                    privacy: "Privacy",
                    terms: "Terms",
                  } as Record<string, string>
                )[path.split("/")[2]] || "Page not found",
              )}
            </h1>
            <p>
              {(
                {
                  shipping: shop.shippingPolicy,
                  returns: shop.returnsPolicy,
                  privacy: shop.privacyPolicy,
                  terms: shop.terms,
                } as Record<string, string>
              )[path.split("/")[2]] ||
                t("Policy information is not available yet.")}
            </p>
          </section>
        ) : (
          <section className="empty-state">
            <h1>{t("Page not found")}</h1>
            {link("/", t("Continue shopping"), "primary")}
          </section>
        )}
      </main>
      <footer className="shop-footer">
        <div>
          <span className="wordmark">
            {shop.name}
            <span>•</span>
          </span>
          <p>{shop.tagline}</p>
          <small>{t("Powered by STOCRANT")}</small>
        </div>
        <div>
          <p className="eyebrow">{t("Collection")}</p>
          {link("/", t("Browse products"))}
          {link("/about", t("About"))}
          {link("/contact", t("Contact"))}
        </div>
        <div>
          <p className="eyebrow">{t("Our policies")}</p>
          {["shipping", "returns", "privacy", "terms"].map((p, i) => (
            <span key={p}>
              {link(
                `/policies/${p}`,
                t(["Shipping", "Returns", "Privacy", "Terms"][i]),
              )}
            </span>
          ))}
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {shop.name}
          </span>
          <span>{t("Thoughtfully chosen")} ↗</span>
        </div>
      </footer>
    </div>
  );
}

function ProductGallery({ product, t }: { product: Product; t: (text: string) => string }) {
  const [active, setActive] = useState(0);
  const photos = product.images?.length ? product.images : product.image ? [product.image] : [];
  return <div className="detail-gallery"><div className="detail-image">{photos.length ? <img src={photos[active] || photos[0]} alt={product.name} /> : <Placeholder />}</div>{photos.length > 1 && <div className="product-thumbnails" aria-label={t("Product photos")}>{photos.map((src, index) => <button type="button" key={src} aria-label={t("View photo") + " " + (index + 1)} aria-pressed={index === active} onClick={() => setActive(index)}><img src={src} alt="" loading="lazy" /></button>)}</div>}</div>;
}
