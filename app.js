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
  };
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
      bpm: state.bpm, beats: state.beats, loop: state.loop,
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

  const modeSwitch = $('#modeSwitch');
  const keyStrip = $('#keyStrip');
  const keyNow = $('#keyNow');
  const optSevenths = $('#optSevenths');
  const optGuided = $('#optGuided');

  function renderMode() {
    modeSwitch.querySelectorAll('.mode-btn').forEach((b) => {
      const on = b.dataset.mode === state.mode;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    document.documentElement.dataset.mode = state.mode;
  }

  function renderKeys() {
    const names = T.KEY_NAMES[state.mode];
    keyStrip.innerHTML = names.map((k) => {
      const on = k === key();
      return '<button class="key" role="radio" aria-checked="' + on + '" tabindex="' + (on ? 0 : -1) +
        '" data-key="' + esc(k) + '" aria-label="' + esc(k) + ' ' + state.mode + '">' + fmtNote(k) + '</button>';
    }).join('') + '<span class="key-marker" aria-hidden="true"></span>';
    const other = state.mode === 'major' ? 'minor' : 'major';
    const tonicPc = T.parseKey(key()).pc;
    const relPc = state.mode === 'major' ? (tonicPc + 9) % 12 : (tonicPc + 3) % 12;
    const rel = T.KEY_NAMES[other].find((k) => T.parseKey(k).pc === relPc);
    keyNow.innerHTML = fmtNote(key()) + ' ' + state.mode +
      ' <span class="key-rel">· relative ' + other + ': ' + fmtNote(rel) + '</span>';
    placeKeyMarker();
  }

  function placeKeyMarker() {
    const marker = $('.key-marker', keyStrip);
    const on = $('[aria-checked="true"]', keyStrip);
    if (!marker || !on) return;
    marker.style.width = on.offsetWidth + 'px';
    marker.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    // Slide only after the first placement, so the page never loads mid-animation.
    if (!keyStrip.classList.contains('is-ready')) requestAnimationFrame(() => keyStrip.classList.add('is-ready'));
  }

  function renderToggles() {
    optSevenths.setAttribute('aria-pressed', String(state.sevenths));
    optGuided.setAttribute('aria-pressed', String(state.guided));
    $('#loopBtn').setAttribute('aria-pressed', String(state.loop));
  }

  modeSwitch.addEventListener('click', (e) => {
    const b = e.target.closest('.mode-btn');
    if (b && b.dataset.mode !== state.mode) setMode(b.dataset.mode);
  });
  modeSwitch.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setMode(state.mode === 'major' ? 'minor' : 'major');
    $('[aria-checked="true"]', modeSwitch).focus();
  });

  function setMode(m) {
    stopPlayback();
    state.mode = m;
    ui.selected = null;
    ui.hover = null;
    persist();
    renderAll();
  }

  keyStrip.addEventListener('click', (e) => {
    const b = e.target.closest('.key');
    if (b) setKey(b.dataset.key);
  });
  keyStrip.addEventListener('keydown', (e) => {
    const names = T.KEY_NAMES[state.mode];
    const i = names.indexOf(key());
    let n = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') n = (i + 1) % 12;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') n = (i + 11) % 12;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = 11;
    if (n === null) return;
    e.preventDefault();
    setKey(names[n]);
    $('[aria-checked="true"]', keyStrip).focus();
  });

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
    if (empty) renderExamples();
    if (scrollToEnd && progEl.lastElementChild) {
      progEl.lastElementChild.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function renderExamples() {
    $('#examples').innerHTML = T.EXAMPLES[state.mode].map((ex, i) => {
      const syms = ex.ids.map((id) => realize(id).symbol).join('  ');
      return '<button type="button" class="example" data-ex="' + i + '">' +
        '<span class="example-name">' + esc(ex.name) + '</span>' +
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

  function runPass(ctx, t0, my, voicings) {
    const dur = (60 / state.bpm) * state.beats;
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
    const shapes = T.guitarVoicings(r.pcs, r.bass.pc);
    if (ui.shape >= shapes.length) ui.shape = 0;
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
      '<div class="inst"><p class="eyebrow">Piano</p>' + pianoSVG(v, r) + '</div>' +
      '<div class="inst inst-guitar"><div class="inst-head"><p class="eyebrow">Guitar</p>' +
        (shapes.length > 1
          ? '<div class="shape-nav"><button type="button" class="btn btn-quiet btn-tiny" data-shape="-1" aria-label="Previous shape">‹</button>' +
            '<span class="shape-count">Shape ' + (ui.shape + 1) + ' of ' + shapes.length + '</span>' +
            '<button type="button" class="btn btn-quiet btn-tiny" data-shape="1" aria-label="Next shape">›</button></div>'
          : '') +
      '</div>' + (shapes.length ? guitarSVG(shapes[ui.shape], r) : '<p class="muted">No comfortable shape found.</p>') + '</div>';

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
      const n = T.guitarVoicings(realize(ui.selected.id).pcs, realize(ui.selected.id).bass.pc).length;
      ui.shape = (ui.shape + Number(s.dataset.shape) + n) % n;
      renderDetail(true);
      $('[data-shape="' + s.dataset.shape + '"]', detailBody).focus();
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) pressTile(add.dataset.add);
  });

  // ---------- instrument drawings ----------

  function pianoSVG(v, r) {
    const LO = 36;  // C2
    const HI = 83;  // B5
    const W = 14;
    const isBlack = (m) => [1, 3, 6, 8, 10].indexOf(m % 12) > -1;
    const sounding = new Set(v.upper.concat([v.bass]));
    const nameOf = {};
    r.tones.forEach((t) => { nameOf[t.pc] = t.name; });
    nameOf[r.bass.pc] = r.bass.name;
    let whites = '';
    let blacks = '';
    let labels = '';
    let x = 0;
    const whiteX = {};
    for (let m = LO; m <= HI; m++) {
      if (isBlack(m)) continue;
      whiteX[m] = x;
      const on = sounding.has(m);
      whites += '<rect class="pk-w' + (on ? (m === v.bass ? ' is-bass' : ' is-on') : '') + '" x="' + x + '" y="0" width="' + (W - 1) + '" height="64" rx="2"/>';
      if (on) labels += '<text class="pk-label" x="' + (x + (W - 1) / 2) + '" y="56">' + esc(nameOf[m % 12] || '') + '</text>';
      if (m % 12 === 0) labels += '<text class="pk-oct" x="' + (x + 2) + '" y="76">C' + (Math.floor(m / 12) - 1) + '</text>';
      x += W;
    }
    for (let m = LO; m <= HI; m++) {
      if (!isBlack(m)) continue;
      const bx = whiteX[m - 1] + W - 4.5;
      const on = sounding.has(m);
      blacks += '<rect class="pk-b' + (on ? (m === v.bass ? ' is-bass' : ' is-on') : '') + '" x="' + bx + '" y="0" width="8" height="40" rx="1.5"/>';
      if (on) labels += '<text class="pk-label pk-label-b" x="' + (bx + 4) + '" y="34">' + esc(nameOf[m % 12] || '') + '</text>';
    }
    return '<svg class="piano" viewBox="-1 -1 ' + (x + 1) + ' 80" role="img" aria-label="Piano voicing: ' +
      esc([v.bass].concat(v.upper).map((m) => nameOf[m % 12]).join(' ')) + '">' + whites + blacks + labels + '</svg>';
  }

  function guitarSVG(shape, r) {
    const frets = shape.frets;
    const fretted = frets.filter((f) => f > 0);
    const maxF = fretted.length ? Math.max.apply(null, fretted) : 0;
    const minF = fretted.length ? Math.min.apply(null, fretted) : 0;
    const start = maxF <= 4 ? 1 : minF;
    const rows = 4;
    const sx = 22; const sy = 26; const gap = 20; const fh = 26;
    const width = sx * 2 + gap * 5;
    let s = '';
    // strings + frets
    for (let i = 0; i < 6; i++) s += '<line class="gs" x1="' + (sx + i * gap) + '" y1="' + sy + '" x2="' + (sx + i * gap) + '" y2="' + (sy + rows * fh) + '"/>';
    for (let f = 0; f <= rows; f++) {
      const cls = f === 0 && start === 1 ? 'gnut' : 'gf';
      s += '<line class="' + cls + '" x1="' + sx + '" y1="' + (sy + f * fh) + '" x2="' + (sx + gap * 5) + '" y2="' + (sy + f * fh) + '"/>';
    }
    if (start > 1) s += '<text class="gpos" x="' + (sx + gap * 5 + 8) + '" y="' + (sy + fh / 2 + 4) + '">' + start + 'fr</text>';
    // barre
    if (shape.barre) {
      const y = sy + (shape.barre.fret - start + 0.5) * fh;
      s += '<rect class="gbarre" x="' + (sx + shape.barre.from * gap - 7) + '" y="' + (y - 7) + '" width="' + ((shape.barre.to - shape.barre.from) * gap + 14) + '" height="14" rx="7"/>';
    }
    // dots and markers
    frets.forEach((f, i) => {
      const x = sx + i * gap;
      const pc = f >= 0 ? (T.GUITAR_OPEN[i] + f) % 12 : null;
      const isRoot = pc === r.root.pc;
      if (f < 0) s += '<text class="gmark" x="' + x + '" y="' + (sy - 9) + '">×</text>';
      else if (f === 0) s += '<circle class="gopen' + (isRoot ? ' is-root' : '') + '" cx="' + x + '" cy="' + (sy - 13) + '" r="4.5"/>';
      else {
        const y = sy + (f - start + 0.5) * fh;
        s += '<circle class="gdot' + (isRoot ? ' is-root' : '') + '" cx="' + x + '" cy="' + y + '" r="7.5"/>';
      }
    });
    // note names under strings
    const nameOf = {};
    r.tones.forEach((t) => { nameOf[t.pc] = t.name; });
    nameOf[r.bass.pc] = r.bass.name;
    frets.forEach((f, i) => {
      if (f < 0) return;
      s += '<text class="gname" x="' + (sx + i * gap) + '" y="' + (sy + rows * fh + 18) + '">' + esc(nameOf[(T.GUITAR_OPEN[i] + f) % 12] || '') + '</text>';
    });
    const tab = frets.map((f) => (f < 0 ? 'x' : f)).join(' ');
    return '<div class="guitar-wrap"><svg class="guitar" viewBox="0 0 ' + (width + 22) + ' ' + (sy + rows * fh + 28) + '" role="img" aria-label="Guitar shape ' + esc(tab) + ', low string first">' + s + '</svg>' +
      '<p class="tab">' + esc(tab) + '</p></div>';
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
    if (e.key === ' ' && prog().length) {
      e.preventDefault();
      if (ui.playing) stopPlayback(); else startPlayback();
    }
  });

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
    state.keys[shared.mode] = shared.key;
    state.sevenths = shared.sevenths;
    state.progs[shared.mode] = shared.ids;
    persist();
    setTimeout(() => toast('Loaded a shared progression. Press Play to hear it.'), 300);
  }

  readHash();
  renderAll();
  window.addEventListener('hashchange', () => {
    if (!location.hash) return;
    stopPlayback();
    ui.selected = null;
    readHash();
    renderAll();
  });

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { placeKeyMarker(); drawArrows(); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { placeKeyMarker(); drawArrows(); });
})();
