// CSS owns idle motion. Pointer updates are coalesced into one animation frame.
export function setupAmbient() {
  const root = document.documentElement;
  const button = document.querySelector('.motion-toggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let pointerFrame = 0;
  let pointerX = 0, pointerY = 0;
  function clearPointer() {
    cancelAnimationFrame(pointerFrame); pointerFrame = 0;
    root.style.removeProperty('--page-x'); root.style.removeProperty('--page-y');
  }
  function canMove() {
    return root.dataset.motion === 'on' && !reduced.matches && !document.hidden &&
      !document.body.matches('.card-preview,.focus-active') &&
      !document.querySelector('.dashboard:focus-visible,.dashboard :focus-visible');
  }
  let preference = 'on';
  try { preference = localStorage.getItem('mb-portfolio-motion') === 'off' ? 'off' : 'on'; } catch { /* Motion controls also work without storage. */ }
  function render() {
    const enabled = preference === 'on' && !reduced.matches;
    root.dataset.motion = enabled ? 'on' : 'off';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Pause page motion' : 'Resume page motion');
    button.title = reduced.matches ? 'Reduced-motion preference is active' : enabled ? 'Pause page motion' : 'Resume page motion';
    button.disabled = reduced.matches;
    if (!enabled) clearPointer();
  }
  button.addEventListener('click', () => {
    preference = preference === 'on' ? 'off' : 'on';
    try { localStorage.setItem('mb-portfolio-motion', preference); } catch { /* No persistence required to pause. */ }
    render();
  });
  reduced.addEventListener('change', render);
  finePointer.addEventListener('change', clearPointer);
  document.addEventListener('pointermove', event => {
    if (!finePointer.matches || event.pointerType === 'touch' || !canMove() ||
      event.target.closest('button,a,input,textarea,select')) {clearPointer(); return;}
    pointerX = (event.clientX / innerWidth - .5) * 10;
    pointerY = (event.clientY / innerHeight - .5) * 6;
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      if (!canMove()) {clearPointer(); return;}
      root.style.setProperty('--page-x', pointerX.toFixed(2) + 'px');
      root.style.setProperty('--page-y', pointerY.toFixed(2) + 'px');
    });
  }, {passive:true});
  document.addEventListener('pointerleave', clearPointer);
  document.addEventListener('pointerdown', clearPointer, {passive:true});
  document.addEventListener('focusin', clearPointer);
  window.addEventListener('blur', clearPointer);
  document.addEventListener('visibilitychange', () => {
    root.classList.toggle('page-hidden', document.hidden);
    if (document.hidden) clearPointer();
  });
  render();
}
