/* Changes: the Scales view. A scale across the instrument, its chords, extensions and modes. */
(function () {
  'use strict';

  const T = window.Theory;
  const A = window.ChordAudio;
  const I = window.Instruments;
  const C = window.Changes;
  const { esc, fmtNote } = C;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const root = $('#view-scales');

  const TYPES = [
    { id: 'major', label: 'Major', keys: 'major', short: 'Major' },
    { id: 'natMinor', label: 'Natural minor', keys: 'minor', short: 'Natural' },
    { id: 'harmMinor', label: 'Harmonic minor', keys: 'minor', short: 'Harmonic' },
    { id: 'melMinor', label: 'Melodic minor', keys: 'minor', short: 'Melodic' },
  ];
  const MINORS = TYPES.filter((t) => t.keys === 'minor');
  const typeOf = (id) => TYPES.find((t) => t.id === id) || TYPES[0];

  const st = C.state.scales;
  if (TYPES.every((t) => t.id !== st.type)) st.type = 'major';
  st.keys = Object.assign({ major: 'C', minor: 'A' }, st.keys || {});
  ['major', 'minor'].forEach((m) => { if (T.KEY_NAMES[m].indexOf(st.keys[m]) < 0) st.keys[m] = m === 'major' ? 'C' : 'A'; });
  st.labels = st.labels === 'notes' ? 'notes' : 'degrees';
  if (MINORS.every((t) => t.id !== st.minorType)) st.minorType = st.type !== 'major' ? st.type : 'natMinor';
  st.degree = Number(st.degree) || 0;

  const keyList = () => T.KEY_NAMES[typeOf(st.type).keys];
  const key = () => st.keys[typeOf(st.type).keys];

  root.innerHTML = `
    <div class="view-head">
      <div>
        <h1 class="view-title">Scales</h1>
        <p class="view-sub">A scale across the whole instrument, the chords it builds, and the mode that goes with each.</p>
      </div>
      <div class="mode" role="radiogroup" aria-label="Major or minor" id="scaleMode">
        <button class="mode-btn" role="radio" data-mode="major"><span class="mode-name">Major</span><span class="mode-sub">bright</span></button>
        <button class="mode-btn" role="radio" data-mode="minor"><span class="mode-name">Minor</span><span class="mode-sub">three flavors</span></button>
      </div>
    </div>

    <section class="controls" aria-label="Key and scale">
      <div class="keybar">
        <div class="keybar-head"><span class="eyebrow">Set the key</span><span class="key-now" id="scaleKeyNow"></span></div>
        <div class="keystrip" id="scaleKeys" role="radiogroup" aria-label="Key"></div>
      </div>
      <div class="seg" role="radiogroup" aria-label="Minor scale" id="scaleType">
        ${MINORS.map((t) => '<button role="radio" data-type="' + t.id + '">' + t.short + '</button>').join('')}
      </div>
    </section>

    <section class="card" aria-labelledby="neckTitle">
      <div class="card-head">
        <div>
          <h2 class="card-title" id="neckTitle"></h2>
          <p class="card-note" id="neckNote"></p>
        </div>
        <div class="card-tools">
          <div class="seg seg-small" role="radiogroup" aria-label="Labels" id="scaleLabels">
            <button role="radio" data-labels="degrees">Degrees</button>
            <button role="radio" data-labels="notes">Notes</button>
          </div>
          <button class="btn btn-quiet btn-small" id="scaleHear" type="button">Hear it</button>
        </div>
      </div>
      <div id="neck"></div>
      <div id="neckLegend"></div>
    </section>

    <section class="card" aria-labelledby="harmTitle">
      <div class="card-head">
        <h2 class="card-title" id="harmTitle">Chords in the scale</h2>
        <p class="card-note">Tap a chord to hear it, an extension to add it, a mode to see it on the neck.</p>
      </div>
      <div class="harm-wrap"><table class="harm" id="harm"></table></div>
    </section>

    <section class="card" aria-labelledby="flowTitle">
      <h2 class="card-title" id="flowTitle">Put it to work</h2>
      <ol class="flow" id="flow"></ol>
    </section>
  `;

  const strip = $('#scaleKeys', root);
  const modeSeg = $('#scaleMode', root);
  const typeSeg = $('#scaleType', root);
  const labelSeg = $('#scaleLabels', root);

  // ---------- controls ----------

  function setSeg(seg, attr, value) {
    seg.querySelectorAll('button').forEach((b) => {
      const on = b.dataset[attr] === value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  function renderControls() {
    strip.innerHTML = C.stripHTML(keyList(), key(), typeOf(st.type).label);
    C.placeMarker(strip);
    $('#scaleKeyNow', root).innerHTML = fmtNote(key()) + ' ' + esc(typeOf(st.type).label.toLowerCase());
    setSeg(typeSeg, 'type', st.type);
    modeSeg.querySelectorAll('.mode-btn').forEach((b) => {
      const on = b.dataset.mode === (st.type === 'major' ? 'major' : 'minor');
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    typeSeg.hidden = st.type === 'major';
    setSeg(labelSeg, 'labels', st.labels);
  }

  C.bindStrip(strip, keyList, key, (k) => {
    st.keys[typeOf(st.type).keys] = k;
    C.persist();
    render();
  });

  // Keep the same tonic when jumping between scale families (C major -> C natural minor).
  function setType(type) {
    if (type === st.type) return;
    const pc = T.parseKey(key()).pc;
    st.type = type;
    if (type !== 'major') st.minorType = type;
    const fam = typeOf(st.type).keys;
    st.keys[fam] = T.KEY_NAMES[fam].find((k) => T.parseKey(k).pc === pc) || st.keys[fam];
    st.degree = 0;
    C.persist();
    render();
  }

  typeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setType(b.dataset.type);
  });

  modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('.mode-btn');
    if (b) setType(b.dataset.mode === 'major' ? 'major' : st.minorType);
  });
  modeSeg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setType(st.type === 'major' ? st.minorType : 'major');
    $('[aria-checked="true"]', modeSeg).focus();
  });

  labelSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    st.labels = b.dataset.labels;
    C.persist();
    renderControls();
    renderNeck();
  });

  // ---------- neck ----------

  function current() {
    const sc = T.buildScale(T.parseKey(key()), st.type);
    const rows = T.harmonize(st.type, key());
    return { sc, rows };
  }

  // The selected mode: same notes, measured from another degree.
  function modeScale(sc) {
    const d = st.degree;
    const spec = T.rotate(st.type, d);
    return T.buildScale(sc.notes[d], spec, spec.name);
  }

  function relativeNote(sc) {
    if (st.type === 'major') {
      const rel = sc.notes[5];
      return 'Shares every note with ' + rel.name + ' natural minor, its relative minor.';
    }
    if (st.type === 'natMinor') {
      const rel = sc.notes[2];
      return 'Shares every note with ' + rel.name + ' major, its relative major.';
    }
    if (st.type === 'harmMinor') return 'Natural minor with a raised 7th, which gives the V chord its pull.';
    return 'Natural minor with a raised 6th and 7th. Smooth going up, and the source of the altered sound.';
  }

  function renderNeck() {
    const { sc } = current();
    const ms = modeScale(sc);
    const inst = C.state.instrument;
    const mark = (pc) => {
      const i = ms.pcs.indexOf(pc);
      if (i < 0) return null;
      return { role: i === 0 ? 'root' : 'tone', label: st.labels === 'notes' ? ms.notes[i].name : ms.degrees[i] };
    };
    $('#neckTitle', root).innerHTML = st.degree === 0
      ? fmtNote(sc.name)
      : fmtNote(ms.name) + ' <span class="muted">· mode ' + (st.degree + 1) + ' of ' + fmtNote(sc.name) + '</span>';
    $('#neckNote', root).innerHTML = fmtNote(ms.notes.map((n) => n.name).join('  ')) + ' &nbsp;·&nbsp; ' + esc(relativeNote(sc));
    $('#neck', root).innerHTML = inst === 'piano'
      ? I.keyboard({ lo: 48, hi: 83, label: ms.name, mark: (m) => mark(T.mod(m, 12)) })
      : I.fretboard({ instrument: inst, from: 0, to: inst === 'ukulele' ? 12 : 15, label: ms.name, mark: (s, f, m) => mark(T.mod(m, 12)) });
    $('#neckLegend', root).innerHTML = I.legend([
      { role: 'root', text: st.degree === 0 ? 'root' : 'root of ' + ms.notes[0].name + ' ' + ms.modeName },
      { role: 'tone', text: 'scale tone' },
    ]);
  }

  $('#scaleHear', root).addEventListener('click', () => {
    const ms = modeScale(current().sc);
    const start = 57 + T.mod(ms.root.pc - 9, 12);
    const line = ms.pcs.map((pc) => start + T.mod(pc - ms.root.pc, 12));
    line.push(start + 12);
    A.playLine(line.concat(line.slice(0, -1).reverse()), 0.17);
  });

  // ---------- harmonized table ----------

  function extendedSymbol(row) {
    const ok = row.extensions.filter((e) => !e.avoid).map((e) => e.name);
    const has = (x) => ok.indexOf(x) > -1;
    const r = row.root.name;
    if (row.quality === 'maj7') return has('13') ? r + 'maj13' : has('9') ? r + 'maj9' : r + 'maj7';
    if (row.quality === 'm7') return has('11') && has('9') ? r + 'm11' : has('9') ? r + 'm9' : r + 'm7';
    if (row.quality === 'dom7') return has('13') && has('9') ? r + '13' : has('9') ? r + '9' : r + '7' + (ok[0] ? '(' + ok[0] + ')' : '');
    return row.symbol + (ok.length ? '(' + ok.join(', ') + ')' : '');
  }

  function playRow(row, extIdx) {
    const pcs = row.chordPcs.slice();
    if (extIdx != null) pcs.push(row.extensions[extIdx].note.pc);
    A.playChord(T.voiceChord(pcs, row.root.pc, null), 0, 1.5);
  }

  function renderHarm() {
    const { rows } = current();
    $('#harm', root).innerHTML =
      '<thead><tr><th scope="col">Degree</th><th scope="col">Scale from here</th><th scope="col">Chord</th><th scope="col">Extensions</th><th scope="col">Mode</th></tr></thead><tbody>' +
      rows.map((row, i) => {
        const sel = i === st.degree;
        return '<tr class="' + (sel ? 'is-selected' : '') + '">' +
          '<th scope="row" class="harm-deg">' + row.numeral + '</th>' +
          '<td class="harm-notes">' + row.notes.map((n, k) => '<span class="' + (k === 0 ? 'is-root' : '') + '">' + fmtNote(n.name) + '</span>').join('') + '</td>' +
          '<td><button type="button" class="next-chip" data-row="' + i + '">' + fmtNote(row.symbol) + '</button></td>' +
          '<td class="harm-ext">' + row.extensions.map((e, k) =>
            '<button type="button" class="ext' + (e.avoid ? ' is-avoid' : '') + '" data-row="' + i + '" data-ext="' + k + '" title="' +
            esc(e.name + ' is ' + e.note.name + (e.avoid ? ', a half step above a chord tone, so it clashes' : '')) + '">' + fmtNote(e.name) + '</button>').join('') + '</td>' +
          '<td><button type="button" class="mode-pick' + (sel ? ' is-on' : '') + '" data-mode="' + i + '" aria-pressed="' + sel + '">' + esc(row.mode) + '</button></td>' +
          '</tr>';
      }).join('') + '</tbody>';
  }

  $('#harm', root).addEventListener('click', (e) => {
    const rows = current().rows;
    const ext = e.target.closest('[data-ext]');
    if (ext) { playRow(rows[Number(ext.dataset.row)], Number(ext.dataset.ext)); return; }
    const ch = e.target.closest('[data-row]');
    if (ch) { playRow(rows[Number(ch.dataset.row)]); return; }
    const md = e.target.closest('[data-mode]');
    if (md) {
      st.degree = Number(md.dataset.mode);
      C.persist();
      renderNeck();
      renderHarm();
      $('[data-mode="' + st.degree + '"]', root).focus();
    }
  });

  // ---------- worked example ----------

  function renderFlow() {
    const { rows } = current();
    const pick = [1, 4, 0, 5].map((i) => rows[i]);
    const list = (arr) => arr.map((x) => '<li>' + x + '</li>').join('');
    $('#flow', root).innerHTML =
      '<li><span class="flow-step">Pick the key</span><ul>' + list([fmtNote(key() + ' ' + typeOf(st.type).label.toLowerCase())]) + '</ul></li>' +
      '<li><span class="flow-step">Choose chords</span><ul>' + list(pick.map((r) => fmtNote(r.symbol))) + '</ul></li>' +
      '<li><span class="flow-step">Add extensions</span><ul>' + list(pick.map((r) => fmtNote(extendedSymbol(r)))) + '</ul></li>' +
      '<li><span class="flow-step">Solo with modes</span><ul>' + list(pick.map((r) => fmtNote(r.root.name + ' ' + r.mode))) + '</ul></li>' +
      '<li class="flow-play"><button type="button" class="btn btn-primary" id="flowPlay">Hear the extended chords</button></li>';
  }

  $('#flow', root).addEventListener('click', (e) => {
    if (!e.target.closest('#flowPlay')) return;
    const ctx = A.ensure();
    if (!ctx) return;
    const rows = current().rows;
    let prev = null;
    [1, 4, 0, 5].forEach((i, k) => {
      const row = rows[i];
      const pcs = row.chordPcs.concat(row.extensions.filter((x) => !x.avoid && x.name.indexOf('11') < 0).slice(0, 1).map((x) => x.note.pc));
      const v = T.voiceChord(pcs, row.root.pc, prev);
      prev = v.upper;
      A.playChord(v, ctx.currentTime + 0.05 + k * 1.6, 1.5);
    });
  });

  // ---------- wiring ----------

  function render() {
    renderControls();
    renderNeck();
    renderHarm();
    renderFlow();
  }

  C.onInstrument(() => renderNeck());
  C.registerView('scales', { show() { render(); }, stop() { A.stopAll(); } });
})();
