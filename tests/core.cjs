'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sandbox = { window: {}, console, Float32Array, Math, Promise };
vm.createContext(sandbox);
for (const file of ['config', 'math', 'path', 'simulation', 'camera', 'audio']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src/assets', file + '.js'), 'utf8'), sandbox, { filename: file + '.js' });
}
const D = sandbox.window.Domino, M = D.math, C = D.config;
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function makePath(points) {
  const p = new D.Path(); p.begin(points[0]);
  for (const point of points.slice(1)) { p.enqueue(point); p.process(12); }
  p.end(); let guard = 0;
  while (p.active && guard++ < 1000) p.process(12);
  assert(!p.active, 'input queue drained'); return p;
}
function play(bones) {
  const events = [], sim = new D.Simulation(bones, event => events.push(event));
  assert(sim.start()); let frames = 0;
  while (sim.running && frames++ < bones.length * 120 + 1000) sim.advance(1 / 60);
  assert(!sim.running, 'chain completes');
  assert.equal(events.filter(e => e.type === 'dominoContact').length, bones.length - 1);
  assert.equal(events.filter(e => e.type === 'groundContact').length, 1);
  assert.equal(new Set(events.filter(e => e.type === 'dominoContact').map(e => e.index)).size, bones.length - 1);
  assert(bones.every(b => b.status === 'settled'));
  for (let i = 0; i < bones.length - 1; i++) assert(!M.intersects(M.box(bones[i]), M.box(bones[i + 1])), 'final neighbouring boxes stay separate at ' + i);
  for (let i = 0; i < events.length - 1; i++) assert(events[i].time <= events[i + 1].time + C.step, 'contact times ordered');
  return { sim, events };
}
check('all source scripts parse and remain offline classic scripts', () => {
  const assets = path.join(root, 'src/assets');
  const banned = /\bfetch\s*\(|XMLHttpRequest|new\s+(?:Worker|SharedWorker|WebSocket|Function)\s*\(|\beval\s*\(|WebAssembly|\bimport\s|\bexport\s|\?\.|\?\?/;
  for (const file of fs.readdirSync(assets).filter(f => f.endsWith('.js'))) {
    const full = path.join(assets, file), source = fs.readFileSync(full, 'utf8');
    const result = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert(!banned.test(source), file);
  }
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  assert(!/<script(?![^>]*\bsrc=)|\bon\w+=|type=["']module|https?:\/\//i.test(html));
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) assert(fs.existsSync(path.resolve(root, 'src', match[1])), match[1]);
});
check('transformed boxes stay above the ground through their whole fall', () => {
  const b = M.bone(0, 0, .72, 0, 1);
  for (let a = 0; a <= Math.PI / 2; a += .025) {
    const corners = M.corners(M.box(b, a));
    assert(corners.every(p => p[1] >= -1e-8));
  }
});
check('first contact agrees with straight-chain geometry', () => {
  const a = M.bone(0, 0, 0, 0, 1), b = M.bone(0, C.spacing, 0, 1, 1);
  assert(!M.intersects(M.box(a), M.box(b)));
  const contact = M.contactAngle(a, b, .4);
  assert(Math.abs(contact - Math.asin((C.spacing - C.thickness) / C.height)) < .012);
  assert(M.intersects(M.box(a, contact + .003), M.box(b)));
});
const straight = makePath([{ x: 0, z: 0 }, { x: 0, z: 20 }]);
check('fast drag produces exactly spaced tiles, not skipped positions', () => {
  assert(straight.bones.length > 40);
  for (let i = 1; i < straight.bones.length; i++) assert(Math.abs(M.distance(straight.bones[i], straight.bones[i - 1]) - C.spacing) < 1e-8);
});
check('straight chain settles by contact with each neighbour', () => {
  play(straight.bones);
  for (let i = 0; i < straight.bones.length - 1; i++) {
    assert(straight.bones[i].angle < Math.PI / 2 - .05, 'supported tiles do not lie through each other');
    assert(!M.intersects(M.box(straight.bones[i]), M.box(straight.bones[i + 1])), 'no adjacent penetration at ' + i + ': ' + straight.bones[i].angle + ', ' + straight.bones[i + 1].angle);
  }
});
const arcPoints = Array.from({ length: 220 }, (_, i) => { const t = i / 219 * 2.4; return { x: 4 * Math.sin(t), z: 4 * (1 - Math.cos(t)) }; });
const arc = makePath(arcPoints);
check('wide circular arc remains buildable and topples to completion', () => { assert(arc.bones.length >= 18); play(arc.bones); });
const sPoints = Array.from({ length: 300 }, (_, i) => { const t = i / 299 * 17; return { x: 1.8 * Math.sin(t * .38), z: t }; });
const sCurve = makePath(sPoints);
check('S curve propagates and emits each sound event exactly once', () => { assert(sCurve.bones.length > 30); play(sCurve.bones); });
check('replay resets every contact flag and does not duplicate loops', () => {
  for (let replay = 0; replay < 10; replay++) { const result = play(arc.bones); assert.equal(result.sim.note, arc.bones.length - 1); }
});
check('tap, cancellation, stroke undo and tail heading restoration', () => {
  const p = new D.Path(); p.begin({ x: 0, z: 0 }); p.end(); p.process(12); assert.equal(p.bones.length, 0);
  p.begin({ x: 0, z: 0 }); p.enqueue({ x: 0, z: 2 }); p.end(); p.process(12);
  const n = p.bones.length, tail = p.bones[n - 1], heading = tail.heading;
  p.begin(tail); p.enqueue({ x: .2, z: tail.z + 2 }); p.process(12); p.cancel(); assert.equal(p.bones.length, n); assert.equal(tail.heading, heading);
  p.begin(tail); p.enqueue({ x: .2, z: tail.z + 2 }); p.end(); p.process(12); assert(p.bones.length > n);
  p.undo(); assert.equal(p.bones.length, n); assert.equal(tail.heading, heading); p.undo(); assert.equal(p.bones.length, 0);
});
check('reverse strokes are rejected and construction caps at 400 tiles', () => {
  const p = makePath([{ x: 0, z: 0 }, { x: 0, z: 500 }]); assert.equal(p.bones.length, 400);
  assert.equal(p.begin(p.bones[399]), false);
  const q = makePath([{ x: 0, z: 0 }, { x: 0, z: 3 }, { x: 0, z: -3 }]);
  assert(q.bones.every(b => b.z >= 0)); assert(q.bones.length < 10);
});
check('crossing the earlier fall envelope is rejected', () => {
  const loop = Array.from({ length: 700 }, (_, i) => { const t = i / 699 * Math.PI * 2.5; return { x: 4 * Math.sin(t), z: 4 * (1 - Math.cos(t)) }; });
  const p = makePath(loop); assert(p.bones.length > 35); assert(p.bones.length < 54, 'loop cannot cross the original chain');
});
check('400 tiles complete with capped catch-up after a long frame', () => {
  const p = makePath([{ x: 0, z: 0 }, { x: 0, z: 500 }]);
  const sim = new D.Simulation(p.bones); sim.start(); sim.advance(30); assert(sim.time <= C.step * C.maxSubsteps + 1e-8);
  play(p.bones);
});
check('screen inversion and stationary-pointer world deltas are camera-independent', () => {
  const camera = new D.Camera(); camera.resize(390, 844); camera.x = 3.5; camera.z = -2;
  const p = camera.project(8, 0, 4), w = camera.unproject(p.x, p.y);
  assert(Math.abs(w.x - 8) < 1e-8 && Math.abs(w.z - 4) < 1e-8);
  camera.x += 10; camera.z += 10;
  const zero = camera.delta(0, 0); assert.equal(zero.x, 0); assert.equal(zero.z, 0);
});
check('overview fits a 400-tile diagonal into the viewport', () => {
  const camera = new D.Camera(); camera.resize(320, 700);
  const bones = Array.from({ length: 400 }, (_, i) => M.bone(i * C.spacing / Math.sqrt(2), i * C.spacing / Math.sqrt(2), Math.PI / 4, i, 1));
  camera.fit(bones); camera.x = camera.tx; camera.z = camera.tz; camera.scale = camera.targetScale;
  const points = bones.flatMap(b => M.corners(M.box(b)).map(p => camera.project(...p)));
  assert(points.every(p => p.x >= 20 && p.x <= 300 && p.y >= 120 && p.y <= 550));
});
check('rainbow is deterministic, low-saturation and cyclic', () => {
  for (let i = 0; i < 72; i++) {
    const color = M.color(i), repeated = M.color(i + 72);
    assert.deepEqual(color, repeated); assert(color.every(c => c >= 0 && c <= 1));
    assert(Math.max(...color) - Math.min(...color) < .25);
  }
});
async function checkAudio() {
  let constructed = 0;
  const oscillatorFrequencies = [];
  const parameter = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  function node() { return { connect() {}, disconnect() {}, start() {}, stop() {}, gain: parameter(), frequency: parameter(), Q: parameter(), threshold: parameter(), knee: parameter(), ratio: parameter() }; }
  class AudioContext {
    constructor() { constructed++; this.state = 'running'; this.sampleRate = 8000; this.currentTime = 0; this.destination = {}; }
    createGain() { return node(); } createDynamicsCompressor() { return node(); }
    createBuffer(c, length) { return { getChannelData() { return new Float32Array(length); } }; }
    createOscillator() { const oscillator = node(); oscillator.frequency.setValueAtTime = value => oscillatorFrequencies.push(value); return oscillator; } createBufferSource() { return node(); } createBiquadFilter() { return node(); }
    resume() { this.state = 'running'; return Promise.resolve(); } suspend() { this.state = 'suspended'; return Promise.resolve(); }
  }
  sandbox.window.AudioContext = AudioContext;
  const audio = new D.Audio(); assert(await audio.unlock()); audio.beginFrame(0, .016);
  for (let i = 0; i < 20; i++) audio.play({ type: 'dominoContact', note: i, time: .01 }, 0);
  assert.deepEqual(oscillatorFrequencies.filter((value, index) => index % 2 === 0), [261.63, 293.66, 329.63, 349.23, 392, 440, 493.88, 523.25, 493.88, 440, 392, 349.23, 329.63, 293.66, 261.63, 293.66, 329.63, 349.23, 392, 440]);
  assert.equal(audio.voices.length, 8);
  audio.setMuted(true); assert.equal(audio.voices.length, 0); assert.equal(audio.master.gain.value, 0);
  audio.play({ note: 0, time: 0 }, 0); assert.equal(audio.voices.length, 0);
  audio.setMuted(false); audio.beginFrame(0, .2); audio.play({ note: 0, time: 0 }, 0); assert.equal(audio.voices.length, 0);
  audio.beginFrame(0, .016); audio.play({ note: 0, time: .01 }, 0); assert.equal(audio.voices.length, 1);
  audio.suspend(); assert.equal(audio.voices.length, 0); assert(await audio.unlock()); assert.equal(constructed, 1);
  sandbox.window.AudioContext = undefined;
  const absent = new D.Audio(); assert.equal(await absent.unlock(), false); assert.equal(absent.status, 'unavailable');
  checks++; console.log('PASS ascending/descending audio cycle, voice cap, mute, stale-frame suppression, cleanup and capability failure');
  console.log('\n' + checks + ' checks passed. Container/audio/device verification is separate.');
}
checkAudio().catch(error => { console.error(error); process.exitCode = 1; });
