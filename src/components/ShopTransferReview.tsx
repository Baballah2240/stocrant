import { useEffect, useState } from "react";
import { isNativeApp, mobileSession, request, serverUrl } from "../api";
import { useLanguage } from "../language-context";
import "../storefront-branding.css";

type Proof = { id: string; reference: string; at: string };
export type TransferOrder = { id: string; organizationId?: string; paymentMethod?: string; transferStatus?: string; transferNote?: string; transferProofs?: Proof[] };
const labels: Record<string, string> = { "awaiting-proof": "Waiting for the customer's transfer receipt", "proof-submitted": "Transfer receipt received — check it against your account", verified: "Transfer verified", rejected: "Transfer rejected — the customer can send a new receipt" };

function ProofImage({ companyId, orderId, proof }: { companyId: string; orderId: string; proof: Proof }) {
  const { t } = useLanguage(), [url, setUrl] = useState(""), [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, made = "";
    const headers: Record<string, string> = {}; if (isNativeApp() && mobileSession.current()) headers.Authorization = `Bearer ${mobileSession.current()}`;
    void fetch(`${serverUrl.current()}/api/workspace/shops/${encodeURIComponent(companyId)}/orders/${encodeURIComponent(orderId)}/transfer-proofs/${encodeURIComponent(proof.id)}`, { credentials: "include", headers })
      .then(async r => { if (!r.ok) throw new Error(); made = URL.createObjectURL(await r.blob()); if (active) setUrl(made); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (made) URL.revokeObjectURL(made); };
  }, [companyId, orderId, proof.id]);
  return <figure className="transfer-proof">{url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={t("Transfer receipt")} /></a> : <span className="hint">{t(failed ? "Could not load the receipt photo." : "Loading…")}</span>}
    <figcaption>{new Date(proof.at).toLocaleString()}{proof.reference && <> · <span dir="ltr">{proof.reference}</span></>}</figcaption></figure>;
}

/** Staff check of a customer's bank / mobile-money transfer: view receipt photos, verify or reject with a note. */
export default function ShopTransferReview({ companyId, order, canReview, onChanged }: { companyId: string; order: TransferOrder; canReview: boolean; onChanged: () => Promise<void> | void }) {
  const { t } = useLanguage(), [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (order.paymentMethod !== "bank-transfer") return null;
  async function review(decision: "verify" | "reject") {
    if (busy) return; setBusy(true); setError("");
    try { await request(`/workspace/shops/${encodeURIComponent(companyId)}/orders/${encodeURIComponent(order.id)}/transfer-review`, { method: "POST", body: JSON.stringify({ decision, note }) }); setNote(""); await onChanged(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const proofs = order.transferProofs || [];
  return <section className="shop-transfer-review" data-status={order.transferStatus}>
    <h3>{t("Transfer payment")}</h3>
    <p className="shop-transfer-status">{t(labels[order.transferStatus || ""] || "Transfer payment")}</p>
    {order.transferStatus === "rejected" && order.transferNote && <p className="hint">{t("Note sent to the customer")}: {order.transferNote}</p>}
    {proofs.length > 0 && <div className="transfer-proofs">{[...proofs].reverse().map(p => <ProofImage key={p.id} companyId={companyId} orderId={order.id} proof={p} />)}</div>}
    {error && <p className="error" role="alert">{t(error)}</p>}
    {canReview && order.transferStatus === "proof-submitted" && <div className="shop-transfer-actions">
      <label className="form-field"><span>{t("Note to the customer (required to reject)")}</span><input maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="inline-actions"><button type="button" className="primary" disabled={busy} onClick={() => void review("verify")}>{t("Transfer received")}</button><button type="button" disabled={busy || !note.trim()} onClick={() => void review("reject")}>{t("Not received")}</button></div>
    </div>}
    {order.transferStatus === "verified" && <p className="hint">{t("After dispatch, record this payment below with method bank so it appears in Finance.")}</p>}
  </section>;
}
