import { BatteryIndicator, useBattery } from "./Battery";
import Atmosphere from './Atmosphere';
import { Translation, useTranslation } from "./Translation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "./icons";
import { calculate } from "../shared/calculator";
import { defaults, duration, localDate, remaining, timeText, type Mode, type Note, type Settings, type Shortcut, type Snapshot, type Store, type Tab, type Task } from "../shared/model";
import type { Activity, CaptureKind, CompanionInfo, ContentPatch, DisplayState, MediaState, PhoneFeed, Stats, Weather } from "../shared/bridge";

const tabs: { id: Tab; label: string; icon: IconName }[] = [{ id: "notes", label: "Notes", icon: "notes" }, { id: "tasks", label: "Tasks", icon: "tasks" }, { id: "calculator", label: "Calculator", icon: "calculator" }, { id: "focus", label: "Focus", icon: "focus" }, { id: "tools", label: "Tools", icon: "tools" }, { id: "shortcuts", label: "Shortcuts", icon: "shortcuts" }, { id: "translation", label: "Translate", icon: "translate" }];
const uid = () => crypto.randomUUID();
const api = window.island;
function ping() { try { const context = new AudioContext(); const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = 660; gain.gain.setValueAtTime(0.06, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.65); oscillator.start(); oscillator.stop(context.currentTime + 0.7); oscillator.onended = () => void context.close(); } catch { /* A muted device still receives the visual completion. */ } }
export default function App() {
  const translation = useTranslation();
  const battery = useBattery();
  const [store, setStore] = useState<Store>(defaults), [snapshot, setSnapshot] = useState<Snapshot | null>(null), [mode, setMode] = useState<Mode>("compact"), [tab, setTab] = useState<Tab>("notes"), [now, setNow] = useState(Date.now()), [toast, setToast] = useState(""), [saved, setSaved] = useState(true), [ready, setReady] = useState(false), [media, setMedia] = useState<MediaState>({ active: false }), [phone, setPhone] = useState<PhoneFeed>({ connected: false, device: "", items: [], at: 0 }), [activity, setActivity] = useState<Activity | null>(null), [weather, setWeather] = useState<Weather | null>(null);
  const [localSound,setLocalSound]=useState(false);
  useEffect(()=>{const changed=(e:Event)=>setLocalSound(Boolean((e as CustomEvent<{active:boolean}>).detail?.active));window.addEventListener("island-audio-state",changed);return()=>window.removeEventListener("island-audio-state",changed);},[]);
  const activityQueue = useRef<Activity[]>([]), activityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Live island: show one announcement at a time for a few seconds, then the next. */
  function announce(next: Activity) {
    activityQueue.current.push(next); if (activityQueue.current.length > 4) activityQueue.current.shift();
    if (!activityTimer.current) playNext();
  }
  const [ok, setOk] = useState(0);
  function celebrate() { setOk(value => value + 1); }
  useEffect(() => { if (!ok) return; const timer = setTimeout(() => setOk(0), 700); return () => clearTimeout(timer); }, [ok]);
  function openActivity(item: Activity) {
    if (activityTimer.current) clearTimeout(activityTimer.current); activityTimer.current = null; setActivity(null); activityQueue.current = [];
    if (item.kind === "reminder") { setTab("tasks"); api?.mode("expanded"); }
    else if (item.kind === "timer") { setTab("focus"); api?.mode("expanded"); }
    else api?.mode("preview");
  }
  function playNext() {
    const next = activityQueue.current.shift();
    if (!next) { setActivity(null); activityTimer.current = null; return; }
    setActivity(next); activityTimer.current = setTimeout(() => { setActivity(null); activityTimer.current = setTimeout(playNext, 420); }, next.kind === "music" ? 3800 : 4800);
  }
  const [capture, setCapture] = useState<CaptureKind | null>(null);
  const storeRef = useRef(store), modeRef = useRef(mode), island = useRef<HTMLElement>(null), hover = useRef<ReturnType<typeof setTimeout> | null>(null), toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  storeRef.current = store; modeRef.current = mode;
  function message(text: string) { setToast(text); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 5500); }
  useEffect(() => {
    if (!api) { setToast("Open Island Desk with the desktop launcher, not in a browser."); return; }
    const dispose = api.onEvent(event => {
      if (event.type === "mode") {
        setMode(event.mode);
        if (event.mode !== "expanded") setCapture(null);
      }
      if (event.type === "capture") setCapture(event.kind);
      if (event.type === "timer") { setStore(current => ({ ...current, timer: event.timer })); if (event.completedPhase) { announce({ kind: "timer", title: event.completedPhase === "work" ? "Focus session done" : "Break over", text: event.completedPhase === "work" ? "Take a breather." : "Ready when you are." }); message(event.completedPhase === "work" ? "Session complete. Take a little breather." : "Break complete. Ready when you are."); if (storeRef.current.settings.sound) ping(); } }
      if (event.type === "replace") { setSnapshot(event.snapshot); setStore(event.snapshot.store); }
      if (event.type === "saved") setSaved(true);
      if (event.type === "media") { setMedia(event.media);  }
      if (event.type === "phone") setPhone(event.phone);
      if (event.type === "weather") setWeather(event.weather);
      if (event.type === "activity") announce(event.activity);
      if (event.type === "error") { setSaved(false); message(event.message); }
    });
    void api.snapshot().then(data => { setSnapshot(data); setStore(data.store); setReady(true); }).catch(error => message(error.message));
    void api.media().then(setMedia).catch(() => undefined);
    void api.phone().then(setPhone).catch(() => undefined);
    void api.weather().then(setWeather).catch(() => undefined);
    const clock = setInterval(() => setNow(Date.now()), 250);
    return () => { dispose(); clearInterval(clock); };
  }, []);
  useEffect(() => {
    let frame = 0, last = 0;
    const report = (timestamp: number) => {
      if (island.current && timestamp - last > 25) {
        const bounds = island.current.getBoundingClientRect(), style = getComputedStyle(island.current);
        api?.geometry({ x: Math.max(0, bounds.x), y: Math.max(0, bounds.y), width: bounds.width, height: bounds.height, radius: parseFloat(style.borderTopLeftRadius) * storeRef.current.settings.scale }); last = timestamp;
      }
      frame = requestAnimationFrame(report);
    };
    frame = requestAnimationFrame(report); return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (!event.defaultPrevented) api?.mode("compact"); return; }
      if (!event.altKey && (event.ctrlKey || event.metaKey) && /^[1-7]$/.test(event.key)) { event.preventDefault(); setTab(tabs[Number(event.key) - 1].id); }
    };
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  }, []);
  function save(patch: ContentPatch) {
    // A brief highlight when something new was added.
    const cur = storeRef.current;
    if ((patch.tasks && patch.tasks.length > cur.tasks.length) || (patch.notes && patch.notes.length > cur.notes.length) || (patch.calculations && patch.calculations.length > cur.calculations.length)) celebrate();
    setSaved(false); setStore(current => ({ ...current, ...patch }));
    void api.save(patch).catch(error => message(error.message));
  }
  function saveCapture(kind: CaptureKind, text: string) {
    const current = storeRef.current;
    if (kind === "note") {
      save({ notes: [{ id: uid(), title: text.slice(0, 300), body: "", pinned: false, checklist: false, updatedAt: Date.now() }, ...current.notes] });
      setTab("notes");
    } else {
      save({ tasks: [{ id: uid(), text, priority: "medium", due: "", reminderAt: "", notified: false, done: false, createdAt: Date.now() }, ...current.tasks] });
      setTab("tasks");
    }
    setCapture(null);
    message(kind === "note" ? "Note added." : "Task added.");
  }
  async function changeSettings(patch: Partial<Settings>) {
    try { const settings = await api.settings(patch); setStore(current => ({ ...current, settings })); if(patch.workMinutes!==undefined||patch.breakMinutes!==undefined){celebrate();announce({kind:"timer",title:"Focus time updated",text:"Your next session is ready."});}return true; } catch (error) { message((error as Error).message); return false; }
  }
  useEffect(()=>{const react=(event:Event)=>{celebrate();announce({kind:"music",title:(event as CustomEvent<{title?:string}>).detail?.title || "Local music",text:"Audio reactions are ready."});};window.addEventListener("island-local-music",react);return()=>window.removeEventListener("island-local-music",react);},[]);
  const timerMs = remaining(store.timer, now);
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(now);
  const clockLabel = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const focused = store.timer.running;
  const timerRequest = (action: "toggle" | "reset" | "skip" | "work" | "break") => { void api.timer(action).then(timer => { setStore(current => ({ ...current, timer })); if (action === "toggle" && timer.running) celebrate(); }).catch(error => message(error.message)); };
  // Decide the slide direction once, when the tab changes, so clock re-renders cannot flip it.
  const tabOrder = [...tabs.map(item => item.id), "settings"], previousTab = useRef(tab), tabDirectionRef = useRef<"forward" | "back">("forward");
  if (previousTab.current !== tab) { tabDirectionRef.current = tabOrder.indexOf(tab) > tabOrder.indexOf(previousTab.current) ? "forward" : "back"; previousTab.current = tab; }
  const tabDirection = tabDirectionRef.current;
  const [toastShown, toastLeaving] = useLeaving(toast);
  return <main className={`canvas ${store.settings.reducedMotion ? "reduce-motion" : ""}`} style={{ "--scale": store.settings.scale } as CSSProperties}>
    <div className={`island-wrap wrap-${mode}`}><i className="ear left" aria-hidden="true"/><i className="ear right" aria-hidden="true"/><section ref={island} className={`island ${mode} ${ok ? "ok-flash" : ""} ${focused ? "focus-reacting" : ""} ${media.active && media.playing ? "media-reacting" : ""} ${activity && mode === "compact" ? `live live-${activity.kind}` : ""}`} aria-label="Island Desk" onMouseEnter={() => { if (modeRef.current === "compact") hover.current = setTimeout(() => { if (modeRef.current === "compact") api?.mode("preview"); }, 180); }} onMouseLeave={() => { if (hover.current) clearTimeout(hover.current); }}>
      {activity && mode === "compact" && <button className="live-card" key={activity.title + activity.text} role="status" aria-live="polite" onClick={() => openActivity(activity)} title="Open">
        <span className="live-ring">{activity.icon ? <img src={activity.icon} alt=""/> : <Icon name={activity.kind === "music" ? "music" : activity.kind === "timer" ? "focus" : activity.kind === "reminder" ? "alarm" : activity.kind === "connected" ? "check" : "notes"} size={17}/>}</span>
        <span className="live-text"><b>{activity.title}</b><small>{activity.text}</small></span>
        {activity.kind === "music" ? <span className="signal music active"><i/><i/><i/><i/></span> : <Icon name="chevron" size={15}/>}
      </button>}
      <button className={`compact-face ${activity && mode === "compact" ? "hidden-face" : ""}`} aria-label="Expand Island Desk" onClick={() => api?.mode("expanded")} tabIndex={mode === "expanded" ? -1 : 0}>
        {!focused && (media.active || localSound) ? <>{media.active && media.art ? <img className="compact-art" src={media.art} alt=""/> : <span className="compact-art blank"><Icon name="music" size={13}/></span>}<span className="compact-label compact-track">{media.active ? media.title : "Device audio"}</span><span className={`signal music ${(media.active && media.playing) || localSound ? "active" : "paused"}`}><i/><i/><i/><i/></span></>
          : focused ? <><span className="signal active"><i/><i/><i/><i/></span><span className="compact-label">{store.timer.phase === "work" ? "In the flow" : "Take a breather"}</span><span className="compact-right"><Rolling text={timeText(timerMs)}/></span></>
          : <span className="pill-idle"><b>{clockLabel}</b>{weather && <><i className="pill-sep"/><span className="pill-weather"><Icon name={weatherIcon(weather)} size={15}/>{weather.temp}°</span></>}<i className={`pill-dot ${phone.connected ? "on" : ""}`} title={phone.connected ? `${phone.device} connected` : "Island Desk"}/></span>}
        <BatteryIndicator battery={battery}/>
      </button>
      {mode === "preview" && <Preview onSettings={() => { setTab("settings"); api?.mode("expanded"); }} weather={weather} phone={phone} media={media} now={now} clock={clockLabel} date={dateLabel} tasks={store.tasks} focus={focused ? `${timeText(timerMs)} · ${store.timer.phase === "work" ? "focus" : "break"}` : ""} message={message} onOpen={() => { setTab("tasks"); api?.mode("expanded"); }}/>}
      <div className="workspace" aria-hidden={mode !== "expanded" || !!capture} inert={mode !== "expanded" || !!capture}>
        <header className="topbar"><div className="brand"><span className="brand-mark"><i/><i/></span><strong>island<span>desk</span></strong><span className="version">{snapshot ? `V${snapshot.version}` : ""}</span></div><div className="top-actions"><BatteryIndicator battery={battery}/><span className="time">{clockLabel}</span><button className={`icon-btn ${tab === "settings" ? "selected" : ""}`} title="Settings" aria-label="Settings" onClick={() => setTab("settings")}><Icon name="settings"/></button><button className="icon-btn" title="Collapse · Esc" aria-label="Collapse island" onClick={() => api.mode("compact")}><Icon name="close"/></button></div></header>
        <div className="workspace-intro"><div><span className="eyebrow">{dateLabel}</span><h1>{tab === "settings" ? "Settings" : tabs.find(item => item.id === tab)?.label ?? "Workspace"}</h1></div><span className="offline"><span/>{tab === "translation" ? "Internet required" : "Local workspace"}</span></div>
        <nav className="tabs" aria-label="Workspace">{tabs.map((item, index) => <button key={item.id} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} title={`${item.label} · Ctrl+${index + 1}`}><Icon name={item.icon} size={16}/>{item.label}{item.id === "tasks" && store.tasks.some(task => !task.done) && <span className="count">{store.tasks.filter(task => !task.done).length}</span>}</button>)}<button aria-current={tab === "settings" ? "page" : undefined} className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Icon name="settings" size={16}/>Settings</button></nav>
        <div className={`content slide-${tabDirection}`} ><div hidden={tab !== "settings"}><Atmosphere/></div>{!ready ? <Empty icon="notes" title="Opening your workspace…" detail="Everything stays on this device."/> : <>
          {tab === "notes" && <Notes notes={store.notes} onChange={notes => save({ notes })}/>}
          {tab === "tasks" && <Tasks tasks={store.tasks} onChange={tasks => save({ tasks })}/>}
          {tab === "calculator" && <Calculator items={store.calculations} onChange={calculations => save({ calculations })} message={message}/>}
          {tab === "focus" && <Focus store={store} now={now} action={timerRequest} update={changeSettings}/>}
          {tab === "translation" && <Translation state={translation} message={message}/>}
          {tab === "tools" && <Tools message={message}/>}
          {tab === "shortcuts" && <Shortcuts items={store.shortcuts} onChange={shortcuts => save({ shortcuts })} message={message}/>}
          {tab === "settings" && snapshot && <Preferences settings={store.settings} snapshot={snapshot} update={changeSettings} message={message}/>}
        </>}</div>
        <footer><span className={`save-status ${saved ? "" : "saving"}`}><span/>{tab === "translation" ? "Translation drafts are not saved" : saved ? "Saved on this device" : "Saving changes…"}</span><span>Less switching. More doing.<kbd>esc</kbd> to fold away</span></footer>
      </div>
      {capture && mode === "expanded" && <QuickCapture key={capture} kind={capture} cancel={() => setCapture(null)} save={text => saveCapture(capture, text)} ready={ready}/>}
      {toastShown && mode === "expanded" && <div className={`toast ${toastLeaving ? "leaving" : ""}`} role="status"><span>{toastShown}</span><button className="icon-btn" aria-label="Dismiss message" onClick={() => setToast("")}><Icon name="close" size={14}/></button></div>}
    </section></div>
  </main>;
}
function QuickCapture({ kind, cancel, save, ready }: { kind: CaptureKind; cancel: () => void; save: (text: string) => void; ready: boolean }) {
  const [text, setText] = useState("");
  const label = kind === "note" ? "Note title" : "Task";
  return <div className="capture-overlay" role="dialog" aria-modal="true" aria-labelledby="capture-title" onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); cancel(); }
    if (event.key === "Tab") {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input, button:not(:disabled)"));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <form className="capture-dialog" onSubmit={event => { event.preventDefault(); if (ready && text.trim()) save(text.trim()); }}>
      <h2 id="capture-title">{kind === "note" ? "Quick note" : "Quick task"}</h2>
      <label>{label}<input autoFocus value={text} onChange={event => setText(event.target.value)} maxLength={kind === "note" ? 300 : 2000}/></label>
      <div><button type="button" className="text-btn" onClick={cancel}>Cancel</button><button className="primary" disabled={!ready || !text.trim()}>Add {kind}</button></div>
    </form>
  </div>;
}
function Empty({ icon, title, detail }: { icon: IconName; title: string; detail: string }) { return <div className="empty"><span className="empty-icon"><Icon name={icon} size={27}/></span><h2>{title}</h2><p>{detail}</p></div>; }
function Notes({ notes, onChange }: { notes: Note[]; onChange: (notes: Note[]) => void }) {
  const [query, setQuery] = useState(""), [selectedId, setSelectedId] = useState(notes[0]?.id || ""), [confirmDelete, setConfirmDelete] = useState(false);
  const shown = notes.filter(note => `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  const selected = notes.find(note => note.id === selectedId) || shown[0];
  function create() { const note: Note = { id: uid(), title: "", body: "", pinned: false, checklist: false, updatedAt: Date.now() }; onChange([note, ...notes]); setSelectedId(note.id); setQuery(""); }
  function patch(input: Partial<Note>) { if (selected) onChange(notes.map(note => note.id === selected.id ? { ...note, ...input, updatedAt: Date.now() } : note)); }
  useEffect(() => { setConfirmDelete(false); }, [selected?.id]);
  return <div className="notes-layout"><aside className="note-sidebar"><div className="section-row"><h2>Your notes <span>{notes.length.toString().padStart(2, "0")}</span></h2><button className="icon-btn add" aria-label="New note" title="New note" onClick={create}><Icon name="plus" size={17}/></button></div><label className="search"><Icon name="search" size={15}/><input aria-label="Search notes" placeholder="Search notes" value={query} onChange={event => setQuery(event.target.value)}/></label><div className="note-list">{shown.map(note => <button className={`note-card ${selected?.id === note.id ? "active" : ""}`} key={note.id} onClick={() => setSelectedId(note.id)} draggable title="Drag out of the island to put it on your desktop" onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", note.title || "Note"); }} onDragEnd={event => { const island = document.querySelector(".island")?.getBoundingClientRect(); const outside = !island || event.clientX < island.left || event.clientX > island.right || event.clientY < island.top || event.clientY > island.bottom; if (outside && event.dataTransfer.dropEffect === "none") void api.stickyOpen(note.id, { x: event.screenX, y: event.screenY }); }}><div><strong>{note.title || "Untitled note"}</strong>{note.pinned && <Icon name="pin" size={12}/>}{note.sticky && <Icon name="sticky" size={12}/>}</div><p>{note.body.replace(/\[[ x]\]/g, "") || "Empty note"}</p><small>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{note.checklist && " · Checklist"}</small></button>)}{!shown.length && <div className="list-empty">{query ? "No matching notes." : "No notes yet."}</div>}</div><button className="text-btn new-note" onClick={create}><Icon name="plus" size={15}/>New note</button></aside>
    {selected ? <article className="note-editor"><div className="editor-meta"><span className="eyebrow">{selected.checklist ? "Checklist" : "Note"}</span><div><button className={`icon-btn ${selected.sticky ? "selected" : ""}`} title={selected.sticky ? "Bring back into the island" : "Put on desktop"} aria-label={selected.sticky ? "Bring note back into the island" : "Put note on desktop"} onClick={() => void (selected.sticky ? api.stickyClose(selected.id) : api.stickyOpen(selected.id))}><Icon name="sticky" size={16}/></button><button className={`icon-btn ${selected.pinned ? "selected" : ""}`} onClick={() => patch({ pinned: !selected.pinned })} aria-label={selected.pinned ? "Unpin note" : "Pin note"}><Icon name="pin" size={16}/></button><button className={`icon-btn ${selected.checklist ? "selected" : ""}`} onClick={() => patch({ checklist: !selected.checklist })} aria-label="Toggle checklist"><Icon name="tasks" size={16}/></button><button className="icon-btn danger" onClick={() => setConfirmDelete(true)} aria-label="Delete note"><Icon name="trash" size={16}/></button></div></div>
      <input className="note-title" autoFocus={!selected.title && !selected.body} key={selected.id} aria-label="Note title" placeholder="Note title" maxLength={300} value={selected.title} onChange={event => patch({ title: event.target.value })}/>
      {selected.checklist ? <div className="checklist">{selected.body.split("\n").map((line, index, lines) => <label key={index}><input type="checkbox" checked={/^\[x\] /i.test(line)} onChange={() => patch({ body: lines.map((text, i) => i === index ? /^\[x\] /i.test(text) ? text.replace(/^\[x\] /i, "[ ] ") : "[x] " + text.replace(/^\[ \] /, "") : text).join("\n") })}/><input aria-label={`Checklist item ${index + 1}`} placeholder="Checklist item" value={line.replace(/^\[[ x]\] /i, "")} onChange={event => patch({ body: lines.map((text, i) => i === index ? `${/^\[x\]/i.test(text) ? "[x]" : "[ ]"} ${event.target.value}` : text).join("\n") })} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); patch({ body: selected.body + "\n[ ] " }); } }}/><button className="icon-btn" aria-label={`Remove checklist item ${index + 1}`} onClick={event => { event.preventDefault(); patch({ body: lines.filter((_line, i) => i !== index).join("\n") }); }}><Icon name="close" size={12}/></button></label>)}<button className="text-btn" onClick={() => patch({ body: selected.body + "\n[ ] " })}><Icon name="plus" size={15}/>Add item</button></div> : <textarea className="note-body" aria-label="Note body" maxLength={200000} placeholder="Write a note" value={selected.body} onChange={event => patch({ body: event.target.value })}/>}
      <div className="note-bottom"><span>{selected.body.trim() ? selected.body.trim().split(/\s+/).length : 0} words</span><span>Only on your device <Icon name="check" size={12}/></span></div>
      {confirmDelete && <div className="inline-confirm"><span>Delete this note?</span><button onClick={() => { onChange(notes.filter(note => note.id !== selected.id)); setConfirmDelete(false); }}>Delete</button><button onClick={() => setConfirmDelete(false)}>Keep it</button></div>}
    </article> : <div className="empty-note"><Empty icon="notes" title="No note selected" detail="Choose an existing note or create a new one."/><button className="primary" onClick={create}><Icon name="plus" size={16}/>Create your first note</button></div>}
  </div>;
}
function Tasks({ tasks, onChange }: { tasks: Task[]; onChange: (tasks: Task[]) => void }) {
  const [filter, setFilter] = useState("today"), [text, setText] = useState(""), [priority, setPriority] = useState<Task["priority"]>("medium"), [due, setDue] = useState(localDate()), [reminderAt, setReminder] = useState(""), [expanded, setExpanded] = useState("");
  const today = localDate(), open = tasks.filter(task => !task.done), done = tasks.filter(task => task.done).length;
  const shown = tasks.filter(task => filter === "done" ? task.done : !task.done && (filter === "all" || !task.due || task.due <= today)).sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]) || (a.due || "9999").localeCompare(b.due || "9999"));
  function patch(id: string, input: Partial<Task>) { onChange(tasks.map(task => task.id === id ? { ...task, ...input } : task)); }
  return <div className="tasks-panel"><div className="section-row"><div><h2>Task list</h2></div><span className="pill muted">{done} complete · {open.length} to go</span></div><div className="task-filters">{[["today", "Today"], ["all", "All tasks"], ["done", "Completed"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <form className="task-capture" onSubmit={event => { event.preventDefault(); if (!text.trim()) return; onChange([{ id: uid(), text: text.trim(), priority, due, reminderAt, notified: false, done: false, createdAt: Date.now() }, ...tasks]); setText(""); setReminder(""); }}><div><Icon name="plus"/><input aria-label="New task" placeholder="Enter a task" maxLength={2000} value={text} onChange={event => setText(event.target.value)}/><button className="primary" disabled={!text.trim()} type="submit">Add task<Icon name="arrow" size={15}/></button></div><div className="capture-options"><label>Priority<select aria-label="Task priority" value={priority} onChange={event => setPriority(event.target.value as Task["priority"])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Due<input aria-label="Task due date" type="date" value={due} onChange={event => setDue(event.target.value)}/></label><label>Remind me<input aria-label="Task reminder" type="datetime-local" value={reminderAt} onChange={event => setReminder(event.target.value)}/></label></div></form>
    <div className="task-list">{shown.map(task => <div className={`task-item ${task.done ? "done" : ""}`} key={task.id}><div className="task-line"><button className="check-button" aria-label={task.done ? `Reopen ${task.text}` : `Complete ${task.text}`} onClick={() => patch(task.id, { done: !task.done })}>{task.done && <Icon name="check" size={13}/>}</button><button className="task-name" onClick={() => setExpanded(expanded === task.id ? "" : task.id)}>{task.text}</button><span className={`priority ${task.priority}`}><i/>{task.priority}</span>{task.due && <span className={`due ${task.due < today && !task.done ? "overdue" : ""}`}>{task.due === today ? "Today" : new Date(task.due + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}<button className="icon-btn" aria-label={`Edit ${task.text}`} onClick={() => setExpanded(expanded === task.id ? "" : task.id)}><Icon name="chevron" size={14}/></button></div>{expanded === task.id && <div className="task-edit"><input aria-label="Edit task text" value={task.text} maxLength={2000} onChange={event => patch(task.id, { text: event.target.value })}/><label>Priority<select value={task.priority} onChange={event => patch(task.id, { priority: event.target.value as Task["priority"] })}><option>low</option><option>medium</option><option>high</option></select></label><label>Due<input type="date" value={task.due} onChange={event => patch(task.id, { due: event.target.value })}/></label><label>Reminder<input type="datetime-local" value={task.reminderAt} onChange={event => patch(task.id, { reminderAt: event.target.value, notified: false })}/></label><button className="icon-btn danger" aria-label="Delete task" onClick={() => onChange(tasks.filter(item => item.id !== task.id))}><Icon name="trash" size={16}/></button></div>}</div>)}{!shown.length && <Empty icon="tasks" title={filter === "done" ? "No completed tasks" : "No tasks in this view"} detail={filter === "done" ? "Your completed tasks will collect here." : "Add a task or choose a different filter."}/>}</div>
  </div>;
}
function Calculator({ items, onChange, message }: { items: Store["calculations"]; onChange: (items: Store["calculations"]) => void; message: (text: string) => void }) {
  const [expression, setExpression] = useState(""), [answer, setAnswer] = useState("0"), [error, setError] = useState(""); const input = useRef<HTMLInputElement>(null);
  function solve() { try { const result = calculate(expression); setAnswer(result); setError(""); onChange([{ id: uid(), expression, result, at: Date.now() }, ...items].slice(0, 200)); } catch (err) { setError((err as Error).message); } }
  function key(value: string) {
    if (value === "=") { solve(); return; }
    if (value === "AC") { setExpression(""); setAnswer("0"); setError(""); return; }
    if (value === "⌫") { setExpression(current => current.slice(0, -1)); return; }
    setExpression(current => (current + value).slice(0, 500)); input.current?.focus();
  }
  // Keys typed anywhere on this tab go into the calculation, so you can just start typing.
  useEffect(() => {
    const route = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target === input.current || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[0-9()%^.*/+-]$/.test(event.key) || event.key === "Backspace" || event.key === "Enter") input.current?.focus();
    };
    window.addEventListener("keydown", route, true); return () => window.removeEventListener("keydown", route, true);
  }, []);
  return <div className="calculator-layout"><section className="calculator"><span className="eyebrow">Expression</span><form onSubmit={event => { event.preventDefault(); solve(); }}><input ref={input} autoFocus aria-label="Calculation" placeholder="Type a calculation…" value={expression} maxLength={500} autoComplete="off" spellCheck={false} onChange={event => { setExpression(event.target.value); setError(""); }}/><output className="answer" aria-live="polite">{answer}</output>{error && <span className="calc-error" role="alert">{error}</span>}</form><div className="keypad">{["AC", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "%", "0", ".", "="].map(value => <button key={value} className={value === "=" ? "equals" : ["÷", "×", "−", "+"].includes(value) ? "operator" : ""} onClick={() => key(value)}>{value}</button>)}</div><p className="micro">Keyboard ready · Enter to calculate · % means ÷100</p></section><aside className="calc-history"><div className="section-row"><h2>Recent calculations</h2>{items.length > 0 && <button className="text-btn" onClick={() => onChange([])}>Clear</button>}</div>{!items.length && <p className="list-empty">No calculations yet.</p>}{items.map(item => <div className="history-item" key={item.id}><button onClick={() => { setExpression(item.expression); setAnswer(item.result); }}><small>{item.expression}</small><strong>= {item.result}</strong></button><button className="icon-btn" title="Copy result" aria-label="Copy result" onClick={() => void navigator.clipboard.writeText(item.result).then(() => message("Result copied.")).catch(() => message("Clipboard unavailable."))}><Icon name="copy" size={14}/></button></div>)}</aside></div>;
}
function Focus({ store, now, action, update }: { store: Store; now: number; action: (value: "toggle" | "reset" | "skip" | "work" | "break") => void; update: (patch: Partial<Settings>) => Promise<boolean> }) {
  const { timer, settings } = store, left = remaining(timer, now), percent = Math.max(0, Math.min(1, left / duration(timer.phase, settings)));
  return <div className="focus-layout"><section className="focus-main"><div className="segmented"><button className={timer.phase === "work" ? "active" : ""} onClick={() => action("work")}>Focus</button><button className={timer.phase !== "work" ? "active" : ""} onClick={() => action("break")}>Break</button></div><div className={`timer-orbit ${timer.running ? "running" : ""}`}><svg viewBox="0 0 260 260" aria-hidden="true"><circle className="track" cx="130" cy="130" r="117"/><circle className="progress" cx="130" cy="130" r="117" strokeDasharray={735.13} strokeDashoffset={735.13 * (1 - percent)}/></svg><div><span className="eyebrow">{timer.phase === "work" ? "Focus session" : timer.phase === "longBreak" ? "Long break" : "Short break"}</span><strong className="countdown"><Rolling text={timeText(left)}/></strong><span className="timer-caption">{timer.running ? "Timer running" : "Timer stopped"}</span></div></div><div className="timer-actions"><button className="icon-btn" aria-label="Reset timer" title="Reset timer" onClick={() => action("reset")}><Icon name="reset" size={19}/></button><button className="primary start-focus" onClick={() => action("toggle")}><Icon name={timer.running ? "pause" : "play"} size={16}/>{timer.running ? "Pause session" : "Start session"}</button><button className="icon-btn" aria-label="Skip session" title="Skip session" onClick={() => action("skip")}><Icon name="skip" size={19}/></button></div></section><aside className="focus-sidebar"><h2>Session lengths</h2><div className="duration-grid">{([["workMinutes", "Focus", 180], ["breakMinutes", "Short break", 60], ["longBreakMinutes", "Long break", 120], ["longBreakEvery", "Long break every", 12]] as const).map(([field, label, max]) => <label key={field}>{label}<span><input aria-label={label + " duration"} type="number" min={field === "longBreakEvery" ? 2 : 1} max={max} value={settings[field]} onChange={event => { const value = Number(event.target.value); if (value >= (field === "longBreakEvery" ? 2 : 1) && value <= max) void update({ [field]: value }); }}/><small>{field === "longBreakEvery" ? "sessions" : "min"}</small></span></label>)}</div><div className="session-dots">{Array.from({ length: settings.longBreakEvery }, (_, index) => <i key={index} className={index < timer.sessions % settings.longBreakEvery ? "complete" : ""}/>)}<span>{timer.completed} sessions completed</span></div><p className="micro">Changes apply to the next session. Start each break yourself. Your timer keeps time while the island is folded away.</p></aside></div>;
}
const unitGroups: Record<string, Record<string, number>> = { Length: { Meters: 1, Kilometers: 1000, Centimeters: 0.01, Miles: 1609.344, Feet: 0.3048, Inches: 0.0254 }, Weight: { Kilograms: 1, Grams: 0.001, Pounds: 0.45359237, Ounces: 0.028349523125 }, Volume: { Liters: 1, Milliliters: 0.001, "US gallons": 3.785411784, "US cups": 0.2365882365 }, Temperature: { Celsius: 1, Fahrenheit: 1, Kelvin: 1 } };
function Tools({ message }: { message: (text: string) => void }) {
  const [tool, setTool] = useState("convert"), [group, setGroup] = useState("Length"), [from, setFrom] = useState("Meters"), [to, setTo] = useState("Feet"), [value, setValue] = useState("1"), [text, setText] = useState(""), [start, setStart] = useState(localDate()), [end, setEnd] = useState(localDate()), [days, setDays] = useState("7");
  const numeric = Number(value); let converted = numeric * unitGroups[group][from] / unitGroups[group][to];
  if (group === "Temperature") { const celsius = from === "Celsius" ? numeric : from === "Fahrenheit" ? (numeric - 32) * 5 / 9 : numeric - 273.15; converted = to === "Celsius" ? celsius : to === "Fahrenheit" ? celsius * 9 / 5 + 32 : celsius + 273.15; }
  const validNumber = value.trim() !== "" && Number.isFinite(numeric) && Number.isFinite(converted);
  const difference = start && end ? Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000) : NaN;
  const shifted = start && days.trim() !== "" && Number.isInteger(Number(days)) && Math.abs(Number(days)) < 365000 ? new Date(Date.parse(start + "T00:00:00Z") + Number(days) * 86400000) : null;
  return <div className="tools-panel"><div className="section-row"><div><h2>Utilities</h2></div><div className="segmented">{[["convert", "Convert"], ["dates", "Dates"], ["text", "Text"]].map(([id, label]) => <button className={tool === id ? "active" : ""} onClick={() => setTool(id)} key={id}>{label}</button>)}</div></div>
    {tool === "convert" && <div className="tool-card"><label>What are we converting?<select value={group} onChange={event => { const next = event.target.value; setGroup(next); const units = Object.keys(unitGroups[next]); setFrom(units[0]); setTo(units[1]); }}>{Object.keys(unitGroups).map(name => <option key={name}>{name}</option>)}</select></label><div className="converter"><label>From<input type="number" value={value} onChange={event => setValue(event.target.value)}/><select aria-label="From unit" value={from} onChange={event => setFrom(event.target.value)}>{Object.keys(unitGroups[group]).map(name => <option key={name}>{name}</option>)}</select></label><button className="icon-btn" title="Swap units" aria-label="Swap units" onClick={() => { setFrom(to); setTo(from); }}><Icon name="arrow"/></button><label>To<output>{validNumber ? Number(converted.toPrecision(10)).toLocaleString(undefined, { maximumFractionDigits: 8 }) : "—"}</output><select aria-label="To unit" value={to} onChange={event => setTo(event.target.value)}>{Object.keys(unitGroups[group]).map(name => <option key={name}>{name}</option>)}</select></label></div><p className="micro">Offline, fixed unit definitions. Temperature uses absolute scales; volume uses US measures.</p></div>}
    {tool === "dates" && <div className="tool-card"><div className="date-inputs"><label>From<input type="date" value={start} onChange={event => setStart(event.target.value)}/></label><label>To<input type="date" value={end} onChange={event => setEnd(event.target.value)}/></label></div><div className="date-result"><strong>{Number.isFinite(difference) ? Math.abs(difference) : "—"}</strong><span>calendar days {difference < 0 ? "before" : "between"}</span></div><div className="date-shift"><label>Add or subtract days<input type="number" min={-364999} max={364999} step="1" value={days} onChange={event => setDays(event.target.value)}/></label><Icon name="arrow"/><output>{shifted && Number.isFinite(shifted.getTime()) ? shifted.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "Choose a date and number of days"}</output></div><p className="micro">Calendar-day arithmetic, without daylight-saving surprises. The start day is excluded.</p></div>}
    {tool === "text" && <div className="text-tool"><textarea placeholder="Enter or paste text" aria-label="Text tools input" value={text} maxLength={200000} onChange={event => setText(event.target.value)}/><div className="section-row"><span className="micro">{text.trim() ? text.trim().split(/\s+/).length : 0} words · {text.length} characters · {text ? text.split(/\n/).length : 0} lines</span><button className="text-btn" onClick={() => void navigator.clipboard.writeText(text).then(() => message("Text copied.")).catch(() => message("Clipboard unavailable."))}><Icon name="copy" size={15}/>Copy</button></div><div className="case-buttons"><button onClick={() => setText(text.toUpperCase())}>UPPERCASE</button><button onClick={() => setText(text.toLowerCase())}>lowercase</button><button onClick={() => setText(text.toLowerCase().replace(/\b\p{L}/gu, char => char.toUpperCase()))}>Title Case</button><button onClick={() => setText(text.trim().replace(/[ \t]+/g, " "))}>Clean spaces</button></div></div>}
  </div>;
}
function Shortcuts({ items, onChange, message }: { items: Shortcut[]; onChange: (items: Shortcut[]) => void; message: (text: string) => void }) {
  const [name, setName] = useState(""), [target, setTarget] = useState(""), [kind, setKind] = useState<Shortcut["kind"]>("website"), [error, setError] = useState("");
  async function pick() { try { const selected = await api.pick(kind === "folder" ? "folder" : "app"); if (selected) { setTarget(selected); if (!name) setName(selected.split(/[\\/]/).at(-1)?.replace(/\.exe$/i, "") || "Shortcut"); } } catch (err) { message((err as Error).message); } }
  function add() {
    setError(""); let value = target.trim();
    if (!name.trim() || !value) return;
    if (kind === "website") { try { if (!/^https?:\/\//i.test(value)) value = "https://" + value; const url = new URL(value); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw Error(); } catch { setError("Use a valid https:// or http:// website address."); return; } }
    onChange([...items, { id: uid(), name: name.trim(), kind, target: value }]); setName(""); setTarget("");
  }
  return <div className="shortcuts-panel"><h2>Add a shortcut</h2><form className="shortcut-form" onSubmit={event => { event.preventDefault(); add(); }}><select aria-label="Shortcut type" value={kind} onChange={event => { setKind(event.target.value as Shortcut["kind"]); setTarget(""); }}><option value="website">Website</option><option value="app">Application</option><option value="folder">Folder</option></select><input aria-label="Shortcut name" maxLength={100} placeholder="Shortcut name" value={name} onChange={event => setName(event.target.value)}/><input aria-label="Shortcut target" maxLength={2000} placeholder={kind === "website" ? "https://…" : "Choose a local path…"} value={target} onChange={event => setTarget(event.target.value)}/>{kind !== "website" && <button type="button" className="icon-btn" aria-label="Browse for shortcut" onClick={() => void pick()}><Icon name="folder"/></button>}<button className="primary" disabled={!name.trim() || !target.trim() || items.length >= 100}><Icon name="plus" size={16}/>Save</button></form>{error && <p className="error" role="alert">{error}</p>}<div className="shortcut-grid">{items.map(item => <div className="shortcut-card" key={item.id}><button onClick={() => void api.open(item).catch(err => message(err.message))}><span className={`shortcut-icon ${item.kind}`}><Icon name={item.kind === "website" ? "globe" : item.kind === "folder" ? "folder" : "shortcuts"} size={23}/></span><strong>{item.name}</strong><small>{item.kind === "website" ? item.target.replace(/^https?:\/\//, "").replace(/\/$/, "") : item.target.split(/[\\/]/).at(-1)}</small><Icon name="arrow" size={15}/></button><button className="icon-btn remove-shortcut" aria-label={`Remove ${item.name}`} onClick={() => onChange(items.filter(shortcut => shortcut.id !== item.id))}><Icon name="close" size={13}/></button></div>)}</div>{!items.length && <Empty icon="shortcuts" title="No shortcuts yet" detail="Add a website, application, or folder."/>}<p className="micro">Local apps and folders open only when you click them. Websites require an internet connection.</p></div>;
}
function Preferences({ settings, snapshot, update, message }: { settings: Settings; snapshot: Snapshot; update: (patch: Partial<Settings>) => Promise<boolean>; message: (text: string) => void }) {
  const [shortcut, setShortcut] = useState(settings.globalShortcut);
  const toggle = (field: "alwaysOnTop" | "dimOnHover" | "companion" | "reducedMotion" | "launchAtStartup" | "sound" | "notifications", label: string, description: string, disabled = false) => <label className={`setting-toggle ${disabled ? "disabled" : ""}`}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" role="switch" checked={settings[field]} disabled={disabled} onChange={event => void update({ [field]: event.target.checked })}/></label>;
  return <div className="preferences"><div className="settings-grid"><section><h2>Window behavior</h2>{toggle("alwaysOnTop", "Float above other windows", "Stay visible above ordinary windows without taking keyboard focus. Turn off to let other apps cover the island.")}<label className="setting-text"><span><strong>Weather city</strong><small>Leave empty to use your time zone. Weather by Open-Meteo.</small></span><input placeholder="Automatic" defaultValue={settings.weatherCity} maxLength={80} onBlur={event => { if (event.target.value.trim() !== settings.weatherCity) void update({ weatherCity: event.target.value.trim() }); }} onKeyDown={event => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}/></label><CompanionCard enabled={settings.companion} toggle={toggle("companion", "Phone companion", "Use your phone as a clock, notes, tasks and focus timer over your Wi-Fi.")} message={message}/>{toggle("dimOnHover", "Blur the background on hover", "Everything else softly goes out of focus while you use the island or a sticky note.")}{toggle("reducedMotion", "Gentler motion", "Skip spring transitions and animated details.")}{toggle("launchAtStartup", "Be here when I sign in", snapshot.startupSupported ? "Start Island Desk with Windows." : "Available after installing the Windows app.", !snapshot.startupSupported)}{toggle("sound", "A soft chime", "A little nudge when your session ends.")}{toggle("notifications", "Desktop reminders", "Task reminders and focus notifications.")}<div className="setting-field"><label htmlFor="global-shortcut">Global keyboard shortcut</label><div><input id="global-shortcut" value={shortcut} maxLength={100} onChange={event => setShortcut(event.target.value)}/><button onClick={() => void update({ globalShortcut: shortcut.trim() }).then(ok => { if (ok) message("Your new shortcut is ready."); })}>Apply</button></div><small>Example: Control+Alt+Space. A shortcut already in use stays unchanged.</small><small>Quick note: Ctrl+Alt+N. Quick task: Ctrl+Alt+T. Both are also in the tray menu.</small></div></section><section><span className="eyebrow">A PLACE ON YOUR DESKTOP</span><label className="setting-field">Display<select value={settings.displayId ?? "primary"} onChange={event => void update({ displayId: event.target.value === "primary" ? null : Number(event.target.value) })}><option value="primary">Follow primary display</option>{snapshot.displays.map(display => <option key={display.id} value={display.id}>{display.label} · {display.width} × {display.height}{display.primary ? " · primary" : ""}</option>)}</select></label><label className="setting-field">Island size <span>{Math.round(settings.scale * 100)}%</span><input type="range" aria-label="Island size" min="0.8" max="1.15" step="0.05" value={settings.scale} onChange={event => void update({ scale: Number(event.target.value) })}/></label><label className="setting-field">From top <span>{settings.offsetY}px</span><input type="range" aria-label="Vertical position" min="0" max="240" step="4" value={settings.offsetY} onChange={event => void update({ offsetY: Number(event.target.value) })}/></label><label className="setting-field">From center <span>{settings.offsetX}px</span><input type="range" aria-label="Horizontal position" min="-700" max="700" step="10" value={settings.offsetX} onChange={event => void update({ offsetX: Number(event.target.value) })}/></label><button className="text-btn" onClick={() => void update({ offsetX: 0, offsetY: 16, scale: 1, displayId: null })}><Icon name="reset" size={14}/>Back to center</button><div className="backup-card"><strong>Keep a little backup.</strong><p>Notes, tasks, history, shortcuts, and your settings. A file you own.</p><div><button onClick={() => void api.backupExport().then(ok => { if (ok) message("Backup exported."); }).catch(err => message(err.message))}><Icon name="download" size={15}/>Export</button><button onClick={() => void api.backupImport().then(ok => { if (ok) message("Backup restored."); }).catch(err => message(err.message))}><Icon name="upload" size={15}/>Import</button></div><button className="text-btn" onClick={() => void api.openData().catch(err => message(err.message))}><Icon name="folder" size={13}/>Open local data folder</button></div></section></div><div className="settings-bottom"><span>Island Desk {snapshot.version} · Offline by design. No account. No telemetry.</span><div><button className="text-btn" onClick={() => api.hide()}>Hide to tray</button><button className="text-btn danger" onClick={() => api.quit()}>Quit app</button></div></div></div>;
}
const priorityRank = { high: 0, medium: 1, low: 2 } as const;
function Preview({ onSettings, weather, phone, media, now, clock, date, tasks, focus, message, onOpen }: { onSettings: () => void; weather: Weather | null; phone: PhoneFeed; media: MediaState; now: number; clock: string; date: string; tasks: Task[]; focus: string; message: (text: string) => void; onOpen: () => void }) {
  const [display, setDisplay] = useState<DisplayState | null>(null), [level, setLevel] = useState<number | null>(null);
  const pending = tasks.filter(task => !task.done).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || priorityRank[a.priority] - priorityRank[b.priority]);
  const today = localDate(), sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { void api?.display().then(state => { setDisplay(state); setLevel(state.brightness); }).catch(() => setDisplay({ brightness: null, nightLight: null })); }, []);
  function brightness(value: number) {
    setLevel(value); if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => void api.setDisplay({ brightness: value }).catch(error => message(error.message)), 120);
  }
  function night() {
    if (display?.nightLight == null) return;
    const next = !display.nightLight; setDisplay({ ...display, nightLight: next });
    void api.setDisplay({ nightLight: next }).then(setDisplay).catch(error => { setDisplay({ ...display }); message(error.message); });
  }
  const pages = [...(media.active ? ["music"] : []), "today", "system"] as const;
  const [page, setPage] = useState(0), previousPage = useRef(0), pageDirectionRef = useRef<"forward" | "back">("forward");
  if (previousPage.current !== page) { pageDirectionRef.current = page > previousPage.current ? "forward" : "back"; previousPage.current = page; }
  const pageDirection = pageDirectionRef.current;
  const current = pages[Math.min(page, pages.length - 1)];
  const wheel = useRef(0);
  const onWheel = (event: React.WheelEvent) => { if (Date.now() - wheel.current < 380 || Math.abs(event.deltaY) < 8) return; wheel.current = Date.now(); setPage(p => Math.max(0, Math.min(pages.length - 1, p + (event.deltaY > 0 ? 1 : -1)))); };
  const dots = <div className="page-dots" role="tablist" aria-label="Island pages">{pages.map((name, index) => <button key={name} role="tab" aria-selected={current === name} aria-label={name} className={current === name ? "on" : ""} onClick={() => setPage(index)}/>)}</div>;
  if (current === "music" && media.active) return <div key="music" className={`preview-body page-music slide-${pageDirection}`} onWheel={onWheel}><NowPlaying media={media} now={now} message={message}/>{dots}</div>;
  if (current === "system") return <div key="system" className={`preview-body page-system slide-${pageDirection}`} onWheel={onWheel}><SystemMonitor/>{dots}</div>;
  return <div key="today" className={`preview-body page-today slide-${pageDirection} ${phone.connected && phone.items.length ? "with-phone" : ""}`} onWheel={onWheel}>
    {dots}
    {weather && <button className="preview-weather" onClick={onSettings} title="Change the weather city"><Icon name={weatherIcon(weather)} size={18}/><b>{weather.temp}°</b><span>{weather.city}</span></button>}
    {phone.connected && phone.items.length > 0 && <div className="phone-feed"><span className="eyebrow">ON YOUR PHONE</span>{phone.items.slice(0, 3).map(item => <div className="phone-row" key={item.key}>{item.icon ? <img src={item.icon} alt=""/> : <span className="phone-dot"/>}<b>{item.title || item.app}</b><span>{item.text}</span></div>)}</div>}
    <div className="today-clock"><strong>{clock}</strong><span>{date}</span>{focus && <em>{focus}</em>}</div>
    {media.active ? <MusicRow media={media} message={message}/> : <button className="preview-tasks" onClick={onOpen} title="Open tasks">
      <span className="eyebrow">{pending.length ? `${pending.length} PENDING` : "ALL CLEAR"}</span>
      {pending.length ? pending.slice(0, 3).map(task => <span className={`preview-task ${task.priority}`} key={task.id}><i/>{task.text}{task.due && <small className={task.due < today ? "late" : ""}>{task.due === today ? "Today" : task.due < today ? "Overdue" : task.due.slice(5)}</small>}</span>) : <span className="preview-task none">Nothing waiting on you.</span>}
      {pending.length > 3 && <small className="more">+{pending.length - 3} more</small>}
    </button>}
    <div className="preview-display">
      <label title="Screen brightness"><Icon name="sun"/><input type="range" min={0} max={100} step={5} value={level ?? 50} disabled={level === null} aria-label="Screen brightness" onChange={event => brightness(Number(event.target.value))}/><span>{level === null ? "—" : `${level}%`}</span></label>
      <button className={`night ${display?.nightLight ? "on" : ""}`} disabled={display?.nightLight == null} onClick={night} aria-pressed={!!display?.nightLight} title="Night light"><Icon name="moon"/>Night light</button>
    </div>
  </div>;
}

const clockOf = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/** Picks a vivid colour from the album art so the player can be tinted with it. */
function useArtColor(art: string) {
  const [color, setColor] = useState("188, 232, 200");
  useEffect(() => {
    if (!art) { setColor("188, 232, 200"); return; }
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 24;
        const context = canvas.getContext("2d", { willReadFrequently: true })!; context.drawImage(image, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        let best = { score: -1, r: 188, g: 232, b: 200 };
        // Score each pixel by saturation and brightness; ignore near-black and near-white.
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max < 60 || min > 225) continue;
          const score = (max - min) / max * 0.75 + max / 255 * 0.25;
          if (score > best.score) best = { score, r, g, b };
        }
        // Lift dark picks so the accent reads on black.
        const lift = Math.max(1, 170 / Math.max(best.r, best.g, best.b));
        setColor([best.r, best.g, best.b].map(v => Math.min(255, Math.round(v * lift))).join(", "));
      } catch { setColor("188, 232, 200"); }
    };
    image.src = art;
  }, [art]);
  return color;
}
const appGlyph = (app: string): IconName => /chrome|edge|firefox|browser|opera|brave/i.test(app) ? "globe" : "music";

function NowPlaying({ media, now, message }: { media: Extract<MediaState, { active: true }>; now: number; message: (text: string) => void }) {
  const accent = useArtColor(media.art);
  const position = Math.min(media.durationMs || Infinity, media.positionMs + (media.playing ? Math.max(0, now - media.updatedAt) : 0));
  const progress = media.durationMs > 0 ? Math.min(100, position / media.durationMs * 100) : 0;
  const send = (command: "toggle" | "next" | "previous") => void api.mediaCommand(command).catch(error => message(error.message));
  return <div className={`now-playing ${media.playing ? "is-playing" : ""}`} style={{ "--accent": accent } as CSSProperties}>
    <div className="np-top">
      <span className="np-cover">{media.art ? <img src={media.art} alt=""/> : <span className="np-art blank"><Icon name="music" size={22}/></span>}<i className="np-badge" title={media.app}><Icon name={appGlyph(media.app)} size={10}/></i></span>
      <div className="np-info">
        <strong title={media.title}>{media.title}</strong>
        <span title={media.artist}>{media.artist || media.app}</span>
        {media.album && <small title={media.album}>{media.album}</small>}
      </div>
      <span className={`np-wave ${media.playing ? "on" : ""}`} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i}/>)}</span>
    </div>
    {media.durationMs > 0 && <div className="np-progress">
      <small>{clockOf(position)}</small>
      <i><b style={{ width: `${progress}%` }}/><em style={{ left: `${progress}%` }}/></i>
      <small>-{clockOf(media.durationMs - position)}</small>
    </div>}
    <div className="np-controls">
      <button aria-label="Previous track" title="Previous" disabled={!media.canPrevious} onClick={() => send("previous")}><Icon name="previous" size={15}/></button>
      <button className="np-play" aria-label={media.playing ? "Pause" : "Play"} title={media.playing ? "Pause" : "Play"} disabled={!media.canToggle} onClick={() => send("toggle")}><Icon name={media.playing ? "pause" : "play"} size={17}/></button>
      <button aria-label="Next track" title="Next" disabled={!media.canNext} onClick={() => send("next")}><Icon name="skip" size={15}/></button>
    </div>
  </div>;
}

function CompanionCard({ enabled, toggle, message }: { enabled: boolean; toggle: React.ReactNode; message: (text: string) => void }) {
  const [info, setInfo] = useState<CompanionInfo | null>(null);
  useEffect(() => { if (!enabled) { setInfo(null); return; } void api.companion().then(setInfo).catch(error => message(error.message)); }, [enabled]);
  return <div className="companion-card">{toggle}
    {enabled && info && (info.url ? <div className="companion-pair">
      <img src={info.qr} alt="QR code to pair your phone"/>
      <div><strong>Scan with your phone's camera</strong><small>Your phone must be on the same Wi-Fi. Then use "Add to Home Screen" so it opens like an app.</small>
        <code>{info.url.replace(/#.*/, "")}</code>
        <button className="text-btn" onClick={() => void api.companionReset().then(next => { setInfo(next); message("Paired phones were signed out. Scan the new code to reconnect."); })}>Sign out paired phones</button></div>
    </div> : <small className="micro">Connect this computer to Wi-Fi to pair a phone.</small>)}
  </div>;
}

/* ───────────── Weather + hardware widgets ───────────── */
function weatherIcon(weather: Weather): IconName {
  const c = weather.code;
  if (c === 0 || c === 1) return weather.isDay ? "sun" : "moon";
  if (c === 2 || c === 3) return "cloud";
  if (c === 45 || c === 48) return "fog";
  if (c >= 95) return "storm";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow";
  return "rain";
}
const bytes = (value: number) => value >= 1e9 ? `${(value / 1073741824).toFixed(1)} GB` : `${(value / 1048576).toFixed(0)} MB`;
const speed = (bytesPerSecond: number | null) => { if (bytesPerSecond == null) return "—"; const bits = bytesPerSecond * 8; return bits >= 1e6 ? `${(bits / 1e6).toFixed(1)} Mbps` : `${Math.round(bits / 1e3)} Kbps`; };

/** Live CPU, memory, GPU, disk and network. Only measures while this page is showing. */
function SystemMonitor() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    const dispose = api.onEvent(event => { if (event.type === "stats") setStats(event.stats); });
    api.watchStats(true);
    return () => { api.watchStats(false); dispose(); };
  }, []);
  const tile = (icon: IconName, label: string, value: string, percent: number | null, color: string) => <div className="hw-tile" style={{ "--hw": color } as CSSProperties}>
    <Icon name={icon} size={17}/><span><small>{label}</small><b>{value}</b>{percent != null && <i><em style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}/></i>}</span></div>;
  if (!stats) return <div className="hw"><h4>Hardware monitor</h4><p className="micro">Measuring…</p></div>;
  const ram = stats.ramUsed / stats.ramTotal * 100;
  return <div className="hw"><h4>Hardware monitor</h4><div className="hw-grid">
    {tile("cpu", "CPU", `${stats.cpu}%`, stats.cpu, "#4cc2ff")}
    {tile("up", "Net up", speed(stats.up), null, "#4cc2ff")}
    {tile("ram", "RAM", `${bytes(stats.ramUsed)} / ${bytes(stats.ramTotal)}`, ram, "#f3b25e")}
    {tile("down", "Net down", speed(stats.down), null, "#4cc2ff")}
    {tile("gpu", "GPU", stats.gpu == null ? "—" : `${stats.gpu}%`, stats.gpu, "#ff6b6b")}
    {tile("disk", "Disk", stats.disk == null ? "—" : `${stats.disk}%`, stats.disk, "#4cc2ff")}
  </div></div>;
}

/** Compact "now playing" row for the Today page. */
function MusicRow({ media, message }: { media: Extract<MediaState, { active: true }>; message: (text: string) => void }) {
  const accent = useArtColor(media.art);
  const send = (command: "toggle" | "next" | "previous") => void api.mediaCommand(command).catch(error => message(error.message));
  return <div className="music-row" style={{ "--accent": accent } as CSSProperties}>
    {media.art ? <img src={media.art} alt=""/> : <span className="music-row-art"><Icon name="music" size={20}/></span>}
    <span className="music-row-text"><b>{media.title}</b><small>{media.artist || media.app}</small></span>
    <span className="music-row-controls">
      <button aria-label="Previous track" disabled={!media.canPrevious} onClick={() => send("previous")}><Icon name="previous" size={13}/></button>
      <button className="play" aria-label={media.playing ? "Pause" : "Play"} disabled={!media.canToggle} onClick={() => send("toggle")}><Icon name={media.playing ? "pause" : "play"} size={16}/></button>
      <button aria-label="Next track" disabled={!media.canNext} onClick={() => send("next")}><Icon name="skip" size={13}/></button>
    </span>
  </div>;
}

/** Keeps a value on screen briefly after it clears, so it can animate out. */
function useLeaving<T>(value: T, ms = 170): [T, boolean] {
  const [shown, setShown] = useState(value), [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (value) { setShown(value); setLeaving(false); return; }
    setLeaving(true); const timer = setTimeout(() => { setShown(value); setLeaving(false); }, ms); return () => clearTimeout(timer);
  }, [value]);
  return [shown, leaving];
}

/** Digits that roll into place when they change (the timer). */
function Rolling({ text }: { text: string }) {
  return <span className="rolling" aria-label={text}>{[...text].map((char, index) => <span key={index + ":" + char} className={/\d/.test(char) ? "roll-digit" : "roll-sep"} aria-hidden="true">{char}</span>)}</span>;
}
