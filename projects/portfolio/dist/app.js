'use strict';
const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
function setTheme(theme) {
  root.dataset.theme = theme === 'light' ? 'light' : 'dark';
  themeButton.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`);
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f4f4ed' : '#10120f';
}
try { setTheme(localStorage.getItem('mb-portfolio-theme') || 'dark'); } catch { setTheme('dark'); }
themeButton.addEventListener('click', () => {
  const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
  try { localStorage.setItem('mb-portfolio-theme', theme); } catch { /* Theme still works without persistent storage. */ }
});
const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('.nav-links');
function closeMenu() { menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Open navigation'); menu.classList.remove('is-open'); }
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  menu.classList.toggle('is-open', open);
});
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
document.addEventListener('click', event => { if (!event.target.closest('.nav')) closeMenu(); });
matchMedia('(min-width: 601px)').addEventListener('change', closeMenu);
const filterButtons = document.querySelectorAll('[data-filter]');
filterButtons.forEach(button => button.addEventListener('click', () => {
  filterButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  document.querySelectorAll('[data-category]').forEach(card => {
    card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter;
  });
}));
const projects = {
  stocrant: { title: 'Stocrant', category: 'BUSINESS OPERATIONS', stage: 'Ongoing development', description: 'A business management project connecting company operations, finance and online shop workflows in one workspace.', focus: ['A connected workspace for company teams.', 'Responsive experiences across desktop and mobile.', 'Company-specific access and operational workflows.'], note: 'The project is being developed and improved. The portfolio illustration is a conceptual interface, not a live dashboard or a claim that every planned module is production-ready.', tags: ['Business software', 'Responsive web', 'Company workflows'], url: 'https://www.mohbaba.online/', link: 'Visit Stocrant' },
  safeer: { title: 'Safeer / سفير', category: 'PASSENGER TRANSPORT', stage: 'In development · local', description: 'A passenger transportation platform for Sudan, developed in stages around independent transport companies and a future passenger marketplace.', focus: ['Company access, roles and operational data isolation.', 'Bilingual company and route management.', 'A roadmap for seat reservations, station ticketing and passenger luggage.'], note: 'Safeer is currently a local development project. Reservations, payment processing and ticket issuance are staged development goals; this portfolio does not accept bookings.', tags: ['TypeScript', 'NestJS', 'PostgreSQL', 'Arabic / English'] },
  school: { title: 'Qatar School Time Table', category: 'EDUCATION & DISPLAYS', stage: 'Local Windows application', description: 'A school schedule display project combining a Windows companion with a local web control panel.', focus: ['Lesson, break and next-activity information.', 'A compact floating display and event notifications.', 'Arabic and English presentation for school screens.'], note: 'The current setup is local. Central hosting and remote synchronization are future deployment work. The display visual on this portfolio is illustrative.', tags: ['Windows', 'Web control panel', 'Bilingual UI'] }
};
const dialog = document.querySelector('#project-dialog');
const details = document.querySelector('#project-details');
function element(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', () => {
  const project = projects[button.dataset.project];
  if (!project) return;
  details.replaceChildren(element('p', project.category, 'eyebrow'), element('h2', project.title), element('span', project.stage, 'project-state'), element('p', project.description), element('h3', 'Project focus'));
  details.querySelector('h2').id = 'dialog-title';
  const list = document.createElement('ul');
  project.focus.forEach(text => list.append(element('li', text)));
  details.append(list);
  const tags = element('div', '', 'tags');
  project.tags.forEach(text => tags.append(element('span', text)));
  details.append(tags, element('p', project.note));
  if (project.url) { const link = element('a', project.link + ' ↗', 'button button-primary'); link.href = project.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link); }
  dialog.showModal();
}));
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
document.querySelector('#year').textContent = String(new Date().getFullYear());
