/* Changes: interface. Depends on theory.js (window.Theory) and audio.js (window.ChordAudio). */
(function () {
  'use strict';

  const T = window.Theory;
  const A = window.ChordAudio;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- storage (per browser, never required) ----------

  const PREFS_KEY = 'changes.prefs.v1';
  const SAVED_KEY = 'changes.saved.v1';
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  // ---------- state ----------

  const stored = readJSON(PREFS_KEY, {}) || {};
  const state = {
    mode: stored.mode === 'minor' ? 'minor' : 'major',
    keys: { major: 'C', minor: 'A' },
    progs: { major: [], minor: [] },
    sevenths: stored.sevenths !== false,
    guided: stored.guided !== false,
    bpm: clamp(Number(stored.bpm) || 84, 50, 160),
    beats: [1, 2, 4].indexOf(Number(stored.beats)) > -1 ? Number(stored.beats) : 4,
    loop: !!stored.loop,
    melody: !!stored.melody,
    harmonies: Math.max(0, Math.min(5, Number(stored.harmonies) || 0)),
    instrument: ['guitar', 'piano', 'ukulele'].indexOf(stored.instrument) > -1 ? stored.instrument : 'guitar',
    view: ['progressions', 'dark', 'blues', 'scales'].indexOf(stored.view) > -1 ? stored.view : 'progressions',
    blues: stored.blues || {},
    scales: stored.scales || {},
  };
  // Progressions is the major-key card, Dark harmony the minor-key card.
  if (state.view === 'progressions') state.mode = 'major';
  if (state.view === 'dark') state.mode = 'minor';
  ['major', 'minor'].forEach((m) => {
    if (stored.keys && T.KEY_NAMES[m].indexOf(stored.keys[m]) > -1) state.keys[m] = stored.keys[m];
    if (stored.progs && Array.isArray(stored.progs[m])) {
      state.progs[m] = stored.progs[m].filter((id) => T.MODES[m].byId[id]).slice(0, 64);
    }
  });

  const ui = {
    selected: null,   // { id, index } index is set when picked from the progression
    hover: null,      // chord id under the pointer or keyboard focus
    playingIndex: -1,
    playing: false,
    shape: 0,         // guitar voicing index
  };

  let saved = readJSON(SAVED_KEY, []);
  if (!Array.isArray(saved)) saved = [];

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function persist() {
    writeJSON(PREFS_KEY, {
      mode: state.mode, keys: state.keys, progs: state.progs,
      sevenths: state.sevenths, guided: state.guided,
      bpm: state.bpm, beats: state.beats, loop: state.loop, melody: state.melody, harmonies: state.harmonies,
      instrument: state.instrument, view: state.view, blues: state.blues, scales: state.scales,
    });
  }

  const mode = () => T.MODES[state.mode];
  const key = () => state.keys[state.mode];
  const prog = () => state.progs[state.mode];
  const realize = (id) => T.realize(state.mode, key(), id, state.sevenths);
  const lastId = () => { const p = prog(); return p.length ? p[p.length - 1] : null; };
  const legalNext = () => new Set(state.guided ? T.nextOptions(state.mode, lastId()) : mode().chords.map((c) => c.id));

  // ---------- formatting ----------

  const fmtNote = (name) => esc(name).replace(/([♯♭])/g, '<span class="acc">$1</span>');

  function chordHTML(r) {
    return '<span class="cn-root">' + fmtNote(r.root.name) + '</span>' +
      (r.sym ? '<span class="cn-q">' + esc(r.sym) + '</span>' : '') +
      (r.slash ? '<span class="cn-bass">/' + fmtNote(r.bass.name) + '</span>' : '');
  }

  function targetLabel(def) {
    const m = mode();
    const mains = def.to.filter((id) => m.byId[id].group === 'main');
    return mains.map((id) => m.byId[id].num).join(' · ');
  }

  const isBorrowed = (id) => !!id && mode().byId[id] && mode().byId[id].group !== 'main';

  // ---------- header: mode + keys + toggles ----------

  const keyStrip = $('#keyStrip');
  const keyNow = $('#keyNow');
  const optSevenths = $('#optSevenths');
  const optGuided = $('#optGuided');

  const MODE_COPY = {
    major: { title: 'Progressions', sub: 'Major keys. Start in the middle row, then step up to secondary dominants or down to borrowed chords.' },
    minor: { title: 'Dark harmony', sub: 'Minor keys. Harmonic-minor chords, secondary diminished chords and the Neapolitan sixth.' },
  };

  function renderMode() {
    $('#progTitleMain').textContent = MODE_COPY[state.mode].title;
    $('#progSub').textContent = MODE_COPY[state.mode].sub;
    document.documentElement.dataset.mode = state.mode;
  }

  // A key strip is a row of radio buttons with a sliding amber marker. Every view uses one.
  function stripHTML(names, cur, suffix) {
    return names.map((k) => {
      const on = k === cur;
      return '<button class="key" role="radio" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) +
        '" data-key="' + esc(k) + '" aria-label="' + esc(k + (suffix ? ' ' + suffix : '')) + '">' + fmtNote(k) + '</button>';
    }).join('') + '<span class="key-marker" aria-hidden="true"></span>';
  }

  function placeMarker(strip) {
    const marker = $('.key-marker', strip);
    const on = $('[aria-checked="true"]', strip);
    if (!marker || !on || !strip.offsetWidth) return;
    marker.style.width = on.offsetWidth + 'px';
    marker.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    // Slide only after the first placement, so the page never loads mid-animation.
    if (!strip.classList.contains('is-ready')) requestAnimationFrame(() => strip.classList.add('is-ready'));
  }

  // Click and arrow-key handling for a strip. getNames/getCur are read live; set(name) applies a pick.
  function bindStrip(strip, getNames, getCur, set) {
    strip.addEventListener('click', (e) => {
      const b = e.target.closest('.key');
      if (b) set(b.dataset.key);
    });
    strip.addEventListener('keydown', (e) => {
      const names = getNames();
      const i = names.indexOf(getCur());
      const n = names.length;
      let j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') j = (i + 1) % n;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') j = (i + n - 1) % n;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = n - 1;
      if (j === null) return;
      e.preventDefault();
      set(names[j]);
      const on = $('[aria-checked="true"]', strip);
      if (on) on.focus();
    });
  }

  function renderKeys() {
    const names = T.KEY_NAMES[state.mode];
    keyStrip.innerHTML = stripHTML(names, key(), state.mode);
    const other = state.mode === 'major' ? 'minor' : 'major';
    const tonicPc = T.parseKey(key()).pc;
    const relPc = state.mode === 'major' ? (tonicPc + 9) % 12 : (tonicPc + 3) % 12;
    const rel = T.KEY_NAMES[other].find((k) => T.parseKey(k).pc === relPc);
    keyNow.innerHTML = fmtNote(key()) + ' ' + state.mode +
      ' <span class="key-rel">· relative ' + other + ': ' + fmtNote(rel) + '</span>';
    placeKeyMarker();
  }

  function placeKeyMarker() { placeMarker(keyStrip); }

  function renderToggles() {
    optSevenths.setAttribute('aria-pressed', String(state.sevenths));
    optGuided.setAttribute('aria-pressed', String(state.guided));
    $('#loopBtn').setAttribute('aria-pressed', String(state.loop));
    $('#melodyBtn').setAttribute('aria-pressed', String(state.melody));
    const harm = $('#harmonies');
    harm.value = String(state.harmonies);
    harm.disabled = !state.melody;
    harm.closest('.field').classList.toggle('is-off', !state.melody);
  }

  function setMode(m) {
    stopPlayback();
    state.mode = m;
    ui.selected = null;
    ui.hover = null;
    persist();
    renderAll();
  }

  bindStrip(keyStrip, () => T.KEY_NAMES[state.mode], key, setKey);

  function setKey(k) {
    if (k === key()) return;
    const wasPlaying = ui.playing;
    stopPlayback();
    state.keys[state.mode] = k;
    persist();
    renderKeys();
    renderBoard();
    renderProg();
    renderDetail();
    if (wasPlaying) startPlayback();
  }

  optSevenths.addEventListener('click', () => {
    state.sevenths = !state.sevenths;
    persist();
    renderToggles();
    renderBoard();
    renderProg();
    renderDetail();
  });
  optGuided.addEventListener('click', () => {
    state.guided = !state.guided;
    persist();
    renderToggles();
    renderBoard();
    renderProg();
    toast(state.guided ? 'Following the arrows. Lit chords are your next moves.' : 'Free play. Every chord is open.');
  });

  // ---------- board ----------

  const lanesEl = $('#lanes');
  const board = $('#board');

  function renderBoard() {
    const m = mode();
    const legal = legalNext();
    const last = lastId();
    const html = ['top', 'mid', 'bottom'].map((lane) => {
      const info = m.lanes[lane];
      const chords = m.chords.filter((c) => m.groups[c.group].lane === lane);
      const used = new Set(chords.map((c) => c.col));
      let cells = chords.map((c) => tileHTML(c, legal, last)).join('');
      for (let col = 0; col < 7; col++) {
        if (!used.has(col)) cells += '<span class="slot" style="grid-column:' + (col + 1) + '" aria-hidden="true"></span>';
      }
      return '<section class="lane lane--' + lane + '" aria-label="' + esc(info.title) + '">' +
        '<header class="lane-head">' +
          (lane === 'mid' ? '<span class="badge">Start here</span>' : '') +
          '<h3 class="lane-title">' + esc(info.title) + '</h3>' +
          '<p class="lane-hint">' + esc(info.hint) + '</p>' +
        '</header>' +
        '<div class="lane-grid">' + cells + '</div>' +
      '</section>';
    }).join('');
    lanesEl.innerHTML = html;
    requestAnimationFrame(drawArrows);
  }

  function tileHTML(def, legal, last) {
    const r = realize(def.id);
    const on = legal.has(def.id);
    const sel = ui.selected && ui.selected.id === def.id;
    const cls = ['tile', 'tile--' + def.group, on ? 'is-on' : 'is-off'];
    if (r.sym.length > 4 || r.slash) cls.push('q-long');
    if (def.id === last) cls.push('is-last');
    if (sel) cls.push('is-selected');
    if (ui.playing && ui.playingIndex > -1 && prog()[ui.playingIndex] === def.id) cls.push('is-sounding');
    const label = r.symbol + ', ' + def.num + (on ? '' : ', off the arrows right now');
    return '<button type="button" class="' + cls.join(' ') + '" data-id="' + esc(def.id) + '" style="grid-column:' + (def.col + 1) +
      '" aria-label="' + esc(label) + '"' + (on ? '' : ' aria-disabled="true"') + '>' +
      '<span class="tile-num">' + esc(def.num) + '</span>' +
      '<span class="tile-name">' + chordHTML(r) + '</span>' +
      (def.group !== 'main' ? '<span class="tile-to" aria-hidden="true"><span class="tile-arrow">→</span> ' + esc(targetLabel(def)) + '</span>' : '') +
      '</button>';
  }

  lanesEl.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (!t) return;
    pressTile(t.dataset.id);
  });
  lanesEl.addEventListener('pointerover', (e) => {
    const t = e.target.closest('.tile');
    const id = t ? t.dataset.id : null;
    if (id !== ui.hover) { ui.hover = id; drawArrows(); }
  });
  lanesEl.addEventListener('pointerleave', () => { ui.hover = null; drawArrows(); });
  lanesEl.addEventListener('focusin', (e) => {
    const t = e.target.closest('.tile');
    ui.hover = t ? t.dataset.id : null;
    drawArrows();
  });
  lanesEl.addEventListener('focusout', () => { ui.hover = null; drawArrows(); });

  function pressTile(id) {
    const legal = legalNext();
    if (!legal.has(id)) {
      // Still let people hear it, but explain why it is not added.
      preview(id);
      ui.selected = { id, index: null };
      ui.shape = 0;
      renderBoard();
      renderDetail();
      toast(whyNot(id));
      return;
    }
    stopPlayback();
    prog().push(id);
    persist();
    ui.selected = { id, index: prog().length - 1 };
    ui.shape = 0;
    preview(id);
    renderBoard();
    renderProg(true);
    renderDetail();
  }

  function whyNot(id) {
    const m = mode();
    const last = lastId();
    const r = realize(id);
    if (!last) return r.symbol + ' is borrowed. Start from a main chord, then come up or down to it.';
    const prev = m.byId[last];
    const prevR = realize(last);
    if (prev.group !== 'main') {
      const outs = prev.to.map((t) => realize(t).symbol);
      const mixes = m.groups[prev.group].mix ? ' or another chord from its group' : '';
      return prevR.symbol + ' wants to resolve to ' + listWords(outs) + mixes + '. Heard ' + r.symbol + ' as a preview.';
    }
    const entry = m.groups[m.byId[id].group].entry;
    if (entry) return 'Borrowed chords open up from ' + listWords(entry.map((e) => m.byId[e].num)) + '. Heard ' + r.symbol + ' as a preview.';
    return 'Heard ' + r.symbol + ' as a preview.';
  }

  function listWords(arr) {
    const a = arr.filter((x, i) => arr.indexOf(x) === i);
    if (a.length < 2) return a.join('');
    return a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1];
  }

  // ---------- arrows (hand-inked overlay) ----------

  const arrowPaths = $('#arrowPaths');

  function tileEl(id) { return lanesEl.querySelector('.tile[data-id="' + CSS.escape(id) + '"]'); }

  function drawArrows() {
    const hovered = isBorrowed(ui.hover) ? ui.hover : null;
    const last = lastId();
    const focus = hovered || (state.guided && isBorrowed(last) ? last : null);
    if (!focus) { arrowPaths.innerHTML = ''; return; }
    const def = mode().byId[focus];
    const from = tileEl(focus);
    if (!from) { arrowPaths.innerHTML = ''; return; }
    const b = board.getBoundingClientRect();
    const fr = from.getBoundingClientRect();
    const kind = hovered && hovered !== last ? 'is-hint' : 'is-live';
    let out = '';
    def.to.forEach((tid, i) => {
      const to = tileEl(tid);
      if (!to) return;
      const tr = to.getBoundingClientRect();
      const fx = fr.left + fr.width / 2 - b.left;
      const tx = tr.left + tr.width / 2 - b.left;
      let d;
      if (Math.abs(fr.top - tr.top) < 4) {
        // same lane: arc over the top
        const y = fr.top - b.top;
        const lift = 26 + i * 4;
        d = 'M' + fx + ' ' + (y - 2) + ' C' + fx + ' ' + (y - lift) + ' ' + tx + ' ' + (y - lift) + ' ' + tx + ' ' + (tr.top - b.top - 4);
      } else {
        // Different lanes: leave the tile, run along the gap between lanes, enter the target.
        const down = tr.top > fr.top;
        const fy = (down ? fr.bottom : fr.top) - b.top + (down ? 2 : -2);
        const ty = (down ? tr.top : tr.bottom) - b.top + (down ? -5 : 5);
        const fromLane = from.closest('.lane').getBoundingClientRect();
        const toLane = to.closest('.lane').getBoundingClientRect();
        const gy = (down ? (fromLane.bottom + toLane.top) / 2 : (toLane.bottom + fromLane.top) / 2) - b.top + (i - (def.to.length - 1) / 2) * 3;
        const dir = tx > fx ? 1 : -1;
        const rad = Math.min(10, Math.abs(tx - fx) / 2);
        const sy = down ? 1 : -1;
        if (rad < 1) {
          d = 'M' + fx + ' ' + fy + ' L' + tx + ' ' + ty;
        } else {
          d = 'M' + fx + ' ' + fy +
            ' L' + fx + ' ' + (gy - sy * rad) +
            ' Q' + fx + ' ' + gy + ' ' + (fx + dir * rad) + ' ' + gy +
            ' L' + (tx - dir * rad) + ' ' + gy +
            ' Q' + tx + ' ' + gy + ' ' + tx + ' ' + (gy + sy * rad) +
            ' L' + tx + ' ' + ty;
        }
      }
      out += '<path class="arrow ' + kind + '" d="' + d + '" marker-end="url(#head)"/>';
    });
    arrowPaths.innerHTML = out;
    // Ink the live arrows in: dash the full measured length, then slide it home.
    arrowPaths.querySelectorAll('.is-live').forEach((p) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      p.getBoundingClientRect();
      p.style.transition = 'stroke-dashoffset .5s cubic-bezier(.2, .7, .2, 1)';
      p.style.strokeDashoffset = 0;
    });
  }

  // ---------- progression ----------

  const progEl = $('#prog');
  const progEmpty = $('#progEmpty');
  const transport = $('#transport');

  function renderProg(scrollToEnd) {
    const ids = prog();
    const ok = state.guided ? T.validate(state.mode, ids) : ids.map(() => true);
    progEl.innerHTML = ids.map((id, i) => {
      const r = realize(id);
      const def = mode().byId[id];
      const cls = ['chip', 'chip--' + def.group];
      if (!ok[i]) cls.push('is-broken');
      if (ui.selected && ui.selected.index === i) cls.push('is-selected');
      if (ui.playing && ui.playingIndex === i) cls.push('is-sounding');
      return '<li class="chip-wrap">' +
        '<button type="button" class="' + cls.join(' ') + '" data-index="' + i + '" aria-label="' +
          esc((i + 1) + '. ' + r.symbol + ', ' + def.num + (ok[i] ? '' : ', breaks the arrows')) + '">' +
          '<span class="chip-name">' + chordHTML(r) + '</span>' +
          '<span class="chip-num">' + esc(def.num) + '</span>' +
        '</button>' +
        '<button type="button" class="chip-x" data-remove="' + i + '" aria-label="Remove ' + esc(r.symbol) + '">' +
          '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</li>';
    }).join('');
    const empty = ids.length === 0;
    progEmpty.hidden = !empty;
    progEl.hidden = empty;
    transport.classList.toggle('is-empty', empty);
    $('#undoBtn').disabled = empty;
    $('#clearBtn').disabled = empty;
    $('#playBtn').disabled = empty;
    $('#saveBtn').disabled = empty;
    $('#shareBtn').disabled = empty;
    $('#midiBtn').disabled = empty;
    if (empty) renderExamples();
    if (scrollToEnd && progEl.lastElementChild) {
      progEl.lastElementChild.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function renderExamples() {
    $('#examples').innerHTML = T.EXAMPLES[state.mode].map((ex, i) => {
      const syms = ex.ids.map((id) => realize(id).symbol).join('  ');
      return '<button type="button" class="example" data-ex="' + i + '">' +
        '<span class="example-step">Step ' + (i + 1) + '</span>' +
        '<span class="example-name">' + esc(ex.name) + '</span>' +
        '<span class="example-text">' + esc(ex.text) + '</span>' +
        '<span class="example-chords">' + fmtNote(syms) + '</span></button>';
    }).join('');
  }

  $('#examples').addEventListener('click', (e) => {
    const b = e.target.closest('.example');
    if (!b) return;
    const ex = T.EXAMPLES[state.mode][Number(b.dataset.ex)];
    state.progs[state.mode] = ex.ids.slice();
    persist();
    ui.selected = null;
    renderBoard();
    renderProg();
    renderDetail();
    startPlayback();
  });

  progEl.addEventListener('click', (e) => {
    const x = e.target.closest('.chip-x');
    if (x) {
      const i = Number(x.dataset.remove);
      stopPlayback();
      const removed = prog().splice(i, 1)[0];
      persist();
      if (ui.selected && ui.selected.index !== null) {
        if (ui.selected.index === i) ui.selected = null;
        else if (ui.selected.index > i) ui.selected.index--;
      }
      renderBoard();
      renderProg();
      renderDetail();
      toast('Removed ' + realize(removed).symbol + '.', 'Undo', () => {
        prog().splice(i, 0, removed);
        persist();
        renderBoard();
        renderProg();
      });
      return;
    }
    const c = e.target.closest('.chip');
    if (!c) return;
    const i = Number(c.dataset.index);
    ui.selected = { id: prog()[i], index: i };
    ui.shape = 0;
    if (!ui.playing) preview(prog()[i], i);
    renderBoard();
    renderProg();
    renderDetail();
  });

  $('#undoBtn').addEventListener('click', () => {
    if (!prog().length) return;
    stopPlayback();
    prog().pop();
    persist();
    if (ui.selected && ui.selected.index !== null && ui.selected.index >= prog().length) ui.selected = null;
    renderBoard();
    renderProg();
    renderDetail();
  });

  $('#clearBtn').addEventListener('click', () => {
    if (!prog().length) return;
    stopPlayback();
    const before = prog().slice();
    state.progs[state.mode] = [];
    persist();
    ui.selected = null;
    renderBoard();
    renderProg();
    renderDetail();
    toast('Cleared.', 'Undo', () => {
      state.progs[state.mode] = before;
      persist();
      renderBoard();
      renderProg();
    });
  });

  // ---------- sound ----------

  function voicingFor(id, index) {
    // Inside the progression, voice-lead from the chords before it.
    const ids = prog();
    if (index != null && ids[index] === id) {
      return T.voiceProgression(ids.slice(0, index + 1).map(realize))[index];
    }
    const r = realize(id);
    return T.voiceChord(r.pcs, r.bass.pc, null);
  }

  let audioWarned = false;
  function preview(id, index) {
    const ok = A.playChord(voicingFor(id, index), 0, 1.6);
    if (!ok && !audioWarned) {
      audioWarned = true;
      toast('This browser cannot play audio, but everything else works.');
    }
  }

  const playBtn = $('#playBtn');
  let timers = [];
  let token = 0;

  function startPlayback() {
    const ids = prog();
    if (!ids.length) return;
    const ctx = A.ensure();
    if (!ctx) { preview(ids[0]); return; }
    stopPlayback();
    ui.playing = true;
    const my = ++token;
    const voicings = T.voiceProgression(ids.map(realize));
    playBtn.setAttribute('aria-pressed', 'true');
    $('.play-label', playBtn).textContent = 'Stop';
    runPass(ctx, ctx.currentTime + 0.08, my, voicings);
  }

  // The same progression always sings the same line, so what you hear is what you export.
  function melodyParts() {
    const ids = prog();
    const segs = ids.map((id) => {
      const sc = T.chordScale(state.mode, key(), id, state.sevenths);
      return { scalePcs: sc.pcs, chordPcs: sc.chordPcs, beats: state.beats };
    });
    let seed = ids.length * 31 + T.parseKey(key()).pc;
    ids.join('').split('').forEach((c) => { seed = (seed * 33 + c.charCodeAt(0)) >>> 0; });
    const line = T.melody(segs, seed);
    return { line, voices: T.harmonyVoices(line, segs, state.harmonies) };
  }

  function runPass(ctx, t0, my, voicings) {
    const dur = (60 / state.bpm) * state.beats;
    if (state.melody) {
      const spb = 60 / state.bpm;
      const parts = melodyParts();
      parts.line.forEach((n) => A.lead(n.midi, t0 + n.beat * spb, n.dur * spb));
      // Harmony voices sit a little behind the lead and get softer the further down they go.
      parts.voices.forEach((v, k) => v.forEach((n) => A.lead(n.midi, t0 + n.beat * spb, n.dur * spb, 0.07 - k * 0.008)));
    }
    voicings.forEach((v, i) => {
      const at = t0 + i * dur;
      A.playChord(v, at, dur * 0.96, { strum: state.beats === 1 ? 0.008 : 0.02 });
      timers.push(setTimeout(() => {
        if (my !== token) return;
        ui.playingIndex = i;
        markSounding();
      }, Math.max(0, (at - ctx.currentTime) * 1000)));
    });
    const end = t0 + voicings.length * dur;
    timers.push(setTimeout(() => {
      if (my !== token) return;
      if (state.loop) runPass(ctx, end, my, voicings);
      else timers.push(setTimeout(() => { if (my === token) stopPlayback(); }, 150));
    }, Math.max(0, (end - ctx.currentTime) * 1000 - 120)));
  }

  function stopPlayback() {
    token++;
    timers.forEach(clearTimeout);
    timers = [];
    if (ui.playing) A.stopAll();
    ui.playing = false;
    ui.playingIndex = -1;
    playBtn.setAttribute('aria-pressed', 'false');
    $('.play-label', playBtn).textContent = 'Play';
    markSounding();
  }

  // Cheap highlight update that does not rebuild the board.
  function markSounding() {
    const ids = prog();
    const id = ui.playingIndex > -1 ? ids[ui.playingIndex] : null;
    lanesEl.querySelectorAll('.tile').forEach((t) => t.classList.toggle('is-sounding', t.dataset.id === id));
    progEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-sounding', Number(c.dataset.index) === ui.playingIndex));
    if (id && ui.playing) {
      ui.selected = { id, index: ui.playingIndex };
      renderDetail(true);
    }
  }

  playBtn.addEventListener('click', () => (ui.playing ? stopPlayback() : startPlayback()));

  const tempo = $('#tempo');
  const tempoOut = $('#tempoOut');
  tempo.value = state.bpm;
  tempoOut.textContent = state.bpm;
  tempo.addEventListener('input', () => {
    state.bpm = Number(tempo.value);
    tempoOut.textContent = state.bpm;
  });
  tempo.addEventListener('change', () => {
    persist();
    if (ui.playing) startPlayback();
  });

  const beats = $('#beats');
  beats.value = String(state.beats);
  beats.addEventListener('change', () => {
    state.beats = Number(beats.value);
    persist();
    if (ui.playing) startPlayback();
  });

  $('#loopBtn').addEventListener('click', () => {
    state.loop = !state.loop;
    persist();
    renderToggles();
  });

  $('#melodyBtn').addEventListener('click', () => {
    state.melody = !state.melody;
    persist();
    renderToggles();
    if (ui.playing) startPlayback();
    else if (state.melody && prog().length) toast('Melody on. Press Play to hear a line written over your chords.');
  });

  $('#harmonies').addEventListener('change', (e) => {
    state.harmonies = Number(e.target.value);
    persist();
    if (ui.playing) startPlayback();
  });

  // ---------- MIDI export ----------

  function fileSlug() {
    const k = key().replace('♯', '-sharp').replace('♭', '-flat').toLowerCase();
    return 'changes-' + k + '-' + state.mode;
  }

  function download(bytes, name) {
    const blob = new Blob([bytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function exportMidi() {
    const ids = prog();
    if (!ids.length) return;
    const M = window.MidiFile;
    const b = state.beats;
    const chords = ids.map(realize);
    const title = key() + ' ' + state.mode + ': ' + chords.map((r) => r.symbol).join(' ');
    const upper = [];
    const bass = [];
    T.voiceProgression(chords).forEach((v, i) => {
      v.upper.forEach((m) => upper.push({ midi: m, beat: i * b, dur: b, vel: 78 }));
      bass.push({ midi: v.bass, beat: i * b, dur: b, vel: 92 });
    });
    download(M.write({ bpm: state.bpm, title, tracks: [
      { name: 'Chords', channel: 0, program: 4, notes: upper },
      { name: 'Bass', channel: 1, program: 33, notes: bass },
    ] }), fileSlug() + '-chords.mid');

    if (!state.melody) {
      toast('Chords exported. Turn on Melody to export a melody file too.');
      return;
    }
    // One file per part, so each voice can go to its own instrument. Downloads are spaced out
    // because browsers drop or merge several downloads fired in the same instant.
    const parts = melodyParts();
    const files = [{ name: 'Melody', file: '-melody.mid', notes: parts.line, vel: 96 }]
      .concat(parts.voices.map((v, k) => ({ name: 'Harmony ' + (k + 1), file: '-harmony-' + (k + 1) + '.mid', notes: v, vel: 84 })));
    files.forEach((f, i) => {
      setTimeout(() => download(M.write({
        bpm: state.bpm,
        title: title + ' (' + f.name.toLowerCase() + ')',
        tracks: [{ name: f.name, channel: 2, program: 0, notes: f.notes.map((n) => Object.assign({ vel: f.vel }, n)) }],
      }), fileSlug() + f.file), 400 * (i + 1));
    });
    const total = files.length + 1;
    toast('Exporting ' + total + ' MIDI files: chords, melody' + (parts.voices.length ? ' and ' + parts.voices.length + ' harmon' + (parts.voices.length > 1 ? 'ies' : 'y') : '') +
      '. If your browser asks, allow multiple downloads.');
  }

  $('#midiBtn').addEventListener('click', exportMidi);

  // ---------- detail panel ----------

  const detailEmpty = $('#detailEmpty');
  const detailBody = $('#detailBody');

  function describe(def, r) {
    const m = mode();
    const sym = (id) => '<b>' + fmtNote(realize(id).symbol) + '</b>';
    const tonic = fmtNote(key());
    const roles = {
      major: {
        I: 'Home. Everything else is measured against it.',
        ii: 'Pre-dominant. Leans naturally toward V.',
        iii: 'Soft and in-between. Shares two notes with I.',
        IV: 'Pre-dominant. Open and lifting.',
        V: 'Dominant. Pulls hard back home to I.',
        vi: 'The relative minor. Home in shadow.',
        vii: 'Unstable. Wants to resolve to I.',
      },
      minor: {
        i: 'Home, the dark center.',
        ii: 'A tense pre-dominant that leans toward V.',
        bIII: 'Augmented. Eerie and unresolved.',
        iv: 'Pre-dominant. Heavy and sad.',
        V: 'Dominant with a raised leading tone. Pulls hard to i.',
        bVI: 'Warm, cinematic lift.',
        vii: 'Leading-tone diminished. Pulls to i.',
      },
    };
    switch (def.group) {
      case 'main':
        return roles[state.mode][def.id] + ' Mix it with any other main chord.';
      case 'secdom':
        return 'Secondary dominant: the V7 of ' + esc(m.byId[def.to[0]].num) + '. It pulls straight to ' + sym(def.to[0]) +
          ', so play it once, then resolve.';
      case 'modal':
        return 'Borrowed from ' + tonic + ' minor. Mix it with the other borrowed chords, then come back to ' +
          sym('I') + ', ' + sym('IV') + ' or ' + sym('V') + '.';
      case 'dimV':
        return 'Secondary diminished, the vii°7 of V. All four chords in this group are the same chord in different inversions, so slide between them, then land on ' + sym('V') + '.';
      case 'dimIV':
        return 'Secondary diminished, the vii°7 of iv. Slide between these four, then rise to ' + sym('iv') + ' or ' + sym('bVI') + '.';
      case 'n6':
        return 'Neapolitan sixth: the ♭II chord with its third in the bass. A dramatic pre-dominant that heads to ' + sym('V') +
          ', directly or through a diminished chord.';
      default:
        return '';
    }
  }

  function renderDetail(fromPlayback) {
    if (!ui.selected) {
      detailEmpty.hidden = false;
      detailBody.hidden = true;
      return;
    }
    const id = ui.selected.id;
    const def = mode().byId[id];
    if (!def) { ui.selected = null; renderDetail(); return; }
    const r = realize(id);
    const v = voicingFor(id, ui.selected.index);
    const shapes = state.instrument === 'piano' ? [] : T.fretVoicings(r.pcs, r.bass.pc, state.instrument);
    if (ui.shape >= shapes.length) ui.shape = 0;
    const sc = T.chordScale(state.mode, key(), id, state.sevenths);
    const next = T.nextOptions(state.mode, id).filter((x) => x !== id);
    const nextMain = def.group === 'main'
      ? null
      : next.map((x) => '<button type="button" class="next-chip" data-add="' + esc(x) + '">' + chordHTML(realize(x)) + '</button>').join('');

    detailEmpty.hidden = true;
    detailBody.hidden = false;
    detailBody.innerHTML =
      '<div class="detail-head">' +
        '<div>' +
          '<p class="eyebrow">' + esc(r.groupName) + ' · ' + esc(def.num) + '</p>' +
          '<p class="detail-chord">' + chordHTML(r) + '</p>' +
          '<p class="detail-quality">' + esc(r.qualityName) + (r.slash ? ', ' + fmtNote(r.bass.name) + ' in the bass' : '') + '</p>' +
        '</div>' +
        '<button type="button" class="btn btn-round" id="hearBtn" aria-label="Hear ' + esc(r.symbol) + '">' +
          '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8 L13 8 L4.5 13.2 Z" fill="currentColor"/></svg>' +
        '</button>' +
      '</div>' +
      '<p class="detail-desc">' + describe(def, r) + '</p>' +
      '<ul class="notes" aria-label="Notes">' + r.tones.map((t) => '<li>' + fmtNote(t.name) + '</li>').join('') + '</ul>' +
      (nextMain ? '<div class="next"><p class="eyebrow">Goes to</p><div class="next-list">' + nextMain + '</div></div>' : '') +
      shapeSection(r, v, shapes) +
      scaleSection(sc, r);

    if (!fromPlayback) {
      detailBody.classList.remove('is-fresh');
      void detailBody.offsetWidth; // restart the fade-in
      detailBody.classList.add('is-fresh');
    }
  }

  detailBody.addEventListener('click', (e) => {
    if (e.target.closest('#hearBtn')) {
      preview(ui.selected.id, ui.selected.index);
      return;
    }
    const s = e.target.closest('[data-shape]');
    if (s) {
      const r = realize(ui.selected.id);
      const n = T.fretVoicings(r.pcs, r.bass.pc, state.instrument).length;
      ui.shape = (ui.shape + Number(s.dataset.shape) + n) % n;
      renderDetail(true);
      $('[data-shape="' + s.dataset.shape + '"]', detailBody).focus();
      return;
    }
    if (e.target.closest('#hearScale')) {
      const sc = T.chordScale(state.mode, key(), ui.selected.id, state.sevenths);
      const start = 60 + sc.root.pc - (sc.root.pc > 6 ? 12 : 0);
      const line = sc.notes.map((nt) => { let m = start + T.mod(nt.pc - sc.root.pc, 12); return m; });
      line.push(start + 12);
      A.playLine(line, 0.2);
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) pressTile(add.dataset.add);
  });

  // ---------- instrument drawings ----------

  const I = window.Instruments;

  function nameMap(r) {
    const nameOf = {};
    r.tones.forEach((t) => { nameOf[t.pc] = t.name; });
    nameOf[r.bass.pc] = r.bass.name;
    return nameOf;
  }

  function shapeSection(r, v, shapes) {
    const nameOf = nameMap(r);
    if (state.instrument === 'piano') {
      const on = new Set(v.upper);
      return '<div class="inst"><p class="eyebrow">Piano voicing</p>' + I.keyboard({
        lo: 36, hi: 83,
        label: 'Piano voicing: ' + [v.bass].concat(v.upper).map((m) => nameOf[m % 12]).join(' '),
        mark: (m) => (m === v.bass ? { role: 'bass', label: nameOf[m % 12] } : on.has(m) ? { role: 'tone', label: nameOf[m % 12] } : null),
      }) + '</div>';
    }
    const instName = T.TUNINGS[state.instrument].name;
    if (!shapes.length) return '<div class="inst"><p class="eyebrow">' + instName + '</p><p class="muted">No comfortable shape found.</p></div>';
    const shape = shapes[ui.shape];
    const tab = shape.frets.map((f) => (f < 0 ? 'x' : f)).join(' ');
    return '<div class="inst inst-guitar"><div class="inst-head"><p class="eyebrow">' + instName + ' shape</p>' +
      (shapes.length > 1
        ? '<div class="shape-nav"><button type="button" class="btn btn-quiet btn-tiny" data-shape="-1" aria-label="Previous shape">‹</button>' +
          '<span class="shape-count">' + (ui.shape + 1) + ' of ' + shapes.length + '</span>' +
          '<button type="button" class="btn btn-quiet btn-tiny" data-shape="1" aria-label="Next shape">›</button></div>'
        : '') +
      '</div><div class="guitar-wrap">' + I.chordBox(shape, r.root.pc, nameOf, state.instrument) + '<p class="tab">' + esc(tab) + '</p></div></div>';
  }

  // The back of the card: chord tones solid, the rest of the scale hollow, root in amber.
  function scaleMark(sc, chordPcs, pc) {
    const i = sc.pcs.indexOf(pc);
    if (i < 0) return null;
    const role = pc === sc.root.pc ? 'root' : chordPcs.indexOf(pc) > -1 ? 'tone' : (sc.blue && sc.blue.has(pc) ? 'blue' : 'scale');
    return { role, label: sc.degrees[i], name: sc.notes[i].name };
  }

  function scaleDiagram(sc, chordPcs, opts) {
    opts = opts || {};
    if (state.instrument === 'piano') {
      return I.keyboard({
        lo: opts.lo || 48, hi: opts.hi || 71, label: sc.name,
        mark: (m) => { const mk = scaleMark(sc, chordPcs, T.mod(m, 12)); return mk && { role: mk.role, label: opts.names ? mk.name : mk.label }; },
      });
    }
    return I.fretboard({
      instrument: state.instrument, from: 0, to: opts.to || 12, label: sc.name,
      mark: (s, f, m) => { const mk = scaleMark(sc, chordPcs, T.mod(m, 12)); return mk && { role: mk.role, label: opts.names ? mk.name : mk.label }; },
    });
  }

  function scaleSection(sc, r) {
    return '<div class="inst"><div class="inst-head"><p class="eyebrow">Play over it</p>' +
      '<button type="button" class="btn btn-quiet btn-small" id="hearScale">Hear the scale</button></div>' +
      '<p class="scale-name">' + fmtNote(sc.name) + '</p>' +
      '<p class="scale-why">' + esc(sc.why.charAt(0).toUpperCase() + sc.why.slice(1)) + '. ' +
        fmtNote(sc.notes.map((n) => n.name).join(' ')) + '</p>' +
      scaleDiagram(sc, r.pcs) +
      I.legend([{ role: 'root', text: 'root' }, { role: 'tone', text: 'chord tone' }, { role: 'scale', text: 'scale tone' }]) +
      '</div>';
  }

  // ---------- save and share ----------

  const saveForm = $('#saveForm');
  const saveName = $('#saveName');

  $('#saveBtn').addEventListener('click', () => {
    if (!prog().length) return;
    saveForm.hidden = false;
    saveName.value = '';
    saveName.focus();
  });
  $('#saveCancel').addEventListener('click', () => { saveForm.hidden = true; });
  saveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = saveName.value.trim() || 'Untitled ' + (saved.length + 1);
    saved.unshift({
      id: Date.now().toString(36),
      name,
      mode: state.mode,
      key: key(),
      sevenths: state.sevenths,
      ids: prog().slice(),
    });
    writeJSON(SAVED_KEY, saved);
    saveForm.hidden = true;
    renderSaved();
    toast('Saved “' + name + '”.');
  });

  function renderSaved() {
    const list = $('#savedList');
    $('#savedEmpty').hidden = saved.length > 0;
    list.innerHTML = saved.map((s, i) => {
      const valid = T.MODES[s.mode] && s.ids.every((id) => T.MODES[s.mode].byId[id]);
      const syms = valid ? s.ids.map((id) => T.realize(s.mode, s.key, id, s.sevenths).symbol).join('  ') : 'Could not read this one';
      return '<li class="saved-item">' +
        '<button type="button" class="saved-load" data-load="' + i + '"' + (valid ? '' : ' disabled') + '>' +
          '<span class="saved-name">' + esc(s.name) + '</span>' +
          '<span class="saved-meta">' + fmtNote(s.key) + ' ' + esc(s.mode) + ' · ' + s.ids.length + ' chords</span>' +
          '<span class="saved-chords">' + fmtNote(syms) + '</span>' +
        '</button>' +
        '<button type="button" class="chip-x" data-del="' + i + '" aria-label="Delete ' + esc(s.name) + '">' +
          '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</li>';
    }).join('');
  }

  $('#savedList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const i = Number(del.dataset.del);
      const gone = saved.splice(i, 1)[0];
      writeJSON(SAVED_KEY, saved);
      renderSaved();
      toast('Deleted “' + gone.name + '”.', 'Undo', () => {
        saved.splice(i, 0, gone);
        writeJSON(SAVED_KEY, saved);
        renderSaved();
      });
      return;
    }
    const load = e.target.closest('[data-load]');
    if (!load) return;
    const s = saved[Number(load.dataset.load)];
    loadProgression(s.mode, s.key, s.sevenths, s.ids);
    toast('Loaded “' + s.name + '”.');
  });

  function loadProgression(m, k, sev, ids) {
    stopPlayback();
    state.mode = m;
    state.keys[m] = k;
    state.sevenths = sev;
    state.progs[m] = ids.slice();
    ui.selected = null;
    persist();
    renderAll();
    showView(m === 'minor' ? 'dark' : 'progressions');
  }

  $('#shareBtn').addEventListener('click', () => {
    const code = T.encodeShare(state.mode, key(), state.sevenths, prog());
    const url = location.href.split('#')[0] + '#' + code;
    const done = () => toast('Link copied. Anyone who opens it hears this progression.');
    const fallback = () => {
      history.replaceState(null, '', '#' + code);
      toast('Copy the link from the address bar.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback);
    else fallback();
  });

  // ---------- toast ----------

  const toastEl = $('#toast');
  const toastMsg = $('#toastMsg');
  const toastAction = $('#toastAction');
  let toastTimer = null;
  let toastFn = null;

  function toast(msg, actionLabel, actionFn) {
    clearTimeout(toastTimer);
    toastMsg.textContent = msg;
    toastFn = actionFn || null;
    toastAction.hidden = !actionFn;
    toastAction.textContent = actionLabel || '';
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('is-in'));
    toastTimer = setTimeout(hideToast, actionFn ? 5200 : 3400);
  }
  function hideToast() {
    toastEl.classList.remove('is-in');
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 220);
  }
  toastAction.addEventListener('click', () => {
    const fn = toastFn;
    hideToast();
    if (fn) fn();
  });

  // ---------- keyboard shortcuts ----------

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, button, [contenteditable]')) return;
    if (e.key === ' ' && (state.view === 'progressions' || state.view === 'dark') && prog().length) {
      e.preventDefault();
      if (ui.playing) stopPlayback(); else startPlayback();
    }
  });

  // ---------- views and instrument ----------

  const views = {};
  const toolNav = $('#toolNav');
  const instSwitch = $('#instSwitch');
  const instListeners = [];

  function registerView(name, api) { views[name] = api; }

  // Progressions and Dark harmony share one board; the tab picks the mode.
  function showView(name, quiet) {
    const board = name === 'progressions' || name === 'dark';
    if (!board && !views[name]) name = 'progressions';
    if (name !== state.view) {
      stopPlayback();
      Object.keys(views).forEach((v) => views[v].stop && views[v].stop());
    }
    state.view = name;
    const wantMode = name === 'dark' ? 'minor' : 'major';
    if ((name === 'progressions' || name === 'dark') && state.mode !== wantMode) setMode(wantMode);
    persist();
    toolNav.querySelectorAll('.tool-btn').forEach((b) => {
      if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const panel = name === 'dark' ? 'progressions' : name;
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + panel; });
    document.documentElement.dataset.view = name;
    if (panel === 'progressions') {
      placeKeyMarker();
      requestAnimationFrame(drawArrows);
    } else if (views[name] && views[name].show) {
      views[name].show();
    }
    if (!quiet) window.scrollTo({ top: 0 });
  }

  toolNav.addEventListener('click', (e) => {
    const b = e.target.closest('.tool-btn');
    if (b) showView(b.dataset.view);
  });

  function renderInstrument() {
    instSwitch.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.inst === state.instrument;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  instSwitch.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.inst === state.instrument) return;
    state.instrument = b.dataset.inst;
    ui.shape = 0;
    persist();
    renderInstrument();
    renderDetail(true);
    instListeners.forEach((fn) => fn(state.instrument));
  });
  instSwitch.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const list = ['guitar', 'piano', 'ukulele'];
    const i = list.indexOf(state.instrument);
    const next = list[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
    instSwitch.querySelector('[data-inst="' + next + '"]').click();
    instSwitch.querySelector('[data-inst="' + next + '"]').focus();
  });

  // Shared with blues.js and scales.js.
  window.Changes = {
    state, persist, toast, download, esc, fmtNote, chordHTML, stripHTML, placeMarker, bindStrip,
    scaleMark, nameMap, registerView,
    onInstrument: (fn) => instListeners.push(fn),
  };

  // ---------- boot ----------

  function renderAll() {
    renderMode();
    renderKeys();
    renderToggles();
    renderBoard();
    renderProg();
    renderDetail();
    renderSaved();
  }

  function readHash() {
    const code = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!code) return;
    const shared = T.decodeShare(code);
    history.replaceState(null, '', location.pathname + location.search);
    if (!shared) {
      setTimeout(() => toast('That link did not load, so here is a fresh board.'), 300);
      return;
    }
    state.mode = shared.mode;
    state.view = shared.mode === 'minor' ? 'dark' : 'progressions';
    state.keys[shared.mode] = shared.key;
    state.sevenths = shared.sevenths;
    state.progs[shared.mode] = shared.ids;
    persist();
    setTimeout(() => toast('Loaded a shared progression. Press Play to hear it.'), 300);
  }

  readHash();
  renderAll();
  renderInstrument();
  const viewParam = new URLSearchParams(location.search).get('view');
  // blues.js and scales.js load after this file, so pick the view once they have registered.
  document.addEventListener('DOMContentLoaded', () => showView(viewParam || state.view, true));
  window.addEventListener('hashchange', () => {
    if (!location.hash) return;
    stopPlayback();
    ui.selected = null;
    readHash();
    renderAll();
    showView(state.view);
  });

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      placeKeyMarker();
      drawArrows();
      document.querySelectorAll('.view:not([hidden]) .keystrip').forEach(placeMarker);
    });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { placeKeyMarker(); drawArrows(); });
})();
