import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserQa } from './browser-qa.mjs';
const root = mkdtempSync(join(tmpdir(), 'stocrant-test-data-dashboard-layout-'));
process.env.STOCRANT_DATA_DIR = root; process.env.NODE_ENV = 'development';
const { createApp } = await import('../dist/app.js');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(done => server.once('listening', done));
const base = `http://127.0.0.1:${server.address().port}`, password = randomBytes(24).toString('hex');
let browser;
try {
  const setup = await fetch(base + '/api/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Dashboard QA', email: 'qa@layout.test', password, setupKey: 'local-setup' }) });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  browser = await browserQa(root); const { send, evaluate, until } = browser;
  await send('Page.enable'); await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];addEventListener("error",e=>__errors.push(e.message));addEventListener("unhandledrejection",e=>__errors.push(String(e.reason)));' });
  await send('Network.setCookie', { name: 'stocrant_session', value: cookie.slice(cookie.indexOf('=') + 1), url: base, path: '/' });
  const click = text => evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.dashboard-customizer button')).find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing button '+${JSON.stringify(text)});button.click();})()`);
  async function navigate() {
    await send('Page.navigate', { url: base + '/workspace' });
    await until('Boolean(document.querySelector(".app-lock-screen input"))');
    await evaluate(`(()=>{const input=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.app-lock-screen form').requestSubmit();})()`);
    await until('Boolean(document.querySelector(".dashboard-customizer button:not(:disabled)"))');
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate();
  await evaluate("localStorage.setItem('stocrant.language','en')"); await navigate();
  await click('Customize dashboard'); await click('Daily focus'); await click('Compact');
  assert.ok(await evaluate('document.querySelectorAll(".is-layout-hidden").length>0'));
  assert.equal(await evaluate('document.querySelector(".custom-dashboard-grid").dataset.density'), 'compact');
  await click('Save layout'); await until('!document.querySelector(".is-customizing")');
  await navigate();
  await until('document.querySelector(".custom-dashboard-grid").dataset.density==="compact"');
  assert.equal(await evaluate('document.querySelectorAll("[data-dashboard-card]:not([hidden])").length'), 5);
  await click('Customize dashboard'); await click('Show all cards');
  assert.equal(await evaluate('document.querySelectorAll(".is-layout-hidden").length'), 0);
  await click('Cancel');
  assert.equal(await evaluate('document.querySelectorAll("[data-dashboard-card]:not([hidden])").length'), 5);
  await click('Customize dashboard'); await click('Balanced'); await click('Save layout'); await until('!document.querySelector(".is-customizing")');
  const shots = resolve('.local-preview/qa/dashboard-customization'); mkdirSync(shots, { recursive: true });
  let layouts = 0;
  for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) for (const [width, height] of [[1920,1080], [1366,768], [820,1000], [390,844], [320,740]]) {
    await evaluate(`localStorage.setItem('stocrant.language',${JSON.stringify(language)});localStorage.setItem('stocrant-theme',${JSON.stringify(theme)})`);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await navigate();
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'), `Overflow: ${language}/${theme}/${width}`);
    assert.deepEqual(await evaluate('window.__errors'), []);
    assert.equal(await evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr');
    if (theme === 'light' && [1366,390].includes(width)) {
      const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(shots, `${language}-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    layouts++;
  }
  await evaluate("localStorage.setItem('stocrant.language','en')"); await navigate(); await click('Customize dashboard');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
  await evaluate('document.querySelector(".dashboard-card-controls summary").click()');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
  console.log(`Dashboard verified: ${layouts} responsive layouts; presets, saved spacing, reload persistence, hidden-card recovery, cancel and mobile editor.`);
} finally {
  if (browser) await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
  assert.ok(root.startsWith(join(tmpdir(), 'stocrant-test-data-dashboard-layout-')));
  rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
