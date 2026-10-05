/* Changes: the Sketchpad. Type any chords, see the key and what each chord is doing, hear it, export it. */
(function () {
  'use strict';

  const T = window.Theory;
  const A = window.ChordAudio;
  const C = window.Changes;
  const { esc, fmtNote, chordHTML } = C;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const root = $('#view-sketch');

  const st = C.state.sketch;
  st.chords = Array.isArray(st.chords) ? st.chords.filter((t) => T.parseChord(t)).slice(0, 64) : [];
  st.key = typeof st.key === 'string' ? st.key : 'auto';
  st.bpm = Math.max(50, Math.min(160, Number(st.bpm) || 84));
  st.beats = [1, 2, 4].indexOf(Number(st.beats)) > -1 ? Number(st.beats) : 4;
  st.loop = !!st.loop;
  st.melody = !!st.melody;
  st.harmonies = Math.max(0, Math.min(5, Number(st.harmonies) || 0));

  const ui = { selected: null, playing: false, playingIndex: -1, shape: 0 };

  const EXAMPLES = [
    { name: 'ii, V, I', text: 'Em7 A7 Dmaj7' },
    { name: 'Turnaround', text: 'Cmaj7 Am7 Dm7 G7' },
    { name: 'Pop with a twist', text: 'C E7 Am F' },
    { name: 'Backdoor', text: 'C Fm Bb7 C' },
    { name: 'Minor blues turn', text: 'Am7 D9 Fmaj7 E7' },
  ];

  const ROLE_TEXT = {
    diatonic: 'In the key',
    secondary: 'Secondary dominant',
    borrowed: 'Borrowed',
    chromatic: 'Chromatic',
  };

  root.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Sketchpad</h1>
        <p class="view-sub">Type any chords in any order. Changes works out the key and tells you what each chord is doing.</p>
      </div>
    </div>

    <main class="layout">
      <div class="col-main">
        <section class="card" aria-labelledby="skTitle">
          <div class="card-head">
            <h2 class="card-title" id="skTitle">Your chords</h2>
            <div class="prog-tools">
              <button class="btn btn-quiet" id="skUndo" type="button">Undo</button>
              <button class="btn btn-quiet" id="skClear" type="button">Clear</button>
            </div>
          </div>

          <form class="sk-entry" id="skForm" autocomplete="off">
            <label class="sr-only" for="skInput">Type chords</label>
            <input id="skInput" type="text" spellcheck="false" placeholder="Type chords, like Em A7 Dmaj7 G/B">
            <button class="btn btn-primary" type="submit">Add</button>
          </form>
          <p class="sk-hint" id="skHint">Names like C, Cm, C7, Cmaj7, Cm7, Cm7b5, Cdim7, Csus4, C6, Cadd9, C9, C13 and slash chords like G/B. Separate with spaces.</p>

          <div class="sk-builder" aria-label="Or build a chord">
            <span class="eyebrow">Or pick one</span>
            <select id="skRoot" aria-label="Root">
              ${['C', 'C♯', 'D♭', 'D', 'D♯', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'G♯', 'A♭', 'A', 'A♯', 'B♭', 'B'].map((n) => '<option>' + n + '</option>').join('')}
            </select>
            <select id="skType" aria-label="Chord type">
              ${T.CHORD_TYPES.map((t) => '<option value="' + esc(t.aliases[0]) + '">' + esc((t.sym || 'major') + ' · ' + t.name) + '</option>').join('')}
            </select>
            <button class="btn" id="skAddPick" type="button">Add</button>
          </div>

          <div class="sk-key">
            <span class="sk-key-now" id="skKeyNow"></span>
            <label class="field">
              <span class="field-label">Key</span>
              <select id="skKey"></select>
            </label>
          </div>

          <ol class="prog" id="skProg" aria-label="Chords in order"></ol>
          <ul class="legend sk-legend" id="skLegend">
            <li><span class="lg-chip is-diatonic"></span>in the key</li>
            <li><span class="lg-chip is-secondary"></span>secondary dominant</li>
            <li><span class="lg-chip is-borrowed"></span>borrowed</li>
            <li><span class="lg-chip is-chromatic"></span>chromatic</li>
          </ul>

          <div class="prog-empty" id="skEmpty">
            <p class="empty-title">Start with any chord.</p>
            <p class="empty-copy">Type a few chords above, or try one of these:</p>
            <div class="examples" id="skExamples"></div>
          </div>

          <div class="transport" id="skTransport">
            <button class="btn btn-primary" id="skPlay" type="button" aria-pressed="false">
              <svg class="icon icon-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8 L13 8 L4.5 13.2 Z" fill="currentColor"/></svg>
              <svg class="icon icon-stop" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor"/></svg>
              <span class="play-label">Play</span>
            </button>
            <label class="field field-tempo">
              <span class="field-label">Tempo <output id="skTempoOut"></output></span>
              <input type="range" id="skTempo" min="50" max="160" step="2">
            </label>
            <label class="field">
              <span class="field-label">Beats per chord</span>
              <select id="skBeats"><option value="1">1</option><option value="2">2</option><option value="4">4</option></select>
            </label>
            <button class="toggle toggle-small" id="skLoop" aria-pressed="false"><span class="toggle-dot" aria-hidden="true"></span>Loop</button>
            <button class="toggle toggle-small" id="skMelody" aria-pressed="false"><span class="toggle-dot" aria-hidden="true"></span>Melody</button>
            <label class="field field-harm">
              <span class="field-label">Harmonies</span>
              <select id="skHarm">
                <option value="0">None</option><option value="1">1 voice</option><option value="2">2 voices</option>
                <option value="3">3 voices</option><option value="4">4 voices</option><option value="5">5 voices</option>
              </select>
            </label>
            <span class="transport-spacer"></span>
            <button class="btn" id="skMidi" type="button">
              <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 V10.5 M4.5 7 L8 10.5 L11.5 7 M3 13.5 H13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Export MIDI
            </button>
            <button class="btn" id="skShare" type="button">Copy link</button>
          </div>
        </section>
      </div>

      <aside class="col-side">
        <section class="card detail" aria-live="polite">
          <div class="detail-empty" id="skDetailEmpty">
            <p class="empty-title">Tap a chord.</p>
            <p class="empty-copy">You'll see what it's doing in the key, how to play it, and a scale to play over it.</p>
          </div>
          <div class="detail-body" id="skDetail" hidden></div>
        </section>
      </aside>
    </main>
  `;

  // ---------- model ----------

  const chords = () => st.chords.map((t) => T.parseChord(t));
  const ALL_KEYS = ['major', 'minor'].reduce((acc, m) => acc.concat(T.KEY_NAMES[m].map((k) => ({ tonic: k, mode: m }))), []);
  const keyId = (k) => k.tonic + '|' + k.mode;

  function currentKey() {
    if (st.key !== 'auto') {
      const [tonic, mode] = st.key.split('|');
      if (T.KEY_NAMES[mode] && T.KEY_NAMES[mode].indexOf(tonic) > -1) return { tonic, mode, auto: false };
    }
    const k = T.detectKey(chords());
    return { tonic: k.tonic, mode: k.mode, auto: true };
  }

  // ---------- entry ----------

  const input = $('#skInput', root);
  const hint = $('#skHint', root);
  const HINT = hint.textContent;

  function addSymbols(list) {
    stop();
    st.chords = st.chords.concat(list).slice(0, 64);
    C.persist();
    ui.selected = st.chords.length - 1;
    ui.shape = 0;
    render();
    const c = T.parseChord(st.chords[st.chords.length - 1]);
    A.playChord(T.voiceChord(c.pcs, c.bass.pc, null), 0, 1.4);
  }

  $('#skForm', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const res = T.parseChords(input.value);
    if (res.bad.length) {
      hint.innerHTML = '<span class="sk-bad">Did not recognize ' + esc(res.bad.join(', ')) + '.</span> ' + esc(HINT);
      input.setAttribute('aria-invalid', 'true');
    } else {
      hint.textContent = HINT;
      input.removeAttribute('aria-invalid');
    }
    if (!res.chords.length) return;
    addSymbols(res.chords.map((c) => c.symbol));
    input.value = res.bad.join(' ');
  });

  $('#skAddPick', root).addEventListener('click', () => {
    const c = T.parseChord($('#skRoot', root).value + $('#skType', root).value);
    if (c) addSymbols([c.symbol]);
  });

  // ---------- render ----------

  const progEl = $('#skProg', root);

  function renderKey() {
    const k = currentKey();
    const sel = $('#skKey', root);
    const auto = T.detectKey(chords());
    sel.innerHTML = '<option value="auto">Auto (' + esc(auto.tonic + ' ' + auto.mode) + ')</option>' +
      ALL_KEYS.map((x) => '<option value="' + esc(keyId(x)) + '">' + esc(x.tonic + ' ' + x.mode) + '</option>').join('');
    sel.value = st.key;
    $('#skKeyNow', root).innerHTML = st.chords.length
      ? (k.auto ? 'Sounds like ' : 'In ') + '<b>' + fmtNote(k.tonic + ' ' + k.mode) + '</b>'
      : '';
  }

  function renderProg() {
    const list = chords();
    const k = currentKey();
    progEl.innerHTML = list.map((c, i) => {
      const a = T.analyzeChord(c, k);
      const cls = ['chip', 'sk-chip', 'is-' + a.role];
      if (ui.selected === i) cls.push('is-selected');
      if (ui.playing && ui.playingIndex === i) cls.push('is-sounding');
      return '<li class="chip-wrap">' +
        '<button type="button" class="' + cls.join(' ') + '" data-index="' + i + '" aria-label="' + esc((i + 1) + '. ' + c.symbol + ', ' + a.numeral + ', ' + ROLE_TEXT[a.role]) + '">' +
          '<span class="chip-name">' + chordHTML(c) + '</span>' +
          '<span class="chip-num">' + fmtNote(a.numeral) + '</span>' +
        '</button>' +
        '<button type="button" class="chip-x" data-remove="' + i + '" aria-label="Remove ' + esc(c.symbol) + '">' +
          '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</li>';
    }).join('');
    const empty = !list.length;
    $('#skEmpty', root).hidden = !empty;
    progEl.hidden = empty;
    $('#skLegend', root).hidden = empty;
    $('.sk-key', root).hidden = empty;
    $('#skTransport', root).classList.toggle('is-empty', empty);
    ['#skUndo', '#skClear', '#skPlay', '#skMidi', '#skShare'].forEach((s) => { $(s, root).disabled = empty; });
    if (empty) {
      $('#skExamples', root).innerHTML = EXAMPLES.map((ex, i) =>
        '<button type="button" class="example" data-ex="' + i + '"><span class="example-name">' + esc(ex.name) + '</span>' +
        '<span class="example-chords">' + fmtNote(ex.text.replace(/b(?=\d|m|\s|$)/g, '♭').replace(/#/g, '♯')) + '</span></button>').join('');
    }
  }

  function renderDetail(fromPlayback) {
    const body = $('#skDetail', root);
    const empty = $('#skDetailEmpty', root);
    const list = chords();
    if (ui.selected == null || !list[ui.selected]) {
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    const c = list[ui.selected];
    const k = currentKey();
    const a = T.analyzeChord(c, k);
    const sc = T.freeScale(c, k);
    const v = T.voiceProgression(list.slice(0, ui.selected + 1))[ui.selected];
    const inst = C.state.instrument;
    const shapes = inst === 'piano' ? [] : T.fretVoicings(c.pcs, c.bass.pc, inst);
    if (ui.shape >= shapes.length) ui.shape = 0;
    empty.hidden = true;
    body.hidden = false;
    body.innerHTML =
      '<div class="detail-head"><div>' +
        '<p class="eyebrow">' + esc(ROLE_TEXT[a.role]) + ' · ' + fmtNote(a.numeral) + ' in ' + fmtNote(k.tonic + ' ' + k.mode) + '</p>' +
        '<p class="detail-chord">' + chordHTML(c) + '</p>' +
        '<p class="detail-quality">' + esc(c.qualityName) + (c.slash ? ', ' + fmtNote(c.bass.name) + ' in the bass' : '') + '</p>' +
      '</div>' +
      '<button type="button" class="btn btn-round" data-hear aria-label="Hear ' + esc(c.symbol) + '">' +
        '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8 L13 8 L4.5 13.2 Z" fill="currentColor"/></svg>' +
      '</button></div>' +
      '<p class="detail-desc">' + fmtNote(a.text) + '</p>' +
      '<ul class="notes" aria-label="Notes">' + c.tones.map((t) => '<li>' + fmtNote(t.name) + '</li>').join('') + '</ul>' +
      C.shapeSection(c, v, shapes, ui.shape) +
      C.scaleSection(sc, c);
    if (!fromPlayback) {
      body.classList.remove('is-fresh');
      void body.offsetWidth; // restart the fade-in
      body.classList.add('is-fresh');
    }
  }

  function renderTransport() {
    $('#skTempo', root).value = st.bpm;
    $('#skTempoOut', root).textContent = st.bpm;
    $('#skBeats', root).value = String(st.beats);
    $('#skLoop', root).setAttribute('aria-pressed', String(st.loop));
    $('#skMelody', root).setAttribute('aria-pressed', String(st.melody));
    const harm = $('#skHarm', root);
    harm.value = String(st.harmonies);
    harm.disabled = !st.melody;
    harm.closest('.field').classList.toggle('is-off', !st.melody);
  }

  function render() {
    renderKey();
    renderProg();
    renderDetail();
    renderTransport();
  }

  // ---------- interactions ----------

  $('#skKey', root).addEventListener('change', (e) => {
    st.key = e.target.value;
    C.persist();
    render();
  });

  $('#skExamples', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    st.chords = T.parseChords(EXAMPLES[Number(b.dataset.ex)].text).chords.map((c) => c.symbol);
    st.key = 'auto';
    ui.selected = null;
    C.persist();
    render();
    play();
  });

  progEl.addEventListener('click', (e) => {
    const x = e.target.closest('.chip-x');
    if (x) {
      const i = Number(x.dataset.remove);
      stop();
      const removed = st.chords.splice(i, 1)[0];
      if (ui.selected === i) ui.selected = null;
      else if (ui.selected > i) ui.selected--;
      C.persist();
      render();
      C.toast('Removed ' + T.parseChord(removed).symbol + '.', 'Undo', () => {
        st.chords.splice(i, 0, removed);
        C.persist();
        render();
      });
      return;
    }
    const chip = e.target.closest('.chip');
    if (!chip) return;
    ui.selected = Number(chip.dataset.index);
    ui.shape = 0;
    if (!ui.playing) {
      const v = T.voiceProgression(chords().slice(0, ui.selected + 1))[ui.selected];
      A.playChord(v, 0, 1.6);
    }
    renderProg();
    renderDetail();
  });

  $('#skDetail', root).addEventListener('click', (e) => {
    const list = chords();
    const c = list[ui.selected];
    if (!c) return;
    if (e.target.closest('[data-hear]')) {
      A.playChord(T.voiceProgression(list.slice(0, ui.selected + 1))[ui.selected], 0, 1.6);
      return;
    }
    if (e.target.closest('[data-hear-scale]')) {
      C.playScale(T.freeScale(c, currentKey()));
      return;
    }
    const s = e.target.closest('[data-shape]');
    if (s) {
      const n = T.fretVoicings(c.pcs, c.bass.pc, C.state.instrument).length;
      ui.shape = (ui.shape + Number(s.dataset.shape) + n) % n;
      renderDetail(true);
      $('[data-shape="' + s.dataset.shape + '"]', root).focus();
    }
  });

  $('#skUndo', root).addEventListener('click', () => {
    if (!st.chords.length) return;
    stop();
    st.chords.pop();
    if (ui.selected != null && ui.selected >= st.chords.length) ui.selected = null;
    C.persist();
    render();
  });

  $('#skClear', root).addEventListener('click', () => {
    if (!st.chords.length) return;
    stop();
    const before = st.chords.slice();
    st.chords = [];
    ui.selected = null;
    C.persist();
    render();
    C.toast('Cleared.', 'Undo', () => { st.chords = before; C.persist(); render(); });
  });

  // ---------- playback ----------

  const playBtn = $('#skPlay', root);
  let timers = [];
  let token = 0;

  function melodyParts() {
    const list = chords();
    const k = currentKey();
    const segs = list.map((c) => {
      const sc = T.freeScale(c, k);
      return { scalePcs: sc.pcs, chordPcs: c.pcs, beats: st.beats };
    });
    let seed = 97 + T.parseKey(k.tonic).pc;
    st.chords.join(' ').split('').forEach((ch) => { seed = (seed * 33 + ch.charCodeAt(0)) >>> 0; });
    const line = T.melody(segs, seed);
    return { line, voices: T.harmonyVoices(line, segs, st.harmonies) };
  }

  function play() {
    const list = chords();
    if (!list.length) return;
    const ctx = A.ensure();
    if (!ctx) return;
    stop();
    ui.playing = true;
    const my = ++token;
    playBtn.setAttribute('aria-pressed', 'true');
    $('.play-label', playBtn).textContent = 'Stop';
    pass(ctx, ctx.currentTime + 0.08, my, T.voiceProgression(list));
  }

  function pass(ctx, t0, my, voicings) {
    const spb = 60 / st.bpm;
    const dur = spb * st.beats;
    if (st.melody) {
      const parts = melodyParts();
      parts.line.forEach((n) => A.lead(n.midi, t0 + n.beat * spb, n.dur * spb));
      parts.voices.forEach((v, k) => v.forEach((n) => A.lead(n.midi, t0 + n.beat * spb, n.dur * spb, 0.07 - k * 0.008)));
    }
    voicings.forEach((v, i) => {
      const at = t0 + i * dur;
      A.playChord(v, at, dur * 0.96, { strum: st.beats === 1 ? 0.008 : 0.02 });
      timers.push(setTimeout(() => { if (my === token) mark(i); }, Math.max(0, (at - ctx.currentTime) * 1000)));
    });
    const end = t0 + voicings.length * dur;
    timers.push(setTimeout(() => {
      if (my !== token) return;
      if (st.loop) pass(ctx, end, my, voicings);
      else timers.push(setTimeout(() => { if (my === token) stop(); }, 150));
    }, Math.max(0, (end - ctx.currentTime) * 1000 - 120)));
  }

  function mark(i) {
    ui.playingIndex = i;
    ui.selected = i;
    progEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-sounding', Number(c.dataset.index) === i));
    renderDetail(true);
  }

  function stop() {
    token++;
    timers.forEach(clearTimeout);
    timers = [];
    if (ui.playing) A.stopAll();
    ui.playing = false;
    ui.playingIndex = -1;
    playBtn.setAttribute('aria-pressed', 'false');
    $('.play-label', playBtn).textContent = 'Play';
    progEl.querySelectorAll('.chip.is-sounding').forEach((c) => c.classList.remove('is-sounding'));
  }

  playBtn.addEventListener('click', () => (ui.playing ? stop() : play()));

  $('#skTempo', root).addEventListener('input', (e) => { st.bpm = Number(e.target.value); $('#skTempoOut', root).textContent = st.bpm; });
  $('#skTempo', root).addEventListener('change', () => { C.persist(); if (ui.playing) play(); });
  $('#skBeats', root).addEventListener('change', (e) => { st.beats = Number(e.target.value); C.persist(); if (ui.playing) play(); });
  $('#skLoop', root).addEventListener('click', () => { st.loop = !st.loop; C.persist(); renderTransport(); });
  $('#skMelody', root).addEventListener('click', () => { st.melody = !st.melody; C.persist(); renderTransport(); if (ui.playing) play(); });
  $('#skHarm', root).addEventListener('change', (e) => { st.harmonies = Number(e.target.value); C.persist(); if (ui.playing) play(); });

  // ---------- export and share ----------

  $('#skMidi', root).addEventListener('click', () => {
    const list = chords();
    if (!list.length) return;
    const k = currentKey();
    C.exportParts({
      slug: 'changes-sketch-' + k.tonic.replace('♯', '-sharp').replace('♭', '-flat').toLowerCase() + '-' + k.mode,
      title: k.tonic + ' ' + k.mode + ': ' + list.map((c) => c.symbol).join(' '),
      bpm: st.bpm, beats: st.beats, chords: list,
      parts: st.melody ? melodyParts() : null,
    });
  });

  $('#skShare', root).addEventListener('click', () => {
    // Plain ASCII symbols keep the link readable: #sketch=Em,A7,Dmaj7
    const ascii = st.chords.map((t) => t.replace(/♯/g, '#').replace(/♭/g, 'b'));
    const url = location.href.split('#')[0].split('?')[0] + '#sketch=' + ascii.map(encodeURIComponent).join(',');
    const done = () => C.toast('Link copied. Anyone who opens it gets these chords in the Sketchpad.');
    const fallback = () => { history.replaceState(null, '', '#sketch=' + ascii.join(',')); C.toast('Copy the link from the address bar.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback);
    else fallback();
  });

  // ---------- wiring ----------

  C.onInstrument(() => { ui.shape = 0; renderDetail(true); });
  C.registerView('sketch', {
    show() {
      // A shared link may have replaced the chords since this view was built.
      st.chords = (C.state.sketch.chords || []).filter((t) => T.parseChord(t));
      render();
    },
    stop,
  });
})();
