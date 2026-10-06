window.FG = window.FG || {};

// Two TIA sound channels. The game hands over AUDC, AUDF and AUDV for both channels once per frame,
// exactly as the cartridge writes them, and this module turns them into samples with the same
// polynomial counters and dividers as the chip. Nothing plays until a gesture unlocks the context.
window.FG.Audio = (function () {
  'use strict';

  const TIA_CLOCK = 31399.5;

  // Runs inside the AudioWorklet or the ScriptProcessor fallback, so it must stay self-contained.
  function tiaCore(sampleRate) {
    const BIT4 = [1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0];
    const BIT5 = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1];
    // The divide-by-31 clock is uneven: 13 ticks one way and 18 the other.
    const DIV31 = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const BIT9 = [];
    let lfsr = 0x1ff;
    for (let i = 0; i < 511; i++) {
      BIT9.push(lfsr & 1);
      const bit = ((lfsr >> 4) ^ lfsr) & 1;
      lfsr = (lfsr >> 1) | (bit << 8);
    }
    const step = 31399.5 / sampleRate;
    const channels = [0, 1].map(function () {
      return { audc: 0, audf: 0, audv: 0, count: 1, p4: 0, p5: 0, p9: 0, out: 0 };
    });
    let phase = 0;

    function tick(ch) {
      const c = ch.audc;
      if (c === 0 || c === 11) {
        ch.out = ch.audv;
        return;
      }
      if (ch.count > 1) {
        ch.count--;
        return;
      }
      ch.count = (ch.audf + 1) * (c >= 12 ? 3 : 1);
      ch.p5 = (ch.p5 + 1) % 31;
      const clocked = (c & 2) === 0 || ((c & 1) === 0 ? DIV31[ch.p5] : BIT5[ch.p5]);
      if (!clocked) return;
      if (c & 4) {
        ch.out = ch.out ? 0 : ch.audv;
      } else if (c & 8) {
        if (c === 8) {
          ch.p9 = (ch.p9 + 1) % 511;
          ch.out = BIT9[ch.p9] ? ch.audv : 0;
        } else {
          ch.out = BIT5[ch.p5] ? ch.audv : 0;
        }
      } else {
        ch.p4 = (ch.p4 + 1) % 15;
        ch.out = BIT4[ch.p4] ? ch.audv : 0;
      }
    }

    return {
      set: function (regs) {
        for (let i = 0; i < 2; i++) {
          const ch = channels[i];
          const r = regs[i] || [0, 0, 0];
          ch.audc = r[0] & 15;
          ch.audf = r[1] & 31;
          ch.audv = r[2] & 15;
          if (ch.out) ch.out = ch.audv;
        }
      },
      render: function (output) {
        for (let n = 0; n < output.length; n++) {
          // Average the chip ticks that fall inside one output sample, a cheap low-pass.
          phase += step;
          let sum = 0;
          let ticks = 0;
          while (phase >= 1) {
            phase -= 1;
            tick(channels[0]);
            tick(channels[1]);
            sum += channels[0].out + channels[1].out;
            ticks++;
          }
          const level = ticks ? sum / ticks : channels[0].out + channels[1].out;
          output[n] = level / 30 * 0.32;
        }
      },
    };
  }

  const PROCESSOR = `${tiaCore.toString()}
class TiaProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.core = tiaCore(sampleRate);
    this.port.onmessage = (event) => this.core.set(event.data);
  }
  process(inputs, outputs) {
    this.core.render(outputs[0][0]);
    return true;
  }
}
registerProcessor('tia-sound', TiaProcessor);`;

  let ctx = null;
  let master = null;
  let sink = null;
  let fallback = null;
  let muted = false;
  let silent = true;
  let last = '';

  function post(regs) {
    if (sink) sink.port.postMessage(regs);
    else if (fallback) fallback.set(regs);
  }

  function connectFallback() {
    if (!ctx.createScriptProcessor) return;
    fallback = tiaCore(ctx.sampleRate);
    const node = ctx.createScriptProcessor(1024, 0, 1);
    node.onaudioprocess = function (event) { fallback.render(event.outputBuffer.getChannelData(0)); };
    node.connect(master);
  }

  function unlock() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    if (!ctx) {
      try {
        ctx = new Context();
      } catch (_) {
        return;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      // A television speaker never reproduced the chip's highest squares; this keeps them from whistling.
      const speaker = ctx.createBiquadFilter();
      speaker.type = 'lowpass';
      speaker.frequency.value = 9000;
      master.connect(speaker);
      speaker.connect(ctx.destination);
      if (ctx.audioWorklet && window.Blob && window.URL) {
        const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'text/javascript' }));
        ctx.audioWorklet.addModule(url).then(function () {
          sink = new AudioWorkletNode(ctx, 'tia-sound', { numberOfInputs: 0, outputChannelCount: [1] });
          sink.connect(master);
          last = '';
        }).catch(connectFallback);
      } else {
        connectFallback();
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
  }

  // Called once per emulated frame with [[audc, audf, audv], [audc, audf, audv]].
  function frame(regs) {
    const key = regs[0].join(',') + ';' + regs[1].join(',');
    silent = !regs[0][2] && !regs[1][2];
    if (key === last) return;
    last = key;
    post(regs);
  }

  function stop() {
    last = '';
    post([[0, 0, 0], [0, 0, 0]]);
    silent = true;
  }

  function setMuted(value) {
    muted = !!value;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.01);
  }

  return {
    TIA_CLOCK: TIA_CLOCK,
    core: tiaCore,
    unlock: unlock,
    frame: frame,
    stop: stop,
    setMuted: setMuted,
    get muted() { return muted; },
    get silent() { return silent; },
  };
})();
