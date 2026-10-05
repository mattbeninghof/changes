/* Changes: the Blues view. Twelve bars, the major and minor blues scales, and target notes. */
(function () {
  'use strict';

  const T = window.Theory;
  const A = window.ChordAudio;
  const I = window.Instruments;
  const C = window.Changes;
  const { esc, fmtNote, chordHTML } = C;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const root = $('#view-blues');

  const st = C.state.blues;
  st.type = st.type === 'minor' ? 'minor' : 'major';
  st.keys = Object.assign({ major: 'E', minor: 'A' }, st.keys || {});
  ['major', 'minor'].forEach((m) => { if (T.KEY_NAMES[m].indexOf(st.keys[m]) < 0) st.keys[m] = m === 'major' ? 'E' : 'A'; });
  st.bpm = Math.max(60, Math.min(180, Number(st.bpm) || 96));
  st.melody = !!st.melody;
  st.mix = !!st.mix;

  const ui = { selected: null, playing: false, bar: -1 };
  const def = () => T.BLUES[st.type];
  const key = () => st.keys[st.type];
  const chord = (id) => T.realizeBlues(st.type, key(), id);

  root.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Blues</h1>
        <p class="view-sub">Twelve bars, two scales, and the notes worth aiming for.</p>
      </div>
      <div class="mode" role="radiogroup" aria-label="Blues type" id="bluesType">
        <button class="mode-btn" role="radio" data-type="major"><span class="mode-name">Major</span><span class="mode-sub">shuffle</span></button>
        <button class="mode-btn" role="radio" data-type="minor"><span class="mode-name">Minor</span><span class="mode-sub">slow burn</span></button>
      </div>
    </div>

    <section class="controls" aria-label="Key">
      <div class="keybar">
        <div class="keybar-head"><span class="eyebrow">Set the key</span><span class="key-now" id="bluesKeyNow"></span></div>
        <div class="keystrip" id="bluesKeys" role="radiogroup" aria-label="Key"></div>
      </div>
    </section>

    <section class="card" aria-labelledby="barsTitle">
      <div class="card-head">
        <h2 class="card-title" id="barsTitle">The twelve bars</h2>
        <p class="card-note">Tap a bar to hear it and see what to aim for.</p>
      </div>
      <ol class="bars" id="bars"></ol>
      <div class="transport">
        <button class="btn btn-primary" id="bluesPlay" type="button" aria-pressed="false">
          <svg class="icon icon-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8 L13 8 L4.5 13.2 Z" fill="currentColor"/></svg>
          <svg class="icon icon-stop" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor"/></svg>
          <span class="play-label">Play the shuffle</span>
        </button>
        <label class="field field-tempo">
          <span class="field-label">Tempo <output id="bluesTempoOut"></output></span>
          <input type="range" id="bluesTempo" min="60" max="180" step="2">
        </label>
        <button class="toggle toggle-small" id="bluesMelody" aria-pressed="false"><span class="toggle-dot" aria-hidden="true"></span>Improvise a solo</button>
        <span class="transport-spacer"></span>
        <button class="btn" id="bluesMidi" type="button">
          <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 V10.5 M4.5 7 L8 10.5 L11.5 7 M3 13.5 H13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Export MIDI
        </button>
      </div>
    </section>

    <div class="grid-2">
      <section class="card" aria-labelledby="bScalesTitle">
        <div class="card-head">
          <h2 class="card-title" id="bScalesTitle">Scales</h2>
          <button class="toggle toggle-small" id="bluesMix" aria-pressed="false"><span class="toggle-dot" aria-hidden="true"></span>Mix major and minor</button>
        </div>
        <div id="bluesScales"></div>
      </section>

      <section class="card" aria-labelledby="targetsTitle">
        <div class="card-head">
          <h2 class="card-title" id="targetsTitle">Target notes</h2>
        </div>
        <p class="card-copy">Land on these when the chord changes. The 3rd and ♭7 say the most about each chord.</p>
        <div id="bluesTargets"></div>
      </section>
    </div>
  `;

  // ---------- header ----------

  const typeSwitch = $('#bluesType', root);
  const strip = $('#bluesKeys', root);

  function renderType() {
    typeSwitch.querySelectorAll('.mode-btn').forEach((b) => {
      const on = b.dataset.type === st.type;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  typeSwitch.addEventListener('click', (e) => {
    const b = e.target.closest('.mode-btn');
    if (!b || b.dataset.type === st.type) return;
    stop();
    st.type = b.dataset.type;
    ui.selected = null;
    C.persist();
    render();
  });

  function renderKeys() {
    strip.innerHTML = C.stripHTML(T.KEY_NAMES[st.type], key(), st.type + ' blues');
    $('#bluesKeyNow', root).innerHTML = fmtNote(key()) + ' ' + esc(def().label.toLowerCase());
    C.placeMarker(strip);
  }

  C.bindStrip(strip, () => T.KEY_NAMES[st.type], key, (k) => {
    if (k === key()) return;
    const was = ui.playing;
    stop();
    st.keys[st.type] = k;
    C.persist();
    render();
    if (was) play();
  });

  // ---------- bars ----------

  const barsEl = $('#bars', root);

  function scaleName(id) {
    return T.SCALES[def().scaleFor[id]].name.toLowerCase();
  }

  function renderBars() {
    const inst = C.state.instrument;
    barsEl.innerHTML = def().bars.map((id, i) => {
      const r = chord(id);
      let shape = '';
      if (inst !== 'piano') {
        const v = T.fretVoicings(r.pcs, r.root.pc, inst)[0];
        if (v) shape = I.chordBox(v, r.root.pc, null, inst, true);
      } else {
        shape = '<span class="bar-notes">' + fmtNote(r.tones.map((t) => t.name).join(' ')) + '</span>';
      }
      const cls = ['bar', 'bar--' + id];
      if (ui.selected === i) cls.push('is-selected');
      if (ui.bar === i) cls.push('is-sounding');
      return '<li><button type="button" class="' + cls.join(' ') + '" data-bar="' + i + '" aria-label="Bar ' + (i + 1) + ': ' + esc(r.symbol) + '">' +
        '<span class="bar-n">' + (i + 1) + '</span>' +
        '<span class="bar-chord">' + chordHTML(r) + '</span>' +
        '<span class="bar-num">' + esc(r.num) + '</span>' +
        '<span class="bar-shape">' + shape + '</span>' +
        '<span class="bar-scale scale--' + def().scaleFor[id] + '">' + esc(scaleName(id)) + '</span>' +
        '</button></li>';
    }).join('');
  }

  barsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.bar');
    if (!b) return;
    const i = Number(b.dataset.bar);
    ui.selected = i;
    const id = def().bars[i];
    const r = chord(id);
    A.playChord(T.voiceChord(r.pcs, r.root.pc, null), 0, 1.4);
    renderBars();
    renderTargets();
    renderScales();
  });

  // ---------- scales ----------

  function scaleDiagram(sc, markFn) {
    const inst = C.state.instrument;
    if (inst === 'piano') {
      return I.keyboard({ lo: 48, hi: 71, label: sc.name, mark: (m) => markFn(T.mod(m, 12)) });
    }
    return I.fretboard({ instrument: inst, from: 0, to: 12, label: sc.name, mark: (s, f, m) => markFn(T.mod(m, 12)) });
  }

  function pureMark(sc) {
    return (pc) => {
      const i = sc.pcs.indexOf(pc);
      if (i < 0) return null;
      const role = pc === sc.root.pc ? 'root' : sc.blue.has(pc) ? 'blue' : 'tone';
      return { role, label: sc.degrees[i] };
    };
  }

  function renderScales() {
    const tonic = T.parseKey(key());
    const el = $('#bluesScales', root);
    const selId = ui.selected != null ? def().bars[ui.selected] : null;
    const mixBtn = $('#bluesMix', root);
    mixBtn.hidden = st.type !== 'major';
    mixBtn.setAttribute('aria-pressed', String(st.mix));

    if (st.type === 'major' && st.mix) {
      const maj = T.buildScale(tonic, 'majBlues');
      const min = T.buildScale(tonic, 'minBlues');
      const label = (pc) => { const i = maj.pcs.indexOf(pc); return i > -1 ? maj.degrees[i] : min.degrees[min.pcs.indexOf(pc)]; };
      const mark = (pc) => {
        const inMaj = maj.pcs.indexOf(pc) > -1;
        const inMin = min.pcs.indexOf(pc) > -1;
        if (!inMaj && !inMin) return null;
        if (pc === tonic.pc) return { role: 'root', label: '1' };
        return { role: inMaj && inMin ? 'tone' : inMaj ? 'scale' : 'blue', label: label(pc) };
      };
      el.innerHTML = '<div class="scale-block"><p class="scale-name">' + fmtNote(tonic.name) + ' major + minor blues</p>' +
        '<p class="scale-why">Blend them: major colour over I, minor bite over IV and V, and slide between the two thirds.</p>' +
        scaleDiagram({ name: 'Mixed blues scales' }, mark) +
        I.legend([{ role: 'root', text: 'root' }, { role: 'tone', text: 'in both' }, { role: 'scale', text: 'major blues only' }, { role: 'blue', text: 'minor blues only' }]) +
        '</div>';
      return;
    }

    const blocks = st.type === 'major'
      ? [{ id: 'majBlues', use: 'Use on I', on: ['I'] }, { id: 'minBlues', use: 'Use on IV and V', on: ['IV', 'V'] }]
      : [{ id: 'minBlues', use: 'Use on every chord', on: ['i', 'iv', 'bVI', 'V'] }];
    el.innerHTML = blocks.map((b) => {
      const sc = T.buildScale(tonic, b.id);
      const active = selId && b.on.indexOf(selId) > -1;
      return '<div class="scale-block' + (active ? ' is-active' : '') + '">' +
        '<div class="inst-head"><p class="scale-name">' + fmtNote(sc.name) + '</p>' +
        '<button type="button" class="btn btn-quiet btn-small" data-hear="' + b.id + '">Hear it</button></div>' +
        '<p class="scale-why"><span class="use-chip">' + esc(b.use) + '</span> ' + fmtNote(sc.notes.map((n) => n.name).join(' ')) + '</p>' +
        scaleDiagram(sc, pureMark(sc)) + '</div>';
    }).join('') + I.legend([{ role: 'root', text: 'root' }, { role: 'tone', text: 'scale degree' }, { role: 'blue', text: 'blue note' }]);
  }

  $('#bluesScales', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-hear]');
    if (!b) return;
    const sc = T.buildScale(T.parseKey(key()), b.dataset.hear);
    const start = 57 + T.mod(sc.root.pc - 9, 12);
    const line = sc.pcs.map((pc) => start + T.mod(pc - sc.root.pc, 12));
    line.push(start + 12);
    A.playLine(line.concat(line.slice(0, -1).reverse()), 0.18);
  });

  $('#bluesMix', root).addEventListener('click', () => {
    st.mix = !st.mix;
    C.persist();
    renderScales();
  });

  // ---------- target notes ----------

  function renderTargets() {
    const selId = ui.selected != null ? def().bars[ui.selected] : null;
    $('#bluesTargets', root).innerHTML = def().targets.map((id) => {
      const r = chord(id);
      const mark = (pc) => {
        const i = r.pcs.indexOf(pc);
        if (i < 0) return null;
        return { role: i === 0 ? 'root' : (i === 1 || i === 3) ? 'blue' : 'tone', label: r.toneLabels[i] };
      };
      return '<div class="scale-block' + (selId === id ? ' is-active' : '') + '">' +
        '<p class="scale-name">' + chordHTML(r) + ' <span class="muted">' + esc(r.num) + '</span></p>' +
        '<p class="scale-why">' + fmtNote(r.tones.map((t, i) => r.toneLabels[i] + ' ' + t.name).join(' · ')) + '</p>' +
        scaleDiagram({ name: r.symbol + ' arpeggio' }, mark) + '</div>';
    }).join('') + I.legend([{ role: 'root', text: 'root' }, { role: 'blue', text: '3rd and ♭7 (aim here)' }, { role: 'tone', text: '5th' }]);
  }

  // ---------- playback: shuffle comp, boogie bass, optional solo ----------

  const playBtn = $('#bluesPlay', root);
  let timers = [];
  let token = 0;
  const swing = (beat) => {
    const whole = Math.floor(beat + 1e-6);
    const frac = beat - whole;
    return whole + (Math.abs(frac - 0.5) < 1e-6 ? 2 / 3 : frac);
  };

  function play() {
    const ctx = A.ensure();
    if (!ctx) return;
    stop();
    ui.playing = true;
    const my = ++token;
    playBtn.setAttribute('aria-pressed', 'true');
    $('.play-label', playBtn).textContent = 'Stop';
    pass(ctx, ctx.currentTime + 0.1, my);
  }

  // One chorus of the band, in beats with the swing already applied. Playback and MIDI export
  // both read from this, so the files match what you hear. Each chorus gets its own solo.
  function arrangement(chorus) {
    const bars = def().bars;
    const comp = [];
    const bass = [];
    let prev = null;
    bars.forEach((id, i) => {
      const r = chord(id);
      const at = i * 4;
      const v = T.voiceChord(r.pcs, r.root.pc, prev);
      prev = v.upper;
      // Comp: stabs on 2 and 4, a ghost on the swung "and" of 4.
      comp.push({ beat: at + 1, dur: 0.45, vel: 0.9, upper: v.upper });
      comp.push({ beat: at + 3, dur: 0.45, vel: 0.9, upper: v.upper });
      comp.push({ beat: at + swing(3.5), dur: 0.2, vel: 0.45, upper: v.upper });
      // Bass: boogie pattern in swung eighths.
      const bassRoot = 40 + T.mod(r.root.pc - 4, 12);
      const pattern = r.quality === 'm7' ? [0, 3, 7, 9, 10, 9, 7, 3] : [0, 4, 7, 9, 10, 9, 7, 4];
      pattern.forEach((semi, k) => bass.push({ midi: bassRoot + semi, beat: at + swing(k / 2), dur: 0.42 }));
    });
    let solo = [];
    if (st.melody) {
      const tonic = T.parseKey(key());
      const segs = bars.map((id) => {
        const sc = T.buildScale(tonic, def().scaleFor[id]);
        return { scalePcs: sc.pcs, chordPcs: chord(id).pcs, beats: 4 };
      });
      solo = T.melody(segs, 11 + tonic.pc + (st.type === 'minor' ? 5 : 0) + chorus * 7)
        .map((n) => ({ midi: n.midi, beat: swing(n.beat), dur: n.dur }));
    }
    return { comp, bass, solo, beats: bars.length * 4 };
  }

  function pass(ctx, t0, my, chorus) {
    chorus = chorus || 0;
    const spb = 60 / st.bpm;
    const arr = arrangement(chorus);
    arr.comp.forEach((c) => A.playChord({ upper: c.upper }, t0 + c.beat * spb, c.dur * spb, { noBass: true, strum: 0.005, vel: c.vel }));
    arr.bass.forEach((n) => A.bass(n.midi, t0 + n.beat * spb, n.dur * spb));
    arr.solo.forEach((n) => A.lead(n.midi, t0 + n.beat * spb, n.dur * spb, 0.1));
    def().bars.forEach((id, i) => {
      const barT = t0 + i * 4 * spb;
      timers.push(setTimeout(() => { if (my === token) mark(i); }, Math.max(0, (barT - ctx.currentTime) * 1000)));
    });
    const end = t0 + arr.beats * spb;
    // The blues loops until you stop it.
    timers.push(setTimeout(() => { if (my === token) pass(ctx, end, my, chorus + 1); }, Math.max(0, (end - ctx.currentTime) * 1000 - 150)));
  }

  // ---------- MIDI export ----------

  function exportMidi() {
    const M = window.MidiFile;
    const arr = arrangement(0);
    const slug = 'changes-' + key().replace('♯', '-sharp').replace('♭', '-flat').toLowerCase() + '-' + st.type + '-blues';
    const title = key() + ' ' + def().label.toLowerCase() + ', 12 bars';
    const chords = [];
    arr.comp.forEach((c) => c.upper.forEach((m) => chords.push({ midi: m, beat: c.beat, dur: c.dur, vel: Math.round(c.vel * 88) })));
    C.download(M.write({ bpm: st.bpm, title, tracks: [
      { name: 'Chords', channel: 0, program: 4, notes: chords },
      { name: 'Bass', channel: 1, program: 33, notes: arr.bass.map((n) => Object.assign({ vel: 96 }, n)) },
    ] }), slug + '.mid');
    if (!st.melody) {
      C.toast('Exported the 12 bars. Turn on Improvise a solo to export a solo file too.');
      return;
    }
    setTimeout(() => C.download(M.write({ bpm: st.bpm, title: title + ' (solo)', tracks: [
      { name: 'Solo', channel: 2, program: 0, notes: arr.solo.map((n) => Object.assign({ vel: 96 }, n)) },
    ] }), slug + '-solo.mid'), 400);
    C.toast('Exported the band and the solo as two MIDI files. The solo is the first chorus you hear.');
  }

  function mark(i) {
    ui.bar = i;
    barsEl.querySelectorAll('.bar').forEach((b) => b.classList.toggle('is-sounding', Number(b.dataset.bar) === i));
  }

  function stop() {
    token++;
    timers.forEach(clearTimeout);
    timers = [];
    if (ui.playing) A.stopAll();
    ui.playing = false;
    ui.bar = -1;
    playBtn.setAttribute('aria-pressed', 'false');
    $('.play-label', playBtn).textContent = 'Play the shuffle';
    barsEl.querySelectorAll('.bar.is-sounding').forEach((b) => b.classList.remove('is-sounding'));
  }

  playBtn.addEventListener('click', () => (ui.playing ? stop() : play()));
  $('#bluesMidi', root).addEventListener('click', exportMidi);

  const tempo = $('#bluesTempo', root);
  const tempoOut = $('#bluesTempoOut', root);
  tempo.addEventListener('input', () => { st.bpm = Number(tempo.value); tempoOut.textContent = st.bpm; });
  tempo.addEventListener('change', () => { C.persist(); if (ui.playing) play(); });

  const melBtn = $('#bluesMelody', root);
  melBtn.addEventListener('click', () => {
    st.melody = !st.melody;
    melBtn.setAttribute('aria-pressed', String(st.melody));
    C.persist();
    if (ui.playing) play();
  });

  // ---------- wiring ----------

  function render() {
    renderType();
    renderKeys();
    renderBars();
    renderScales();
    renderTargets();
    tempo.value = st.bpm;
    tempoOut.textContent = st.bpm;
    melBtn.setAttribute('aria-pressed', String(st.melody));
  }

  C.onInstrument(() => {
    renderBars();
    renderScales();
    renderTargets();
  });

  C.registerView('blues', {
    show() { render(); },
    stop,
  });
})();
