import { useEffect, useRef, useState } from "react";
import { request, serverUrl, isNativeApp, mobileSession } from "../api";
import { useLanguage } from "../language-context";
import { optimizedPhoto, ShopImage } from "./ProductPhotos";

export default function InventoryPhotoUpload({ companyId, itemId, value, onChange, onBusy, disabled = false, preview = true }: { companyId: string; itemId?: string; value: string; onChange: (value: string) => void | Promise<void>; onBusy: (busy: boolean) => void; disabled?: boolean; preview?: boolean }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const running = useRef(false), alive = useRef(true), drafts = useRef(new Set<string>());
  const busyCallback = useRef(onBusy); busyCallback.current = onBusy;
  const prefix = "/workspace/inventory/" + encodeURIComponent(companyId) + "/photos";
  // Linked and pending-approval files are protected server-side from draft cleanup.
  async function discard(url: string) { if (!url.startsWith("/api/inventory-images/")) return; try { await fetch(serverUrl.current() + "/api" + prefix + "/" + url.split("/").pop(), { method: "DELETE", credentials: "include", headers: isNativeApp() ? { Authorization: "Bearer " + mobileSession.current(), "X-STOCRANT-NATIVE": "1" } : {} }); } catch { /* Abandoned drafts are also collected by the upload API after a day. */ } }
  useEffect(() => { alive.current = true; const staged = drafts.current; return () => { alive.current = false; busyCallback.current(false); for (const url of staged) void discard(url); }; }, [companyId, itemId]);
  async function upload(file?: File) {
    if (!file || running.current || disabled) return;
    running.current = true; setBusy(true); onBusy(true); setError("");
    let uploaded = "";
    try {
      const body = await optimizedPhoto(file); if (!alive.current) return;
      const result = await request<{ url: string }>(prefix, { method: "POST", headers: { "Content-Type": "application/octet-stream", ...(itemId ? { "X-Inventory-Item": itemId } : {}) }, body });
      uploaded = result.url; if (!alive.current) { void discard(uploaded); return; }
      drafts.current.add(uploaded); await onChange(uploaded);
    } catch (error) { if (uploaded) void discard(uploaded); if (alive.current) setError((error as Error).message === "The source image cannot be decoded." ? "Choose a valid JPEG, PNG or WebP photo." : (error as Error).message); }
    finally { running.current = false; if (alive.current) { setBusy(false); onBusy(false); } }
  }
  async function remove() { if (running.current || disabled) return; running.current = true; setBusy(true); onBusy(true); setError(""); try { await onChange(""); if (drafts.current.delete(value)) void discard(value); } catch (error) { if (alive.current) setError((error as Error).message); } finally { running.current = false; if (alive.current) { setBusy(false); onBusy(false); } } }
  return <fieldset className="inventory-photo-upload" disabled={busy || disabled}>
    <legend>{t("Item picture")}</legend>
    {preview && value && <div className="inventory-upload-preview"><ShopImage src={value} alt={t("Item picture")} /></div>}
    <label className="form-field"><span>{t(value ? "Replace picture" : "Upload picture")}</span><input type="file" aria-label={t(value ? "Replace picture" : "Upload picture")} accept="image/jpeg,image/png,image/webp" disabled={!companyId || busy || disabled} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
    <p className="hint">{t(companyId ? "JPEG, PNG or WebP, up to 5 MB. Pictures follow the item's access and approval rules." : "Choose a company before uploading a picture.")}</p>
    {value && <button type="button" onClick={() => void remove()}>{t("Remove picture")}</button>}
    {busy && <p role="status">{t("Uploading picture…")}</p>}{error && <p role="alert" className="error">{t(error)}</p>}
  </fieldset>;
}
