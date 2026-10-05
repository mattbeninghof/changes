/* Changes: a small warm keys synth on Web Audio. No samples, no dependencies. */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let dry = null;
  let wet = null;
  const live = new Set();

  function supported() {
    return !!(root.AudioContext || root.webkitAudioContext);
  }

  function makeRoom(c) {
    const len = Math.floor(c.sampleRate * 2.2);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = c.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function ensure() {
    if (!supported()) return null;
    if (!ctx) {
      ctx = new (root.AudioContext || root.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(comp).connect(ctx.destination);
      dry = ctx.createGain();
      dry.gain.value = 0.85;
      dry.connect(master);
      const room = makeRoom(ctx);
      wet = ctx.createGain();
      wet.gain.value = 0.22;
      room.connect(wet).connect(master);
      dry.room = room;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function voice(midi, t, dur, vel) {
    const f = hz(midi);
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2;
    o2.detune.value = 4;
    const g2 = ctx.createGain();
    g2.gain.value = 0.16;

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.4;
    tone.frequency.setValueAtTime(Math.min(5200, f * 9), t);
    tone.frequency.exponentialRampToValueAtTime(Math.min(1800, f * 4), t + 0.9);

    const env = ctx.createGain();
    const end = t + dur;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.012);
    env.gain.exponentialRampToValueAtTime(vel * 0.38, Math.min(t + 0.55, end - 0.02));
    env.gain.exponentialRampToValueAtTime(Math.max(vel * 0.16, 0.0002), end);
    env.gain.exponentialRampToValueAtTime(0.0001, end + 0.35);

    o1.connect(tone);
    o2.connect(g2).connect(tone);
    tone.connect(env);
    env.connect(dry);
    env.connect(dry.room);

    const node = { o1, o2, env };
    live.add(node);
    o1.start(t);
    o2.start(t);
    o1.stop(end + 0.4);
    o2.stop(end + 0.4);
    o1.onended = () => live.delete(node);
  }

  // A soft, slightly breathy lead for melodies.
  function lead(midi, t, dur, vel) {
    const c = ensure();
    if (!c) return false;
    t = Math.max(t || 0, c.currentTime + 0.005);
    vel = vel || 0.11;
    const f = hz(midi);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = c.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f;
    o2.detune.value = -6;
    const g2 = c.createGain();
    g2.gain.value = 0.35;
    const vib = c.createOscillator();
    vib.frequency.value = 5.2;
    const vibAmt = c.createGain();
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(f * 0.004, t + Math.min(0.4, dur));
    vib.connect(vibAmt).connect(o.frequency);
    const env = c.createGain();
    const end = t + dur;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.03);
    env.gain.setTargetAtTime(vel * 0.6, t + 0.05, 0.25);
    env.gain.setTargetAtTime(0.0001, end, 0.06);
    o.connect(env);
    o2.connect(g2).connect(env);
    env.connect(dry);
    env.connect(dry.room);
    const node = { o1: o, o2, env };
    live.add(node);
    [o, o2, vib].forEach((x) => { x.start(t); x.stop(end + 0.4); });
    o.onended = () => live.delete(node);
    return true;
  }

  // Short plucked bass for walking and boogie lines.
  function bass(midi, t, dur, vel) {
    const c = ensure();
    if (!c) return false;
    t = Math.max(t || 0, c.currentTime + 0.005);
    vel = vel || 0.22;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz(midi);
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = hz(midi);
    const env = c.createGain();
    const end = t + dur;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.008);
    env.gain.exponentialRampToValueAtTime(vel * 0.4, Math.max(t + 0.02, end - 0.02));
    env.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
    o.connect(env);
    o2.connect(env);
    env.connect(dry);
    const node = { o1: o, o2, env };
    live.add(node);
    o.start(t); o2.start(t);
    o.stop(end + 0.1); o2.stop(end + 0.1);
    o.onended = () => live.delete(node);
    return true;
  }

  // voicing: { bass, upper: [midi...] }. strum spreads the notes slightly.
  function playChord(voicing, when, dur, opts) {
    const c = ensure();
    if (!c) return false;
    opts = opts || {};
    const t = Math.max(when || 0, c.currentTime + 0.01);
    const strum = opts.strum == null ? 0.018 : opts.strum;
    const vel = opts.vel == null ? 1 : opts.vel;
    if (voicing.bass != null && !opts.noBass) voice(voicing.bass, t, dur, 0.2 * vel);
    voicing.upper.forEach((m, i) => voice(m, t + strum * (i + 1), Math.max(0.06, dur - strum * (i + 1)), 0.12 * vel));
    return true;
  }

  // Play loose notes (a scale or an arpeggio) one after another.
  function playLine(midis, step) {
    const c = ensure();
    if (!c) return false;
    step = step || 0.22;
    const t0 = c.currentTime + 0.03;
    midis.forEach((m, i) => voice(m, t0 + i * step, step * 1.6, 0.13));
    return true;
  }

  function stopAll() {
    if (!ctx) return;
    const now = ctx.currentTime;
    live.forEach((n) => {
      try {
        n.env.gain.cancelScheduledValues(now);
        n.env.gain.setTargetAtTime(0.0001, now, 0.03);
        n.o1.stop(now + 0.2);
        n.o2.stop(now + 0.2);
      } catch (e) { /* already stopped */ }
    });
    live.clear();
  }

  root.ChordAudio = {
    supported,
    ensure,
    playChord,
    playLine,
    lead,
    bass,
    stopAll,
    now: () => (ctx ? ctx.currentTime : 0),
  };
})(window);
