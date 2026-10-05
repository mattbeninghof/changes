/* Changes: theory engine. Pure functions, no DOM, so tests can load it anywhere. */
(function (root) {
  'use strict';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
  const ACC = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
  const ODD = new Set(['F♭', 'C♭', 'E♯', 'B♯']);
  const mod = (n, m) => ((n % m) + m) % m;

  // ---------- notes and spelling ----------

  function makeNote(letter, pc) {
    letter = mod(letter, 7);
    pc = mod(pc, 12);
    const acc = mod(pc - NATURAL_PC[letter] + 6, 12) - 6;
    return { letter, acc, pc, name: LETTERS[letter] + (ACC[acc] !== undefined ? ACC[acc] : '?') };
  }

  // Respell to a natural or single accidental, keeping the direction of the original.
  function simplify(note) {
    const preferFlat = note.acc < 0;
    let best = null;
    for (let l = 0; l < 7; l++) {
      const n = makeNote(l, note.pc);
      if (Math.abs(n.acc) > 1) continue;
      if (n.acc === 0) return n;
      if (!best || (preferFlat ? n.acc < 0 : n.acc > 0)) best = n;
    }
    return best;
  }

  // Double accidentals always get respelled. Chromatic chord roots also lose
  // the rare spellings (F♭, C♭, E♯, B♯), which read as typos to most players.
  function tidy(note, chromatic) {
    if (Math.abs(note.acc) >= 2) return simplify(note);
    if (chromatic && ODD.has(note.name)) return simplify(note);
    return note;
  }

  // ---------- keys ----------

  const KEY_NAMES = {
    major: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'],
    minor: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'],
  };

  function parseKey(name) {
    const letter = LETTERS.indexOf(name[0]);
    const acc = name.indexOf('♯') > -1 ? 1 : name.indexOf('♭') > -1 ? -1 : 0;
    return makeNote(letter, NATURAL_PC[letter] + acc);
  }

  const keyId = (name) => name.replace('♯', 's').replace('♭', 'b');
  const keyFromId = (mode, id) => (KEY_NAMES[mode] || []).find((k) => keyId(k) === id) || null;

  // Same tonic pitch in the other mode (C major -> C minor, D♭ major -> C♯ minor).
  function parallelKey(fromMode, name, toMode) {
    const pc = parseKey(name).pc;
    return KEY_NAMES[toMode].find((k) => parseKey(k).pc === pc);
  }

  // ---------- chord qualities ----------

  const QUALITIES = {
    maj:    { iv: [0, 4, 7],     sym: '',        name: 'major triad' },
    min:    { iv: [0, 3, 7],     sym: 'm',       name: 'minor triad' },
    dim:    { iv: [0, 3, 6],     sym: '°',       name: 'diminished triad' },
    aug:    { iv: [0, 4, 8],     sym: '+',       name: 'augmented triad' },
    maj7:   { iv: [0, 4, 7, 11], sym: 'maj7',    name: 'major seventh' },
    m7:     { iv: [0, 3, 7, 10], sym: 'm7',      name: 'minor seventh' },
    dom7:   { iv: [0, 4, 7, 10], sym: '7',       name: 'dominant seventh' },
    m7b5:   { iv: [0, 3, 6, 10], sym: 'm7♭5',    name: 'half-diminished seventh' },
    dim7:   { iv: [0, 3, 6, 9],  sym: '°7',      name: 'diminished seventh' },
    mMaj7:  { iv: [0, 3, 7, 11], sym: 'm(maj7)', name: 'minor major seventh' },
    maj7s5: { iv: [0, 4, 8, 11], sym: 'maj7♯5',  name: 'augmented major seventh' },
  };
  const STEPS = [0, 2, 4, 6]; // chord tones are stacked letter-thirds

  // ---------- the two systems ----------
  // deg: scale-letter offset from the tonic. semi: semitones from the tonic.
  // col: which main-chord column a tile sits in (0..6, by letter).
  // to: where the chord is allowed to go next (beyond its own group, if it mixes).

  function buildMajor() {
    const main = [
      { id: 'I',   col: 0, deg: 0, semi: 0,  tri: 'maj', sev: 'maj7', num: 'I' },
      { id: 'ii',  col: 1, deg: 1, semi: 2,  tri: 'min', sev: 'm7',   num: 'ii' },
      { id: 'iii', col: 2, deg: 2, semi: 4,  tri: 'min', sev: 'm7',   num: 'iii' },
      { id: 'IV',  col: 3, deg: 3, semi: 5,  tri: 'maj', sev: 'maj7', num: 'IV' },
      { id: 'V',   col: 4, deg: 4, semi: 7,  tri: 'maj', sev: 'dom7', num: 'V' },
      { id: 'vi',  col: 5, deg: 5, semi: 9,  tri: 'min', sev: 'm7',   num: 'vi' },
      { id: 'vii', col: 6, deg: 6, semi: 11, tri: 'dim', sev: 'm7b5', num: 'vii°' },
    ].map((c) => Object.assign(c, { group: 'main', to: [] }));

    const secdom = main.filter((c) => c.id !== 'vii').map((t) => ({
      id: 'V/' + t.id, group: 'secdom', col: t.col,
      deg: t.deg + 4, semi: t.semi + 7, tri: 'dom7', sev: 'dom7',
      num: 'V/' + t.num.replace('°', ''), to: [t.id],
    }));

    const back = ['I', 'IV', 'V'];
    const modal = [
      { id: 'm-ii',   col: 1, deg: 1, semi: 2,  tri: 'dim', sev: 'm7b5', num: 'ii°' },
      { id: 'm-bIII', col: 2, deg: 2, semi: 3,  tri: 'maj', sev: 'maj7', num: '♭III' },
      { id: 'm-iv',   col: 3, deg: 3, semi: 5,  tri: 'min', sev: 'm7',   num: 'iv' },
      { id: 'm-bVI',  col: 5, deg: 5, semi: 8,  tri: 'maj', sev: 'maj7', num: '♭VI' },
      { id: 'm-bVII', col: 6, deg: 6, semi: 10, tri: 'maj', sev: 'dom7', num: '♭VII' },
    ].map((c) => Object.assign(c, { group: 'modal', to: back.slice() }));

    return {
      id: 'major',
      label: 'Major',
      groups: {
        main:   { lane: 'mid',    mix: true,  name: 'Main chord' },
        secdom: { lane: 'top',    mix: false, name: 'Secondary dominant' },
        modal:  { lane: 'bottom', mix: true,  name: 'Modal interchange', entry: back.slice() },
      },
      lanes: {
        top:    { title: 'Secondary dominants', hint: 'Up from any main chord. Play one, then follow its arrow down.' },
        mid:    { title: 'Main chords', hint: 'Start here. Mix these freely.' },
        bottom: { title: 'Modal interchange', hint: 'Down from I, IV or V. Mix freely, then back up to I, IV or V.' },
      },
      chords: main.concat(secdom, modal),
    };
  }

  function buildMinor() {
    const main = [
      { id: 'i',    col: 0, deg: 0, semi: 0,  tri: 'min',  sev: 'mMaj7',  num: 'i' },
      { id: 'ii',   col: 1, deg: 1, semi: 2,  tri: 'dim',  sev: 'm7b5',   num: 'ii°' },
      { id: 'bIII', col: 2, deg: 2, semi: 3,  tri: 'aug',  sev: 'maj7s5', num: '♭III+' },
      { id: 'iv',   col: 3, deg: 3, semi: 5,  tri: 'min',  sev: 'm7',     num: 'iv' },
      { id: 'V',    col: 4, deg: 4, semi: 7,  tri: 'dom7', sev: 'dom7',   num: 'V' },
      { id: 'bVI',  col: 5, deg: 5, semi: 8,  tri: 'maj',  sev: 'maj7',   num: '♭VI' },
      { id: 'vii',  col: 6, deg: 6, semi: 11, tri: 'dim',  sev: 'dim7',   num: 'vii°' },
    ].map((c) => Object.assign(c, { group: 'main', to: [] }));

    // vii°7 of V: one diminished seventh chord, shown on all four of its roots.
    const dimV = [[0, 0], [2, 3], [3, 6], [5, 9]].map(([deg, semi]) => ({
      id: 'dV-' + (deg + 1), group: 'dimV', col: deg, deg, semi,
      tri: 'dim7', sev: 'dim7', num: 'vii°/V', to: ['V'],
    }));

    // vii°7 of iv (which also leans into ♭VI).
    const dimIV = [[1, 1], [2, 4], [4, 7], [6, 10]].map(([deg, semi]) => ({
      id: 'dIV-' + (deg + 1), group: 'dimIV', col: deg, deg, semi,
      tri: 'dim7', sev: 'dim7', num: 'vii°/iv', to: ['iv', 'bVI'],
    }));

    const n6 = {
      id: 'N6', group: 'n6', col: 1, deg: 1, semi: 1, tri: 'maj', sev: 'maj',
      bass: { deg: 3, semi: 5 }, num: 'N⁶',
      to: ['V'].concat(dimV.map((c) => c.id)),
    };

    return {
      id: 'minor',
      label: 'Minor',
      groups: {
        main:  { lane: 'mid',    mix: true,  name: 'Main chord' },
        dimV:  { lane: 'top',    mix: true,  name: 'Secondary diminished' },
        n6:    { lane: 'top',    mix: false, name: 'Neapolitan sixth' },
        dimIV: { lane: 'bottom', mix: true,  name: 'Secondary diminished' },
      },
      lanes: {
        top:    { title: 'Secondary diminished & Neapolitan', hint: 'Up from any main chord. The diminished chords mix, then land on V. The Neapolitan heads to V.' },
        mid:    { title: 'Main chords', hint: 'Start here. Mix these freely.' },
        bottom: { title: 'Secondary diminished', hint: 'Down from any main chord. Mix freely, then rise to iv or ♭VI.' },
      },
      chords: main.concat(n6, dimV, dimIV),
    };
  }

  const MODES = { major: buildMajor(), minor: buildMinor() };
  Object.keys(MODES).forEach((k) => {
    const m = MODES[k];
    m.byId = {};
    m.chords.forEach((c) => { m.byId[c.id] = c; });
  });

  // ---------- realizing a chord in a key ----------

  function realize(modeId, keyName, chordId, sevenths) {
    const mode = MODES[modeId];
    const def = mode && mode.byId[chordId];
    if (!def) return null;
    const tonic = parseKey(keyName);
    const chromatic = def.group !== 'main';
    const qKey = sevenths ? def.sev : def.tri;
    const q = QUALITIES[qKey];

    const root = tidy(makeNote(tonic.letter + def.deg, tonic.pc + def.semi), chromatic);
    const tones = q.iv.map((iv, i) => tidy(makeNote(root.letter + STEPS[i], root.pc + iv), false));
    const bass = def.bass
      ? tidy(makeNote(tonic.letter + def.bass.deg, tonic.pc + def.bass.semi), chromatic)
      : root;
    const slash = bass.pc !== root.pc;

    return {
      id: def.id,
      group: def.group,
      groupName: mode.groups[def.group].name,
      lane: mode.groups[def.group].lane,
      col: def.col,
      num: def.num,
      to: def.to.slice(),
      quality: qKey,
      qualityName: q.name,
      sym: q.sym,
      root,
      bass,
      slash,
      tones,
      pcs: tones.map((t) => t.pc),
      symbol: root.name + q.sym + (slash ? '/' + bass.name : ''),
    };
  }

  // ---------- movement rules ----------

  function nextOptions(modeId, prevId) {
    const m = MODES[modeId];
    const mains = m.chords.filter((c) => c.group === 'main').map((c) => c.id);
    const prev = prevId && m.byId[prevId];
    if (!prev) return mains;
    if (prev.group === 'main') {
      return m.chords
        .filter((c) => {
          if (c.group === 'main') return true;
          const entry = m.groups[c.group].entry;
          return !entry || entry.indexOf(prev.id) > -1;
        })
        .map((c) => c.id);
    }
    const out = prev.to.slice();
    if (m.groups[prev.group].mix) {
      m.chords.forEach((c) => {
        if (c.group === prev.group && out.indexOf(c.id) < 0) out.push(c.id);
      });
    }
    return out;
  }

  function validate(modeId, ids) {
    return ids.map((id, i) => nextOptions(modeId, i ? ids[i - 1] : null).indexOf(id) > -1);
  }

  const EXAMPLES = {
    major: [
      { name: 'The workhorse', ids: ['I', 'V', 'vi', 'IV'] },
      { name: 'Detour through IV', ids: ['I', 'V/IV', 'IV', 'V'] },
      { name: 'Backdoor home', ids: ['IV', 'm-iv', 'm-bVII', 'I'] },
      { name: 'Circle walk', ids: ['I', 'V/vi', 'vi', 'V/ii', 'ii', 'V/V', 'V', 'I'] },
    ],
    minor: [
      { name: 'Minor cadence', ids: ['i', 'iv', 'V', 'i'] },
      { name: 'Neapolitan turn', ids: ['i', 'bVI', 'N6', 'V'] },
      { name: 'Diminished climb', ids: ['i', 'dIV-3', 'iv', 'dV-4', 'V', 'i'] },
      { name: 'Full shadow', ids: ['i', 'N6', 'dV-4', 'V'] },
    ],
  };

  // ---------- share codes ----------

  function encodeShare(modeId, keyName, sevenths, ids) {
    return [modeId, keyId(keyName), sevenths ? '7' : '3', ids.map(encodeURIComponent).join(',')].join('.');
  }

  function decodeShare(code) {
    if (!code) return null;
    const parts = String(code).split('.');
    if (parts.length !== 4) return null;
    const mode = MODES[parts[0]];
    const key = keyFromId(parts[0], parts[1]);
    if (!mode || !key || (parts[2] !== '7' && parts[2] !== '3')) return null;
    let ids;
    try {
      ids = parts[3] ? parts[3].split(',').map(decodeURIComponent) : [];
    } catch (e) {
      return null;
    }
    if (ids.some((id) => !mode.byId[id])) return null;
    return { mode: parts[0], key, sevenths: parts[2] === '7', ids };
  }

  // ---------- keyboard voicing with simple voice leading ----------
  // Bass in octave 2, upper voices in a closed stack starting between G3 and F♯4,
  // choosing the inversion that moves least from the previous chord.

  function voiceChord(pcs, bassPc, prevUpper) {
    const cands = [];
    for (let r = 0; r < pcs.length; r++) {
      const order = pcs.slice(r).concat(pcs.slice(0, r));
      for (let start = 55; start <= 66; start++) {
        if (mod(start, 12) !== order[0]) continue;
        const notes = [start];
        for (let i = 1; i < order.length; i++) {
          let n = notes[i - 1] + 1;
          while (mod(n, 12) !== order[i]) n++;
          notes.push(n);
        }
        cands.push(notes);
      }
    }
    const cost = (notes) => {
      if (!prevUpper || !prevUpper.length) {
        const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
        return Math.abs(mean - 64);
      }
      const near = (a, set) => Math.min.apply(null, set.map((b) => Math.abs(a - b)));
      return notes.reduce((s, n) => s + near(n, prevUpper), 0) +
        prevUpper.reduce((s, n) => s + near(n, notes), 0);
    };
    cands.sort((a, b) => cost(a) - cost(b));
    return { bass: 36 + mod(bassPc, 12), upper: cands[0] };
  }

  function voiceProgression(chords) {
    let prev = null;
    return chords.map((c) => {
      const v = voiceChord(c.pcs, c.bass.pc, prev);
      prev = v.upper;
      return v;
    });
  }

  // ---------- guitar voicings (standard tuning, searched not tabled) ----------

  const GUITAR_OPEN = [40, 45, 50, 55, 59, 64]; // low E to high E
  const guitarCache = {};

  function guitarVoicings(pcs, bassPc, limit) {
    limit = limit || 4;
    const cacheKey = pcs.join(',') + '/' + bassPc + '/' + limit;
    if (guitarCache[cacheKey]) return guitarCache[cacheKey];

    const need = new Set(pcs);
    const fifth = pcs.length >= 4 ? mod(pcs[0] + 7, 12) : null; // optional in 4-note chords
    const found = new Map();

    function evaluate(fr) {
      const sounded = [];
      for (let i = 0; i < 6; i++) if (fr[i] >= 0) sounded.push(i);
      if (sounded.length < 4) return;
      const got = new Set(sounded.map((i) => mod(GUITAR_OPEN[i] + fr[i], 12)));
      for (const pc of need) if (!got.has(pc) && pc !== fifth) return;
      const lo = sounded[0];
      const hi = sounded[sounded.length - 1];
      let interior = 0;
      for (let i = lo; i <= hi; i++) if (fr[i] < 0) interior++;
      if (interior > 1) return;

      const fretted = sounded.filter((i) => fr[i] > 0);
      const frets = fretted.map((i) => fr[i]);
      const minF = frets.length ? Math.min.apply(null, frets) : 0;
      const maxF = frets.length ? Math.max.apply(null, frets) : 0;
      if (maxF - minF > 3) return;

      let barre = null;
      if (frets.length > 4) {
        const at = fretted.filter((i) => fr[i] === minF);
        const a = at[0];
        const b = at[at.length - 1];
        for (let i = a; i <= b; i++) if (fr[i] < minF) return;
        if (1 + frets.filter((f) => f > minF).length > 4) return;
        barre = { fret: minF, from: a, to: b };
      }

      const opens = sounded.length - fretted.length;
      let score = sounded.length * 8
        - interior * 4
        - Math.max(0, minF - 1) * 2.2
        - (maxF - minF) * 1.2
        - (barre ? 2 : 0)
        + (maxF <= 4 ? 4 + opens * 1.2 : 0) // open position reads as "the" shape
        - (opens && maxF >= 5 ? 10 : 0);     // open strings under a high hand are awkward
      if (fifth !== null && !got.has(fifth)) score -= 3;

      const key = fr.join(',');
      const position = maxF <= 4 ? 0 : minF;
      if (!found.has(key)) found.set(key, { frets: fr.slice(), barre, score, minFret: minF, maxFret: maxF, position });
    }

    const fr = [];
    function rec(i, base, bassSet, lo, hi) {
      if (i === 6) { if (bassSet) evaluate(fr); return; }
      const open = GUITAR_OPEN[i];
      fr[i] = -1; // muted
      rec(i + 1, base, bassSet, lo, hi);
      const options = [];
      if (need.has(mod(open, 12))) options.push(0);
      for (let f = base; f <= base + 3; f++) if (need.has(mod(open + f, 12))) options.push(f);
      for (const f of options) {
        const pc = mod(open + f, 12);
        if (!bassSet && pc !== bassPc) continue; // lowest sounding string must be the bass
        fr[i] = f;
        const nlo = f > 0 ? Math.min(lo, f) : lo;
        const nhi = f > 0 ? Math.max(hi, f) : hi;
        if (nhi - nlo > 3) continue;
        rec(i + 1, base, true, nlo, nhi);
      }
      fr[i] = undefined;
    }
    for (let base = 1; base <= 12; base++) rec(0, base, false, 99, -1);

    const sorted = Array.from(found.values()).sort((a, b) => b.score - a.score);
    const picked = [];
    for (const v of sorted) {
      if (picked.some((p) => Math.abs(p.position - v.position) < 2)) continue;
      picked.push(v);
      if (picked.length >= limit) break;
    }
    guitarCache[cacheKey] = picked;
    return picked;
  }

  root.Theory = {
    LETTERS, KEY_NAMES, QUALITIES, MODES, EXAMPLES, GUITAR_OPEN,
    mod, makeNote, simplify, parseKey, keyId, keyFromId, parallelKey,
    realize, nextOptions, validate, encodeShare, decodeShare,
    voiceChord, voiceProgression, guitarVoicings,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
