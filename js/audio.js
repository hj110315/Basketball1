// Synthesized sound effects using the Web Audio API (no audio files needed).
const Sfx = (() => {
  'use strict';
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  const VOLUME = 0.6;

  try {
    muted = localStorage.getItem('hoopFrenzy.muted') === '1';
  } catch (e) { /* ignore */ }

  // Must be called from a user gesture (browsers block audio until then).
  function init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOLUME;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  const ready = () => ctx && !muted;

  function envelope(g, t0, attack, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, attack + 0.01));
  }

  function tone({ freq, to, type = 'sine', dur = 0.2, vol = 0.3, delay = 0, attack = 0.005 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    envelope(g, t0, attack, vol, dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.3, vol = 0.3, type = 'bandpass', freq = 2000, to, Q = 1, delay = 0, attack = 0.01 }) {
    if (!ready()) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    f.Q.value = Q;
    const g = ctx.createGain();
    envelope(g, t0, attack, vol, dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  return {
    init,
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem('hoopFrenzy.muted', muted ? '1' : '0');
      } catch (e) { /* ignore */ }
      if (master) master.gain.value = muted ? 0 : VOLUME;
      return muted;
    },
    shoot() {
      noise({ dur: 0.2, vol: 0.12, type: 'highpass', freq: 1200, to: 4000, attack: 0.04 });
    },
    swish() {
      noise({ dur: 0.5, vol: 0.5, type: 'bandpass', freq: 6500, to: 1800, Q: 0.9, attack: 0.03 });
    },
    net() {
      noise({ dur: 0.32, vol: 0.32, type: 'bandpass', freq: 3800, to: 1500, Q: 1.2, attack: 0.02 });
    },
    rim(intensity = 1) {
      const v = Math.min(0.32, 0.07 + 0.05 * intensity);
      [[470, 1], [1230, 0.55], [2110, 0.3]].forEach(([f, a]) =>
        tone({ freq: f * (0.97 + Math.random() * 0.06), type: 'triangle', dur: 0.4, vol: v * a }));
      noise({ dur: 0.05, vol: v * 0.6, type: 'highpass', freq: 3000 });
    },
    board(intensity = 1) {
      tone({ freq: 150, to: 85, dur: 0.2, vol: Math.min(0.45, 0.15 + 0.05 * intensity) });
      noise({ dur: 0.09, vol: 0.18, type: 'lowpass', freq: 900 });
    },
    bounce(intensity = 1) {
      tone({ freq: 115, to: 55, dur: 0.16, vol: Math.min(0.35, 0.04 + 0.05 * intensity) });
    },
    beep() {
      tone({ freq: 660, type: 'square', dur: 0.14, vol: 0.12 });
    },
    go() {
      tone({ freq: 990, type: 'square', dur: 0.45, vol: 0.13 });
      tone({ freq: 1320, type: 'square', dur: 0.45, vol: 0.07 });
    },
    tick() {
      tone({ freq: 1250, type: 'square', dur: 0.05, vol: 0.06 });
    },
    buzzer() {
      tone({ freq: 118, type: 'sawtooth', dur: 1.1, vol: 0.22, attack: 0.01 });
      tone({ freq: 177, type: 'square', dur: 1.1, vol: 0.09, attack: 0.01 });
    },
    cheer(strength = 1) {
      noise({ dur: 1.7 * strength, vol: 0.2 * strength, type: 'bandpass', freq: 1100, Q: 0.4, attack: 0.25 });
      noise({ dur: 1.5 * strength, vol: 0.09 * strength, type: 'bandpass', freq: 2700, Q: 0.6, attack: 0.3 });
    },
    fanfare() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: i === 3 ? 0.6 : 0.22, vol: 0.18, delay: i * 0.09 }));
    },
    levelUp() {
      [440, 554.37, 659.25, 880].forEach((f, i) =>
        tone({ freq: f, type: 'square', dur: 0.12, vol: 0.07, delay: i * 0.06 }));
    },
  };
})();
