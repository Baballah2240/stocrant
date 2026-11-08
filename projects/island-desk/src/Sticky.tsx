import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import type { Note } from "../shared/model";
import { pendingPatch } from "../shared/pending-patch";

/** A single note floating on the desktop in its own small window. Drag the top bar to move it; drag any edge to resize. */
export default function Sticky({ id }: { id: string }) {
  const api = window.island;
  const [note, setNote] = useState<Note | null>(null), [error, setError] = useState("");
  const local = useRef(0);
  const [typing] = useState(() => pendingPatch<Pick<Note, "title" | "body" | "checklist">>(patch => {
    void api.notePatch(id, patch).catch(e => setError(e.message));
  }, 200));
  useEffect(() => () => typing.flush(), [typing]);
  useEffect(() => {
    document.body.classList.add("sticky-window");
    const take = (notes: Note[]) => { if (Date.now() - local.current < 800) return; setNote(notes.find(item => item.id === id) || null); };
    void api.snapshot().then(data => take(data.store.notes));
    return api.onEvent(event => { if (event.type === "replace") take(event.snapshot.store.notes); if (event.type === "error") setError(event.message); });
  }, [id]);
  function change(patch: Partial<Pick<Note, "title" | "body" | "checklist">>) {
    if (!note) return;
    local.current = Date.now(); setNote({ ...note, ...patch });
    typing.push(patch);
  }
  if (!note) return <div className="sticky"><div className="sticky-bar"><span>Note</span></div></div>;
  const lines = note.body.split("\n");
  const toggle = (index: number) => change({ body: lines.map((text, i) => i !== index ? text : /^\[x\] /i.test(text) ? text.replace(/^\[x\] /i, "[ ] ") : "[x] " + text.replace(/^\[ \] /, "")).join("\n") });
  return <div className="sticky">
    <div className="sticky-bar" title="Drag to move">
      <input className="sticky-title" aria-label="Note title" placeholder="Untitled note" value={note.title} maxLength={300} onChange={event => change({ title: event.target.value })}/>
      <button className="sticky-btn" title={note.checklist ? "Show as text" : "Show as checklist"} aria-label="Toggle checklist" onClick={() => change({ checklist: !note.checklist })}><Icon name="tasks" size={14}/></button>
      <button className="sticky-btn" title="Back to the island" aria-label="Put note back in the island" onClick={() => { typing.flush(); void api.stickyClose(id); }}><Icon name="close" size={14}/></button>
    </div>
    {note.checklist
      ? <div className="sticky-checklist">{lines.map((line, index) => <label key={index}><input type="checkbox" checked={/^\[x\] /i.test(line)} onChange={() => toggle(index)}/><span className={/^\[x\] /i.test(line) ? "done" : ""}>{line.replace(/^\[[ x]\] /i, "") || "…"}</span></label>)}</div>
      : <textarea className="sticky-body" aria-label="Note" placeholder="Write anything…" value={note.body} maxLength={200000} onChange={event => change({ body: event.target.value })}/>}
    {error && <div className="sticky-error" onClick={() => setError("")}>{error}</div>}
  </div>;
}
