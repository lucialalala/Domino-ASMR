(function (D) {
  'use strict';
  var C = D.config, M = D.math;
  var faces = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];
  var normalAxis = [0, 0, 1, 1, 2, 2], normalSign = [-1, 1, -1, 1, -1, 1];
  var triangles = [0, 1, 2, 0, 2, 3];
  function Renderer(onNotice) {
    this.canvas = document.getElementById('scene'); this.fallback = document.getElementById('fallback');
    this.ground = document.getElementById('ground'); this.overlay = document.getElementById('overlay');
    this.groundContext = this.ground.getContext('2d'); this.overlayContext = this.overlay.getContext('2d');
    this.onNotice = onNotice; this.low = false; this.mode = 'webgl'; this.restoreAttempts = 0;
    this.vertices = new Float32Array((C.maxCount + 32) * 120 * 6); this.used = 0;
    this.xyz = new Float32Array(24); this.axes = new Float32Array(9); this.painter = []; this.visible = [];
    this.ghost = [];
    for (var i = 0; i < 24; i++) {
      var t = i * .17 - 1.4;
      this.ghost.push(M.bone(3.15 * Math.sin(t), .6 + 2.5 * Math.cos(t), Math.atan2(3.15 * Math.cos(t), -2.5 * Math.sin(t)), i * 2, -1));
    }
    try { this.initGL(); } catch (error) { this.useFallback('已切换到轻量画面'); }
    var self = this;
    this.canvas.addEventListener('webglcontextlost', function (event) {
      event.preventDefault(); self.useFallback('画面已恢复为轻量模式');
    });
    this.canvas.addEventListener('webglcontextrestored', function () {
      if (self.restoreAttempts++ >= 1 || self.low) return;
      try { self.initGL(); self.mode = 'webgl'; self.canvas.hidden = false; self.fallback.hidden = true; if (self.onNotice) self.onNotice('已恢复三维画面'); }
      catch (error) { self.useFallback('继续使用轻量画面'); }
    });
  }
  Renderer.prototype.initGL = function () {
    var gl = this.canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL unavailable');
    var vertex = 'attribute vec3 aPosition; attribute vec3 aColor; varying vec3 vColor; uniform vec2 uCenter; uniform vec2 uSize; uniform vec2 uOrigin; uniform float uScale; uniform vec4 uView; void main(){ vec2 p=aPosition.xz-uCenter; float sx=dot(p,uView.xy)*uScale+uOrigin.x; float sy=(dot(p,uView.zw)*0.76604444-aPosition.y*0.64278761)*uScale+uOrigin.y; float depth=dot(p,uView.zw)*0.64278761+aPosition.y*0.76604444; gl_Position=vec4(2.0*sx/uSize.x-1.0,1.0-2.0*sy/uSize.y,-depth/1000.0,1.0); vColor=aColor; }';
    var fragment = 'precision mediump float; varying vec3 vColor; void main(){ gl_FragColor=vec4(vColor,1.0); }';
    function shader(type, source) {
      var s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); throw new Error('Shader compilation failed'); }
      return s;
    }
    var vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment);
    var program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); throw new Error('Shader link failed'); }
    gl.useProgram(program);
    this.gl = gl; this.program = program; this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);
    var position = gl.getAttribLocation(program, 'aPosition'), color = gl.getAttribLocation(program, 'aColor');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(color); gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 24, 12);
    this.uniforms = {};
    var names = ['uCenter', 'uSize', 'uOrigin', 'uScale', 'uView'];
    for (var i = 0; i < names.length; i++) this.uniforms[names[i]] = gl.getUniformLocation(program, names[i]);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clearColor(0, 0, 0, 0);
  };
  Renderer.prototype.useFallback = function (message) {
    this.mode = 'canvas'; this.canvas.hidden = true; this.fallback.hidden = false;
    this.fallbackContext = this.fallback.getContext('2d');
    if (this.onNotice) this.onNotice(message);
  };
  Renderer.prototype.resize = function (w, h) {
    this.width = w; this.height = h;
    var cap = this.low ? 1000000 : 2000000;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.low ? 1 : 1.5, Math.sqrt(cap / (w * h)));
    var all = [this.canvas, this.fallback, this.ground, this.overlay];
    for (var i = 0; i < all.length; i++) { all[i].width = Math.max(1, Math.floor(w * this.dpr)); all[i].height = Math.max(1, Math.floor(h * this.dpr)); }
    this.groundKey = '';
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };
  Renderer.prototype.fillCorners = function (b) {
    var sh = Math.sin(b.heading), ch = Math.cos(b.heading), sa = Math.sin(b.angle), ca = Math.cos(b.angle);
    var axes = this.axes;
    axes[0] = ch; axes[1] = 0; axes[2] = -sh;
    axes[3] = sh * sa; axes[4] = ca; axes[5] = ch * sa;
    axes[6] = sh * ca; axes[7] = -sa; axes[8] = ch * ca;
    var forward = C.thickness / 2 - C.thickness / 2 * ca + C.height / 2 * sa;
    var cx = b.x + sh * forward, cy = C.thickness / 2 * sa + C.height / 2 * ca, cz = b.z + ch * forward;
    for (var k = 0; k < 8; k++) {
      var side = (k & 1 ? 1 : -1) * C.width / 2, up = (k & 2 ? 1 : -1) * C.height / 2, thickness = (k & 4 ? 1 : -1) * C.thickness / 2;
      this.xyz[k * 3] = cx + axes[0] * side + axes[3] * up + axes[6] * thickness;
      this.xyz[k * 3 + 1] = cy + axes[1] * side + axes[4] * up + axes[7] * thickness;
      this.xyz[k * 3 + 2] = cz + axes[2] * side + axes[5] * up + axes[8] * thickness;
    }
  };
  Renderer.prototype.vertex = function (x, y, z, r, g, b) {
    var n = this.used, out = this.vertices;
    out[n] = x; out[n + 1] = y; out[n + 2] = z; out[n + 3] = r; out[n + 4] = g; out[n + 5] = b; this.used += 6;
  };
  Renderer.prototype.shade = function (face) {
    var axis = normalAxis[face] * 3, sign = normalSign[face];
    return .80 + .23 * Math.max(0, (this.axes[axis] * -.45 + this.axes[axis + 1] * .83 + this.axes[axis + 2] * .33) * sign);
  };
  Renderer.prototype.drawGL = function (bones, camera, ghost) {
    var gl = this.gl; this.used = 0;
    var i, k, layer, color;
    if (!this.low) for (i = 0; i < bones.length; i++) {
      var bone = bones[i], sh = Math.sin(bone.heading), ch = Math.cos(bone.heading);
      var length = .23 + .55 * Math.sin(bone.angle);
      var cx = bone.x + sh * length * .65 + .09, cz = bone.z + ch * length * .65 + .07;
      for (layer = 0; layer < 2; layer++) {
        var spread = layer === 0 ? 1.4 : 1, dim = ghost ? .012 : layer === 0 ? .022 : .045;
        for (k = 0; k < 12; k++) {
          var a = k * Math.PI / 6, a2 = (k + 1) * Math.PI / 6;
          var xx = Math.cos(a) * .37 * spread, zz = Math.sin(a) * length * spread;
          var xx2 = Math.cos(a2) * .37 * spread, zz2 = Math.sin(a2) * length * spread;
          color = C.paper;
          this.vertex(cx, .002 + layer * .001, cz, color[0] - dim, color[1] - dim, color[2] - dim);
          this.vertex(cx + ch * xx + sh * zz, .002 + layer * .001, cz - sh * xx + ch * zz, color[0] - dim, color[1] - dim, color[2] - dim);
          this.vertex(cx + ch * xx2 + sh * zz2, .002 + layer * .001, cz - sh * xx2 + ch * zz2, color[0] - dim, color[1] - dim, color[2] - dim);
        }
      }
    }
    for (i = 0; i < bones.length; i++) {
      this.fillCorners(bones[i]); color = bones[i].color;
      for (var f = 0; f < 6; f++) {
        var shade = this.shade(f), fade = ghost ? .64 : 0;
        var r = color[0] * shade * (1 - fade) + C.paper[0] * fade;
        var g = color[1] * shade * (1 - fade) + C.paper[1] * fade;
        var b = color[2] * shade * (1 - fade) + C.paper[2] * fade;
        for (k = 0; k < 6; k++) {
          var v = faces[f][triangles[k]] * 3;
          this.vertex(this.xyz[v], this.xyz[v + 1], this.xyz[v + 2], r, g, b);
        }
      }
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.uCenter, camera.x, camera.z); gl.uniform2f(this.uniforms.uSize, camera.width, camera.height);
    gl.uniform2f(this.uniforms.uOrigin, camera.ox, camera.oy); gl.uniform1f(this.uniforms.uScale, camera.scale);
    gl.uniform4f(this.uniforms.uView, camera.rx, camera.rz, camera.hx, camera.hz);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, this.used));
    gl.drawArrays(gl.TRIANGLES, 0, this.used / 6);
  };
  Renderer.prototype.drawCanvas = function (bones, camera, ghost) {
    var ctx = this.fallbackContext; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    var used = 0;
    for (var i = 0; i < bones.length; i++) {
      this.fillCorners(bones[i]);
      var center = camera.project(bones[i].x, 0, bones[i].z);
      if (!this.low) { ctx.fillStyle = ghost ? 'rgba(80,85,66,.015)' : 'rgba(80,85,66,.045)'; ctx.beginPath(); ctx.ellipse(center.x + 4, center.y + 3, camera.scale * .4, camera.scale * .17, 0, 0, Math.PI * 2); ctx.fill(); }
      for (var f = 0; f < 6; f++) {
        var item = this.painter[used];
        if (!item) { item = { points: new Float32Array(8), depth: 0, color: '' }; this.painter[used] = item; }
        item.depth = 0;
        for (var k = 0; k < 4; k++) {
          var v = faces[f][k] * 3, p = camera.project(this.xyz[v], this.xyz[v + 1], this.xyz[v + 2]);
          item.points[k * 2] = p.x; item.points[k * 2 + 1] = p.y; item.depth += p.depth;
        }
        var shade = this.shade(f), color = bones[i].color, fade = ghost ? .64 : 0;
        item.color = 'rgb(' + Math.round((color[0] * shade * (1 - fade) + C.paper[0] * fade) * 255) + ',' + Math.round((color[1] * shade * (1 - fade) + C.paper[1] * fade) * 255) + ',' + Math.round((color[2] * shade * (1 - fade) + C.paper[2] * fade) * 255) + ')';
        used++;
      }
    }
    this.painter.length = used;
    this.painter.sort(function (a, b) { return a.depth - b.depth; });
    for (var j = 0; j < used; j++) {
      var face = this.painter[j], points = face.points;
      ctx.beginPath(); ctx.moveTo(points[0], points[1]);
      for (var n = 1; n < 4; n++) ctx.lineTo(points[n * 2], points[n * 2 + 1]);
      ctx.closePath(); ctx.fillStyle = face.color; ctx.fill();
      ctx.strokeStyle = face.color; ctx.lineWidth = .4; ctx.stroke();
    }
  };
  Renderer.prototype.drawGround = function (camera) {
    var key = camera.x.toFixed(3) + ',' + camera.z.toFixed(3) + ',' + camera.scale.toFixed(2);
    if (key === this.groundKey) return;
    this.groundKey = key;
    var ctx = this.groundContext; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    var gradient = ctx.createRadialGradient(this.width * .55, this.height * .52, 0, this.width * .55, this.height * .52, this.height * .6);
    gradient.addColorStop(0, 'rgba(255,255,250,.55)'); gradient.addColorStop(1, 'rgba(255,255,250,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.width, this.height);
    var step = camera.scale < 16 ? 6 : 1.5;
    var radius = Math.min(45, Math.max(this.width, this.height) / camera.scale * 1.2);
    var startX = Math.floor((camera.x - radius) / step) * step, startZ = Math.floor((camera.z - radius) / step) * step;
    ctx.fillStyle = 'rgba(148,153,129,.18)'; ctx.beginPath();
    for (var x = startX; x < camera.x + radius; x += step) for (var z = startZ; z < camera.z + radius; z += step) {
      var p = camera.project(x, 0, z);
      if (p.x < 0 || p.x > this.width || p.y < 110 || p.y > this.height - 140) continue;
      ctx.moveTo(p.x + .8, p.y); ctx.arc(p.x, p.y, .8, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  Renderer.prototype.drawOverlay = function (path, camera, editing, ghost) {
    var ctx = this.overlayContext; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    if (ghost && !path.active) {
      var start = camera.project(this.ghost[0].x, 0, this.ghost[0].z);
      ctx.fillStyle = '#a6ac9c'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('在空白处，画出你的路线', this.width / 2, Math.min(this.height - 230, this.height * .70) + 12);
      ctx.strokeStyle = '#bdc9b5'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(start.x, start.y + 10, 5, 0, Math.PI * 2); ctx.stroke();
      return;
    }
    if (!editing) return;
    var bones = path.bones, tail = bones[bones.length - 1];
    if (tail) {
      var p = camera.project(tail.x, 0, tail.z);
      ctx.strokeStyle = '#819b7a'; ctx.fillStyle = '#f8f8ef'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, 9, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#83957e'; ctx.beginPath(); ctx.arc(p.x, p.y + 3, 2.1, 0, Math.PI * 2); ctx.fill();
      if (!path.active) { ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#8f9b88'; ctx.fillText('从这里继续', p.x, p.y + 27); }
    }
    if (path.preview) {
      var preview = path.preview, base = tail || path.anchor;
      var a = camera.project(base.x, 0, base.z), b = camera.project(preview.x, 0, preview.z);
      ctx.strokeStyle = preview.valid ? '#9cac91' : '#c9958b'; ctx.setLineDash([3, 5]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 7, 4, 0, 0, Math.PI * 2); ctx.stroke();
    }
  };
  Renderer.prototype.draw = function (path, camera, editing) {
    var ghost = !path.bones.length && !path.active, bones = ghost ? this.ghost : path.bones;
    this.visible.length = 0;
    var margin = (C.height + C.width) * camera.scale;
    for (var i = 0; i < bones.length; i++) {
      var p = camera.project(bones[i].x, 0, bones[i].z);
      if (p.x >= -margin && p.x <= camera.width + margin && p.y >= -margin && p.y <= camera.height + margin) this.visible.push(bones[i]);
    }
    this.drawGround(camera);
    if (this.mode === 'webgl') this.drawGL(this.visible, camera, ghost); else this.drawCanvas(this.visible, camera, ghost);
    this.drawOverlay(path, camera, editing, ghost);
  };
  D.Renderer = Renderer;
}(window.Domino));
