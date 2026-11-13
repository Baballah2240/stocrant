import { useRef, useState } from "react";
import { translationLanguages, translationLimit, type TranslationRequest } from "../shared/translation";
import { Icon } from "./icons";

/** Owned by App so switching tabs preserves the draft and any request in flight. */
export function useTranslation() {
  const [draft, setDraft] = useState<TranslationRequest>({ text: "", from: "en", to: "ar" });
  const [output, setOutput] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const sequence = useRef(0);
  function cancel() { sequence.current++; setBusy(false); void window.island?.cancelTranslation(); }
  function change(patch: Partial<TranslationRequest>) { if (busy) cancel(); setDraft(d => ({ ...d, ...patch })); setOutput(""); setError(""); }
  async function translate() {
    if (busy || !draft.text.trim() || draft.text.length > translationLimit || draft.from === draft.to) return;
    const id = ++sequence.current;
    setBusy(true); setError(""); setOutput("");
    try {
      const result = await window.island.translate(draft);
      if (id !== sequence.current) return;
      if (result.ok) {
        // Provider output is plain text; decode entities without interpreting markup.
        const decoder = document.createElement("textarea");
        decoder.innerHTML = result.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        setOutput(decoder.value);
      } else if (result.error !== "canceled") setError({ invalid: "Check your languages and text, then try again.", offline: "Could not connect. Check your internet connection and try again.", limit: "The translation service's free limit has been reached. Try again later.", unavailable: "Translation is unavailable right now. Please try again." }[result.error]);
    } catch { if (id === sequence.current) setError("Translation is unavailable. Please try again."); }
    finally { if (id === sequence.current) setBusy(false); }
  }
  return { draft, output, busy, error, change, translate, cancel };
}

export function Translation({ state, message }: { state: ReturnType<typeof useTranslation>; message: (text: string) => void }) {
  const { draft, output, busy, error, change, translate, cancel } = state;
  const tooLong = draft.text.length > translationLimit;
  const direction = (code: string) => translationLanguages.find(l => l.code === code && "rtl" in l) ? "rtl" : "ltr";
  const options = translationLanguages.map(l => <option key={l.code} value={l.code}>{l.label}</option>);
  return <form className="translation" onSubmit={event => { event.preventDefault(); void translate(); }}>
    <div className="section-row"><div><span className="eyebrow">A little less lost in translation</span><h2>Find the right words.</h2></div><span className="translation-online"><Icon name="globe" size={14}/>Online tool</span></div>
    <div className="translation-languages">
      <label htmlFor="translation-from">From<select id="translation-from" value={draft.from} onChange={e => change({ from: e.target.value, to: e.target.value === "en" ? "ar" : "en" })}>{options}</select></label>
      <button type="button" className="translation-swap" aria-label="Swap languages" title="Swap languages" onClick={() => change({ from: draft.to, to: draft.from, text: output || draft.text })}><Icon name="swap" size={20}/></button>
      <label htmlFor="translation-to">To<select id="translation-to" value={draft.to} onChange={e => change({ to: e.target.value, from: e.target.value === "en" ? "ar" : "en" })}>{options}</select></label>
    </div>
    <div className="translation-panels">
      <div className="translation-panel"><label htmlFor="translation-source">Your text</label><textarea id="translation-source" value={draft.text} dir={direction(draft.from)} lang={draft.from} placeholder="Type or paste something here…" aria-describedby="translation-count translation-privacy" aria-invalid={tooLong} onChange={e => change({ text: e.target.value })} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void translate(); } }}/><div className="translation-panel-foot"><span id="translation-count" className={tooLong ? "translation-error" : ""}>{draft.text.length.toLocaleString()} / {translationLimit.toLocaleString()}</span><button type="button" onClick={() => change({ text: "" })} disabled={!draft.text && !busy}>Clear</button></div></div>
      <div className="translation-panel translation-result" aria-busy={busy}><label htmlFor="translation-output">Translation</label><textarea id="translation-output" readOnly value={output} dir={direction(draft.to)} lang={draft.to} placeholder={busy ? "Finding the right words…" : "Your translation will appear here."}/><div className="translation-panel-foot"><span role="status">{busy ? "Translating…" : output ? "Ready to copy" : ""}</span><button type="button" disabled={!output || busy} onClick={() => { void window.island.copyText(output).then(() => message("Translation copied.")).catch(() => message("Couldn't copy. Select the translation and copy it manually.")); }}><Icon name="copy" size={14}/>Copy</button></div></div>
    </div>
    {error && <p className="translation-error" role="alert">{error}</p>}
    {tooLong && <p className="translation-error" role="alert">Shorten your text to {translationLimit.toLocaleString()} characters.</p>}
    {draft.from === draft.to && <p className="translation-error" role="alert">Choose two different languages.</p>}
    <div className="translation-bottom"><p id="translation-privacy">Text is sent to MyMemory only when you translate. Internet required. Free daily limits apply. Drafts stay here until you quit.</p><div>{busy ? <button type="button" className="translation-cancel" onClick={cancel}>Cancel</button> : <span className="translation-shortcut">Ctrl + Enter</span>}<button className="primary" type="submit" disabled={busy || !draft.text.trim() || tooLong || draft.from === draft.to}><Icon name="translate" size={17}/>{busy ? "Translating…" : error ? "Try again" : "Translate"}</button></div></div>
  </form>;
}
