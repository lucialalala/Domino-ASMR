// Uses the installed browser and Node's built-in CDP WebSocket; no downloaded test dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, '.preview');
await fs.mkdir(artifacts, { recursive: true });
const browserPath = process.env.DOMINO_BROWSER || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find(existsSync);
if (!browserPath) throw new Error('Set DOMINO_BROWSER to an installed Chromium browser.');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'domino-browser-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs'), '4175'], { cwd: root, windowsHide: true, stdio: 'ignore' });
const browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions',
  '--disable-sync', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', 'about:blank'],
{ windowsHide: true, stdio: 'ignore' });
let ws, nextId = 1;
const pending = new Map(), errors = [];
const results = [];
async function waitFor(fn, message, timeout = 15000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch {} await sleep(60); }
  throw new Error('Timed out: ' + message + ' (' + JSON.stringify(last) + ')');
}
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timeout }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception.description);
  return result.result.value;
}
async function snapshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64'));
}
async function navigate() {
  await send('Page.navigate', { url: 'http://127.0.0.1:4175/' });
  await waitFor(() => evaluate('!!(window.Domino && Domino.app && document.getElementById("scene").width > 1)'), 'game startup');
  await sleep(200);
}
async function click(id) {
  const p = await evaluate('(function(){var r=document.getElementById(' + JSON.stringify(id) + ').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};}())');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
}
async function stroke(points, stationary = false) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points[0].x, y: points[0].y, id: 1 }] });
  for (const p of points.slice(1)) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    await sleep(18);
  }
  if (stationary) {
    const count = await evaluate('Domino.app.path.bones.length');
    await sleep(650);
    assert.equal(await evaluate('Domino.app.path.bones.length'), count, 'stationary finger cannot extend a path');
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor(() => evaluate('!Domino.app.path.active'), 'stroke completion');
}
function passed(name, data) { console.log('PASS ' + name); results.push({ name, data }); }
try {
  await waitFor(async () => { const r = await fetch('http://127.0.0.1:4175/'); return r.ok; }, 'preview server');
  const port = await waitFor(async () => (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0], 'browser port');
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const page = pages.find(p => p.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const entry = pending.get(data.id); pending.delete(data.id); clearTimeout(entry.timeout);
      if (data.error) entry.reject(new Error(JSON.stringify(data.error))); else entry.resolve(data.result || {});
    }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text + ': ' + (data.params.exceptionDetails.exception && data.params.exceptionDetails.exception.description));
    if (data.method === 'Log.entryAdded' && data.params.entry.source === 'security') errors.push(data.params.entry.text);
  });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await navigate();
  assert.equal(await evaluate('Domino.app.state'), 'EMPTY');
  assert.equal(await evaluate('document.querySelector("h1").textContent'), '多米诺ASMR');
  assert(await evaluate('document.getElementById("sound").getBoundingClientRect().top') >= 44);
  assert.equal(await evaluate('Domino.app.renderer.mode'), 'webgl');
  await snapshot('mobile-empty'); passed('mobile startup under restrictive CSP', await evaluate('Domino.app.diagnostics()'));
  assert.equal(await evaluate('document.getElementById("hint").textContent'), '滑动摆放，点击推倒');
  await evaluate('(function(){var hint=document.getElementById("hint");window.dragHintFlashes=0;window.dragHintUpdates=[];window.dragHintObserver=new MutationObserver(function(){if(Domino.app.path.active){window.dragHintUpdates.push(hint.textContent);if(hint.textContent==="滑动摆放 · 松手后可从尾点续画")window.dragHintFlashes++;}});window.dragHintObserver.observe(hint,{childList:true,characterData:true,subtree:true});}())');
  const points = Array.from({ length: 42 }, (_, i) => ({ x: 85 + i * 4.8, y: 365 + i * 3.5 }));
  await stroke(points, true);
  const builtCount = await evaluate('Domino.app.path.bones.length'); assert(builtCount >= 12);
  assert.equal(await evaluate('window.dragHintFlashes'), 0);
  assert.deepEqual(await evaluate('window.dragHintUpdates'), ['沿着彩虹继续画']);
  assert.equal(await evaluate('document.getElementById("hint").textContent'), '滑动摆放 · 松手后可从尾点续画');
  await evaluate('window.dragHintObserver.disconnect()'); passed('drag hint remains stable until the whole stroke completes');
  await snapshot('mobile-built'); passed('touch construction, follow camera, stationary finger', { count: builtCount });
  await click('sound'); assert.equal(await evaluate('Domino.app.audio.muted'), true);
  await click('sound'); assert.equal(await evaluate('Domino.app.audio.muted'), false); passed('sound toggle');
  const tail = await evaluate('(function(){var a=Domino.app,b=a.path.bones[a.path.bones.length-1];return a.camera.project(b.x,0,b.z);}())');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tail.x, y: tail.y, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tail.x + 35, y: tail.y + 25, id: 1 }] }); await sleep(100);
  await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await sleep(60); assert.equal(await evaluate('Domino.app.path.bones.length'), builtCount); passed('cancelled touch rolls back the uncommitted stroke');
  await stroke(Array.from({ length: 14 }, (_, i) => ({ x: tail.x + i * 2.7, y: tail.y + i * 1.97 })));
  assert(await evaluate('Domino.app.path.bones.length') > builtCount);
  await click('undo'); assert.equal(await evaluate('Domino.app.path.bones.length'), builtCount); passed('tail continuation and stroke undo');
  await click('play');
  await waitFor(() => evaluate('Domino.app.state === "FINISHED"'), 'animated chain completion');
  assert.equal(await evaluate('Domino.app.simulation.note'), builtCount - 1);
  await snapshot('mobile-finished'); passed('contact-driven animation and audio engine', await evaluate('Domino.app.diagnostics()'));
  await click('play'); await waitFor(() => evaluate('Domino.app.state === "FINISHED"'), 'replay');
  assert.equal(await evaluate('Domino.app.simulation.note'), builtCount - 1); passed('replay resets contacts');
  await click('clear'); assert.equal(await evaluate('Domino.app.state'), 'PAUSED');
  await click('cancel-clear'); assert.equal(await evaluate('Domino.app.state'), 'FINISHED');
  await click('clear'); await click('confirm-clear'); assert.equal(await evaluate('Domino.app.path.bones.length'), 0); passed('clear confirmation and cancellation');
  await stroke(points);
  await click('play'); await sleep(1200);
  await evaluate('window.dispatchEvent(new Event("pagehide"))');
  const pausedAt = await evaluate('Domino.app.simulation.time'); await sleep(250);
  assert.equal(await evaluate('Domino.app.simulation.time'), pausedAt);
  assert.equal(await evaluate('Domino.app.audio.voices.length'), 0);
  await click('resume'); await waitFor(() => evaluate('Domino.app.state === "FINISHED"'), 'resume'); passed('page pause freezes simulation and clears audio');
  await evaluate('Domino.app.renderer.gl.getExtension("WEBGL_lose_context").loseContext()');
  await waitFor(() => evaluate('Domino.app.renderer.mode === "canvas"'), 'WebGL context fallback');
  await snapshot('mobile-fallback'); passed('context loss switches to projected Canvas renderer');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(); await snapshot('desktop-empty'); passed('desktop responsive layout');
  // Force runtime capability failures before scripts run; the same game remains playable.
  const injected = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'var originalContext=HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext=function(kind){if(kind==="webgl")return null;return originalContext.apply(this,arguments);}; window.AudioContext=undefined; window.webkitAudioContext=undefined;' });
  await navigate(); assert.equal(await evaluate('Domino.app.renderer.mode'), 'canvas');
  await stroke(Array.from({ length: 30 }, (_, i) => ({ x: 430 + i * 5, y: 420 + i * 3 })));
  await click('play'); await waitFor(() => evaluate('Domino.app.state === "FINISHED"'), 'silent fallback completion');
  assert.equal(await evaluate('Domino.app.audio.status'), 'unavailable'); passed('missing WebGL and audio keep the game operable');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier });
  const legacy = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.PointerEvent=undefined;' });
  await navigate();
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 430, y: 420, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 20; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 430 + i * 6, y: 420 + i * 4, button: 'left', buttons: 1 }); await sleep(12); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 550, y: 500, button: 'left', clickCount: 1 });
  await waitFor(() => evaluate('!Domino.app.path.active'), 'legacy mouse stroke');
  assert(await evaluate('Domino.app.path.bones.length') >= 4);
  const oldCount = await evaluate('Domino.app.path.bones.length');
  const legacyTail = await evaluate('(function(){var a=Domino.app,b=a.path.bones[a.path.bones.length-1];return a.camera.project(b.x,0,b.z);}())');
  await stroke(Array.from({ length: 14 }, (_, i) => ({ x: legacyTail.x + i * 4, y: legacyTail.y + i * 2.667 })));
  assert(await evaluate('Domino.app.path.bones.length') > oldCount); passed('mouse and touch fallback without Pointer Events');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: legacy.identifier });
  await navigate();
  const perf = await evaluate('(async function(){var a=Domino.app,p=a.path;p.begin({x:0,z:0});p.enqueue({x:0,z:500});p.end();while(p.active)p.process(12);a.state="EDITING";a.camera.fit(p.bones);a.camera.x=a.camera.tx;a.camera.z=a.camera.tz;a.camera.scale=a.camera.targetScale;a.redraw();await new Promise(function(r){requestAnimationFrame(r);}); var start=performance.now(); for(var i=0;i<60;i++)a.renderer.draw(p,a.camera,true);return {count:p.bones.length,averageDrawMs:(performance.now()-start)/60,diagnostics:a.diagnostics()};}())');
  assert.equal(perf.count, 400); assert.equal(perf.diagnostics.triangles, 14400); passed('400 visible tiles and geometry budget (software browser only)', perf);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const platform = await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.windowInfoCalls=0;window.xhs={launchOptions:{miniToolEnv:{buildVersion:9490000}},miniTool:{getWindowInfo:function(){window.windowInfoCalls++;return Promise.resolve({windowWidth:390,windowHeight:844,safeArea:{top:44,left:0,right:390,bottom:810},menuButtons:{back:{bottom:72},me:null,share:{bottom:72}}});}}};' });
  await navigate();
  assert(await evaluate('window.windowInfoCalls') > 0);
  assert(await evaluate('document.getElementById("sound").getBoundingClientRect().top') >= 72);
  assert.equal(await evaluate('parseFloat(document.documentElement.style.getPropertyValue("--safe-area-inset-bottom"))'), 34);
  await snapshot('mobile-safe-area'); passed('platform window API and native button avoidance');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: platform.identifier });
  assert.deepEqual(errors, []);
  const version = await send('Browser.getVersion');
  await fs.writeFile(path.join(artifacts, 'browser-results.json'), JSON.stringify({ browser: version.product, scope: 'Local headless software rendering; not minitool or real-device acceptance.', results, errors }, null, 2));
  console.log('\n' + results.length + ' browser checks passed. Screenshots: .preview/');
} finally {
  if (ws && ws.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} ws.close(); }
  browser.kill(); server.kill();
  for (const item of pending.values()) { clearTimeout(item.timeout); item.reject(new Error('Browser closed')); }
}
