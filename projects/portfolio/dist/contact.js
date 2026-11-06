export const profile = Object.freeze({
  name: 'Mohammed Baballah Alsiddig Mohammed',
  nationality: 'Sudanese',
  email: 'mohammedbaballah142@gmail.com',
  phone: '+97470533752',
  phoneLabel: '+974 7053 3752',
  github: 'https://github.com/Baballah2240'
});

const node = (tag, text, className) => {
  const result = document.createElement(tag);
  result.textContent = text;
  if (className) result.className = className;
  return result;
};

function contactLink(label, value, href) {
  const link = node('a', '', 'contact-method');
  link.href = href;
  link.append(node('span', label), node('strong', value));
  return link;
}

export function createContact() {
  const section = node('section', '', 'contact-content');
  const methods = node('div', '', 'contact-methods');
  methods.append(
    contactLink('EMAIL', profile.email, 'mailto:' + profile.email),
    contactLink('CALL · QATAR NUMBER', profile.phoneLabel, 'tel:' + profile.phone)
  );
  const form = node('form', '', 'contact-form');
  const grid = node('div', '', 'contact-form-grid');
  function field(name, labelText, type, maxLength, autocomplete) {
    const label = node('label', labelText);
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    input.id = 'contact-' + name; input.name = name; input.required = true; input.maxLength = maxLength;
    if (type === 'textarea') input.rows = 4; else input.type = type;
    if (autocomplete) input.autocomplete = autocomplete;
    label.append(input); return label;
  }
  grid.append(field('name', 'Your name', 'text', 100, 'name'), field('email', 'Your email', 'email', 254, 'email'));
  const subject = field('subject', 'What would you like to discuss?', 'text', 120);
  subject.querySelector('input').placeholder = 'A project, a meeting, or a new idea';
  const message = field('message', 'Your message', 'textarea', 1500);
  message.querySelector('textarea').placeholder = 'Tell me a little about what you have in mind…';
  form.append(grid, subject, message);
  const note = node('p', 'This prepares a draft in your email app. You review and send it there. Messages are not submitted to this website.', 'contact-form-note');
  note.id = 'contact-form-note'; form.setAttribute('aria-describedby', note.id);
  const submit = node('button', 'Prepare email', 'primary-button'); submit.type = 'submit';
  const status = node('p', '', 'contact-form-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const draft = node('a', 'Open in your email app ↗', 'email-draft');
  draft.hidden = true;
  const actions = node('div', '', 'contact-form-actions'); actions.append(submit, draft);
  form.append(note, actions, status);
  function resetDraft() { draft.hidden = true; draft.removeAttribute('href'); status.textContent = ''; }
  form.addEventListener('input', event => {event.target.setCustomValidity?.(''); resetDraft();});
  form.addEventListener('submit', event => {
    event.preventDefault(); resetDraft();
    for (const input of form.querySelectorAll('input,textarea')) {
      if (!input.value.trim()) input.setCustomValidity('Please enter ' + (input.name === 'message' ? 'a message.' : 'your ' + input.name + '.'));
    }
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const name = String(data.get('name')).trim();
    const email = String(data.get('email')).trim();
    const subject = String(data.get('subject')).trim();
    const body = `Hello Mohammed,\n\n${String(data.get('message')).trim()}\n\nFrom: ${name}\nContact email: ${email}`;
    draft.href = 'mailto:' + profile.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    draft.hidden = false;
    status.textContent = 'Your draft is ready. Open your email app to review and send it.';
    draft.focus({preventScroll:true});
  });
  section.append(methods, form);
  return section;
}
