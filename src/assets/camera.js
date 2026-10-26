(function (D) {
  'use strict';
  var M = D.math;
  function Camera() {
    this.x = 0; this.z = 0; this.tx = 0; this.tz = 0;
    this.rx = Math.cos(Math.PI / 6); this.rz = -Math.sin(Math.PI / 6);
    this.hx = -this.rz; this.hz = this.rx;
    this.se = Math.sin(50 * Math.PI / 180); this.ce = Math.cos(50 * Math.PI / 180);
    this.width = 1; this.height = 1; this.scale = 40; this.targetScale = 40; this.baseScale = 40;
    this.editing = false;
  }
  Camera.prototype.resize = function (w, h) {
    this.width = w; this.height = h; this.ox = w / 2; this.oy = h * .52;
    this.baseScale = M.clamp(Math.min(w / 11.5, h / 14), 26, 64);
    this.scale = this.baseScale; this.targetScale = this.baseScale;
  };
  Camera.prototype.project = function (x, y, z) {
    var dx = x - this.x, dz = z - this.z;
    return { x: this.ox + (this.rx * dx + this.rz * dz) * this.scale,
      y: this.oy + ((this.hx * dx + this.hz * dz) * this.se - y * this.ce) * this.scale,
      depth: (this.hx * dx + this.hz * dz) * this.ce + y * this.se };
  };
  Camera.prototype.delta = function (dx, dy) {
    var a = dx / this.scale, b = dy / (this.scale * this.se);
    return { x: this.rx * a + this.hx * b, z: this.rz * a + this.hz * b };
  };
  Camera.prototype.unproject = function (x, y) {
    var delta = this.delta(x - this.ox, y - this.oy);
    return { x: this.x + delta.x, z: this.z + delta.z };
  };
  Camera.prototype.focus = function (b, ahead) {
    this.tx = b.x + Math.sin(b.heading) * (ahead || 0);
    this.tz = b.z + Math.cos(b.heading) * (ahead || 0);
    this.targetScale = this.baseScale;
  };
  Camera.prototype.edge = function (b) {
    var p = this.project(b.x, 0, b.z);
    var top = Math.min(180, this.height * .27), bottom = Math.max(top + 45, this.height - 210);
    var dx = p.x - M.clamp(p.x, this.width * .22, this.width * .78);
    var dy = p.y - M.clamp(p.y, top, bottom);
    if (Math.abs(dx) + Math.abs(dy) > 1) {
      var shift = this.delta(dx, dy); this.tx = this.x + shift.x; this.tz = this.z + shift.z;
    }
  };
  Camera.prototype.fit = function (bones) {
    if (!bones.length) { this.tx = 0; this.tz = 0; this.targetScale = this.baseScale; return; }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < bones.length; i++) {
      var corners = M.corners(M.box(bones[i]));
      for (var j = 0; j < corners.length; j++) {
        var v = corners[j], p = this.project(v[0], v[1], v[2]);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    }
    var availableH = Math.max(80, this.height - (this.height < 540 ? 190 : 360));
    var shift = this.delta((minX + maxX) / 2 - this.ox, (minY + maxY) / 2 - this.oy);
    this.tx = this.x + shift.x; this.tz = this.z + shift.z;
    this.targetScale = Math.min(this.baseScale, (this.width - 75) * this.scale / (maxX - minX + 1), availableH * this.scale / (maxY - minY + 1));
    this.targetScale = Math.max(.5, this.targetScale);
  };
  Camera.prototype.update = function (dt) {
    var alpha = 1 - Math.exp(-dt / .25), dx = (this.tx - this.x) * alpha, dz = (this.tz - this.z) * alpha;
    var distance = Math.hypot(dx, dz), limit = this.editing ? 4 * dt : Infinity;
    if (distance > limit) { dx *= limit / distance; dz *= limit / distance; }
    this.x += dx; this.z += dz; this.scale += (this.targetScale - this.scale) * alpha;
  };
  D.Camera = Camera;
}(window.Domino));
