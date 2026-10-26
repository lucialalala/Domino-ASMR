(function (D) {
  'use strict';
  var C = D.config, M = D.math;
  function Simulation(bones, onEvent) {
    this.bones = bones; this.onEvent = onEvent || function () {};
    this.time = 0; this.running = false; this.front = 0; this.note = 0; this.accumulator = 0;
  }
  Simulation.prototype.reset = function () {
    this.time = 0; this.running = false; this.front = 0; this.note = 0; this.accumulator = 0;
    for (var i = 0; i < this.bones.length; i++) {
      var b = this.bones[i]; b.angle = 0; b.angularVelocity = 0; b.status = 'standing'; b.contactEmitted = false; b.groundEmitted = false;
      b.resting = false; b.supportAngle = 0; b.skipped = false;
    }
  };
  Simulation.prototype.start = function () {
    if (this.bones.length < 2 || this.running) return false;
    this.reset(); this.running = true;
    this.bones[0].status = 'falling'; this.bones[0].angularVelocity = 1.65;
    return true;
  };
  Simulation.prototype.advance = function (dt) {
    if (!this.running) return;
    this.accumulator = Math.min(this.accumulator + dt, C.step * C.maxSubsteps);
    var steps = 0;
    while (this.accumulator >= C.step && steps++ < C.maxSubsteps && this.running) {
      this.tick(C.step); this.accumulator -= C.step;
    }
  };
  Simulation.prototype.tick = function (dt) {
    var bones = this.bones, halfPi = Math.PI / 2;
    for (var i = 0; i < bones.length; i++) {
      var b = bones[i];
      if (b.status !== 'falling') continue;
      var next = bones[i + 1];
      b.skipped = Boolean(b.resting && next && Math.abs(next.angle - b.supportAngle) < .00002);
      if (b.skipped) continue;
      var oldAngle = b.angle;
      b.angularVelocity = Math.min(7, b.angularVelocity + (3.2 + 13 * Math.sin(b.angle)) * dt);
      var proposed = Math.min(halfPi, b.angle + b.angularVelocity * dt);
      if (next && next.status === 'standing' && M.intersects(M.box(b, proposed), M.box(next))) {
        var contact = M.contactAngle(b, next, proposed);
        var fraction = M.clamp((contact - oldAngle) / (proposed - oldAngle || 1), 0, 1);
        if (!b.contactEmitted) {
          b.contactEmitted = true; next.status = 'falling'; next.angularVelocity = 2.05;
          this.front = i + 1;
          this.onEvent({ type: 'dominoContact', index: i, next: i + 1, note: this.note++, time: this.time + dt * fraction, strength: .8 });
        }
        proposed = contact;
      }
      b.angle = proposed;
    }
    // Solve from the free tail backwards, so each tile rests on its moving neighbour.
    // Collision geometry, propagation and rendered geometry use the same pivot and boxes.
    for (var j = bones.length - 1; j >= 0; j--) {
      var tile = bones[j];
      if (tile.status !== 'falling') continue;
      var following = bones[j + 1], blocked = false;
      if (tile.skipped && following && Math.abs(following.angle - tile.supportAngle) < .00002) {
        if (following.status === 'settled') { tile.status = 'settled'; tile.angularVelocity = 0; }
        continue;
      }
      if (following && M.intersects(M.box(tile), M.box(following))) {
        tile.angle = M.contactAngle(tile, following, tile.angle);
        tile.angularVelocity = Math.min(tile.angularVelocity, 2.5);
        blocked = true;
      }
      tile.resting = blocked;
      if (following) tile.supportAngle = following.angle;
      if (!following && tile.angle >= halfPi - .0001) {
        tile.angle = halfPi; tile.status = 'settled'; tile.angularVelocity = 0;
        if (!tile.groundEmitted) {
          tile.groundEmitted = true;
          this.onEvent({ type: 'groundContact', index: j, note: Math.max(0, this.note - 1), time: this.time + dt, strength: .35 });
        }
      } else if (blocked && following && following.status === 'settled') {
        tile.status = 'settled'; tile.angularVelocity = 0;
      }
    }
    this.time += dt;
    if (bones.length && bones[0].status === 'settled') this.running = false;
  };
  D.Simulation = Simulation;
}(window.Domino));
