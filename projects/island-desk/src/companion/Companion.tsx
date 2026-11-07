import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../icons";
import { calculate } from "../../shared/calculator";
import { localDate, remaining, timeText, type Calculation, type Note, type Task, type Timer } from "../../shared/model";
import type { MediaState } from "../../shared/bridge";

type State = { notes: Note[]; tasks: Task[]; calculations: Calculation[]; timer: Timer; settings: { workMinutes: number; breakMinutes: number; longBreakMinutes: number }; media: MediaState; serverTime: number };
type View = "clock" | "notes" | "tasks" | "focus" | "calc";

// The pairing token arrives in the URL fragment (never sent to the server in requests) and is kept on this phone.
const TOKEN_KEY = "island-desk-token";
function readToken() {
  const fromHash = location.hash.slice(1);
  if (fromHash) { try { localStorage.setItem(TOKEN_KEY, fromHash); } catch { /* private mode */ } history.replaceState(null, "", "/"); return fromHash; }
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
const token = readToken();
async function act(action: Record<string, unknown>) {
  const response = await fetch("/api/action", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(action) });
  const body = await response.json(); if (!response.ok) throw Error(body.error || "That didn't save."); return body as State;
}

const views: { id: View; label: string; icon: IconName }[] = [{ id: "clock", label: "Clock", icon: "focus" }, { id: "notes", label: "Notes", icon: "notes" }, { id: "tasks", label: "Tasks", icon: "tasks" }, { id: "focus", label: "Focus", icon: "play" }, { id: "calc", label: "Calc", icon: "calculator" }];

export default function Companion() {
  const [state, setState] = useState<State | null>(null), [status, setStatus] = useState<"connecting" | "live" | "offline" | "unpaired">("connecting");
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem("island-desk-view") as View) || "clock"; } catch { return "clock"; } });
  const [now, setNow] = useState(Date.now()), [toast, setToast] = useState(""), skew = useRef(0);
  useEffect(() => { try { localStorage.setItem("island-desk-view", view); } catch { /* ignore */ } }, [view]);
  useEffect(() => { const clock = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(clock); }, []);
  useEffect(() => {
    if (!token) { setStatus("unpaired"); return; }
    let source: EventSource | undefined, retry: ReturnType<typeof setTimeout> | undefined, closed = false;
    const connect = () => {
      source = new EventSource(`/api/events?t=${encodeURIComponent(token)}`);
      source.onmessage = event => { const next = JSON.parse(event.data) as State; skew.current = next.serverTime - Date.now(); setState(next); setStatus("live"); };
      source.onerror = () => {
        source?.close(); if (closed) return;
        void fetch("/api/state", { headers: { authorization: `Bearer ${token}` } }).then(r => setStatus(r.status === 401 ? "unpaired" : "offline")).catch(() => setStatus("offline"));
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => { closed = true; source?.close(); if (retry) clearTimeout(retry); };
  }, []);
  // Keep the screen awake on the clock view where supported (a bedside or desk clock).
  useEffect(() => {
    if (view !== "clock" || !("wakeLock" in navigator)) return;
    let lock: { release(): Promise<void> } | undefined, gone = false;
    const take = () => void (navigator as any).wakeLock.request("screen").then((l: any) => { if (gone) void l.release(); else lock = l; }).catch(() => undefined);
    take(); const again = () => { if (document.visibilityState === "visible") take(); };
    document.addEventListener("visibilitychange", again);
    return () => { gone = true; document.removeEventListener("visibilitychange", again); void lock?.release(); };
  }, [view]);

  async function run(action: Record<string, unknown>) {
    try { setState(await act(action)); } catch (error) { setToast((error as Error).message); setTimeout(() => setToast(""), 3500); }
  }
  if (status === "unpaired") return <main className="c-shell center"><div className="c-pill big"><i className="dot"/>Island Desk</div><h1>Pair this phone</h1><p className="muted">On your computer, open Island Desk → Settings → Phone companion and scan the QR code with this phone's camera.</p></main>;
  if (!state) return <main className="c-shell center"><div className="c-pill big pulse"><i className="dot"/>Connecting…</div><p className="muted">Make sure this phone is on the same Wi-Fi as your computer and Island Desk is running.</p></main>;
  const serverNow = now + skew.current;
  return <main className={`c-shell view-${view}`}>
    <header className="c-top">
      <div className={`c-pill ${state.timer.running ? "active" : ""}`}>
        <i className={`dot ${status === "live" ? "" : "off"}`}/>
        {state.timer.running ? <><span>{state.timer.phase === "work" ? "Focus" : "Break"}</span><b>{timeText(remaining(state.timer, serverNow))}</b></>
          : state.media.active ? <><span className="ellipsis">{state.media.title}</span><span className={`bars ${state.media.playing ? "on" : ""}`}><i/><i/><i/></span></>
          : <span>{status === "live" ? "Connected" : "Reconnecting…"}</span>}
      </div>
    </header>
    <section className="c-content">
      {view === "clock" && <ClockView state={state} now={now}/>}
      {view === "notes" && <NotesView notes={state.notes} run={run}/>}
      {view === "tasks" && <TasksView tasks={state.tasks} run={run}/>}
      {view === "focus" && <FocusView timer={state.timer} now={serverNow} run={run}/>}
      {view === "calc" && <CalcView history={state.calculations} run={run}/>}
    </section>
    {state.media.active && view !== "clock" && <MiniPlayer media={state.media} run={run}/>}
    <nav className="c-nav">{views.map(item => <button key={item.id} className={view === item.id ? "on" : ""} onClick={() => setView(item.id)}><Icon name={item.icon} size={20}/><span>{item.label}</span></button>)}</nav>
    {toast && <div className="c-toast" onClick={() => setToast("")}>{toast}</div>}
  </main>;
}

function ClockView({ state, now }: { state: State; now: number }) {
  const date = new Date(now);
  const hm = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const rank = { high: 0, medium: 1, low: 2 }, today = localDate(date), pending = state.tasks.filter(task => !task.done && (!task.due || task.due <= today)).sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 4);
  const pinned = state.notes.filter(note => note.pinned).slice(0, 2);
  return <div className="clock-view">
    <div className="big-clock"><span>{hm}</span><small>{seconds}</small></div>
    <div className="clock-date">{new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(date)}</div>
    {state.media.active && <MiniPlayer media={state.media} run={() => undefined} compact/>}
    <div className="clock-cards">
      <div className="c-card"><span className="eyebrow">{pending.length ? "TODAY" : "ALL CLEAR"}</span>{pending.length ? pending.map(task => <p key={task.id} className={`prio ${task.priority}`}><i/>{task.text}</p>) : <p className="muted">Nothing waiting on you.</p>}</div>
      {pinned.map(note => <div className="c-card" key={note.id}><span className="eyebrow">PINNED</span><strong>{note.title || "Untitled note"}</strong><p className="muted clamp">{note.body.replace(/\[[ x]\] /gi, "• ")}</p></div>)}
    </div>
  </div>;
}

function NotesView({ notes, run }: { notes: Note[]; run: (action: Record<string, unknown>) => Promise<void> }) {
  const [query, setQuery] = useState(""), [openId, setOpenId] = useState<string | null>(null);
  const shown = useMemo(() => notes.filter(note => `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt), [notes, query]);
  const open = notes.find(note => note.id === openId);
  if (open) return <NoteEditor note={open} run={run} back={() => setOpenId(null)}/>;
  return <div className="list-view">
    <div className="row"><h2>Notes</h2><button className="round" aria-label="New note" onClick={() => void act({ type: "note-save", note: { title: "", body: "" } }).then(next => setOpenId(next.notes[0]?.id || null))}><Icon name="plus" size={20}/></button></div>
    <label className="c-search"><Icon name="search" size={16}/><input placeholder="Find a thought…" value={query} onChange={event => setQuery(event.target.value)}/></label>
    {shown.map(note => <button className="c-card note" key={note.id} onClick={() => setOpenId(note.id)}><div className="row"><strong>{note.title || "Untitled note"}</strong>{note.pinned && <Icon name="pin" size={13}/>}</div><p className="muted clamp">{note.body.replace(/\[[ x]\] /gi, "• ") || "Empty"}</p></button>)}
    {!shown.length && <p className="muted center-text">{query ? "No matching notes." : "No notes yet. Tap + to write one."}</p>}
  </div>;
}

function NoteEditor({ note, run, back }: { note: Note; run: (action: Record<string, unknown>) => Promise<void>; back: () => void }) {
  const [draft, setDraft] = useState({ title: note.title, body: note.body }), timer = useRef<ReturnType<typeof setTimeout> | null>(null), [confirm, setConfirm] = useState(false);
  const edited = useRef(0);
  // Accept edits from the desktop unless the phone is mid-edit.
  useEffect(() => { if (Date.now() - edited.current > 1500) setDraft({ title: note.title, body: note.body }); }, [note.title, note.body]);
  const change = (patch: Partial<typeof draft>) => {
    edited.current = Date.now(); const next = { ...draft, ...patch }; setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run({ type: "note-save", note: { id: note.id, ...next } }), 350);
  };
  const lines = draft.body.split("\n");
  return <div className="editor-view">
    <div className="row"><button className="text" onClick={back}><Icon name="chevron" size={16} style={{ transform: "rotate(180deg)" }}/>Notes</button><div className="row gap">
      <button className={`round small ${note.pinned ? "on" : ""}`} aria-label="Pin" onClick={() => void run({ type: "note-save", note: { id: note.id, pinned: !note.pinned } })}><Icon name="pin" size={16}/></button>
      <button className={`round small ${note.checklist ? "on" : ""}`} aria-label="Checklist" onClick={() => void run({ type: "note-save", note: { id: note.id, checklist: !note.checklist } })}><Icon name="tasks" size={16}/></button>
      <button className="round small danger" aria-label="Delete" onClick={() => setConfirm(true)}><Icon name="trash" size={16}/></button></div></div>
    {confirm && <div className="c-card confirm"><span>Delete this note?</span><button onClick={() => { void run({ type: "note-delete", id: note.id }); back(); }}>Delete</button><button onClick={() => setConfirm(false)}>Keep</button></div>}
    <input className="title-input" placeholder="Title" value={draft.title} onChange={event => change({ title: event.target.value })}/>
    {note.checklist ? <div className="checklist">{lines.map((line, index) => { const done = /^\[x\] /i.test(line); return <label key={index} className={done ? "done" : ""}>
        <input type="checkbox" checked={done} onChange={() => change({ body: lines.map((text, i) => i !== index ? text : done ? text.replace(/^\[x\] /i, "[ ] ") : "[x] " + text.replace(/^\[ \] /, "")).join("\n") })}/>
        <input value={line.replace(/^\[[ x]\] /i, "")} placeholder="Item" onChange={event => change({ body: lines.map((text, i) => i === index ? `${done ? "[x]" : "[ ]"} ${event.target.value}` : text).join("\n") })}/></label>; })}
      <button className="text" onClick={() => change({ body: (draft.body ? draft.body + "\n" : "") + "[ ] " })}><Icon name="plus" size={16}/>Add item</button></div>
      : <textarea className="body-input" placeholder="Write anything…" value={draft.body} onChange={event => change({ body: event.target.value })}/>}
  </div>;
}

function TasksView({ tasks, run }: { tasks: Task[]; run: (action: Record<string, unknown>) => Promise<void> }) {
  const [text, setText] = useState(""), [filter, setFilter] = useState<"today" | "all" | "done">("today"), [priority, setPriority] = useState<Task["priority"]>("medium");
  const today = localDate();
  const shown = tasks.filter(task => filter === "done" ? task.done : !task.done && (filter === "all" || !task.due || task.due <= today)).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const add = () => { if (!text.trim()) return; void run({ type: "task-save", task: { text: text.trim(), priority, due: filter === "today" ? today : "" } }); setText(""); };
  return <div className="list-view">
    <div className="row"><h2>Tasks</h2><div className="seg">{(["today", "all", "done"] as const).map(id => <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{id[0].toUpperCase() + id.slice(1)}</button>)}</div></div>
    <form className="add-task" onSubmit={event => { event.preventDefault(); add(); }}>
      <input placeholder={filter === "today" ? "Add a task for today…" : "Add a task…"} value={text} onChange={event => setText(event.target.value)}/>
      <button type="button" className={`prio-pick ${priority}`} aria-label={`Priority ${priority}`} onClick={() => setPriority(priority === "low" ? "medium" : priority === "medium" ? "high" : "low")}><i/></button>
      <button className="round" aria-label="Add task"><Icon name="plus" size={18}/></button>
    </form>
    {shown.map(task => <div className={`c-card task ${task.done ? "done" : ""}`} key={task.id}>
      <button className={`check prio ${task.priority}`} aria-label={task.done ? "Mark not done" : "Mark done"} onClick={() => void run({ type: "task-save", task: { id: task.id, done: !task.done } })}>{task.done && <Icon name="check" size={14}/>}</button>
      <span className="task-text">{task.text}{task.due && <small className={task.due < today && !task.done ? "late" : ""}>{task.due === today ? "Today" : task.due < today ? `Overdue · ${task.due.slice(5)}` : task.due.slice(5)}</small>}</span>
      <button className="round small ghost" aria-label="Delete task" onClick={() => void run({ type: "task-delete", id: task.id })}><Icon name="close" size={14}/></button>
    </div>)}
    {!shown.length && <p className="muted center-text">{filter === "done" ? "Nothing finished yet." : "All clear."}</p>}
  </div>;
}

function FocusView({ timer, now, run }: { timer: Timer; now: number; run: (action: Record<string, unknown>) => Promise<void> }) {
  const left = remaining(timer, now), label = timer.phase === "work" ? "Focus" : timer.phase === "break" ? "Short break" : "Long break";
  const total = Math.max(1, timer.running && timer.endAt ? Math.max(left, timer.remainingMs) : timer.remainingMs);
  return <div className="focus-view">
    <span className="eyebrow">{label.toUpperCase()}</span>
    <div className={`ring ${timer.running ? "running" : ""}`} style={{ ["--p" as string]: String(1 - left / Math.max(total, left)) }}><b>{timeText(left)}</b></div>
    <div className="row gap center-row">
      <button className="round small ghost" aria-label="Reset" onClick={() => void run({ type: "timer", action: "reset" })}><Icon name="reset" size={18}/></button>
      <button className="round play" aria-label={timer.running ? "Pause" : "Start"} onClick={() => void run({ type: "timer", action: "toggle" })}><Icon name={timer.running ? "pause" : "play"} size={26}/></button>
      <button className="round small ghost" aria-label="Skip" onClick={() => void run({ type: "timer", action: "skip" })}><Icon name="skip" size={18}/></button>
    </div>
    <p className="muted">{timer.completed} sessions completed · Synced with your computer</p>
  </div>;
}

function CalcView({ history, run }: { history: Calculation[]; run: (action: Record<string, unknown>) => Promise<void> }) {
  const [expression, setExpression] = useState(""), [answer, setAnswer] = useState("0"), [error, setError] = useState("");
  const solve = () => { try { const result = calculate(expression); setAnswer(result); setError(""); void run({ type: "calc-add", expression, result }); } catch (err) { setError((err as Error).message); } };
  const press = (key: string) => { if (key === "=") return solve(); if (key === "AC") { setExpression(""); setAnswer("0"); setError(""); return; } if (key === "⌫") return setExpression(value => value.slice(0, -1)); setExpression(value => value + key); };
  return <div className="calc-view">
    <div className="calc-screen"><input inputMode="decimal" value={expression} placeholder="0" onChange={event => setExpression(event.target.value)} onKeyDown={event => { if (event.key === "Enter") solve(); }}/><output>{error || answer}</output></div>
    <div className="pad">{["AC", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "%", "0", ".", "="].map(key => <button key={key} className={key === "=" ? "eq" : "÷×−+".includes(key) ? "op" : key === "AC" ? "fn" : ""} onClick={() => press(key)}>{key}</button>)}</div>
    {history.length > 0 && <div className="calc-history">{history.slice(0, 6).map(item => <button key={item.id} onClick={() => setExpression(item.result)}><span className="muted">{item.expression}</span><b>= {item.result}</b></button>)}</div>}
  </div>;
}

function MiniPlayer({ media, run, compact }: { media: Extract<MediaState, { active: true }>; run: (action: Record<string, unknown>) => void | Promise<void>; compact?: boolean }) {
  return <div className={`mini-player ${compact ? "compact" : ""}`}>
    {media.art ? <img src={media.art} alt=""/> : <span className="art-blank"><Icon name="music" size={18}/></span>}
    <div className="mp-info"><strong>{media.title}</strong><span>{media.artist || media.app}</span></div>
    {!compact && <div className="mp-controls">
      <button aria-label="Previous" disabled={!media.canPrevious} onClick={() => void run({ type: "media", command: "previous" })}><Icon name="previous" size={18}/></button>
      <button className="play" aria-label={media.playing ? "Pause" : "Play"} onClick={() => void run({ type: "media", command: "toggle" })}><Icon name={media.playing ? "pause" : "play"} size={18}/></button>
      <button aria-label="Next" disabled={!media.canNext} onClick={() => void run({ type: "media", command: "next" })}><Icon name="skip" size={18}/></button>
    </div>}
  </div>;
}
