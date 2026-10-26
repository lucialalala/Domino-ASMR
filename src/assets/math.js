(function (D) {
  'use strict';
  var C = D.config;
  var M = D.math = {};
  M.clamp = function (x, lo, hi) { return Math.max(lo, Math.min(hi, x)); };
  M.wrap = function (a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  M.distance = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z); };
  M.color = function (i) {
    var hue = ((i * 5) % 360) / 60;
    var chroma = (1 - Math.abs(2 * .72 - 1)) * .4;
    var x = chroma * (1 - Math.abs(hue % 2 - 1));
    var rgb = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
    for (var j = 0; j < 3; j++) rgb[j] += .72 - chroma / 2;
    return rgb;
  };
  M.bone = function (x, z, heading, index, stroke) {
    return { id: index, x: x, z: z, heading: heading, colorIndex: index, color: M.color(index), strokeId: stroke,
      angle: 0, angularVelocity: 0, status: 'standing', contactEmitted: false, groundEmitted: false };
  };
  M.dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  M.cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
  // Pivot at the leading bottom edge: every transformed corner stays above y=0.
  M.box = function (b, angle) {
    var a = angle === undefined ? b.angle : angle;
    var sn = Math.sin(b.heading), cs = Math.cos(b.heading), sa = Math.sin(a), ca = Math.cos(a);
    var axes = [[cs, 0, -sn], [sn * sa, ca, cs * sa], [sn * ca, -sa, cs * ca]];
    var forward = C.thickness / 2 - C.thickness / 2 * ca + C.height / 2 * sa;
    return { center: [b.x + sn * forward, C.thickness / 2 * sa + C.height / 2 * ca, b.z + cs * forward],
      axes: axes, half: [C.width / 2, C.height / 2, C.thickness / 2] };
  };
  M.corners = function (box) {
    var out = [];
    for (var k = 0; k < 8; k++) {
      var p = box.center.slice();
      for (var a = 0; a < 3; a++) {
        var sign = (k & (1 << a)) ? 1 : -1;
        for (var n = 0; n < 3; n++) p[n] += box.axes[a][n] * box.half[a] * sign;
      }
      out.push(p);
    }
    return out;
  };
  M.intersects = function (a, b) {
    var delta = [b.center[0] - a.center[0], b.center[1] - a.center[1], b.center[2] - a.center[2]];
    function separated(axis) {
      var length2 = M.dot(axis, axis);
      if (length2 < 1e-10) return false;
      var radius = 0;
      for (var k = 0; k < 3; k++) radius += a.half[k] * Math.abs(M.dot(a.axes[k], axis)) + b.half[k] * Math.abs(M.dot(b.axes[k], axis));
      return Math.abs(M.dot(delta, axis)) > radius + 1e-7;
    }
    for (var i = 0; i < 3; i++) if (separated(a.axes[i]) || separated(b.axes[i])) return false;
    for (var j = 0; j < 3; j++) for (var n = 0; n < 3; n++) if (separated(M.cross(a.axes[j], b.axes[n]))) return false;
    return true;
  };
  M.contactAngle = function (a, b, limit) {
    var dx = b.x - a.x, dz = b.z - a.z;
    var forward = dx * Math.sin(a.heading) + dz * Math.cos(a.heading);
    var lateral = dx * Math.cos(a.heading) - dz * Math.sin(a.heading);
    if (Math.abs(M.wrap(a.heading - b.heading)) < .000001 && Math.abs(lateral) < .000001) {
      var tipContact = b.angle + Math.asin(M.clamp((forward * Math.cos(b.angle) - C.thickness) / C.height, -1, 1));
      var edgeContact = Math.atan2(forward - C.thickness * Math.cos(b.angle), C.thickness * Math.sin(b.angle));
      var angle = Math.min(tipContact, edgeContact);
      return Math.max(0, Math.min(limit, angle - .00015));
    }
    var target = M.box(b), lo = 0, hi = limit;
    if (!M.intersects(M.box(a, hi), target)) return limit;
    for (var k = 0; k < 13; k++) {
      var mid = (lo + hi) / 2;
      if (M.intersects(M.box(a, mid), target)) hi = mid; else lo = mid;
    }
    return Math.max(0, lo - .00015);
  };
  M.pointSegmentDistance = function (p, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z;
    var t = M.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
  };
  M.segmentDistance = function (a, b, c, d) {
    function orient(p, q, r) { return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x); }
    if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return 0;
    return Math.min(M.pointSegmentDistance(a, c, d), M.pointSegmentDistance(b, c, d), M.pointSegmentDistance(c, a, b), M.pointSegmentDistance(d, a, b));
  };
  M.sweepEnd = function (b) { return { x: b.x + Math.sin(b.heading) * C.height, z: b.z + Math.cos(b.heading) * C.height }; };
}(window.Domino));
