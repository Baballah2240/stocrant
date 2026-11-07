export type IconName = "notes" | "tasks" | "calculator" | "focus" | "tools" | "shortcuts" | "settings" | "plus" | "search" | "pin" | "trash" | "arrow" | "check" | "play" | "pause" | "reset" | "skip" | "close" | "download" | "upload" | "folder" | "globe" | "sun" | "chevron" | "copy" | "moon" | "sticky" | "music" | "previous";
const paths: Record<IconName, React.ReactNode> = {
  notes: <><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5"/></>,
  tasks: <><rect x="3" y="4" width="18" height="17" rx="4"/><path d="m7 12 3 3 7-7"/></>,
  calculator: <><rect x="5" y="2" width="14" height="20" rx="4"/><path d="M8 7h8M8 12h1m6 0h1m-8 5h1m6 0h1"/></>,
  focus: <><circle cx="12" cy="13" r="8"/><path d="M10 2h4M12 9v4l3 2M19 5l2 2"/></>,
  tools: <><path d="m13 4 7 7-9 9-7-7zM7 10l3 3m0-6 3 3m0-6 3 3M4 20l-1 1"/></>,
  shortcuts: <><path d="M14 3h7v7m0-7L11 13M10 5H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4"/></>,
  settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  pin: <><path d="m9 3 12 12-5 1-4 4-3-7-6-3 4-4zM9 15l-6 6"/></>, trash: <><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>, check: <path d="m5 12 4 4L19 6"/>, play: <path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>,
  pause: <path d="M8 5v14M16 5v14" strokeWidth="3"/>, reset: <><path d="M4 11a8 8 0 1 1 2 7M4 4v7h7"/></>, skip: <><path d="m5 5 11 7-11 7z"/><path d="M19 5v14"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>, download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>, upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
  folder: <path d="M3 7V5h7l2 3h9v12H3z"/>, globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c6 5 6 13 0 18-6-5-6-13 0-18"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></>,
  music: <><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></>, previous: <><path d="m19 5-11 7 11 7z"/><path d="M5 5v14"/></>, sticky: <><path d="M5 4h14v10l-6 6H5z"/><path d="M13 20v-6h6"/></>, moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>, chevron: <path d="m8 5 7 7-7 7"/>, copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/></>,
};
export function Icon({ name, size = 18, ...props }: { name: IconName; size?: number } & React.SVGProps<SVGSVGElement>) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>; }
