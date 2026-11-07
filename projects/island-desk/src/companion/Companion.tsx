import { useEffect, useMemo, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Icon, type IconName } from "../icons";
import { calculate } from "../../shared/calculator";
import { localDate, remaining, timeText, type Calculation, type Note, type Task, type Timer } from "../../shared/model";
import type { MediaState } from "../../shared/bridge";
import type { Action } from "../../shared/actions";
import { isLauncher, loadPairing, newId, parsePairLink, savePairing, setDiscovery, usePocket, type Pairing, type State, type Status } from "./backend";
import { Launcher, type Alarm, type InstalledApp, type PhoneNotification } from "./launcher";

if (isLauncher) setDiscovery(ms => Launcher.discover({ timeoutMs: ms }).then(result => result.computers));

type View = "clock" | "notes" | "tasks" | "focus" | "calc";
type Run = (action: Action) => Promise<void>;

const views: { id: View; label: string; icon: IconName }[] = [
  { id: "clock", label: isLauncher ? "Home" : "Clock", icon: "focus" }, { id: "notes", label: "Notes", icon: "notes" }, { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "focus", label: isLauncher ? "Clock" : "Focus", icon: isLauncher ? "alarm" : "play" }, { id: "calc", label: "Calc", icon: "calculator" },
];

export default function Companion() {
  const [pairing, setPairing] = useState<Pairing | null>(() => isLauncher ? loadPairing() : null);
  const { state, status, run: send, skew, adoptLocalData } = usePocket(pairing, next => { savePairing(next); setPairing(next); });
  const [view, setView] = useState<View>(() => { if (isLauncher) return "clock"; try { return (localStorage.getItem("island-desk-view") as View) || "clock"; } catch { return "clock"; } });
  const [now, setNow] = useState(Date.now()), [toast, setToast] = useState(""), [openNote, setOpenNote] = useState<string | null>(null), [sheet, setSheet] = useState(false), [drawer, setDrawer] = useState(false);
  const viewRef = useRef(view); viewRef.current = view;
  // Survives the clock re-rendering several times a second during a swipe.
  const swipeRef = useRef({ x: 0, y: 0, t: 0, ok: false });
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
    const back = NativeApp.addListener("backButton", () => { setSheet(false); setDrawer(false); setOpenNote(null); if (viewRef.current !== "clock") setView("clock"); });
    return () => { void opened.then(h => h.remove()); void back.then(h => h.remove()); };
  }, []);

  const [keepAwake, setKeepAwake] = useState(() => { try { return localStorage.getItem("island-keep-awake") === "1"; } catch { return false; } });
  useEffect(() => { if (isLauncher) void Launcher.setKeepAwake({ value: keepAwake && view === "clock" }).catch(() => undefined); }, [keepAwake, view]);
  const run: Run = async action => { try { await send(action); } catch (error) { say((error as Error).message); } };
  if (!isLauncher && status === "unpaired") return <main className="c-shell center"><div className="c-pill big"><i className="dot"/>Island Desk</div><h1>Pair this phone</h1><p className="muted">On your computer, open Island Desk → Settings → Phone companion and scan the QR code with this phone's camera.</p></main>;
  if (!state) return <main className="c-shell center"><div className="c-pill big pulse"><i className="dot"/>Connecting…</div><p className="muted">Make sure this phone is on the same Wi-Fi as your computer and Island Desk is running.</p></main>;
  const serverNow = now + (status === "live" ? skew.current : 0);
  const swipe = swipeRef.current;
  const onTouchStart = (event: React.TouchEvent) => { const target = event.target as HTMLElement, touch = event.touches[0]; swipe.x = touch.clientX; swipe.y = touch.clientY; swipe.t = Date.now(); swipe.ok = isLauncher && !drawer && !sheet && !target.closest("input, textarea, select, .app-drawer, .sheet, .feed"); };
  const onTouchEnd = (event: React.TouchEvent) => { if (!swipe.ok) return; const touch = event.changedTouches[0], dx = touch.clientX - swipe.x, dy = touch.clientY - swipe.y; if (dx > 90 && Math.abs(dy) < Math.abs(dx) * 0.6 && Date.now() - swipe.t < 700) setDrawer(true); };
  const pillText = status === "live" ? "Connected" : status === "local" ? "On this phone" : status === "unpaired" ? "Pair again" : status === "offline" ? "Offline · saved on phone" : "Connecting…";
  return <main className={`c-shell view-${view} ${isLauncher ? "launcher" : ""}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    {!isLauncher && <header className="c-top">
      <button className={`c-pill ${state.timer.running ? "active" : ""}`} onClick={() => isLauncher && setSheet(true)}>
        <i className={`dot ${status === "live" || status === "local" ? "" : "off"}`}/>
        {state.timer.running ? <><span>{state.timer.phase === "work" ? "Focus" : "Break"}</span><b>{timeText(remaining(state.timer, serverNow))}</b></>
          : state.media.active ? <><span className="ellipsis">{state.media.title}</span><span className={`bars ${state.media.playing ? "on" : ""}`}><i/><i/><i/></span></>
          : <span>{pillText}</span>}
      </button>
    </header>}
    <section className="c-content" key={view}>
      {view === "clock" && (isLauncher ? <LauncherHome state={state} now={now} openAlarms={() => setView("focus")} openTasks={() => setView("tasks")} openNote={id => { setOpenNote(id); setView("notes"); }} say={say}/> : <ClockView state={state} now={now} run={run} openAlarms={() => setView("focus")}/>)}
      {view === "notes" && <NotesView notes={state.notes} run={run} openId={openNote} setOpenId={setOpenNote}/>}
      {view === "tasks" && <TasksView tasks={state.tasks} run={run}/>}
      {view === "focus" && (isLauncher ? <ClockTab timer={state.timer} now={serverNow} run={run} synced={status === "live"} say={say}/> : <FocusView timer={state.timer} now={serverNow} run={run} synced={status === "live"}/>)}
      {view === "calc" && <CalcView history={state.calculations} run={run}/>}
    </section>
    {state.media.active && view !== "clock" && <MiniPlayer media={state.media} run={run}/>}
    {isLauncher ? <SideNav view={view} timerRunning={state.timer.running} offline={!!pairing && status !== "live"} go={id => { setView(id); if (id !== "notes") setOpenNote(null); }} openApps={() => setDrawer(true)} openSettings={() => setSheet(true)}/>
    : <nav className="c-nav">{views.map(item => <button key={item.id} className={view === item.id ? "on" : ""} onClick={() => { setView(item.id); if (item.id !== "notes") setOpenNote(null); }}><Icon name={item.icon} size={20}/><span>{item.label}</span></button>)}</nav>}
    {isLauncher && <AppDrawer open={drawer} close={() => setDrawer(false)}/>}
    {sheet && <SettingsSheet keepAwake={keepAwake} setKeepAwake={value => { setKeepAwake(value); try { localStorage.setItem("island-keep-awake", value ? "1" : "0"); } catch { /* ignore */ } }} status={status} pairing={pairing} onPair={next => { adoptLocalData(); savePairing(next); setPairing(next); setSheet(false); say("Connected to your computer."); }} close={() => setSheet(false)} unpair={() => { savePairing(null); setPairing(null); setSheet(false); say("Disconnected. Your notes stay on this phone."); }}/>}
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
const launchApp = (app: InstalledApp) => void Launcher.launch({ packageName: app.packageName, activity: app.activity });
/** Preinstalled apps people reach for first; anything else that came with the phone follows. */
const essentials = [/dialer|incallui|\.phone$|contacts/i, /mms|messag/i, /camera/i, /gallery|photos/i, /settings/i, /browser|chrome/i, /deskclock|clock/i, /calendar/i, /filemanager|files/i, /music|video/i];
const rank = (app: InstalledApp) => { const index = essentials.findIndex(rule => rule.test(app.packageName) || rule.test(app.label)); return index < 0 ? essentials.length : index; };

/** Left icon rail: the app's sections, then Apps and Settings. */
function SideNav({ view, timerRunning, offline, go, openApps, openSettings }: { view: View; timerRunning: boolean; offline: boolean; go: (id: View) => void; openApps: () => void; openSettings: () => void }) {
  return <nav className="side-nav" aria-label="Sections">
    {views.map(item => <button key={item.id} className={view === item.id ? "on" : ""} onClick={() => go(item.id)} aria-label={item.label} title={item.label}>
      <Icon name={item.icon} size={22}/>{item.id === "focus" && timerRunning && <i className="badge"/>}</button>)}
    <span className="side-spacer"/>
    <button className="apps-btn" onClick={openApps} aria-label="Your apps" title="Your apps (or swipe right)"><Icon name="grid" size={22}/></button>
    <button onClick={openSettings} aria-label="Settings" title="Settings"><Icon name="settings" size={22}/>{offline && <i className="badge warn"/>}</button>
  </nav>;
}

/** All apps behind one icon: phone apps first, then the ones you installed. Swipe right to open; swipe left, Back or a tap outside closes. */
function AppDrawer({ open, close }: { open: boolean; close: () => void }) {
  const all = useApps(), [query, setQuery] = useState("");
  const start = useRef({ x: 0, y: 0 });
  useEffect(() => { if (!open) setQuery(""); }, [open]);
  const match = (app: InstalledApp) => app.label.toLowerCase().includes(query.toLowerCase());
  const phone = all.filter(app => app.system && match(app)).sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  const mine = all.filter(app => !app.system && match(app));
  const tile = (app: InstalledApp) => <button key={app.packageName + app.activity} tabIndex={open ? 0 : -1} onClick={() => { if (open) launchApp(app); close(); }} onContextMenu={event => { event.preventDefault(); void Launcher.openAppInfo({ packageName: app.packageName }); }}>
    <img src={app.icon} alt="" loading="lazy"/><span>{app.label}</span></button>;
  return <div className={`app-drawer ${open ? "open" : ""}`} aria-hidden={!open} onClick={close}
    onTouchStart={event => { start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
    onTouchEnd={event => { const dx = event.changedTouches[0].clientX - start.current.x, dy = event.changedTouches[0].clientY - start.current.y; if (dx < -80 && Math.abs(dy) < Math.abs(dx)) close(); }}>
    <div className="drawer-panel" onClick={event => event.stopPropagation()}>
      <div className="drawer-head"><div><span className="eyebrow">APPS</span><h2>{all.length} on this phone</h2></div>
        <label className="c-search"><Icon name="search" size={16}/><input placeholder="Search apps" value={query} onChange={event => setQuery(event.target.value)} tabIndex={open ? 0 : -1}/></label>
        <button className="round small" aria-label="Close apps" onClick={close}><Icon name="close" size={16}/></button></div>
      {phone.length > 0 && <><h4 className="drawer-section">Phone</h4><div className="app-grid drawer-grid">{phone.map(tile)}</div></>}
      {mine.length > 0 && <><h4 className="drawer-section">Your apps</h4><div className="app-grid drawer-grid">{mine.map(tile)}</div></>}
      {!all.length && <p className="muted center-text">{appCache ? "No apps found." : "Loading your apps…"}</p>}
      {all.length > 0 && !phone.length && !mine.length && <p className="muted center-text">No app matches "{query}".</p>}
    </div>
  </div>;
}

/* ───────────── Modern launcher home ───────────── */
const ago = (time: number, now: number) => { const m = Math.max(0, Math.round((now - time) / 60000)); if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.round(m / 60); return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`; };
const isMail = (n: PhoneNotification) => n.category === "email" || /(\.gm$|email|mail|outlook|yahoo|proton|spark|bluemail)/i.test(n.packageName);

function LauncherHome({ state, now, openAlarms, openTasks, openNote, say }: { state: State; now: number; openAlarms: () => void; openTasks: () => void; openNote: (id: string) => void; say: (text: string) => void }) {
  const date = new Date(now), alarms = useAlarms();
  const hh = String(date.getHours()).padStart(2, "0"), mm = String(date.getMinutes()).padStart(2, "0");
  const today = localDate(date), rankP = { high: 0, medium: 1, low: 2 };
  const pending = state.tasks.filter(task => !task.done && (!task.due || task.due <= today)).sort((a, b) => rankP[a.priority] - rankP[b.priority]).slice(0, 4);
  const pinned = state.notes.filter(note => note.pinned).slice(0, 2);
  return <div className="home-modern">
    <section className="mc">
      <div className="mc-time" aria-label={`${hh}:${mm}`}><span>{hh}</span><span className={`mc-colon ${date.getSeconds() % 2 ? "dim" : ""}`}>:</span><span className="mc-min">{mm}</span></div>
      <div className="mc-seconds" aria-hidden="true"><i style={{ transform: `scaleX(${(date.getSeconds() + date.getMilliseconds() / 1000) / 60})` }}/></div>
      <div className="mc-chips">
        <span className="chip">{new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date)}<b>{new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(date)}</b></span>
        <button className="chip" onClick={openAlarms}><Icon name="alarm" size={14}/>{alarms.next > 0 ? <>{new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(alarms.next)}<b>in {until(alarms.next - now)}</b></> : <b>No alarm</b>}</button>
        {state.timer.running && <button className="chip live" onClick={openAlarms}><Icon name="play" size={13}/>{state.timer.phase === "work" ? "Focus" : "Break"}<b>{timeText(remaining(state.timer, now))}</b></button>}
      </div>
    </section>
    <section className="feed" aria-label="Your day">
      <MailCard now={now} say={say}/>
      <NewsCard now={now} say={say}/>
      <button className="glass" onClick={openTasks}><header><Icon name="tasks" size={15}/><span>Today</span><em>{pending.length || ""}</em></header>
        {pending.length ? pending.map(task => <p key={task.id} className={`prio ${task.priority}`}><i/>{task.text}</p>) : <p className="muted">Nothing waiting on you.</p>}</button>
      {pinned.map(note => <button className="glass" key={note.id} onClick={() => openNote(note.id)}><header><Icon name="pin" size={15}/><span>{note.title || "Pinned note"}</span></header><p className="muted clamp">{note.body.replace(/\[[ x]\] /gi, "• ") || "Empty"}</p></button>)}
    </section>
  </div>;
}

function useNotifications() {
  const [data, setData] = useState<{ granted: boolean; notifications: PhoneNotification[] } | null>(null);
  useEffect(() => {
    const load = () => void Launcher.getNotifications().then(setData).catch(() => setData({ granted: false, notifications: [] }));
    load();
    const listener = Launcher.addListener("notificationsChanged", load);
    const again = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", again); const timer = setInterval(load, 20000);
    return () => { void listener.then(h => h.remove()); document.removeEventListener("visibilitychange", again); clearInterval(timer); };
  }, []);
  return data;
}

function MailCard({ now, say }: { now: number; say: (text: string) => void }) {
  const data = useNotifications();
  const [everything, setEverything] = useState(() => { try { return localStorage.getItem("island-all-notifications") === "1"; } catch { return false; } });
  if (!data) return null;
  if (!data.granted) return <div className="glass invite"><header><Icon name="notes" size={15}/><span>Mail</span></header>
    <p>Show new email on your home screen. Island reads only what your phone already shows in notifications, never your password, and nothing leaves the phone.</p>
    <span className="pill-btn small-btn" onClick={() => void Launcher.openNotificationAccess()}>Allow notification access</span></div>;
  const items = data.notifications.filter(n => everything || isMail(n)).slice(0, 4);
  const toggle = () => { const next = !everything; setEverything(next); try { localStorage.setItem("island-all-notifications", next ? "1" : "0"); } catch { /* ignore */ } };
  return <div className="glass">
    <header><Icon name="notes" size={15}/><span>{everything ? "Notifications" : "Mail"}</span><em>{items.length || ""}</em><button className="link" onClick={toggle}>{everything ? "Mail only" : "All"}</button></header>
    {items.length ? items.map(n => <div className="note-row" key={n.key}>
      <button className="note-open" onClick={() => void Launcher.openNotification({ key: n.key }).catch(error => say(error.message))}>
        {n.icon ? <img src={n.icon} alt=""/> : <span className="art-blank"/>}
        <span className="note-lines"><span className="note-top"><b>{n.title || n.app}</b><small>{n.app} · {ago(n.time, now)}</small></span><span className="note-text">{n.text}</span></span>
      </button>
      <button className="note-x" aria-label="Dismiss" onClick={() => void Launcher.dismissNotification({ key: n.key })}><Icon name="close" size={12}/></button>
    </div>) : <p className="muted">{everything ? "No notifications." : "No new email."}</p>}
  </div>;
}

interface Story { title: string; link: string; time: number; image: string }
const NEWS_URL = "https://feeds.bbci.co.uk/sport/football/rss.xml", NEWS_KEY = "island-news";
function useNews() {
  const [news, setNews] = useState<{ stories: Story[]; at: number; error?: string }>(() => { try { return JSON.parse(localStorage.getItem(NEWS_KEY) || "") ; } catch { return { stories: [], at: 0 }; } });
  useEffect(() => {
    const load = async () => {
      try {
        const xml = new DOMParser().parseFromString(await (await fetch(NEWS_URL)).text(), "text/xml");
        const stories = [...xml.querySelectorAll("item")].slice(0, 12).map(item => ({
          title: item.querySelector("title")?.textContent?.trim() || "", link: item.querySelector("link")?.textContent?.trim() || "",
          time: Date.parse(item.querySelector("pubDate")?.textContent || "") || Date.now(),
          image: (item.getElementsByTagNameNS("http://search.yahoo.com/mrss/", "thumbnail")[0]?.getAttribute("url") || "").replace(/^http:/, "https:"),
        })).filter(story => story.title && /^https:\/\//.test(story.link));
        if (!stories.length) throw Error("empty");
        const next = { stories, at: Date.now() }; setNews(next); try { localStorage.setItem(NEWS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      } catch { setNews(current => ({ ...current, error: "offline" })); }
    };
    if (Date.now() - news.at > 10 * 60000) void load();
    const timer = setInterval(() => void load(), 15 * 60000);
    return () => clearInterval(timer);
  }, []);
  return news;
}

function NewsCard({ now, say }: { now: number; say: (text: string) => void }) {
  const news = useNews();
  const open = (story: Story) => void Launcher.openUrl({ url: story.link }).catch(error => say(error.message));
  const [lead, ...rest] = news.stories;
  return <div className="glass news">
    <header><Icon name="globe" size={15}/><span>Football</span><small className="muted">BBC Sport</small></header>
    {lead ? <>
      <button className="story lead" onClick={() => open(lead)}>{lead.image && <img src={lead.image} alt="" loading="lazy"/>}<span><b>{lead.title}</b><small>{ago(lead.time, now)} ago</small></span></button>
      {rest.slice(0, 3).map(story => <button className="story" key={story.link} onClick={() => open(story)}><span><b>{story.title}</b><small>{ago(story.time, now)} ago</small></span></button>)}
    </> : <p className="muted">{news.error ? "No connection. Football news will appear when you're online." : "Loading football news…"}</p>}
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

function SettingsSheet({ keepAwake, setKeepAwake, status, pairing, onPair, close, unpair }: { keepAwake: boolean; setKeepAwake: (value: boolean) => void; status: Status; pairing: Pairing | null; onPair: (pairing: Pairing) => void; close: () => void; unpair: () => void }) {
  const [isDefault, setDefault] = useState<boolean | null>(null);
  useEffect(() => { void Launcher.isDefaultLauncher().then(result => setDefault(result.value)).catch(() => setDefault(null)); }, []);
  return <div className="sheet-backdrop" onClick={close}><div className="sheet" onClick={event => event.stopPropagation()}>
    <i className="grabber"/>
    <h3>Island Launcher</h3>
    <div className="c-card"><strong>Home screen</strong><p className="muted">{isDefault ? "Island is your home screen." : "Make Island your home screen so the Home button opens it."}</p>
      <button className="pill-btn" onClick={() => void Launcher.openHomeSettings()}>{isDefault ? "Change home app" : "Set as home screen"}</button></div>
    <label className="c-card switch-row"><span><strong>Keep screen on</strong><small className="muted">While Home is showing, so the phone works as a desk or bedside clock. Best while charging.</small></span><input type="checkbox" role="switch" checked={keepAwake} onChange={event => setKeepAwake(event.target.checked)}/></label>
    <div className="c-card"><strong>Computer</strong><p className="muted">{pairing ? `${status === "live" ? "Connected to" : "Paired with"} ${pairing.base.replace(/^https?:\/\//, "").replace(/\/$/, "")}${status === "offline" ? ", offline right now. Changes wait on this phone and sync later." : ""}` : "Not connected. Notes, tasks and the timer are saved on this phone."}</p>
      {pairing && <button className="pill-btn ghost" onClick={unpair}>Disconnect</button>}</div>
    {!pairing && <PairCard onPair={onPair}/>}
  </div></div>;
}

function ClockView({ state, now, run, openAlarms }: { state: State; now: number; run: Run; openAlarms: () => void }) {
  const alarms = useAlarms();
  const date = new Date(now);
  const hm = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const rank = { high: 0, medium: 1, low: 2 }, today = localDate(date), pending = state.tasks.filter(task => !task.done && (!task.due || task.due <= today)).sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 4);
  const pinned = state.notes.filter(note => note.pinned).slice(0, 2);
  return <div className="clock-view">
    <div className="big-clock"><span>{hm}</span><small>{seconds}</small></div>
    <div className="clock-date">{new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(date)}</div>
    {isLauncher && state.timer.running && <button className="next-alarm focus-chip" onClick={openAlarms}><Icon name="play" size={14}/>{state.timer.phase === "work" ? "Focus" : "Break"} <b>{timeText(remaining(state.timer, now))}</b></button>}
    {isLauncher && <button className="next-alarm" onClick={openAlarms}><Icon name="alarm" size={16}/>{alarms.next > 0 ? <>Alarm {new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(alarms.next)} <span className="muted">· in {until(alarms.next - now)}</span></> : <span className="muted">No alarm set</span>}</button>}
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

/* ───────────── Alarms (launcher) ───────────── */
const dayNames = ["S", "M", "T", "W", "T", "F", "S"], dayFull = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const until = (ms: number) => { const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60); return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : h ? `${h} h ${m % 60} min` : `${m} min`; };
const repeatText = (days: number[]) => { const set = [...days].sort(); if (!set.length) return "Once"; if (set.length === 7) return "Every day"; if (set.join() === "1,2,3,4,5") return "Weekdays"; if (set.join() === "0,6") return "Weekends"; return set.map(d => dayFull[d]).join(" "); };
const two = (n: number) => String(n).padStart(2, "0");

function useAlarms() {
  const [list, setList] = useState<{ alarms: Alarm[]; next: number }>({ alarms: [], next: -1 });
  const load = () => { if (isLauncher) void Launcher.getAlarms().then(setList).catch(() => undefined); };
  useEffect(() => { load(); const again = () => { if (document.visibilityState === "visible") load(); }; document.addEventListener("visibilitychange", again); const timer = setInterval(load, 30000); return () => { document.removeEventListener("visibilitychange", again); clearInterval(timer); }; }, []);
  return { ...list, setList, load };
}

function ClockTab(props: { timer: Timer; now: number; run: Run; synced: boolean; say: (text: string) => void }) {
  const [tab, setTab] = useState<"alarms" | "focus">(() => { try { return (localStorage.getItem("island-clock-tab") as "alarms" | "focus") || "alarms"; } catch { return "alarms"; } });
  useEffect(() => { try { localStorage.setItem("island-clock-tab", tab); } catch { /* ignore */ } }, [tab]);
  return <div className="list-view">
    <div className="row"><h2>{tab === "alarms" ? "Alarms" : "Focus"}</h2><div className="seg"><button className={tab === "alarms" ? "on" : ""} onClick={() => setTab("alarms")}>Alarms</button><button className={tab === "focus" ? "on" : ""} onClick={() => setTab("focus")}>Focus</button></div></div>
    {tab === "alarms" ? <AlarmsView now={props.now} say={props.say}/> : <FocusView timer={props.timer} now={props.now} run={props.run} synced={props.synced}/>}
  </div>;
}

function AlarmsView({ now, say }: { now: number; say: (text: string) => void }) {
  const { alarms, next, setList } = useAlarms(), [editing, setEditing] = useState<Alarm | null>(null);
  const sorted = [...alarms].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  const save = async (alarm: Alarm) => { await Launcher.ensureAlarmPermissions().catch(() => undefined); setList(await Launcher.saveAlarm({ alarm })); };
  const fresh = (): Alarm => { const at = new Date(now + 60 * 60000); return { id: newId(), hour: at.getHours(), minute: 0, days: [], label: "", enabled: true, vibrate: true, snoozeMinutes: 10 }; };
  return <>
    <p className="muted alarm-next">{next > 0 ? `Next alarm in ${until(next - now)}` : "No alarms on."}</p>
    {sorted.map(alarm => <div key={alarm.id} className={`c-card alarm ${alarm.enabled ? "" : "off"}`}>
      <button className="alarm-main" onClick={() => setEditing(alarm)}><b>{two(alarm.hour)}:{two(alarm.minute)}</b><span>{alarm.label || "Alarm"} · {repeatText(alarm.days)}</span></button>
      <input type="checkbox" role="switch" aria-label={`Alarm ${two(alarm.hour)}:${two(alarm.minute)} on`} checked={alarm.enabled} onChange={event => void save({ ...alarm, enabled: event.target.checked }).catch(error => say(error.message))}/>
    </div>)}
    {!alarms.length && <p className="muted center-text">No alarms yet. Tap + to add one.</p>}
    <button className="round fab" aria-label="Add alarm" onClick={() => setEditing(fresh())}><Icon name="plus" size={24}/></button>
    {editing && <AlarmEditor alarm={editing} isNew={!alarms.some(a => a.id === editing.id)} close={() => setEditing(null)} say={say}
      save={async alarm => { try { await save(alarm); setEditing(null); say(`Alarm set for ${two(alarm.hour)}:${two(alarm.minute)}.`); } catch (error) { say((error as Error).message); } }}
      remove={async id => { setList(await Launcher.deleteAlarm({ id })); setEditing(null); }}/>}
  </>;
}

function AlarmEditor({ alarm, isNew, save, remove, close, say }: { alarm: Alarm; isNew: boolean; save: (alarm: Alarm) => Promise<void>; remove: (id: string) => Promise<void>; close: () => void; say: (text: string) => void }) {
  const [draft, setDraft] = useState<Alarm>(alarm);
  const toggleDay = (day: number) => setDraft(d => ({ ...d, days: d.days.includes(day) ? d.days.filter(x => x !== day) : [...d.days, day] }));
  return <div className="sheet-backdrop" onClick={close}><div className="sheet alarm-editor" onClick={event => event.stopPropagation()}>
    <i className="grabber"/>
    <h3>{isNew ? "New alarm" : "Edit alarm"}</h3>
    <input className="time-pick" type="time" value={`${two(draft.hour)}:${two(draft.minute)}`} onChange={event => { const [h, m] = event.target.value.split(":").map(Number); if (Number.isFinite(h) && Number.isFinite(m)) setDraft(d => ({ ...d, hour: h, minute: m })); }}/>
    <div className="days">{dayNames.map((name, day) => <button key={day} className={draft.days.includes(day) ? "on" : ""} aria-label={dayFull[day]} aria-pressed={draft.days.includes(day)} onClick={() => toggleDay(day)}>{name}</button>)}</div>
    <p className="muted small">{repeatText(draft.days)}</p>
    <input className="label-input" placeholder="Label (optional)" maxLength={60} value={draft.label} onChange={event => setDraft(d => ({ ...d, label: event.target.value }))}/>
    <label className="switch-row"><span>Vibrate</span><input type="checkbox" role="switch" checked={draft.vibrate} onChange={event => setDraft(d => ({ ...d, vibrate: event.target.checked }))}/></label>
    <label className="switch-row"><span>Snooze</span><select value={draft.snoozeMinutes} onChange={event => setDraft(d => ({ ...d, snoozeMinutes: Number(event.target.value) }))}>{[5, 10, 15, 20, 30].map(m => <option key={m} value={m}>{m} min</option>)}</select></label>
    <div className="row gap editor-actions">
      <button className="pill-btn" onClick={() => void save({ ...draft, enabled: true })}>Save</button>
      {!isNew && <button className="pill-btn ghost-light" onClick={() => void Launcher.testAlarm({ id: draft.id }).then(() => say("Test alarm rings in 5 seconds.")).catch(error => say(error.message))}>Test</button>}
      {!isNew && <button className="pill-btn ghost" onClick={() => void remove(draft.id)}>Delete</button>}
    </div>
  </div></div>;
}
