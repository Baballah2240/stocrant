import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { browserQa } from './browser-qa.mjs';
const root = mkdtempSync(join(tmpdir(), 'stocrant-test-data-app-releases-'));
process.env.STOCRANT_DATA_DIR = root; process.env.NODE_ENV = 'development';
const { createApp } = await import('../dist/app.js');
const server = createApp().listen(0, '127.0.0.1'); await new Promise(done => server.once('listening', done));
const base = `http://127.0.0.1:${server.address().port}`, password = randomBytes(24).toString('hex');
let browser;
try {
  const setup = await fetch(base + '/api/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'App release QA', email: 'qa@release.test', password, setupKey: 'local-setup' }) });
  assert.equal(setup.status, 201); const cookie = setup.headers.get('set-cookie').split(';')[0];
  const api = async (suffix, body) => { const response = await fetch(base + '/api/workspace/app-releases' + suffix, { method: body ? 'POST' : 'GET', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); assert.ok(response.ok, await response.clone().text()); return response.json(); };
  const draft = (await api('', { platform: 'android', versionName: '2.0.0', buildNumber: 20, notes: 'Verified example build for local tests only.', downloadUrl: 'https://releases.example.test/stocrant-20.apk', sha256: 'a'.repeat(64) })).item;
  browser = await browserQa(root); const { send, evaluate, until } = browser;
  await send('Page.enable'); await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errors=[];addEventListener("error",e=>__errors.push(e.message));addEventListener("unhandledrejection",e=>__errors.push(String(e.reason)));' });
  await send('Network.setCookie', { name: 'stocrant_session', value: cookie.slice(cookie.indexOf('=') + 1), url: base, path: '/' });
  async function navigate(path) {
    await send('Page.navigate', { url: base + path }); await until('Boolean(document.querySelector(".app-lock-screen input"))');
    await evaluate(`(()=>{const n=document.querySelector('.app-lock-screen input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(password)});n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.app-lock-screen form').requestSubmit();})()`);
    await until('Boolean(document.querySelector(".app-updates"))');
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await navigate('/app-update'); await until('Boolean(document.querySelector(".app-updates>.card"))');
  assert.equal(await evaluate('document.querySelectorAll(".app-release-card").length'), 0);
  assert.ok(!await evaluate('document.querySelector(".app-updates").textContent.includes("2.0.0")'));
  await evaluate("localStorage.setItem('stocrant.language','en')");
  await navigate('/admin?tab=Mobile%20app'); await until('Boolean(document.querySelector(".app-release-card button"))');
  await evaluate('Array.from(document.querySelectorAll(".app-release-card button")).find(n=>n.textContent.includes("Approve and notify")).click()');
  await until('Array.from(document.querySelectorAll(".app-release-card button")).some(n=>n.textContent.includes("Withdraw"))');
  assert.equal((await api('/available')).items[0].versionName, '2.0.0');
  const shots = resolve('.local-preview/qa/app-releases'); mkdirSync(shots, { recursive: true });
  let layouts = 0;
  for (const language of ['en','ar']) for (const theme of ['light','dark']) for (const [width,height] of [[1366,768],[390,844],[320,740]]) {
    await evaluate(`localStorage.setItem('stocrant.language',${JSON.stringify(language)});localStorage.setItem('stocrant-theme',${JSON.stringify(theme)})`);
    await send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:width<700 });
    for (const path of ['/app-update','/admin?tab=Mobile%20app']) {
      await navigate(path); await until('document.querySelectorAll(".app-release-card").length===1');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'), `${path}/${language}/${theme}/${width} overflow`);
      assert.deepEqual(await evaluate('window.__errors'), []);
      if (theme==='light' && width===390 && path==='/app-update') { const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(shots,language+'-390.png'),Buffer.from(shot.data,'base64')); }
      layouts++;
    }
  }
  await evaluate("localStorage.setItem('stocrant.language','en')"); await navigate('/app-update'); await until('Boolean(document.querySelector(".app-release-card button"))');
  await api(`/${draft.id}/withdraw`, { version: 2 });
  await evaluate('document.querySelector(".app-release-card button").click()'); await until('Boolean(document.querySelector(".app-updates [role=alert]"))');
  assert.ok(await evaluate('document.querySelector(".app-updates [role=alert]").textContent.includes("no longer approved")'));
  assert.equal(await evaluate('location.origin'), base);
  console.log(`App releases verified: ${layouts} responsive user/admin layouts, English/Arabic, themes, hidden drafts, UI approval and stale-download revocation.`);
} finally {
  if (browser) await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
  assert.ok(root.startsWith(join(tmpdir(),'stocrant-test-data-app-releases-'))); rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:250});
}
