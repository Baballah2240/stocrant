import { useEffect, useMemo, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Icon, type IconName } from "../icons";
import { calculate } from "../../shared/calculator";
import { localDate, remaining, timeText, type Calculation, type Note, type Task, type Timer } from "../../shared/model";
import type { MediaState } from "../../shared/bridge";
import type { Action } from "../../shared/actions";
import { isLauncher, loadPairing, newId, parsePairLink, savePairing, usePocket, type Pairing, type State, type Status } from "./backend";
import { Launcher, type InstalledApp } from "./launcher";

type View = "clock" | "notes" | "tasks" | "focus" | "calc" | "apps";
type Run = (action: Action) => Promise<void>;

const views: { id: View; label: string; icon: IconName }[] = [
  { id: "clock", label: isLauncher ? "Home" : "Clock", icon: "focus" }, { id: "notes", label: "Notes", icon: "notes" }, { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "focus", label: "Focus", icon: "play" }, { id: "calc", label: "Calc", icon: "calculator" }, ...(isLauncher ? [{ id: "apps" as View, label: "My apps", icon: "shortcuts" as IconName }] : []),
];

export default function Companion() {
  const [pairing, setPairing] = useState<Pairing | null>(() => isLauncher ? loadPairing() : null);
  const { state, status, run: send, skew, adoptLocalData } = usePocket(pairing);
  const [view, setView] = useState<View>(() => { if (isLauncher) return "clock"; try { return (localStorage.getItem("island-desk-view") as View) || "clock"; } catch { return "clock"; } });
  const [now, setNow] = useState(Date.now()), [toast, setToast] = useState(""), [openNote, setOpenNote] = useState<string | null>(null), [sheet, setSheet] = useState(false);
  const viewRef = useRef(view); viewRef.current = view;
  const say = (text: string) => { setToast(text); setTimeout(() => setToast(""), 3500); };
  useEffect(() => { try { localStorage.setItem("island-desk-view", view); } catch { /* ignore */ } }, [view]);
  useEffect(() => { const clock = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(clock); }, []);
  // Keep the screen awake on the clock view where supported (a bedside or desk clock).
  useEffect(() => {
    if (view !== "clock" || isLauncher || !("wakeLock" in navigator)) return;
    let lock: { release(): Promise<void> } | undefined, gone = false;
    const take = () => void (navigator as any).wakeLock.request("screen").then((l: any) => { if (gone) void l.release(); else lock = l; }).catch(() => undefined);
    take(); const again = () => { if (document.visibilityState === "visible") take(); };
    document.addEventListener("visibilitychange", again);
    return () => { gone = true; document.removeEventListener("visibilitychange", again); void lock?.release(); };
  }, [view]);
  // Launcher: pairing links, and a back button that steps back instead of leaving the home screen.
  useEffect(() => {
    if (!isLauncher) return;
    const pair = (link: string) => { const next = parsePairLink(link); if (!next) return; adoptLocalData(); savePairing(next); setPairing(next); say("Connected to your computer."); };
    void NativeApp.getLaunchUrl().then(result => { if (result?.url) pair(result.url); }).catch(() => undefined);
    const opened = NativeApp.addListener("appUrlOpen", event => pair(event.url));
    const back = NativeApp.addListener("backButton", () => { setSheet(false); setOpenNote(null); if (viewRef.current !== "clock") setView("clock"); });
    return () => { void opened.then(h => h.remove()); void back.then(h => h.remove()); };
  }, []);

  const run: Run = async action => { try { await send(action); } catch (error) { say((error as Error).message); } };
  if (!isLauncher && status === "unpaired") return <main className="c-shell center"><div className="c-pill big"><i className="dot"/>Island Desk</div><h1>Pair this phone</h1><p className="muted">On your computer, open Island Desk → Settings → Phone companion and scan the QR code with this phone's camera.</p></main>;
  if (!state) return <main className="c-shell center"><div className="c-pill big pulse"><i className="dot"/>Connecting…</div><p className="muted">Make sure this phone is on the same Wi-Fi as your computer and Island Desk is running.</p></main>;
  const serverNow = now + (status === "live" ? skew.current : 0);
  const pillText = status === "live" ? "Connected" : status === "local" ? "On this phone" : status === "unpaired" ? "Pair again" : status === "offline" ? "Offline · saved on phone" : "Connecting…";
  return <main className={`c-shell view-${view} ${isLauncher ? "launcher" : ""}`}>
    <header className="c-top">
      <button className={`c-pill ${state.timer.running ? "active" : ""}`} onClick={() => isLauncher && setSheet(true)}>
        <i className={`dot ${status === "live" || status === "local" ? "" : "off"}`}/>
        {state.timer.running ? <><span>{state.timer.phase === "work" ? "Focus" : "Break"}</span><b>{timeText(remaining(state.timer, serverNow))}</b></>
          : state.media.active ? <><span className="ellipsis">{state.media.title}</span><span className={`bars ${state.media.playing ? "on" : ""}`}><i/><i/><i/></span></>
          : <span>{pillText}</span>}
      </button>
    </header>
    <section className="c-content" key={view}>
      {view === "clock" && <ClockView state={state} now={now} run={run}/>}
      {view === "clock" && isLauncher && !pairing && <PairCard onPair={next => { adoptLocalData(); savePairing(next); setPairing(next); }}/>}
      {view === "notes" && <NotesView notes={state.notes} run={run} openId={openNote} setOpenId={setOpenNote}/>}
      {view === "tasks" && <TasksView tasks={state.tasks} run={run}/>}
      {view === "focus" && <FocusView timer={state.timer} now={serverNow} run={run} synced={status === "live"}/>}
      {view === "calc" && <CalcView history={state.calculations} run={run}/>}
      {view === "apps" && <AppsView/>}
    </section>
    {view === "clock" && isLauncher && <SystemRail/>}
    {state.media.active && view !== "clock" && view !== "apps" && <MiniPlayer media={state.media} run={run}/>}
    <nav className="c-nav">{views.map(item => <button key={item.id} className={view === item.id ? "on" : ""} onClick={() => { setView(item.id); if (item.id !== "notes") setOpenNote(null); }}><Icon name={item.icon} size={20}/><span>{item.label}</span></button>)}</nav>
    {sheet && <SettingsSheet status={status} pairing={pairing} close={() => setSheet(false)} unpair={() => { savePairing(null); setPairing(null); setSheet(false); say("Disconnected. Your notes stay on this phone."); }}/>}
    {toast && <div className="c-toast" onClick={() => setToast("")}>{toast}</div>}
  </main>;
}

/* ───────────── Launcher-only pieces ───────────── */
let appCache: InstalledApp[] | null = null;
function useApps() {
  const [apps, setApps] = useState<InstalledApp[]>(appCache || []);
  useEffect(() => {
    const load = () => void Launcher.listApps().then(result => { appCache = result.apps.sort((a, b) => a.label.localeCompare(b.label)); setApps(appCache); }).catch(() => undefined);
    load(); const again = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", again); return () => document.removeEventListener("visibilitychange", again);
  }, []);
  return apps;
}
const open = (app: InstalledApp) => void Launcher.launch({ packageName: app.packageName, activity: app.activity });
/** Preinstalled apps people reach for first; anything else that came with the phone follows. */
const essentials = [/dialer|incallui|\.phone$|contacts/i, /mms|messag/i, /camera/i, /gallery|photos/i, /settings/i, /browser|chrome/i, /deskclock|clock/i, /calendar/i, /filemanager|files/i, /music|video/i];
const rank = (app: InstalledApp) => { const index = essentials.findIndex(rule => rule.test(app.packageName) || rule.test(app.label)); return index < 0 ? essentials.length : index; };

/** Home: system apps in a slim vertical rail along the right edge. */
function SystemRail() {
  const apps = useApps().filter(app => app.system).sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  if (!apps.length) return null;
  return <aside className="system-rail" aria-label="System apps">{apps.map(app => <button key={app.packageName + app.activity} onClick={() => open(app)} aria-label={app.label} title={app.label}><img src={app.icon} alt=""/></button>)}</aside>;
}

/** A separate window for the apps you installed yourself. */
function AppsView() {
  const apps = useApps().filter(app => !app.system), [query, setQuery] = useState("");
  const shown = apps.filter(app => app.label.toLowerCase().includes(query.toLowerCase()));
  return <div className="list-view apps-view">
    <div className="row"><h2>My apps</h2><span className="muted small">{apps.length}</span></div>
    <label className="c-search"><Icon name="search" size={16}/><input placeholder="Search your apps" value={query} onChange={event => setQuery(event.target.value)}/></label>
    <div className="app-grid">{shown.map(app => <button key={app.packageName + app.activity} onClick={() => open(app)} onContextMenu={event => { event.preventDefault(); void Launcher.openAppInfo({ packageName: app.packageName }); }}>
      <img src={app.icon} alt=""/><span>{app.label}</span></button>)}</div>
    {!apps.length && <p className="muted center-text">{appCache ? "No apps installed yet." : "Loading your apps…"}</p>}
    {apps.length > 0 && !shown.length && <p className="muted center-text">No app matches "{query}".</p>}
  </div>;
}

function PairCard({ onPair }: { onPair: (pairing: Pairing) => void }) {
  const [link, setLink] = useState(""), [error, setError] = useState("");
  return <div className="c-card pair-card">
    <span className="eyebrow">CONNECT TO YOUR COMPUTER</span>
    <p className="muted">Optional. Everything works on this phone alone. To sync with Island Desk on your computer, turn on Settings → Phone companion there, scan its QR code with this phone, then tap "Open in Island Launcher". Or paste the link here:</p>
    <div className="row"><input placeholder="http://192.168…:47820/#code" value={link} onChange={event => { setLink(event.target.value); setError(""); }}/><button className="round small on" aria-label="Connect" onClick={() => { const next = parsePairLink(link.trim()); if (next) onPair(next); else setError("That doesn't look like an Island Desk link."); }}><Icon name="arrow" size={16}/></button></div>
    {error && <small className="late">{error}</small>}
  </div>;
}

function SettingsSheet({ status, pairing, close, unpair }: { status: Status; pairing: Pairing | null; close: () => void; unpair: () => void }) {
  const [isDefault, setDefault] = useState<boolean | null>(null);
  useEffect(() => { void Launcher.isDefaultLauncher().then(result => setDefault(result.value)).catch(() => setDefault(null)); }, []);
  return <div className="sheet-backdrop" onClick={close}><div className="sheet" onClick={event => event.stopPropagation()}>
    <i className="grabber"/>
    <h3>Island Launcher</h3>
    <div className="c-card"><strong>Home screen</strong><p className="muted">{isDefault ? "Island is your home screen." : "Make Island your home screen so the Home button opens it."}</p>
      <button className="pill-btn" onClick={() => void Launcher.openHomeSettings()}>{isDefault ? "Change home app" : "Set as home screen"}</button></div>
    <div className="c-card"><strong>Computer</strong><p className="muted">{pairing ? `${status === "live" ? "Connected to" : "Paired with"} ${pairing.base.replace(/^https?:\/\//, "").replace(/\/$/, "")}${status === "offline" ? ", offline right now. Changes wait on this phone and sync later." : ""}` : "Not connected. Notes, tasks and the timer are saved on this phone."}</p>
      {pairing && <button className="pill-btn ghost" onClick={unpair}>Disconnect</button>}</div>
  </div></div>;
}

function ClockView({ state, now, run }: { state: State; now: number; run: Run }) {
  const date = new Date(now);
  const hm = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const rank = { high: 0, medium: 1, low: 2 }, today = localDate(date), pending = state.tasks.filter(task => !task.done && (!task.due || task.due <= today)).sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 4);
  const pinned = state.notes.filter(note => note.pinned).slice(0, 2);
  return <div className="clock-view">
    <div className="big-clock"><span>{hm}</span><small>{seconds}</small></div>
    <div className="clock-date">{new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(date)}</div>
    {state.media.active && <MiniPlayer media={state.media} run={run} compact={!isLauncher}/>}
    <div className="clock-cards">
      <div className="c-card"><span className="eyebrow">{pending.length ? "TODAY" : "ALL CLEAR"}</span>{pending.length ? pending.map(task => <p key={task.id} className={`prio ${task.priority}`}><i/>{task.text}</p>) : <p className="muted">Nothing waiting on you.</p>}</div>
      {!isLauncher && /Android/i.test(navigator.userAgent) && <LauncherLink/>}
      {pinned.map(note => <div className="c-card" key={note.id}><span className="eyebrow">PINNED</span><strong>{note.title || "Untitled note"}</strong><p className="muted clamp">{note.body.replace(/\[[ x]\] /gi, "• ")}</p></div>)}
    </div>
  </div>;
}

function NotesView({ notes, run, openId, setOpenId }: { notes: Note[]; run: Run; openId: string | null; setOpenId: (id: string | null) => void }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => notes.filter(note => `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt), [notes, query]);
  const open = notes.find(note => note.id === openId);
  if (open) return <NoteEditor note={open} run={run} back={() => setOpenId(null)}/>;
  return <div className="list-view">
    <div className="row"><h2>Notes</h2><button className="round" aria-label="New note" onClick={() => { const id = newId(); void run({ type: "note-save", note: { id, title: "", body: "" } }).then(() => setOpenId(id)); }}><Icon name="plus" size={20}/></button></div>
    <label className="c-search"><Icon name="search" size={16}/><input placeholder="Find a thought…" value={query} onChange={event => setQuery(event.target.value)}/></label>
    {shown.map(note => <button className="c-card note" key={note.id} onClick={() => setOpenId(note.id)}><div className="row"><strong>{note.title || "Untitled note"}</strong>{note.pinned && <Icon name="pin" size={13}/>}</div><p className="muted clamp">{note.body.replace(/\[[ x]\] /gi, "• ") || "Empty"}</p></button>)}
    {!shown.length && <p className="muted center-text">{query ? "No matching notes." : "No notes yet. Tap + to write one."}</p>}
  </div>;
}

function NoteEditor({ note, run, back }: { note: Note; run: Run; back: () => void }) {
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

function TasksView({ tasks, run }: { tasks: Task[]; run: Run }) {
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

function FocusView({ timer, now, run, synced }: { timer: Timer; now: number; run: Run; synced: boolean }) {
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
    <p className="muted">{timer.completed} sessions completed{synced ? " · Synced with your computer" : ""}</p>
  </div>;
}

function CalcView({ history, run }: { history: Calculation[]; run: Run }) {
  const [expression, setExpression] = useState(""), [answer, setAnswer] = useState("0"), [error, setError] = useState("");
  const solve = () => { try { const result = calculate(expression); setAnswer(result); setError(""); void run({ type: "calc-add", expression, result, id: newId() }); } catch (err) { setError((err as Error).message); } };
  const press = (key: string) => { if (key === "=") return solve(); if (key === "AC") { setExpression(""); setAnswer("0"); setError(""); return; } if (key === "⌫") return setExpression(value => value.slice(0, -1)); setExpression(value => value + key); };
  return <div className="calc-view">
    <div className="calc-screen"><input inputMode="decimal" value={expression} placeholder="0" onChange={event => setExpression(event.target.value)} onKeyDown={event => { if (event.key === "Enter") solve(); }}/><output>{error || answer}</output></div>
    <div className="pad">{["AC", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "%", "0", ".", "="].map(key => <button key={key} className={key === "=" ? "eq" : "÷×−+".includes(key) ? "op" : key === "AC" ? "fn" : ""} onClick={() => press(key)}>{key}</button>)}</div>
    {history.length > 0 && <div className="calc-history">{history.slice(0, 6).map(item => <button key={item.id} onClick={() => setExpression(item.result)}><span className="muted">{item.expression}</span><b>= {item.result}</b></button>)}</div>}
  </div>;
}

function MiniPlayer({ media, run, compact }: { media: Extract<MediaState, { active: true }>; run: Run; compact?: boolean }) {
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

/** On an Android browser, hand this pairing to the installed Island Launcher app. */
function LauncherLink() {
  let token = ""; try { token = JSON.parse(localStorage.getItem("island-desk-token") || '""'); } catch { /* ignore */ }
  if (!token) return null;
  const href = `islanddesk://pair?u=${encodeURIComponent(location.origin + "/")}&t=${encodeURIComponent(token)}`;
  return <a className="c-card launcher-link" href={href}><span className="eyebrow">HAVE ISLAND LAUNCHER?</span><strong>Open in Island Launcher</strong><p className="muted">Pairs the installed app with this computer in one tap.</p></a>;
}
