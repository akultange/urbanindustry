// Sound design, synthesised live with Web Audio (no files), so every hit lands on its cut.
//
// The reel: a pumping sub drone in F minor, a kick on each beat (every 4 cuts = 112.5 BPM),
// a click and hat on every cut, and an accent per shot (a scan beep on the price, a knock on the
// metal slats, a camera shutter on the feed photos, a zap on the LED shelf...). Negatives get the
// darker, lower version of their accent. A riser builds into the match cut, a sub drop lands on
// it, the sign hums on, and each shelf LED rings a note as it lights: the wall plays an arpeggio.
// Then quiet UI sounds for hover, open, sizes and the bag.
//
// Browsers only allow sound after the visitor's first click or tap, so nothing plays until
// enable() is called from one.

const F1 = 43.65;
const PENTA = [698.46, 830.61, 932.33, 1046.5, 1244.51, 1396.91, 1661.22, 1864.66, 2093.0, 2489.02]; // F5 Ab5 Bb5 C6 Eb6 F6 ...

export function createEngine(ctx) {
  const out = ctx.createGain(); out.gain.value = 0.38;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.12;
  out.connect(comp); comp.connect(ctx.destination);
  // a small room for tails
  const verb = ctx.createConvolver();
  const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 1.7), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
  }
  verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.32; verb.connect(wet); wet.connect(out);
  // one second of white noise, reused
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

  const env = (g, t, a, peak, dec, curve = 'exp') => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    else g.gain.linearRampToValueAtTime(0, t + a + dec);
  };
  const bus = (dest = out, send = 0) => {
    const g = ctx.createGain(); g.connect(dest);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(verb); }
    return g;
  };
  function noiseHit(dest, t, { type = 'highpass', f = 6000, q = 0.7, a = 0.001, gain = 0.2, dec = 0.03, sweepTo = 0, pan = 0 } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
    if (sweepTo) flt.frequency.exponentialRampToValueAtTime(sweepTo, t + a + dec);
    const g = ctx.createGain(); env(g, t, a, gain, dec);
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    s.connect(flt); flt.connect(g); node.connect(dest);
    s.start(t, Math.random() * 0.5, a + dec + 0.05);
  }
  function tone(dest, t, { type = 'sine', f = 440, to = 0, a = 0.002, gain = 0.1, dec = 0.2, glide = 0 } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + (glide || dec));
    const g = ctx.createGain(); env(g, t, a, gain, dec);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + dec + 0.05);
  }
  const kick = (dest, t, k = 1) => {
    tone(dest, t, { f: 150, to: 46, glide: 0.11, gain: 0.9 * k, dec: 0.3 });
    noiseHit(dest, t, { f: 2500, gain: 0.18 * k, dec: 0.012 });
  };
  const bell = (dest, t, f, gain = 0.05) => {
    tone(dest, t, { f, gain, dec: 0.9 });
    tone(dest, t, { f: f * 2.76, gain: gain * 0.35, dec: 0.35 });
    tone(dest, t, { f: f * 5.4, gain: gain * 0.12, dec: 0.12 });
  };

  // ---- per-shot accents (neg = the darker, lower version)
  const ACCENT = {
    field(d, t, neg) { tone(d, t, { f: neg ? 174.6 : 349.2, gain: 0.12, dec: 0.32 }); tone(d, t, { f: neg ? 349.2 : 698.5, gain: 0.04, dec: 0.18 }); },
    price(d, t, neg) { const m = neg ? 0.5 : 1; tone(d, t, { type: 'square', f: 1318.5 * m, gain: 0.035, dec: 0.04, a: 0.001 }); tone(d, t + 0.05, { type: 'square', f: 1760 * m, gain: 0.035, dec: 0.05, a: 0.001 }); },
    day(d, t, neg) { const m = neg ? 0.6 : 1; for (const [f, dec, gn] of [[620, 0.09, 0.09], [1110, 0.06, 0.06], [1840, 0.04, 0.04]]) tone(d, t, { f: f * m, gain: gn, dec }); noiseHit(d, t, { type: 'bandpass', f: 3000 * m, q: 2, gain: 0.08, dec: 0.01 }); },
    night(d, t) { ACCENT.day(d, t, true); },
    blueprint(d, t, neg) { noiseHit(d, t, { type: 'bandpass', f: neg ? 2200 : 4200, q: 4, gain: 0.14, dec: 0.01 }); tone(d, t + 0.004, { f: neg ? 1600 : 3200, gain: 0.03, dec: 0.025 }); },
    held(d, t, neg) { const f = neg ? 1400 : 2600; noiseHit(d, t, { type: 'bandpass', f, q: 1.4, gain: 0.2, dec: 0.012 }); noiseHit(d, t + 0.038, { type: 'bandpass', f: f * 0.8, q: 1.4, gain: 0.12, dec: 0.016 }); },
    box(d, t, neg) { ACCENT.held(d, t, neg); tone(d, t, { f: neg ? 80 : 110, to: neg ? 55 : 70, glide: 0.12, gain: 0.22, dec: 0.16 }); },
    beam(d, t, neg) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = neg ? 60 : 120;
      const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = neg ? 500 : 950; flt.Q.value = 2;
      const g = ctx.createGain(); env(g, t, 0.004, 0.09, 0.15, 'lin');
      const trem = ctx.createOscillator(); trem.type = 'square'; trem.frequency.value = 32;
      const tg = ctx.createGain(); tg.gain.value = 0.5; trem.connect(tg); tg.connect(g.gain);
      o.connect(flt); flt.connect(g); g.connect(d); o.start(t); trem.start(t); o.stop(t + 0.2); trem.stop(t + 0.2);
    },
    swatch(d, t, neg) { noiseHit(d, t, { type: 'bandpass', f: neg ? 500 : 900, sweepTo: neg ? 2000 : 4500, q: 1.2, a: 0.02, gain: 0.12, dec: 0.1 }); },
    halftone(d, t, neg) { const m = neg ? 0.5 : 1; [1046.5, 1244.5, 1568].forEach((f, k) => tone(d, t + k * 0.028, { type: 'square', f: f * m, gain: 0.022, dec: 0.022, a: 0.001 })); },
    silhouette(d, t, neg) { tone(d, t, { f: neg ? 55 : 70, to: 40, glide: 0.14, gain: 0.3, dec: 0.18 }); },
  };

  // ---- the reel. cuts: [{ t (s, absolute), d (s), shot, neg }]; returns a bus to silence it on skip
  function reel(cuts, endT) {
    const b = bus(out, 0.07);
    const t0 = cuts[0].t;
    // sub drone, pumping on every cut, the filter opening towards the drop
    const drone = ctx.createGain(); drone.gain.value = 0; drone.connect(b);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(170, t0); lp.frequency.exponentialRampToValueAtTime(900, endT);
    lp.connect(drone);
    const oscs = [[F1, 'sawtooth', 0.22, 0], [F1 * 1.5, 'sawtooth', 0.12, 4], [F1 * 2, 'sawtooth', 0.1, -5], [F1, 'sine', 0.5, 0]].map(([f, type, g, cents]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents;
      const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(lp); o.start(t0); o.stop(endT + 0.05); return o;
    });
    void oscs;
    drone.gain.setValueAtTime(0, t0);
    for (const c of cuts) {
      drone.gain.setValueAtTime(0.42, c.t);
      drone.gain.linearRampToValueAtTime(0.85, c.t + Math.min(0.09, c.d * 0.7));
    }
    drone.gain.setValueAtTime(0.85, endT - 0.012);
    drone.gain.linearRampToValueAtTime(0, endT);
    cuts.forEach((c, i) => {
      // click + hat on every cut, brighter on positives
      noiseHit(b, c.t, { type: 'highpass', f: 1500, gain: 0.12, dec: 0.003, pan: (i % 2 ? 0.25 : -0.25) });
      noiseHit(b, c.t, { type: c.neg ? 'bandpass' : 'highpass', f: c.neg ? 3200 : 7500, q: 0.8, gain: i % 2 ? 0.09 : 0.05, dec: 0.028, pan: (i % 2 ? -0.2 : 0.2) });
      if (i % 4 === 0) kick(b, c.t, i === 0 ? 0.8 : 1);
      if (i % 8 === 4) noiseHit(b, c.t, { type: 'bandpass', f: 1800, q: 0.9, gain: 0.3, dec: 0.09 }); // snap on the backbeat
      const acc = ACCENT[c.shot]; if (acc) acc(b, c.t + 0.002, c.neg);
    });
    // riser into the drop
    const rs = Math.max(t0, endT - 1.15);
    noiseHit(b, rs, { type: 'bandpass', f: 300, sweepTo: 6000, q: 1.6, a: endT - rs - 0.02, gain: 0.22, dec: 0.02 });
    tone(b, rs, { type: 'sawtooth', f: 174.6, to: 349.2, glide: endT - rs, a: endT - rs - 0.02, gain: 0.035, dec: 0.02 });
    return b;
  }

  // ---- the match cut and the wall powering on. sweep: seconds after t at which each shelf lights
  function land(t, sweep = []) {
    const b = bus(out, 0.25);
    tone(b, t, { f: 58, to: 31, glide: 1.2, gain: 0.95, dec: 1.8 });            // sub drop
    kick(b, t, 1.1);
    noiseHit(b, t, { type: 'lowpass', f: 3200, sweepTo: 400, q: 0.5, gain: 0.32, dec: 0.9 });
    // the sign hums on: a little flicker, then a steady buzz that settles down
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 200;
    const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1300; flt.Q.value = 1.1;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    [[0.3, 0.05], [0.34, 0], [0.38, 0.06], [0.42, 0.01], [0.47, 0.055]].forEach(([dt, v]) => g.gain.setValueAtTime(v, t + dt));
    g.gain.linearRampToValueAtTime(0.03, t + 1.6); g.gain.linearRampToValueAtTime(0.012, t + 2.6); g.gain.linearRampToValueAtTime(0, t + 3.4);
    const o2g = ctx.createGain(); o2g.gain.value = 0.25;
    o.connect(flt); o2.connect(o2g); o2g.connect(flt); flt.connect(g); g.connect(b);
    o.start(t); o2.start(t); o.stop(t + 3.5); o2.stop(t + 3.5);
    // each shelf LED rings as it strikes: a rising arpeggio along the wall
    sweep.forEach((dt, k) => bell(b, t + dt, PENTA[k % PENTA.length], 0.045));
    // the pull-back: air moving
    noiseHit(b, t + 0.05, { type: 'lowpass', f: 2400, sweepTo: 260, q: 0.6, a: 0.5, gain: 0.07, dec: 1.6 });
    // and a soft chord to resolve on (Ab add9)
    [103.83, 155.56, 261.63, 466.16].forEach((f, k) => {
      const p = ctx.createOscillator(); p.type = 'sawtooth'; p.frequency.value = f; p.detune.value = (k % 2 ? 6 : -6);
      const pl = ctx.createBiquadFilter(); pl.type = 'lowpass'; pl.frequency.value = 1100;
      const pg = ctx.createGain(); pg.gain.setValueAtTime(0, t + 0.2); pg.gain.linearRampToValueAtTime(0.028, t + 1.0);
      pg.gain.setValueAtTime(0.028, t + 1.8); pg.gain.linearRampToValueAtTime(0, t + 4.0);
      p.connect(pl); pl.connect(pg); pg.connect(b); p.start(t + 0.2); p.stop(t + 4.1);
    });
  }

  // ---- the box opening (reel.js OPEN_MS, 1.3 s): a press, the lid letting go, cardboard and air as it
  // lifts away, tissue paper, then a shimmer that swells into the reel's first beat
  function open(t, dur = 1.3) {
    const b = bus(out, 0.16);
    tone(b, t, { f: 96, to: 58, glide: 0.09, gain: 0.3, dec: 0.12 });                                   // the press
    noiseHit(b, t, { type: 'lowpass', f: 420, gain: 0.16, dec: 0.05 });
    tone(b, t + 0.1, { f: 250, to: 115, glide: 0.045, gain: 0.2, dec: 0.065 });                          // suction pop
    noiseHit(b, t + 0.1, { type: 'bandpass', f: 1500, q: 1.6, gain: 0.08, dec: 0.018 });
    noiseHit(b, t + 0.07, { type: 'bandpass', f: 360, sweepTo: 1100, q: 1.2, a: 0.12, gain: 0.11, dec: 0.16 });   // cardboard
    noiseHit(b, t + 0.27, { type: 'bandpass', f: 700, sweepTo: 3600, q: 0.8, a: 0.2, gain: 0.1, dec: 0.22, pan: -0.15 }); // the lid away
    [0.31, 0.38, 0.45, 0.53, 0.62].forEach((dt, k) =>                                                     // tissue paper
      noiseHit(b, t + dt, { type: 'highpass', f: 3600 + k * 320, a: 0.006, gain: 0.028 + 0.012 * (k % 2), dec: 0.035, pan: k % 2 ? 0.25 : -0.25 }));
    noiseHit(b, t + 0.32, { type: 'bandpass', f: 900, sweepTo: 7600, q: 1.4, a: dur - 0.36, gain: 0.07, dec: 0.03 }); // the light
    tone(b, t + 0.3, { f: 349.23, to: 698.46, glide: dur - 0.32, a: dur - 0.34, gain: 0.032, dec: 0.04 });
    tone(b, t + 0.3, { type: 'triangle', f: 174.61, to: 349.23, glide: dur - 0.32, a: dur - 0.34, gain: 0.03, dec: 0.04 });
    [[0.58, 1046.5], [0.77, 1244.51], [0.93, 1396.91], [1.07, 1661.22]].forEach(([dt, f]) => bell(b, t + dt, f, 0.02));
  }

  // ---- interface
  const UI = {
    hover(t) { tone(out, t, { f: 480, to: 760, glide: 0.07, gain: 0.06, dec: 0.11 }); noiseHit(out, t, { type: 'bandpass', f: 3000, q: 2, gain: 0.025, dec: 0.006 }); },
    open(t) { tone(out, t, { f: 140, to: 88, glide: 0.09, gain: 0.16, dec: 0.12 }); noiseHit(out, t, { type: 'bandpass', f: 380, sweepTo: 2200, q: 1, a: 0.12, gain: 0.07, dec: 0.25 }); },
    close(t) { noiseHit(out, t, { type: 'bandpass', f: 2200, sweepTo: 380, q: 1, a: 0.08, gain: 0.06, dec: 0.25 }); },
    size(t) { tone(out, t, { f: 1600, gain: 0.04, dec: 0.014, a: 0.001 }); },
    bag(t) { bell(out, t, 1046.5, 0.05); bell(out, t + 0.085, 1568, 0.05); },
    order(t) { bell(out, t, 1046.5, 0.045); bell(out, t + 0.07, 1318.5, 0.045); bell(out, t + 0.14, 1568, 0.05); },
    step(t) { tone(out, t, { f: 900, gain: 0.03, dec: 0.02, a: 0.001 }); },
  };
  return { out, reel, land, open, ui: (name, t) => UI[name] && UI[name](t) };
}

// the live engine: created on the first click that asks for sound
export function createSound() {
  let ctx = null, eng = null, on = false, reelBus = null, idle = 0;
  const session = type => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {} };
  const api = {
    get on() { return on; },
    get ctx() { return ctx; },
    // call from inside a click or key handler: that's the only time browsers let audio start
    async enable() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      clearTimeout(idle);
      // they asked for sound: on an iPhone, play it even with the silent switch on
      session('playback');
      if (!ctx) { ctx = new AC({ latencyHint: 'interactive' }); eng = createEngine(ctx); }
      // an empty buffer started inside the gesture unlocks audio on older iOS
      try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0); } catch (e) {}
      try { await ctx.resume(); } catch (e) {}
      on = ctx.state === 'running';
      if (on) { eng.out.gain.cancelScheduledValues(ctx.currentTime); eng.out.gain.setValueAtTime(0.38, ctx.currentTime); }
      else session('auto');
      return on;
    },
    // without a click: start only if the browser allows it right now (Chrome and Edge do on a reload after
    // a click on the site). Doesn't wait for a gesture: if it's not running within a moment, it's blocked.
    async tryStart(wait = 260) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { if (navigator.getAutoplayPolicy && navigator.getAutoplayPolicy('audiocontext') === 'disallowed') return false; } catch (e) {}
      if (!ctx) { ctx = new AC({ latencyHint: 'interactive' }); eng = createEngine(ctx); }
      if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
        const t0 = performance.now();
        while (ctx.state !== 'running' && performance.now() - t0 < wait) await new Promise(r => setTimeout(r, 20));
      }
      on = ctx.state === 'running';
      if (on) { eng.out.gain.cancelScheduledValues(ctx.currentTime); eng.out.gain.setValueAtTime(0.38, ctx.currentTime); }
      return on;
    },
    disable() {
      on = false;
      if (!ctx) return;
      eng.out.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      if (reelBus) { reelBus.gain.setTargetAtTime(0, ctx.currentTime, 0.02); reelBus = null; }
      // once the fade is done, let go of the audio hardware (and anything else that was playing comes back)
      clearTimeout(idle);
      idle = setTimeout(() => { if (!on && ctx.state === 'running') ctx.suspend().catch(() => {}); session('auto'); }, 300);
    },
    now() { return ctx ? ctx.currentTime : 0; },
    // cuts as the reel lays them out (ms from its start), placed at audio time `start` (s)
    reel(timeline, start) {
      if (!on) return;
      if (reelBus) reelBus.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
      const cuts = timeline.map(c => ({ t: start + c.t / 1000, d: c.d / 1000, shot: c.shot, neg: !!c.neg }));
      const last = timeline[timeline.length - 1];
      reelBus = eng.reel(cuts, start + (last.t + last.d) / 1000);
    },
    stopReel() { if (reelBus && ctx) { reelBus.gain.setTargetAtTime(0, ctx.currentTime, 0.015); reelBus = null; } },
    land(sweep) { if (on) { api.stopReel(); eng.land(ctx.currentTime + 0.005, sweep); } },
    // the box opening; returns the audio time it started at (the reel's first beat goes at that + its length)
    open(dur) { if (!on) return null; const t = ctx.currentTime + 0.005; eng.open(t, dur); return t; },
    ui(name) { if (on && ctx.state === 'running') eng.ui(name, ctx.currentTime + 0.004); },
  };
  return api;
}

// for the preview video: the same score rendered offline, returned as a 16-bit WAV (times in s)
export async function renderScore({ timeline, boxAt = -1, openDur = 1.3, reelAt = 0, landAt, sweep = [], tail = 4.2, sr = 48000 }) {
  const last = timeline[timeline.length - 1];
  const len = Math.ceil((landAt + tail) * sr);
  const oc = new OfflineAudioContext(2, len, sr);
  const eng = createEngine(oc);
  if (boxAt >= 0) eng.open(boxAt, openDur);
  const cuts = timeline.map(c => ({ t: reelAt + c.t / 1000, d: c.d / 1000, shot: c.shot, neg: !!c.neg }));
  eng.reel(cuts, reelAt + (last.t + last.d) / 1000);
  eng.land(landAt, sweep);
  const buf = await oc.startRendering();
  const n = buf.length, chans = [buf.getChannelData(0), buf.getChannelData(1)];
  const wav = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => [...s].forEach((ch, i) => wav.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
  wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true); wav.setUint32(24, sr, true);
  wav.setUint32(28, sr * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); w(36, 'data'); wav.setUint32(40, n * 4, true);
  let peak = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
    const v = Math.max(-1, Math.min(1, chans[c][i])); peak = Math.max(peak, Math.abs(v));
    wav.setInt16(44 + (i * 2 + c) * 2, v * 32767, true);
  }
  return { wav: new Uint8Array(wav.buffer), peak };
}
