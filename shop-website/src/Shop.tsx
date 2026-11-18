import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
  type CSSProperties,
} from "react";
import { ar } from "./language";
import ShopSupport from "./ShopSupport";
import { defaultMerchandising, type Merchandising } from "../../src/storefront-merchandising";
type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  image: string;
  images?: string[];
  warranty?: boolean;
  warrantyDetails?: string;
  originalPrice?: string;
  offerId?: string;
  offerTitle?: string;
  offerPercent?: number;
  price: string;
  currency: string;
  available: number;
  category: string;
};
type Branding = { template: string; primaryColor: string; accentColor: string; font: string; banner: string; heroTitle: string; heroSubtitle: string; aboutTitle: string; aboutImage: string; whatsapp: string; instagram: string; facebook: string; tiktok: string; faq: { question: string; answer: string }[]; seoTitle: string; seoDescription: string; customDomain: string };
const defaultBranding: Branding = { template: "classic", primaryColor: "#244c40", accentColor: "#b78d52", font: "serif", banner: "", heroTitle: "", heroSubtitle: "", aboutTitle: "", aboutImage: "", whatsapp: "", instagram: "", facebook: "", tiktok: "", faq: [], seoTitle: "", seoDescription: "", customDomain: "" };
/** Readable text colour on a brand colour. */
const onColor = (hex: string) => { const n = parseInt(hex.slice(1), 16), l = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? "#14221d" : "#fffdf5"; };
type Settings = {
  alerts?: { customerChannel: "none" | "sms" | "whatsapp" };
  payments?: { cashEnabled: boolean; transferEnabled: boolean };
  branding?: Branding;
  merchandising?: Merchandising;
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
  orderNumber?:string;
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
  transfer?: { method: string; status?: string; note?: string; proofs?: number; canUpload?: boolean; accounts?: { label: string; accountName: string; accountNumber: string; instructions: string }[] };
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
    [sort, setSort] = useState("featured"), [onlyOffers, setOnlyOffers] = useState(false), [offerFilter, setOfferFilter] = useState(""), [refreshAt, setRefreshAt] = useState(0);
  const [cart, setCart] = useState<Line[]>([]),
    [cartReady, setCartReady] = useState(false),
    [quantity, setQuantity] = useState(1),
    [method, setMethod] = useState("pickup"),
    [payment, setPayment] = useState<"cash" | "transfer">("cash"),
    [quote, setQuote] = useState<Quote | null>(null),
    [quoteBusy, setQuoteBusy] = useState(false),
    [busy, setBusy] = useState(false);
  const [bagAdded, setBagAdded] = useState(0);
  const [floatingBag,setFloatingBag] = useState(false);
  const bagAnchorRef = useRef<HTMLSpanElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => setFloatingBag(Boolean(bagAnchorRef.current && bagAnchorRef.current.getBoundingClientRect().top < 16));
    update();
    window.addEventListener("scroll",update,{passive:true});
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => { observer.disconnect(); window.removeEventListener("scroll",update); };
  }, [loading, shop]);
  const [liked, setLiked] = useState<string[]>([]), [likesShop, setLikesShop] = useState(""), [onlyLiked, setOnlyLiked] = useState(false);
  useEffect(() => {
    if (!slug) return;
    const saved = load<unknown>(`amal.likes.${slug}`, []);
    setLiked(Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 180))].slice(0,1000) : []);
    setLikesShop(slug); setOnlyLiked(false);
  }, [slug]);
  useEffect(() => { if (slug && likesShop === slug) save(`amal.likes.${slug}`, liked); }, [slug, likesShop, liked]);
  const [form, setForm] = useState({
    customer: "",
    email: "",
    phone: "",
    address: "",
    region: "",
    notes: "",
    consent: false,
    updates: false,
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
    api<{ shop: Settings; products: Product[]; refreshAt?: number }>(apiBase + "/catalog")
      .then((r) => {
        if (!active) return;
        setShop(r.shop);
        setProducts(r.products);
        setSort(r.shop.merchandising?.display.defaultSort || "featured");
        setRefreshAt(r.refreshAt || Date.now() + 60000);
        setMethod(r.shop.pickupEnabled ? "pickup" : "delivery");
        setPayment(r.shop.payments && !r.shop.payments.cashEnabled ? "transfer" : "cash");
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
    if (!shop || !refreshAt) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void api<{shop: Settings; products: Product[]; refreshAt: number}>(apiBase + "/catalog").then(r => {
        if (active) { setShop(r.shop); setProducts(r.products); setRefreshAt(r.refreshAt); }
      }).catch(() => { if (active) setRefreshAt(Date.now() + 15000); });
    }, Math.max(100, Math.min(60000, refreshAt - Date.now() + 30)));
    return () => { active = false; window.clearTimeout(timer); };
  }, [apiBase, refreshAt, shop?.slug]);
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
  const merchandising = shop?.merchandising || defaultMerchandising;
  const brand = { ...defaultBranding, ...(shop?.branding || {}) };
  const brandStyle = theme === "dark" ? undefined : ({ "--green": brand.primaryColor, "--on-green": onColor(brand.primaryColor), "--accent": brand.accentColor } as CSSProperties);
  const whatsappLink = brand.whatsapp ? `https://wa.me/${brand.whatsapp.replace(/[^0-9]/g, "")}` : "";
  const socials = ([["WhatsApp", whatsappLink], ["Instagram", brand.instagram], ["Facebook", brand.facebook], ["TikTok", brand.tiktok]] as const).filter(([, href]) => href);
  const productRank = (id:string) => {const order=merchandising.display.productOrder||[];return order.includes(id)?order.indexOf(id):order.length;};
  const categoryTitle = (key: string) => merchandising.categories.find(c => c.name === key)?.title || t(key);
  const categoryOptions = [ ...merchandising.categories.filter(c => products.some(p => p.category === c.name)).map(c => c.name), ...[...new Set(products.map(p => p.category))].filter(name => !merchandising.categories.some(c => c.name === name)) ];
  const normalizeSearch = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "").toLocaleLowerCase().trim();
  const terms = normalizeSearch(merchandising.display.showSearch ? search : "").split(/\s+/).filter(Boolean);
  const count = cart.reduce((n, l) => n + l.quantity, 0),
    visible = products.filter(p => (!onlyLiked || liked.includes(p.id)) && (!merchandising.display.showCategories || category === "All" || p.category === category) && (!onlyOffers || Boolean(p.offerId)) && (!offerFilter || p.offerId === offerFilter) && terms.every(term => normalizeSearch(`${p.name} ${p.sku} ${p.description} ${p.category} ${categoryTitle(p.category)} ${p.offerTitle || ""}`).includes(term))).sort((a,b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "low" ? Number(a.price)-Number(b.price) : sort === "high" ? Number(b.price)-Number(a.price) : productRank(a.id)-productRank(b.id));
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
    setBagAdded(value => value + 1);
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
      payment,
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
  const relatedProducts = product
    ? products.filter(p => p.id !== product.id)
        .sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category))
        .slice(0, 4)
    : [];
  function priceLabel(p: Product) { return <span className="store-price">{p.originalPrice && <del>{moneyLabel(p.originalPrice)}</del>}<span>{moneyLabel(p.price)}</span>{p.offerTitle && <small>{p.offerTitle}</small>}</span>; }
  function likeButton(p: Product, detail = false) { const selected = liked.includes(p.id); return <button type="button" className={detail ? "product-like-detail" : "product-like"} aria-label={t(selected ? "Unlike product" : "Like product") + ": " + p.name} aria-pressed={selected} title={t(selected ? "Unlike product" : "Like product")} disabled={likesShop !== slug} onClick={() => setLiked(current => current.includes(p.id) ? current.filter(id => id !== p.id) : [...current,p.id].slice(-1000))}><Heart filled={selected} />{detail && <span>{t(selected ? "Liked" : "Like")}</span>}</button>; }
  function renderProduct(p: Product, i: number) { return (<article className="product-card" data-motion={merchandising.display.productMotion?.find(row=>row.productId===p.id)?.motion} key={p.id} data-product-id={p.id}>
                    {likeButton(p)}
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
                        {p.available ? categoryTitle(p.category) : t("Sold out")}
                      </span>
                      {p.offerId && <span className="offer-product-tag">{p.offerPercent}% {t("off")}</span>}
                      <span className="product-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </a>
                    <div className="product-caption">
                      <div>
                        <h3>{link(`/product/${p.id}`, p.name)}</h3>
                        {priceLabel(p)}
                        {p.warranty && <WarrantyBadge details={p.warrantyDetails} t={t} />}
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
                  </article>); }
  function sectionProducts(section: Merchandising["sections"][number]) { const selected = products.filter(p => section.source === "all" || section.source === "category" && p.category === section.category || section.source === "offers" && Boolean(p.offerId) || section.source === "products" && section.productIds.includes(p.id)); return (section.source === "products" ? [...selected].sort((a,b)=>section.productIds.indexOf(a.id)-section.productIds.indexOf(b.id)) : [...selected].sort((a,b)=>productRank(a.id)-productRank(b.id))).slice(0,section.limit); }
  return (
    <div className="amal" data-template={brand.template} data-font={brand.font} style={brandStyle} data-card-size={merchandising.display.cardSize || "medium"} data-image-shape={merchandising.display.imageShape || "portrait"} data-spacing={merchandising.display.spacing || "comfortable"} data-text-size={merchandising.display.textSize || "medium"}>
      <a className="skip" href="#content">
        {t("Skip to content")}
      </a>
      <div className="announcement">
        {shop.preview
          ? t("Preview only. Checkout is disabled until the shop is published.")
          : shop.tagline}
      </div>
      <header className="shop-header" ref={headerRef}>
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
          {link("/support", t("Customer service"))}
          {link("/#collection", t("Collection"))}
          {link("/about", t("About"))}
          {link("/contact", t("Contact"))}
        </nav>
        {merchandising.display.showSearch && <form className="header-store-search" role="search" onSubmit={event => { event.preventDefault(); setCategory("All"); setOnlyOffers(false); setOfferFilter(""); navigate("/#collection"); }}><label><span className="sr-only">{t("Search store")}</span><input type="search" placeholder={merchandising.display.searchPlaceholder || t("Search products")} value={search} onChange={event=>setSearch(event.target.value)} /></label><button type="submit">{t("Search")}</button></form>}
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
          <button className="liked-products-link" type="button" aria-label={t("Liked products")} aria-pressed={onlyLiked} onClick={() => { setOnlyLiked(true); setCategory("All"); setSearch(""); setOnlyOffers(false); setOfferFilter(""); navigate("/#collection"); }}><Heart filled={onlyLiked} /><span>{products.filter(p => liked.includes(p.id)).length}</span></button>
          <span className="bag-anchor" ref={bagAnchorRef}><a href={base + "/bag"} className={`bag-link${floatingBag ? " is-floating" : ""}${count ? " has-items" : ""}`} aria-label={`${t("Bag")}: ${count}`} onClick={event => { event.preventDefault(); navigate("/bag"); }}>
              <span key={bagAdded} className={`bag-icon${bagAdded ? " is-added" : ""}`}><Basket /></span>
              <span className="bag-label">{t("Bag")}</span>
              <span className="bag-count" aria-live="polite" aria-atomic="true">{count}</span>
          </a></span>
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
            {merchandising.display.showHero && <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">
                  {t("Thoughtfully chosen")} / {shop.name}
                </p>
                <h1>
                  {brand.heroTitle || t("A little more care.")}
                  <br />
                  <em>{brand.heroSubtitle || (brand.heroTitle ? "" : t("In everything you choose."))}</em>
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
              {brand.banner ? <div className="hero-art hero-banner" aria-hidden="true"><img src={brand.banner} alt="" /></div> : <div className="hero-art" aria-hidden="true">
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
              </div>}
            </section>}
            {merchandising.display.showOffers && merchandising.offers.length > 0 && <section className="store-offers" aria-label={t("Current offers")}>{merchandising.offers.map(offer => <article key={offer.id}><span className="offer-percentage">{offer.percent}% {t("off")}</span><div><h2>{offer.title}</h2>{offer.description && <p>{offer.description}</p>}</div><button type="button" onClick={() => { setCategory(offer.target === "category" ? offer.category : "All"); setOnlyOffers(true); setOfferFilter(offer.id); setSearch(""); document.getElementById("collection")?.scrollIntoView({behavior:"smooth"}); }}>{t("Shop offers")} <span aria-hidden="true">&#8599;</span></button></article>)}</section>}
            {merchandising.sections.map(section => { const items = sectionProducts(section); return items.length ? <section className="store-curated-section" key={section.id} data-store-section={section.id}><header className="section-heading"><div><h2>{section.title}</h2>{section.description && <p>{section.description}</p>}</div><span>{items.length} {t("Products")}</span></header><div className={`product-grid section-products ${section.layout === "row" ? "is-scroll-row" : ""}`}>{items.map(renderProduct)}</div></section> : null; })}
            <section id="collection" className="collection">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{t("Explore the collection")}</p>
                  <h2>{merchandising.display.collectionTitle || t("Find your everyday favourites.")}</h2>
                </div>
                <span>
                  {products.length.toString().padStart(2, "0")} /{" "}
                  {t("Collection")}
                </span>
              </div>
              <div className="catalog-tools">
                {merchandising.display.showSearch && <label className="search">
                  <span className="sr-only">{t("Search products")}</span>
                  <input
                    type="search"
                    placeholder={merchandising.display.searchPlaceholder || t("Search products")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span aria-hidden="true">⌕</span>
                </label>}
                {merchandising.display.showCategories && <div className="categories" aria-label={t("Collection")}>
                  {["All", ...categoryOptions].map(
                    (c) => (
                      <button
                        key={c}
                        aria-pressed={category === c}
                        onClick={() => { setCategory(c); setOfferFilter(""); }}
                      >
                        {c === "All" ? t("All") : categoryTitle(c)}
                      </button>
                    ),
                  )}
                </div>}
                <button className="offers-filter liked-products-filter" aria-pressed={onlyLiked} onClick={() => setOnlyLiked(!onlyLiked)}>{t("Liked products")}</button>
                {products.some(p => p.offerId) && <button className="offers-filter" aria-pressed={onlyOffers} onClick={() => { setOnlyOffers(!onlyOffers); setOfferFilter(""); }}>{t("Products on offer")}</button>}
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
              <div className="store-results-line"><p className="search-results" role="status">{visible.length} {t("products found")}</p>{(search || category !== "All" || onlyOffers || onlyLiked) && <button className="text-link" onClick={()=>{setSearch("");setCategory("All");setOnlyOffers(false);setOfferFilter("");setOnlyLiked(false);}}>{t("Clear filters")}</button>}</div>
              <div className={`product-grid ${merchandising.display.layout === "list" ? "is-list" : ""}`}>
                {visible.map(renderProduct)}
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
            {merchandising.display.showStory && <section className="shop-story">
              <p className="eyebrow">
                {shop.name} / {t("Our story")}
              </p>
              <h2>{t("Built for your everyday.")}</h2>
              <p>{shop.description}</p>
              {link("/about", t("About") + " ↗")}
            </section>}
          </>
        ) : product ? (
          <>
          <section className="product-detail">
            <ProductGallery key={product.id} product={product} t={t} />
            <div className="detail-copy">
              {link("/", "← " + t("Back to collection"), "text-link")}
              <p className="eyebrow">
                {product.sku} / {categoryTitle(product.category)}
              </p>
              <h1>{product.name}</h1>
              <div className="detail-price">{priceLabel(product)}</div>
              {likeButton(product,true)}
              {product.warranty && <><WarrantyBadge details={product.warrantyDetails} t={t} />{product.warrantyDetails && <p className="warranty-details" dir="auto">{product.warrantyDetails}</p>}</>}
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
          {relatedProducts.length > 0 && <section className="related-products" aria-labelledby="related-products-heading">
            <header className="section-heading"><div>
              <p className="eyebrow">{t("More to discover")}</p>
              <h2 id="related-products-heading">{t("Related products")}</h2>
            </div>{link("/", t("Back to collection"), "text-link")}</header>
            <div className="product-grid">{relatedProducts.map(renderProduct)}</div>
          </section>}
          </>
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
                          {p && priceLabel(p)}
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
                  {shop.alerts && shop.alerts.customerChannel !== "none" && <label className="consent">
                    <input type="checkbox" checked={form.updates} onChange={(e) => setForm({ ...form, updates: e.target.checked })} />
                    <span>{t(shop.alerts.customerChannel === "whatsapp" ? "Send me order updates on WhatsApp" : "Send me order updates by SMS")}</span>
                  </label>}
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
                  <fieldset className="payment-choice">
                    <legend>{t("Payment")}</legend>
                    {shop.payments?.cashEnabled !== false && <label><input type="radio" name="payment" checked={payment === "cash"} onChange={() => setPayment("cash")} /> {t(method === "pickup" ? "Pay on collection" : "Pay on delivery")}</label>}
                    {shop.payments?.transferEnabled && <label><input type="radio" name="payment" checked={payment === "transfer"} onChange={() => setPayment("transfer")} /> {t("Bank or mobile money transfer")}</label>}
                    {payment === "transfer" && <small>{t("After placing the order you will see the account details. Send a photo of the transfer receipt from your order page.")}</small>}
                  </fieldset>
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
              {t("Order reference")} / {order?.orderNumber || order?.id.slice(0, 8) || "…"}
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
                  {order.transfer?.method === "bank-transfer" ? <p>{t("Bank or mobile money transfer")}</p> : <><p>
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
                  </p></>}
                </div>
                {order.transfer?.method === "bank-transfer" && <TransferPanel order={order} apiBase={apiBase} secret={location.split("#")[1] || ""} t={t} money={moneyLabel} onUpdated={setOrder} />}
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
            <h1>{brand.aboutTitle || t("Built for your everyday.")}</h1>
            {shop.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
            <div className="story-illustration">
              {brand.aboutImage ? <img src={brand.aboutImage} alt="" /> : <Placeholder />}
            </div>
            {link("/", t("Browse products"), "primary")}
          </section>
        ) : path === "/faq" ? (
          <section className="text-page faq-page">
            <p className="eyebrow">{shop.name} / {t("FAQ")}</p>
            <h1>{t("Frequently asked questions")}</h1>
            {brand.faq.length ? brand.faq.map((item, i) => <details key={i} className="faq-item"><summary>{item.question}</summary><p>{item.answer}</p></details>) : <p>{t("No questions have been added yet.")}</p>}
            <p>{link("/support", t("Contact shop customer service"), "primary")}</p>
          </section>
        ) : path === "/support" ? <ShopSupport key={slug} apiBase={apiBase} t={t} preview={shop.preview}/> : path === "/contact" ? (
          <section className="text-page">
            <p className="eyebrow">{t("Contact")}</p>
            <h1>{t("Good things start with a conversation.")}</h1>
            <p>{link("/support",t("Contact shop customer service"),"primary")}</p>
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
              {socials.length > 0 && <article><h2>{t("Follow us")}</h2><p className="social-links">{socials.map(([name, href]) => <a key={name} href={href} target="_blank" rel="noopener noreferrer">{name}</a>)}</p></article>}
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
          {brand.faq.length > 0 && link("/faq", t("FAQ"))}
          {link("/support", t("Customer service"))}
          {socials.length > 0 && <p className="social-links">{socials.map(([name, href]) => <a key={name} href={href} target="_blank" rel="noopener noreferrer">{name}</a>)}</p>}
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
      {whatsappLink && <a className="whatsapp-float" href={whatsappLink} target="_blank" rel="noopener noreferrer" aria-label={t("Chat on WhatsApp")}><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z"/></svg></a>}
    </div>
  );
}

function ProductGallery({ product, t }: { product: Product; t: (text: string) => string }) {
  const [active, setActive] = useState(0);
  const photos = product.images?.length ? product.images : product.image ? [product.image] : [];
  return <div className="detail-gallery"><div className="detail-image">{photos.length ? <img src={photos[active] || photos[0]} alt={product.name} /> : <Placeholder />}</div>{photos.length > 1 && <div className="product-thumbnails" aria-label={t("Product photos")}>{photos.map((src, index) => <button type="button" key={src} aria-label={t("View photo") + " " + (index + 1)} aria-pressed={index === active} onClick={() => setActive(index)}><img src={src} alt="" loading="lazy" /></button>)}</div>}</div>;
}

function WarrantyBadge({details,t}:{details?:string;t:(text:string)=>string}) { return <span className="product-warranty" title={details || t("Warranty included")}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg><span>{t("Warranty included")}</span></span>; }

function Heart({filled=false}:{filled?:boolean}) { return <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>; }

type TransferInfo = NonNullable<Receipt["transfer"]>;
/** Customer-facing transfer instructions and receipt upload on the private order page. */
function TransferPanel({ order, apiBase, secret, t, money, onUpdated }: { order: Receipt; apiBase: string; secret: string; t: (text: string) => string; money: (value: string) => ReactNode; onUpdated: (order: Receipt) => void }) {
  const info = order.transfer as TransferInfo, [file, setFile] = useState<File | null>(null), [reference, setReference] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState("");
  const status: Record<string, string> = { "awaiting-proof": "Waiting for your transfer receipt", "proof-submitted": "Receipt sent. The shop is checking your transfer.", verified: "Transfer confirmed by the shop.", rejected: "The shop could not confirm this transfer." };
  async function upload(event: FormEvent) {
    event.preventDefault(); if (!file || busy) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError(t("Choose a JPEG, PNG or WebP photo.")); return; }
    if (file.size > 4 * 1024 * 1024) { setError(t("The photo must be 4 MB or smaller.")); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiBase}/orders/${encodeURIComponent(order.id)}/transfer-proof`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type, "X-Receipt-Secret": secret, "X-Transfer-Reference": encodeURIComponent(reference) }, body: file });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t("Upload failed. Try again."));
      onUpdated(data.order); setFile(null); setReference("");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="transfer-panel" aria-labelledby="transfer-title">
    <h2 id="transfer-title">{t("Pay by transfer")}</h2>
    <p className="transfer-status" data-status={info.status}>{t(status[info.status || ""] || "")}</p>
    {info.status === "rejected" && info.note && <p className="transfer-note">{t("Shop note")}: {info.note}</p>}
    {info.status !== "verified" && <>
      <p>{t("Transfer exactly")} <strong>{money(order.total)}</strong> {t("to one of these accounts. Write your order number in the transfer note.")} <strong dir="ltr">{order.orderNumber || order.id.slice(0, 8)}</strong></p>
      <div className="transfer-accounts">{(info.accounts || []).map(a => <article key={a.label + a.accountNumber}><h3>{a.label}</h3><p>{a.accountName}</p><p className="transfer-number"><span dir="ltr">{a.accountNumber}</span> <button type="button" onClick={() => void navigator.clipboard?.writeText(a.accountNumber).then(() => setCopied(a.accountNumber))}>{t(copied === a.accountNumber ? "Copied" : "Copy")}</button></p>{a.instructions && <small>{a.instructions}</small>}</article>)}</div>
    </>}
    {info.canUpload && <form className="transfer-upload" onSubmit={upload}>
      <label>{t("Photo of the transfer receipt")}<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      <label>{t("Transaction number (optional)")}<input dir="ltr" maxLength={80} value={reference} onChange={e => setReference(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy || !file}>{t(busy ? "Sending…" : "Send transfer receipt")}</button>
    </form>}
  </section>;
}
