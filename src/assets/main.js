(function (D) {
  'use strict';
  var C = D.config, M = D.math;
  function element(id) { return document.getElementById(id); }
  var stage = element('stage'), intro = element('intro'), play = element('play'), undo = element('undo'), clear = element('clear');
  var sound = element('sound'), pausePanel = element('pause-panel'), clearPanel = element('clear-panel');
  var count = element('count'), hint = element('hint'), phase = element('phase'), toastTimer = 0;
  var raf = 0, lastTime = 0, dirty = true, pointer = null, prepTime = 0, resumeState = 'EMPTY', dialogState = null;
  var slowTime = 0, lastCount = -1, lastUIState = '', audioWarned = false;
  function toast(message) {
    element('toast').textContent = message; element('toast').classList.add('visible');
    window.clearTimeout(toastTimer); toastTimer = window.setTimeout(function () { element('toast').classList.remove('visible'); }, 2600);
  }
  var path = new D.Path(), camera = new D.Camera();
  var audio = new D.Audio(function (status) {
    if (status === 'unavailable' && !audioWarned) { audioWarned = true; toast('声音暂不可用，仍可继续摆放'); }
    updateSound();
  });
  var renderer = new D.Renderer(function (message) { toast(message); if (app) requestDraw(); });
  var sim = new D.Simulation(path.bones, function (event) {
    var tile = path.bones[event.index], point = camera.project(tile.x, 0, tile.z);
    audio.play(event, (point.x / camera.width - .5) * .65);
  });
  var app = D.app = { path: path, camera: camera, renderer: renderer, audio: audio, simulation: sim, state: 'EMPTY' };
  function editable() { return app.state === 'EMPTY' || app.state === 'EDITING'; }
  function updateSound() {
    sound.classList.toggle('is-muted', audio.muted || audio.status === 'unavailable');
    sound.setAttribute('aria-pressed', String(!audio.muted));
    sound.setAttribute('aria-label', audio.muted ? '开启声音' : '关闭声音');
    element('sound-label').textContent = audio.status === 'unavailable' ? '声音暂不可用' : audio.muted ? '声音已关' : '声音已开';
  }
  function syncUI(force) {
    var blocked = Boolean(path.preview && !path.preview.valid);
    var uiState = app.state + ':' + path.active + ':' + blocked;
    if (!force && lastCount === path.bones.length && lastUIState === uiState) return;
    lastCount = path.bones.length; lastUIState = uiState;
    count.textContent = String(lastCount);
    intro.classList.toggle('is-hidden', lastCount > 0 || path.active);
    play.disabled = lastCount < 2 || path.active || app.state === 'PREPARING' || app.state === 'TOPPLING' || app.state === 'PAUSED';
    undo.disabled = !path.strokes.length || path.active || !(editable() || app.state === 'FINISHED');
    clear.disabled = !lastCount;
    var label = element('play-label'), hintText;
    if (app.state === 'PREPARING') { phase.textContent = '回到起点'; hintText = '把下一刻交给重力'; label.textContent = '准备中'; }
    else if (app.state === 'TOPPLING') { phase.textContent = '正在落下'; hintText = '听，彩虹有了声音'; label.textContent = '轻轻落下中'; }
    else if (app.state === 'FINISHED') { phase.textContent = '这一刻，很好'; hintText = '可以重听，也可以重新画'; label.textContent = '再听一次'; }
    else if (app.state === 'PAUSED') { phase.textContent = '稍作停留'; hintText = '你的彩虹已暂停'; label.textContent = '已暂停'; }
    else {
      phase.textContent = '自由建造'; label.textContent = '推倒彩虹';
      if (path.active) hintText = blocked ? '转弯放缓一点，给骨牌留些空间' : '沿着彩虹继续画';
      else if (lastCount >= C.maxCount) hintText = '已放满 400 张，推倒听听吧';
      else hintText = lastCount ? '滑动摆放 · 松手后可从尾点续画' : '滑动摆放，点击推倒';
    }
    if (hint.textContent !== hintText) hint.textContent = hintText;
    stage.style.cursor = editable() ? 'crosshair' : 'default';
  }
  function requestDraw() {
    dirty = true;
    if (!raf && app.state !== 'PAUSED' && !document.hidden) { lastTime = 0; raf = window.requestAnimationFrame(frame); }
  }
  function frame(time) {
    raf = 0;
    if (app.state === 'PAUSED' || document.hidden) return;
    var elapsed = lastTime ? Math.max(0, (time - lastTime) / 1000) : 1 / 60;
    var dt = Math.min(elapsed, .20); lastTime = time;
    var working = path.active || app.state === 'TOPPLING';
    if (path.active) {
      if (path.process(C.maxPlacements)) dirty = true;
      if (!path.active) app.state = path.bones.length ? 'EDITING' : 'EMPTY';
    }
    if (app.state === 'PREPARING') {
      prepTime += dt;
      if (prepTime >= .85 && (Math.hypot(camera.tx - camera.x, camera.tz - camera.z) < .15 || prepTime > 1.8)) {
        sim.start(); app.state = 'TOPPLING';
      }
      dirty = true;
    }
    if (app.state === 'TOPPLING') {
      audio.beginFrame(sim.time, elapsed); sim.advance(dt);
      if (sim.running) camera.focus(path.bones[Math.min(path.bones.length - 1, sim.front + 2)], .5);
      else { app.state = 'FINISHED'; camera.fit(path.bones); }
      dirty = true;
    }
    camera.editing = editable();
    if (editable() && path.bones.length && path.active) camera.edge(path.bones[path.bones.length - 1]);
    var moving = Math.hypot(camera.tx - camera.x, camera.tz - camera.z) > .002 || Math.abs(camera.targetScale - camera.scale) > .002;
    if (moving) { camera.update(dt); dirty = true; }
    syncUI(false);
    if (dirty) { renderer.draw(path, camera, editable()); dirty = false; }
    if (working && elapsed > .036) slowTime += dt; else slowTime = Math.max(0, slowTime - dt * .5);
    if (slowTime > 2) {
      slowTime = 0;
      if (!renderer.low) { renderer.low = true; renderer.resize(camera.width, camera.height); toast('已减少画面细节，让彩虹更流畅'); }
      else if (renderer.mode === 'webgl' && elapsed > .05) renderer.useFallback('已切换到轻量画面');
      dirty = true;
    }
    if (!raf && (path.active || app.state === 'PREPARING' || app.state === 'TOPPLING' || moving || dirty)) raf = window.requestAnimationFrame(frame);
  }
  function localPoint(event) {
    var rect = stage.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function begin(event, id) {
    if (!editable() || pointer || path.active || !clearPanel.hidden) return;
    if (path.bones.length >= C.maxCount) { toast('已放满 400 张，推倒听听吧'); return; }
    var p = localPoint(event), tail = path.bones[path.bones.length - 1];
    if (tail) {
      var projected = camera.project(tail.x, 0, tail.z);
      if (Math.hypot(projected.x - p.x, projected.y - p.y) > 95) { toast('从彩虹尾部的绿色圆点继续'); return; }
    }
    var world = tail ? { x: tail.x, z: tail.z } : camera.unproject(p.x, p.y);
    if (!path.begin(world)) return;
    pointer = { id: id, x: p.x, y: p.y, world: world };
    app.state = 'EDITING'; audio.unlock();
    requestDraw(); syncUI(true);
  }
  function move(event, id) {
    if (!pointer || pointer.id !== id) return;
    var p = localPoint(event), delta = camera.delta(p.x - pointer.x, p.y - pointer.y);
    pointer.world.x += delta.x; pointer.world.z += delta.z;
    pointer.x = p.x; pointer.y = p.y;
    path.enqueue(pointer.world); requestDraw();
  }
  function end(event, id, cancelled) {
    if (!pointer || pointer.id !== id) return;
    if (!cancelled && event) move(event, id);
    pointer = null;
    if (cancelled) { path.cancel(); app.state = path.bones.length ? 'EDITING' : 'EMPTY'; }
    else path.end();
    requestDraw(); syncUI(true);
  }
  function cancelPointer() {
    if (pointer) end(null, pointer.id, true);
    else if (path.active) { path.cancel(); app.state = path.bones.length ? 'EDITING' : 'EMPTY'; }
  }
  if (window.PointerEvent) {
    stage.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || event.isPrimary === false) return;
      begin(event, event.pointerId);
      if (pointer && typeof stage.setPointerCapture === 'function') { try { stage.setPointerCapture(event.pointerId); } catch (error) { /* Window listeners remain active. */ } }
    });
    window.addEventListener('pointermove', function (event) { move(event, event.pointerId); });
    window.addEventListener('pointerup', function (event) { end(event, event.pointerId, false); });
    window.addEventListener('pointercancel', function (event) { end(event, event.pointerId, true); });
    stage.addEventListener('lostpointercapture', function (event) { if (pointer && pointer.id === event.pointerId) end(null, event.pointerId, true); });
  } else {
    var lastTouchTime = 0;
    stage.addEventListener('touchstart', function (event) {
      lastTouchTime = Date.now();
      if (!pointer && event.changedTouches.length) { var t = event.changedTouches[0]; begin(t, t.identifier); }
      if (pointer) event.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', function (event) {
      for (var i = 0; i < event.changedTouches.length; i++) move(event.changedTouches[i], event.changedTouches[i].identifier);
      if (pointer) event.preventDefault();
    }, { passive: false });
    function touchEnd(event) { for (var i = 0; i < event.changedTouches.length; i++) end(event.changedTouches[i], event.changedTouches[i].identifier, event.type === 'touchcancel'); }
    window.addEventListener('touchend', touchEnd); window.addEventListener('touchcancel', touchEnd);
    stage.addEventListener('mousedown', function (event) { if (event.button === 0 && Date.now() - lastTouchTime > 800) begin(event, 'mouse'); });
    window.addEventListener('mousemove', function (event) { move(event, 'mouse'); });
    window.addEventListener('mouseup', function (event) { end(event, 'mouse', false); });
  }
  window.addEventListener('blur', cancelPointer);
  play.addEventListener('click', function () {
    if (play.disabled) return;
    audio.unlock(); audio.stopAll(); sim.reset(); app.state = 'PREPARING'; prepTime = 0;
    camera.focus(path.bones[0], .7); requestDraw(); syncUI(true);
  });
  undo.addEventListener('click', function () {
    if (undo.disabled) return;
    audio.stopAll(); sim.reset(); path.undo(); app.state = path.bones.length ? 'EDITING' : 'EMPTY';
    if (path.bones.length) camera.focus(path.bones[path.bones.length - 1], 0); else camera.fit([]);
    syncUI(true); requestDraw();
  });
  sound.addEventListener('click', function () {
    audio.setMuted(!audio.muted);
    if (!audio.muted) audio.unlock();
    updateSound();
  });
  function focusButton(button) { try { button.focus({ preventScroll: true }); } catch (error) { button.focus(); } }
  clear.addEventListener('click', function () {
    if (clear.disabled) return;
    cancelPointer(); dialogState = app.state; app.state = 'PAUSED'; audio.stopAll();
    if (raf) window.cancelAnimationFrame(raf); raf = 0;
    clearPanel.hidden = false; focusButton(element('cancel-clear')); syncUI(true);
  });
  function cancelClear() {
    if (clearPanel.hidden) return;
    clearPanel.hidden = true; app.state = dialogState || 'EDITING'; dialogState = null;
    audio.unlock(); syncUI(true); requestDraw(); focusButton(clear);
  }
  element('cancel-clear').addEventListener('click', cancelClear);
  element('confirm-clear').addEventListener('click', function () {
    clearPanel.hidden = true; pausePanel.hidden = true; dialogState = null;
    audio.stopAll(); sim.reset(); path.clear(); app.state = 'EMPTY'; camera.fit([]);
    syncUI(true); requestDraw(); focusButton(sound);
  });
  function pause() {
    cancelPointer();
    if (!clearPanel.hidden) { clearPanel.hidden = true; app.state = dialogState || 'EDITING'; dialogState = null; }
    if (app.state === 'PAUSED') return;
    resumeState = app.state; app.state = 'PAUSED'; audio.suspend();
    if (raf) window.cancelAnimationFrame(raf); raf = 0;
    pausePanel.hidden = false; syncUI(true);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else if (app.state === 'PAUSED') focusButton(element('resume')); });
  window.addEventListener('pagehide', pause);
  element('resume').addEventListener('click', function () {
    audio.unlock(); app.state = resumeState; pausePanel.hidden = true; sim.accumulator = 0;
    syncUI(true); requestDraw(); focusButton(sound);
  });
  document.addEventListener('keydown', function (event) {
    var panel = !clearPanel.hidden ? clearPanel : !pausePanel.hidden ? pausePanel : null;
    if (!panel) return;
    if (event.key === 'Escape' && panel === clearPanel) { event.preventDefault(); cancelClear(); }
    if (event.key === 'Tab') {
      var buttons = panel.querySelectorAll('button'), first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); focusButton(last); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); focusButton(first); }
    }
  });
  function resize() {
    cancelPointer();
    var rect = stage.getBoundingClientRect();
    camera.resize(Math.max(1, rect.width), Math.max(1, rect.height)); renderer.resize(camera.width, camera.height);
    if (app.state === 'FINISHED') camera.fit(path.bones);
    D.platform.refresh().then(function () { requestDraw(); });
    syncUI(true); requestDraw();
  }
  window.addEventListener('resize', resize);
  app.redraw = requestDraw;
  app.diagnostics = function () {
    return { state: app.state, count: path.bones.length, renderer: renderer.mode, low: renderer.low,
      bufferPixels: renderer.canvas.width * renderer.canvas.height, triangles: renderer.used / 18,
      audio: audio.status, voices: audio.voices.length, simulationTime: sim.time, contacts: sim.note };
  };
  resize(); updateSound(); syncUI(true);
}(window.Domino));
