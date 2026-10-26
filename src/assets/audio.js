(function (D) {
  'use strict';
  function Audio(onStatus) {
    this.context = null; this.muted = false; this.voices = []; this.onStatus = onStatus;
    this.status = 'locked'; this.frameTime = 0; this.frameSim = 0; this.skipFrame = false;
  }
  Audio.prototype.unlock = function () {
    var self = this;
    try {
      if (!this.context) {
        var Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) throw new Error('Audio unavailable');
        var context = this.context = new Context();
        this.master = context.createGain(); this.master.gain.value = this.muted ? 0 : .24;
        var limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -15; limiter.knee.value = 15; limiter.ratio.value = 8;
        this.master.connect(limiter); limiter.connect(context.destination);
        this.noise = context.createBuffer(1, Math.round(context.sampleRate * .035), context.sampleRate);
        var samples = this.noise.getChannelData(0);
        for (var i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (samples.length * .2));
      }
      // Also queues a resume behind a pending suspend during a very quick pause/continue.
      var operation = typeof this.context.resume === 'function' ? this.context.resume() : Promise.resolve();
      return Promise.resolve(operation).then(function () {
        self.status = self.context.state === 'running' ? 'ready' : 'unavailable';
        if (self.onStatus) self.onStatus(self.status);
        return self.status === 'ready';
      }).catch(function () { self.status = 'unavailable'; if (self.onStatus) self.onStatus(self.status); return false; });
    } catch (error) {
      this.status = 'unavailable'; if (this.onStatus) this.onStatus(this.status); return Promise.resolve(false);
    }
  };
  Audio.prototype.beginFrame = function (simulationTime, elapsed) {
    this.frameSim = simulationTime; this.frameTime = this.context ? this.context.currentTime : 0;
    this.skipFrame = elapsed > .12;
  };
  Audio.prototype.play = function (event, pan) {
    var context = this.context;
    if (this.muted || this.status !== 'ready' || !context || context.state !== 'running' || this.skipFrame) return;
    var intended = this.frameTime + event.time - this.frameSim;
    if (intended < context.currentTime - .075) return;
    var when = Math.max(context.currentTime, Math.min(context.currentTime + .07, intended));
    var cycle = D.config.noteCycle;
    var frequency = D.config.notes[cycle[event.note % cycle.length]];
    var soft = event.type === 'groundContact' ? .42 : 1;
    var voice = { nodes: [], sources: [], disposed: false }, self = this;
    voice.dispose = function () {
      if (voice.disposed) return;
      voice.disposed = true;
      for (var i = 0; i < voice.sources.length; i++) { try { voice.sources[i].stop(); } catch (error) { /* Already ended. */ } }
      for (var j = 0; j < voice.nodes.length; j++) { try { voice.nodes[j].disconnect(); } catch (error) { /* Partially initialized voice. */ } }
      var index = self.voices.indexOf(voice); if (index >= 0) self.voices.splice(index, 1);
    };
    try {
      while (this.voices.length >= 8) this.voices[0].dispose();
      this.voices.push(voice);
      var envelope = context.createGain(); voice.nodes.push(envelope);
      envelope.gain.setValueAtTime(.0001, when);
      envelope.gain.exponentialRampToValueAtTime(.48 * soft, when + .004);
      envelope.gain.exponentialRampToValueAtTime(.0001, when + .20);
      if (typeof context.createStereoPanner === 'function') {
        var panner = context.createStereoPanner(); panner.pan.value = D.math.clamp(pan, -.5, .5);
        voice.nodes.push(panner); envelope.connect(panner); panner.connect(this.master);
      } else envelope.connect(this.master);
      var tone = context.createOscillator(); tone.type = 'sine'; tone.frequency.setValueAtTime(frequency, when);
      var harmonic = context.createOscillator(); harmonic.type = 'sine'; harmonic.frequency.setValueAtTime(frequency * 2.003, when);
      var harmonicGain = context.createGain(); harmonicGain.gain.value = .12;
      harmonic.connect(harmonicGain); harmonicGain.connect(envelope); tone.connect(envelope);
      var noise = context.createBufferSource(); noise.buffer = this.noise;
      var filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1350; filter.Q.value = .7;
      var noiseGain = context.createGain(); noiseGain.gain.value = .28;
      noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(envelope);
      voice.nodes.push(tone, harmonic, harmonicGain, noise, filter, noiseGain);
      voice.sources.push(tone, harmonic, noise);
      tone.onended = voice.dispose;
      tone.start(when); tone.stop(when + .22); harmonic.start(when); harmonic.stop(when + .21); noise.start(when);
    } catch (error) {
      voice.dispose(); this.status = 'unavailable'; if (this.onStatus) this.onStatus(this.status);
    }
  };
  Audio.prototype.stopAll = function () { while (this.voices.length) this.voices[0].dispose(); };
  Audio.prototype.setMuted = function (muted) {
    this.muted = muted;
    if (muted) this.stopAll();
    if (this.master) this.master.gain.value = muted ? 0 : .24;
  };
  Audio.prototype.suspend = function () {
    this.stopAll();
    if (this.context && this.context.state === 'running') {
      try { var p = this.context.suspend(); if (p && p.catch) p.catch(function () {}); } catch (error) { /* Optional in older WebViews. */ }
    }
  };
  D.Audio = Audio;
}(window.Domino));
