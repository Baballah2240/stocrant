import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
export async function browserQa(root) {
  const executable = process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (!existsSync(executable)) throw new Error("Set CHROME_EXE to Chrome/Chromium for browser verification.");
  const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-pipe", `--user-data-dir=${join(root, "browser")}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  const requests = new Map(); let sequence = 0, buffer = "", sessionId;
  const failPending = error => { for (const request of requests.values()) request.reject(error); requests.clear(); };
  browser.on("error", failPending);
  browser.once("exit", () => failPending(new Error("Chrome closed before verification completed.")));
  browser.stdio[3].on("error", failPending);
  browser.stdio[4].on("error", failPending);
  browser.stdio[4].on("data", chunk => { buffer += chunk; let boundary; while ((boundary = buffer.indexOf("\0")) >= 0) { const raw = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1); if (!raw) continue; const message = JSON.parse(raw), request = requests.get(message.id); if (request) { requests.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); } } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { requests.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 10000); requests.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } }); browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0"); });
  try {
    const target = await send("Target.createTarget", { url: "about:blank" }); sessionId = (await send("Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  } catch (error) { await close(); throw error; }
  const evaluate = async expression => { const data = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (data.exceptionDetails) throw new Error(data.exceptionDetails.exception?.description || data.exceptionDetails.text); return data.result.value; };
  const until = async expression => { for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Browser condition timed out: ${expression}`); };
  async function close() {
    try { browser.stdio[3].write(JSON.stringify({ id: ++sequence, method: "Browser.close" }) + "\0"); } catch { /* Already closed. */ }
    await new Promise(resolve => { if (browser.exitCode !== null) return resolve(); browser.once("exit", resolve); setTimeout(() => { browser.kill(); resolve(); }, 2000).unref(); });
  }
  return { send, evaluate, until, close };
}
