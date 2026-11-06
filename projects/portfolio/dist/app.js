'use strict';
import {profile, createContact} from './contact.js';
import {setupCards} from './cards.js';
import {setupAmbient} from './ambient.js';

setupAmbient();

const root = document.documentElement;
const themeButton = document.querySelector('.theme-toggle');
function setTheme(value) {
  const theme = value === 'light' ? 'light' : 'dark';
  root.dataset.theme = theme;
  themeButton.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`);
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#eceff3' : '#0c1016';
}
try { setTheme(localStorage.getItem('mb-portfolio-theme')); } catch { setTheme('dark'); }
themeButton.addEventListener('click', () => {
  const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
  try { localStorage.setItem('mb-portfolio-theme', theme); } catch { /* Theme works without storage. */ }
});

const projects = {
  stocrant: {
    title: 'Stocrant', category: '01 / BUSINESS OPERATIONS', stage: 'Ongoing development',
    description: 'A business management project connecting company operations, finance and online shop workflows in one workspace.',
    focus: ['A connected workspace for company teams.', 'Responsive experiences across desktop and mobile.', 'Company-specific access and operational workflows.'],
    note: 'This project is being developed and improved. The overview artwork is an interface illustration, not a live dashboard or a claim that every planned module is production-ready.',
    tags: ['Business software', 'Responsive web', 'Company workflows'], url: 'https://www.mohbaba.online/', link: 'Visit Stocrant'
  },
  safeer: {
    title: 'Safeer / سفير', category: '02 / PASSENGER TRANSPORT', stage: 'In development · local',
    description: 'A passenger transportation platform for Sudan, developed in stages around independent transport companies and a future passenger marketplace.',
    focus: ['Company access, roles and operational data isolation.', 'Bilingual company and route management.', 'A roadmap for seat reservations, station ticketing and passenger luggage.'],
    note: 'Safeer is currently a local development project. Reservations, payment processing and ticket issuance are staged development goals; this portfolio does not accept bookings.',
    tags: ['TypeScript', 'NestJS', 'PostgreSQL', 'Arabic / English']
  },
  school: {
    title: 'Qatar School Time Table', category: '03 / EDUCATION & DISPLAYS', stage: 'Local Windows application',
    description: 'A school schedule display project combining a Windows companion with a local web control panel.',
    focus: ['Lesson, break and next-activity information.', 'A compact floating display and event notifications.', 'Arabic and English presentation for school screens.'],
    note: 'The current setup is local. Central hosting and remote synchronization are future deployment work. The display visual in this portfolio is illustrative.',
    tags: ['Windows', 'Web control panel', 'Bilingual UI']
  }
};
const expertise = [
  {title:'Interface & experience', description:'Responsive layouts, clear navigation and bilingual Arabic/English experiences across screen sizes.', tags:['HTML & CSS', 'JavaScript', 'Accessibility']},
  {title:'Application & logic', description:'Connected business workflows, structured APIs and permissions that reflect how an organization operates.', tags:['TypeScript', 'Node.js', 'NestJS']},
  {title:'Data & foundations', description:'Relational data, company isolation and tested rules, with a foundation that can grow alongside the product.', tags:['PostgreSQL', 'Git & GitHub', 'Testing']}
];
const dialog = document.querySelector('#project-dialog');
const details = document.querySelector('#project-details');
const counter = document.querySelector('.focus-counter');
let opener = null;

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function arrow() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#arrow'); svg.append(use); return svg;
}
function tags(values) {
  const node = element('div', '', 'tags');
  values.forEach(value => node.append(element('span', value)));
  return node;
}
function link(label, url) {
  const node = element('a', label, 'primary-button detail-link');
  node.href = url; node.target = '_blank'; node.rel = 'noopener noreferrer'; node.append(arrow());
  return node;
}
function heading(category, title, description) {
  const titleNode = element('h2', title, 'detail-heading'); titleNode.id = 'dialog-title';
  details.replaceChildren(element('p', category, 'eyebrow'), titleNode);
  if (description) details.append(element('p', description, 'detail-description'));
}
function showProject(id) {
  const project = projects[id]; if (!project) return;
  heading(project.category, project.title);
  details.append(element('span', project.stage, 'detail-stage'), element('p', project.description, 'detail-description'), element('h3', 'Project focus', 'detail-section-title'));
  const list = element('ul', '', 'detail-list');
  project.focus.forEach(value => list.append(element('li', value)));
  details.append(list, tags(project.tags), element('p', project.note, 'detail-note'));
  if (project.url) details.append(link(project.link, project.url));
  counter.textContent = 'PROJECT ' + (Object.keys(projects).indexOf(id) + 1) + ' / 3';
  document.querySelectorAll('.project-card').forEach(card => card.classList.toggle('is-selected', card.dataset.project === id));
}
function showSection(section) {
  counter.textContent = section.toUpperCase();
  if (section === 'work') {
    heading('SELECTED WORK', 'Three projects. One approach.', 'Connected software for the way people actually work. Choose a project to explore its context and current stage.');
    const list = element('div', '', 'project-picker');
    Object.entries(projects).forEach(([id, project]) => {
      const button = element('button', ''); button.type = 'button';
      const copy = element('div', ''); copy.append(element('strong', project.title), element('span', project.stage));
      button.append(copy, arrow());
      button.addEventListener('click', () => {showProject(id); resetDialogFocus();});
      list.append(button);
    });
    details.append(list);
  } else if (section === 'about') {
    heading('04 / BEHIND THE WORK', 'Curious by nature. Builder by choice.');
    details.append(element('p', profile.name, 'profile-name'), element('p', 'Sudanese full-stack developer. I turn complex workflows into software that feels straightforward.', 'detail-description'));
    details.append(element('p', 'My projects explore business management, passenger transportation and school displays. I care about how the interface, the underlying data and the people using the product fit together.', 'detail-paragraph'));
    details.append(element('p', 'I work iteratively: understand the problem, build the foundation, test the workflow, then improve the details.', 'detail-paragraph'), tags(['Sudanese', 'Business systems', 'Transport', 'Education', 'Arabic & English']), link('Follow the work on GitHub', profile.github));
  } else if (section === 'expertise') {
    heading('05 / HOW I BUILD', 'Every layer matters.', 'From the first interaction to the data behind it.');
    const list = element('div', '', 'expertise-list');
    expertise.forEach(item => {const article = element('article', ''); article.append(element('h3', item.title), element('p', item.description), tags(item.tags)); list.append(article);});
    details.append(list);
  } else if (section === 'contact') {
    heading('06 / LET’S CONNECT', 'Let’s make time to talk.', 'Have a project or want to arrange a meeting? Send me an email or give me a call.');
    details.append(element('p', profile.name + ' · ' + profile.nationality, 'profile-name'), createContact());
  }
}
function resetDialogFocus() {
  document.querySelector('.dialog-scroll').scrollTop = 0;
  document.querySelector('.dialog-close').focus({preventScroll:true});
}
function openView(button, type, id) {
  cards.clear();
  opener = button;
  document.querySelectorAll('[aria-controls="project-dialog"]').forEach(node => node.setAttribute('aria-expanded', String(node === button)));
  if (type === 'project') showProject(id); else showSection(id);
  document.body.classList.add('focus-active');
  if (!dialog.open) dialog.showModal();
  resetDialogFocus();
}
const cards = setupCards({
  ...Object.fromEntries(Object.entries(projects).map(([id, project]) => [id, {category:project.category, title:project.title, description:project.description}])),
  about:{category:'04 / ABOUT ME', title:'Mohammed Baballah', description:'Sudanese full-stack developer. Building connected software for business, transport and education.'},
  expertise:{category:'05 / EXPERTISE', title:'From interface to data.', description:'JavaScript, TypeScript, Node.js, NestJS and PostgreSQL. Responsive Arabic and English experiences.'},
  contact:{category:'06 / LET’S CONNECT', title:'Email me. Or call.', description:profile.email + ' · ' + profile.phoneLabel}
}, () => dialog.open);
document.querySelectorAll('[data-project]').forEach(button => button.addEventListener('click', event => {if (cards.shouldOpen(button, event)) openView(button, 'project', button.dataset.project);}));
document.querySelectorAll('[data-focus]').forEach(button => button.addEventListener('click', event => {if (cards.shouldOpen(button, event)) openView(button, 'section', button.dataset.focus);}));
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  document.body.classList.remove('focus-active');
  document.querySelectorAll('[aria-controls="project-dialog"]').forEach(node => node.setAttribute('aria-expanded', 'false'));
  document.querySelectorAll('.is-selected').forEach(node => node.classList.remove('is-selected'));
  if (opener?.isConnected) opener.focus({preventScroll:true});
  cards.clear();
  opener = null;
  if (details.querySelector('.contact-form')) details.replaceChildren();
});
document.querySelector('#year').textContent = String(new Date().getFullYear());
