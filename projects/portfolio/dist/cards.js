// Flip previews are progressive enhancement: every card remains a native button.
export function setupCards(summaries, isDialogOpen) {
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const cards = [...document.querySelectorAll('.project-card,.info-card')];
  let current = null;
  function clear() {
    current?.classList.remove('is-preview');
    if (current) {current.querySelector('.flip-front').removeAttribute('aria-hidden'); current.querySelector('.flip-back').setAttribute('aria-hidden', 'true');}
    current = null;
    document.body.classList.remove('card-preview');
  }
  function preview(card) {
    if (isDialogOpen() || current === card) return;
    clear(); current = card;
    card.classList.add('is-preview');
    card.querySelector('.flip-front').setAttribute('aria-hidden', 'true');
    card.querySelector('.flip-back').removeAttribute('aria-hidden');
    document.body.classList.add('card-preview');
  }
  cards.forEach(card => {
    const key = card.dataset.project || card.dataset.focus;
    const summary = summaries[key];
    const front = document.createElement('span'); front.className = 'flip-face flip-front';
    front.append(...card.childNodes);
    const back = document.createElement('span'); back.className = 'flip-face flip-back'; back.setAttribute('aria-hidden', 'true');
    const category = document.createElement('span'); category.className = 'eyebrow'; category.textContent = summary.category;
    const copy = document.createElement('span'); copy.className = 'flip-copy';
    const title = document.createElement('strong'); title.textContent = summary.title;
    const description = document.createElement('span'); description.textContent = summary.description;
    copy.append(title, description);
    const hint = document.createElement('span'); hint.className = 'flip-hint'; hint.textContent = 'Open full details ↗';
    back.append(category, copy, hint);
    const inner = document.createElement('span'); inner.className = 'flip-inner'; inner.append(front, back);
    card.classList.add('flip-card'); card.append(inner);
    card.addEventListener('pointerenter', event => {if (finePointer.matches && event.pointerType !== 'touch') preview(card);});
    card.addEventListener('pointerleave', event => {if (event.pointerType !== 'touch' && current === card && document.activeElement !== card) clear();});
    card.addEventListener('focus', () => {if (finePointer.matches) preview(card);});
    card.addEventListener('blur', () => {if (current === card) clear();});
  });
  document.addEventListener('pointerdown', event => {if (current && !current.contains(event.target)) clear();});
  document.addEventListener('keydown', event => {if (event.key === 'Escape' && !isDialogOpen()) clear();});
  finePointer.addEventListener('change', clear);
  reducedMotion.addEventListener('change', clear);
  return {
    clear,
    // Touch: first tap previews, second tap opens. Enter/Space always opens.
    shouldOpen(card, event) {
      if (!card.classList.contains('flip-card')) {clear(); return true;}
      if (!finePointer.matches && event.detail > 0 && current !== card) {preview(card); return false;}
      clear(); return true;
    }
  };
}
