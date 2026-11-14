import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserQa } from './browser-qa.mjs';
const root = mkdtempSync(join(tmpdir(), 'stocrant-test-data-company-services-'));
process.env.STOCRANT_DATA_DIR = root;
process.env.NODE_ENV = 'development';
const { createApp } = await import('../dist/app.js');
const server = createApp().listen(0, '127.0.0.1');
await new Promise(done => server.once('listening', done));
const base = `http://127.0.0.1:${server.address().port}`, password = randomBytes(24).toString('hex');
let browser;
try {
  const setup = await fetch(base + '/api/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Company Services QA', email: 'qa@services.test', password, setupKey: 'local-setup' }) });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  const path = '/api/workspace/company-services/company-primary';
  const defaults = await (await fetch(base + path, { headers: { Cookie: cookie } })).json();
  const { organizationId, ...settings } = defaults.settings;
  const save = await fetch(base + path, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...settings, websiteEnabled: true, published: true, slug: 'qa-company', title: 'Connected company', titleAr: 'الشركة المترابطة', about: 'A company website connected to its business workspace.', aboutAr: 'موقع الشركة متصل بمساحة عملها.', email: 'public@example.test', services: 'Operations\nBusiness management' }) });
  assert.equal(save.status, 200, await save.text());
  browser = await browserQa(root);
  const { send, evaluate, until } = browser;
  await send('Page.enable'); await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];addEventListener("error",e=>__errors.push(e.message));addEventListener("unhandledrejection",e=>__errors.push(String(e.reason)));' });
  await send('Network.setCookie', { name: 'stocrant_session', value: cookie.slice(cookie.indexOf('=') + 1), url: base, path: '/' });
  const shots = resolve('.local-preview/qa/company-services'); mkdirSync(shots, { recursive: true });
  let layouts = 0;
  for (const language of ['en', 'ar']) for (const theme of ['light', 'dark']) for (const [width, height] of [[1366, 768], [390, 844], [320, 740]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.navigate', { url: base + '/workspace' });
    await until('document.readyState==="complete"');
    await evaluate(`localStorage.setItem('stocrant.language',${JSON.stringify(language)});localStorage.setItem('stocrant-theme',${JSON.stringify(theme)})`);
    await send('Page.navigate', { url: base + '/organization/companies/company-primary?section=services' });
    await until('Boolean(document.querySelector(".app-lock-screen input"))');
    await evaluate(`(()=>{const input=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(password)});input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.app-lock-screen form').requestSubmit();})()`);
    await until('Boolean(document.querySelector(".company-service-publish"))');
    assert.equal(await evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'), `Workspace overflow ${language}/${theme}/${width}`);
    assert.equal(await evaluate('document.querySelectorAll(".company-service-links a").length'), 5);
    assert.ok(await evaluate('document.querySelector(".company-service-checks input").getBoundingClientRect().height<=24'), 'Checkboxes stay compact with full label touch targets');
    assert.deepEqual(await evaluate('window.__errors'), []);
    if (theme === 'light' && [1366, 390].includes(width)) {
      await evaluate('document.querySelector(".company-services").scrollIntoView({block:"start"})');
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(join(shots, `${language}-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    layouts++;
  }
  await evaluate(`(()=>{const input=Array.from(document.querySelectorAll('.company-services input')).find(n=>n.value==='Connected company');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Updated company website');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate('document.querySelector(".company-services form").requestSubmit()');
  await until('Boolean(document.querySelector(".company-services [role=status]"))');
  const updated = await (await fetch(base + path, { headers: { Cookie: cookie } })).json();
  assert.equal(updated.settings.title, 'Updated company website');
  for (const language of ['en', 'ar']) for (const width of [1366, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.navigate', { url: base + '/company/qa-company?lang=' + language });
    await until('Boolean(document.querySelector(".hero"))');
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
    assert.equal(await evaluate('document.documentElement.dir'), language === 'ar' ? 'rtl' : 'ltr');
    assert.equal(await evaluate('document.querySelector("#contact a").getAttribute("href")'), 'mailto:public@example.test');
    layouts++;
  }
  console.log(`Company services verified: ${layouts} responsive layouts, English/Arabic, light/dark workspace, saved UI edits, public contact and isolated fixtures.`);
} finally {
  if (browser) await browser.close();
  server.closeAllConnections(); await new Promise(done => server.close(done));
  assert.ok(root.startsWith(join(tmpdir(), 'stocrant-test-data-company-services-')));
  rmSync(root, { recursive: true, force: true });
}
