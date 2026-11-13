const paths = {
  shop: 'M3 10V4h18v6M3 4l-1 6c0 3 4 3 5 0 1 3 4 3 5 0 1 3 4 3 5 0 1 3 5 3 5 0l-1-6M4 13v8h16v-8M9 21v-6h6v6',
  support: 'M4 13v-2a8 8 0 0 1 16 0v2M4 11H2v7h4v-7H4m16 0h2v7h-4v-7h2m0 7v1a3 3 0 0 1-3 3h-4m-3-1h4v2h-4z',
  payroll: 'M3 6h18v13H3zM3 10h18M6 15h4m6-1v3m-1-2h3M6 3v3m12-3v3',
  payslip: 'M5 3h14v19l-3-2-4 2-4-2-3 2V3M8 7h8M8 11h8M8 15h4',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v12H5zM12 15v3',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6',
  close: 'm6 6 12 12M6 18 18 6',
  moon: 'M20.5 13A9 9 0 0 1 11 3.5a9 9 0 1 0 9.5 9.5',
  sun: 'M12 3v1m0 16v1M3 12h1m16 0h1M5.6 5.6l.7.7m11.4 11.4.7.7M5.6 18.4l.7-.7M17.7 6.3l.7-.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  attendance: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  leave: 'M8 3v4m8-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2m3 10 3 3 5-5',
  work: 'M8 7V4h8v3M3 12l9 4 9-4M4 7h16v14H4zM12 12v5',
  more: 'M5 5h1v1H5zm13 0h1v1h-1zM5 18h1v1H5zm13 0h1v1h-1z',
  files: 'M14 3H5v18h14V8zM14 3v5h5M8 12h8m-8 4h6',
  companies: 'M4 21V3h12v18M16 9h4v12M8 7h4m-4 4h4m-4 4h4M2 21h20',
  locations: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  people: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-3a4 4 0 0 1 0 8m5 9v-3a4 4 0 0 0-3-4',
  inventory: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 5 9-5M12 12v9M7 5l10 5',
  finance: 'M3 6h18v14H3zM3 6V4h15M15 11h6v5h-6z',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  refresh: 'M20 8a8 8 0 1 0 0 8M20 3v5h-5',
  chevron: 'm9 5 7 7-7 7',
  info: 'M12 11v6m0-10v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  logout: 'M9 3H3v18h6M8 12h13m-5-5 5 5-5 5',
};
export type MobileIconName = keyof typeof paths;
export default function MobileIcon({ name }: { name: MobileIconName }) {
  return <svg className="mobile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
