window.FG = window.FG || {};

(function (FG) {
  'use strict';

  var context = null;
  var master = null;
  var Audio = { muted: false, available: true };

  function initialize() {
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      Audio.available = false;
      return;
    }
    try {
      context = new Context();
      master = context.createGain();
      master.gain.value = Audio.muted ? 0 : 0.2;
      master.connect(context.destination);
    } catch (error) {
      context = null;
      Audio.available = false;
    }
  }

  function unlock() {
    if (!context && Audio.available) initialize();
    if (context && context.state === 'suspended') context.resume();
  }

  function setMuted(muted) {
    Audio.muted = !!muted;
    if (master) master.gain.value = Audio.muted ? 0 : 0.2;
  }

  function tone(frequency, duration, type, gain) {
    if (!context || Audio.muted || context.state !== 'running') return;
    var now = context.currentTime;
    var oscillator = context.createOscillator();
    var amp = context.createGain();
    oscillator.type = type || 'square';
    oscillator.frequency.value = frequency;
    amp.gain.setValueAtTime(gain || 0.15, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(amp);
    amp.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function sequence(notes) {
    if (!context || Audio.muted || context.state !== 'running') return;
    var now = context.currentTime;
    for (var i = 0; i < notes.length; i++) {
      var oscillator = context.createOscillator();
      var amp = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = notes[i][0];
      var at = now + notes[i][2];
      amp.gain.setValueAtTime(0.12, at);
      amp.gain.exponentialRampToValueAtTime(0.001, at + notes[i][1]);
      oscillator.connect(amp);
      amp.connect(master);
      oscillator.start(at);
      oscillator.stop(at + notes[i][1] + 0.02);
    }
  }

  Audio.unlock = unlock;
  Audio.setMuted = setMuted;
  Audio.stop = function () {};
  Audio.hop = function () { tone(420, 0.06, 'square', 0.08); };
  Audio.sploosh = function () { tone(90, 0.28, 'sawtooth', 0.18); };
  Audio.warn = function () { tone(660, 0.08, 'square', 0.08); };
  Audio.lady = function () { tone(880, 0.12, 'square', 0.1); };
  Audio.home = function () { tone(520, 0.14, 'square', 0.12); };
  Audio.clear = function () { sequence([[523, 0.12, 0], [659, 0.12, 0.13], [784, 0.22, 0.26]]); };
  Audio.extra = function () { sequence([[784, 0.08, 0], [988, 0.14, 0.1]]); };

  FG.Audio = Audio;
})(window.FG);
