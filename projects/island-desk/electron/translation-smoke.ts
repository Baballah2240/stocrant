import { clipboard, type BrowserWindow } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Real renderer + trusted IPC, with deterministic provider replies and no user data. */
export async function translationSmoke(window: BrowserWindow): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  const originalFetch = globalThis.fetch;
  let calls = 0, behavior = "success";
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith("https://api.mymemory.translated.net/get?")) return originalFetch(input, init);
    calls++;
    if (behavior === "offline") throw Error("offline fixture");
    if (behavior === "pending") await new Promise<void>((_, reject) => {
      if (init?.signal?.aborted) reject(Error("aborted"));
      else init?.signal?.addEventListener("abort", () => reject(Error("aborted")), { once: true });
    });
    return Response.json({ responseStatus: 200, responseData: { translatedText: "مرحبا &amp; &lt;hello&gt;" } });
  };
  const js = (code: string) => window.webContents.executeJavaScript(code);
  const waitFor = async (code: string) => { for (let i = 0; i < 60; i++) { if (await js(code)) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
  const tab = (label: string) => js(`[...document.querySelectorAll('.tabs button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);
  const input = (text: string) => js(`(()=>{const el=document.querySelector('#translation-source');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  try {
    await tab("Translate");await waitFor("!!document.querySelector('#translation-source')");
    await input("Hello");
    results.translationIsOptIn = calls === 0;
    results.translationHasRTL = await js("document.querySelector('#translation-output').dir==='rtl'");
    await js("document.querySelector('.translation button[type=submit]').click()");
    results.translationThroughIPC = await waitFor("document.querySelector('#translation-output').value==='مرحبا & <hello>'");
    results.translationSafeText = await js("!document.querySelector('.translation hello')");
    await js("document.querySelector('.translation-panel-foot button:has(svg)').click()");
    results.translationCopy = await waitFor("document.querySelector('.toast')?.textContent.includes('Translation copied.')") && (await clipboard.readText()) === "مرحبا & <hello>";
    await tab("Notes");await tab("Translate");
    results.translationDraftPreserved = await js("document.querySelector('#translation-source').value==='Hello'&&document.querySelector('#translation-output').value==='مرحبا & <hello>'");
    await js("document.querySelector('.translation-swap').click()");
    results.translationSwap = await js("document.querySelector('#translation-from').value==='ar'&&document.querySelector('#translation-to').value==='en'&&document.querySelector('#translation-source').dir==='rtl'&&document.querySelector('#translation-source').value==='مرحبا & <hello>'&&document.querySelector('#translation-output').value===''");
    behavior = "pending";await js("document.querySelector('.translation button[type=submit]').click()");
    await waitFor("document.querySelector('.translation-result').getAttribute('aria-busy')==='true'");
    await js("document.querySelector('.translation-cancel').click()");
    results.translationCancel = await waitFor("document.querySelector('.translation-result').getAttribute('aria-busy')==='false'&&document.querySelector('#translation-output').value===''");
    behavior = "offline";await js("document.querySelector('.translation button[type=submit]').click()");
    results.translationOffline = await waitFor("document.querySelector('.translation [role=alert]')?.textContent.includes('internet connection')");
    behavior = "success";await js("document.querySelector('.translation button[type=submit]').click()");
    results.translationRetry = await waitFor("!!document.querySelector('#translation-output').value&&!document.querySelector('.translation [role=alert]')");
    results.translationLayout = await js("(()=>{const f=document.querySelector('.translation'),tabs=document.querySelector('.tabs'),content=document.querySelector('.content'),button=document.querySelector('.translation button[type=submit]');return f.scrollWidth<=f.clientWidth+1&&tabs.scrollWidth<=tabs.clientWidth+1&&button.getBoundingClientRect().bottom<=content.getBoundingClientRect().bottom+1;})()");
    await js("document.querySelector('.toast button')?.click();document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).forEach(a=>a.finish())");
    await new Promise(r => setTimeout(r, 450));
    mkdirSync(".qa", { recursive: true });writeFileSync(join(".qa", "translation-desktop.png"), (await window.webContents.capturePage()).toPNG());
    await tab("Calculator");
  } finally { globalThis.fetch = originalFetch; }
  return results;
}
