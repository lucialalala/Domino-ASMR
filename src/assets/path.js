(function (D) {
  'use strict';
  var C = D.config, M = D.math;
  function Path() {
    this.bones = []; this.strokes = []; this.cells = {}; this.queue = [];
    this.active = false; this.ending = false; this.preview = null; this.serial = 0;
  }
  Path.prototype.key = function (x, z) { return Math.floor(x / C.cellSize) + ',' + Math.floor(z / C.cellSize); };
  Path.prototype.insert = function (b) {
    var key = this.key(b.x, b.z);
    if (!this.cells[key]) this.cells[key] = [];
    this.cells[key].push(b);
  };
  Path.prototype.reindex = function () {
    this.cells = {};
    for (var i = 0; i < this.bones.length; i++) this.insert(this.bones[i]);
  };
  Path.prototype.begin = function (point) {
    if (this.active || this.bones.length >= C.maxCount) return false;
    this.active = true; this.ending = false; this.queue.length = 0;
    this.startCount = this.bones.length;
    var tail = this.bones[this.bones.length - 1];
    this.oldTailHeading = tail ? tail.heading : 0;
    this.anchor = tail ? { x: tail.x, z: tail.z } : { x: point.x, z: point.z };
    this.preview = { x: this.anchor.x, z: this.anchor.z, heading: tail ? tail.heading : 0, valid: true };
    this.serial++;
    return true;
  };
  Path.prototype.enqueue = function (point) {
    if (!this.active || this.ending) return;
    if (this.queue.length < 128) this.queue.push({ x: point.x, z: point.z });
    else this.queue[this.queue.length - 1] = { x: point.x, z: point.z };
  };
  Path.prototype.valid = function (candidate) {
    var bones = this.bones, n = bones.length;
    var cx = Math.floor(candidate.x / C.cellSize), cz = Math.floor(candidate.z / C.cellSize);
    var end = M.sweepEnd(candidate);
    for (var x = cx - 2; x <= cx + 2; x++) for (var z = cz - 2; z <= cz + 2; z++) {
      var bucket = this.cells[x + ',' + z];
      if (!bucket) continue;
      for (var i = 0; i < bucket.length; i++) {
        var old = bucket[i];
        // Near neighbours belong to the intentional overlapping fall envelope.
        if (old.id >= n - 3) continue;
        if (M.segmentDistance(candidate, end, old, M.sweepEnd(old)) < C.width + .055) return false;
      }
    }
    var tail = bones[n - 1];
    if (tail) {
      var oldHeading = tail.heading;
      tail.heading = candidate.heading;
      var overlap = M.intersects(M.box(tail), M.box(candidate));
      var reachable = M.intersects(M.box(tail, .40), M.box(candidate));
      tail.heading = oldHeading;
      if (overlap || !reachable) return false;
    }
    return true;
  };
  Path.prototype.process = function (budget) {
    var placed = 0;
    while (this.active && this.queue.length && placed < budget) {
      var target = this.queue[0], tail = this.bones[this.bones.length - 1];
      var base = tail || this.anchor;
      var dx = target.x - base.x, dz = target.z - base.z, distance = Math.hypot(dx, dz);
      this.preview = { x: target.x, z: target.z, heading: tail ? tail.heading : Math.atan2(dx, dz), valid: true };
      if (distance < C.spacing) { this.queue.shift(); continue; }
      var heading = Math.atan2(dx, dz);
      if (tail) {
        var turn = M.wrap(heading - tail.heading);
        if (Math.abs(turn) > 1.22) { this.preview.valid = false; this.queue.shift(); continue; }
        heading = tail.heading + M.clamp(turn, -C.maxTurn, C.maxTurn);
      }
      var candidate = M.bone(base.x + Math.sin(heading) * C.spacing, base.z + Math.cos(heading) * C.spacing, heading, this.bones.length, this.serial);
      if (!this.valid(candidate)) { this.preview.valid = false; this.queue.shift(); continue; }
      if (!tail) {
        var first = M.bone(this.anchor.x, this.anchor.z, heading, 0, this.serial);
        this.bones.push(first); this.insert(first);
        candidate.id = 1; candidate.colorIndex = 1; candidate.color = M.color(1);
      } else tail.heading = heading;
      this.bones.push(candidate); this.insert(candidate); placed++;
      if (this.bones.length >= C.maxCount) { this.queue.length = 0; break; }
    }
    if (this.active && this.ending && !this.queue.length) this.commit();
    return placed;
  };
  Path.prototype.end = function () { if (this.active) this.ending = true; };
  Path.prototype.commit = function () {
    if (this.bones.length > this.startCount) this.strokes.push({ count: this.startCount, heading: this.oldTailHeading });
    this.active = false; this.ending = false; this.preview = null; this.queue.length = 0;
  };
  Path.prototype.cancel = function () {
    if (!this.active) return;
    this.bones.length = this.startCount;
    if (this.bones.length) this.bones[this.bones.length - 1].heading = this.oldTailHeading;
    this.active = false; this.ending = false; this.preview = null; this.queue.length = 0; this.reindex();
  };
  Path.prototype.undo = function () {
    if (this.active) return false;
    var stroke = this.strokes.pop();
    if (!stroke) return false;
    this.bones.length = stroke.count;
    if (this.bones.length) this.bones[this.bones.length - 1].heading = stroke.heading;
    this.reindex(); return true;
  };
  Path.prototype.clear = function () {
    this.bones.length = 0; this.strokes.length = 0; this.queue.length = 0;
    this.cells = {}; this.active = false; this.ending = false; this.preview = null;
  };
  D.Path = Path;
}(window.Domino));
