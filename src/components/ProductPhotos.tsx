import { useEffect, useRef, useState } from "react";
import { isNativeApp, mobileSession, request, serverUrl } from "../api";
import { useLanguage } from "../language-context";

export function ShopImage({ src, alt = "", onError }: { src: string; alt?: string; onError?: () => void }) {
  const onErrorRef = useRef(onError); onErrorRef.current = onError;
  const [blob, setBlob] = useState("");
  const native = isNativeApp() && (src.startsWith("/api/shop-images/") || src.startsWith("/api/inventory-images/"));
  useEffect(() => {
    if (!native) return;
    const controller = new AbortController(); let url = "";
    setBlob("");
    void fetch(serverUrl.current() + src, { credentials: "include", signal: controller.signal, headers: { Authorization: `Bearer ${mobileSession.current()}` } }).then(async response => {
      if (!response.ok) { onErrorRef.current?.(); return; }
      url = URL.createObjectURL(await response.blob());
      if (controller.signal.aborted) URL.revokeObjectURL(url); else setBlob(url);
    }).catch(() => { if (!controller.signal.aborted) onErrorRef.current?.(); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [src, native]);
  return native && !blob ? <span aria-hidden="true">&#9671;</span> : <img src={native ? blob : src} alt={alt} loading="lazy" onError={onError} />;
}

export async function optimizedPhoto(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose JPEG, PNG or WebP photos up to 5 MB each.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40000000) throw new Error("Choose a photo smaller than 40 megapixels.");
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob && blob.size <= 5 * 1024 * 1024 ? resolve(blob) : reject(new Error("Choose JPEG, PNG or WebP photos up to 5 MB each.")), file.type, .88));
  } finally { URL.revokeObjectURL(url); }
}

export default function ProductPhotos({ companyId, value, onChange, onBusy }: { companyId: string; value: string[]; onChange: (images: string[]) => void; onBusy: (busy: boolean) => void }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [link, setLink] = useState("");
  const uploaded = useRef(new Set<string>());
  const alive = useRef(true), uploading = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function upload(files: File[]) {
    if (uploading.current || !files.length) return;
    setError("");
    if (value.length + files.length > 6) { setError("Choose up to six product photos."); return; }
    uploading.current = true; setBusy(true); onBusy(true);
    let next = [...value];
    try {
      for (const file of files) {
        const body = await optimizedPhoto(file);
        if (!alive.current) return;
        const result = await request<{url: string}>(`/workspace/shops/${companyId}/photos`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body });
        if (!alive.current) return;
        uploaded.current.add(result.url); next = [...next, result.url]; onChange(next);
      }
    } catch (e) { if (alive.current) setError((e as Error).message === "The source image cannot be decoded." ? "Choose a valid JPEG, PNG or WebP photo." : (e as Error).message); }
    finally { uploading.current = false; if (alive.current) { setBusy(false); onBusy(false); } }
  }
  return <fieldset className="product-photo-picker" disabled={busy}>
    <legend>{t("Product photos")}</legend>
    <p className="hint">{t("Add up to six photos. The first photo is the cover. JPEG, PNG or WebP, up to 5 MB each.")}</p>
    <div className="product-photo-grid">{value.map((url, i) => <article key={url}>
      <ShopImage src={url} alt={`${t("Product photo")} ${i + 1}`} />
      <span className="shop-photo-number">{i === 0 ? t("Cover photo") : i + 1}</span>
      <div>{i > 0 && <button type="button" onClick={() => onChange([url, ...value.filter(v => v !== url)])}>{t("Make cover")}</button>}
        <button type="button" onClick={() => { onChange(value.filter(v => v !== url)); if (uploaded.current.delete(url)) void request(`/workspace/shops/${companyId}/photos/${url.split("/").pop()}`, { method: "DELETE" }).catch(() => {}); }}>{t("Remove photo")}</button></div>
    </article>)}</div>
    <label className="shop-photo-upload"><span>{t(busy ? "Uploading photos…" : "Choose photos")}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || value.length >= 6} onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ""; }} /></label>
    <details><summary>{t("Use an image link")}</summary><label className="form-field"><span>{t("Product image URL")}</span><input type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://" /></label><button type="button" disabled={!link || value.length >= 6} onClick={() => { try { const url = new URL(link); if (url.protocol !== "https:") throw new Error(); if (!value.includes(link)) onChange([...value, link]); setLink(""); setError(""); } catch { setError("Use a valid HTTPS image link."); } }}>{t("Add photo link")}</button></details>
    {busy && <p role="status">{t("Uploading photos…")}</p>}
    {error && <p className="error" role="alert">{t(error)}</p>}
  </fieldset>;
}
