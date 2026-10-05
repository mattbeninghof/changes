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

  // The lesson: each step adds one idea to the last.
  const EXAMPLES = {
    major: [
      { name: 'Main chords', ids: ['I', 'V', 'vi', 'IV'],
        text: 'Start anywhere in the middle row and mix freely.' },
      { name: 'Add a secondary dominant', ids: ['I', 'V/iii', 'iii', 'V'],
        text: 'Step up from any main chord, then follow its arrow down.' },
      { name: 'Add modal interchange', ids: ['I', 'm-bIII', 'm-bVI', 'm-iv'],
        text: 'Step down from I, IV or V into the parallel minor.' },
      { name: 'Use both', ids: ['I', 'V/IV', 'IV', 'm-bVI'],
        text: 'A borrowed dominant and a borrowed chord in four bars.' },
    ],
    minor: [
      { name: 'Main chords', ids: ['i', 'vii', 'bVI', 'V'],
        text: 'Harmonic minor gives you a real V7 and a leading-tone vii°.' },
      { name: 'Add secondary diminished', ids: ['iv', 'V', 'i', 'dIV-3', 'iv'],
        text: 'Step down to a diminished chord and it rises into iv.' },
      { name: 'Add the Neapolitan', ids: ['i', 'bVI', 'N6', 'V'],
        text: 'The ♭II in first inversion pulls straight to V.' },
      { name: 'Use both', ids: ['i', 'N6', 'dV-4', 'V'],
        text: 'Neapolitan, then a diminished chord, then home to V.' },
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

  // ---------- fretted voicings (searched, not tabled) ----------
  // Guitar requires the chord's bass on the lowest sounding string. Ukulele is
  // re-entrant (G C E A), so it has no real bass and every string is played.

  const TUNINGS = {
    guitar:  { name: 'Guitar',  open: [40, 45, 50, 55, 59, 64], labels: ['E', 'A', 'D', 'G', 'B', 'E'], requireBass: true,  minStrings: 4 },
    ukulele: { name: 'Ukulele', open: [67, 60, 64, 69],         labels: ['G', 'C', 'E', 'A'],           requireBass: false, minStrings: 4 },
  };
  const GUITAR_OPEN = TUNINGS.guitar.open;
  const voicingCache = {};

  function fretVoicings(pcs, bassPc, instrument, limit) {
    const tun = TUNINGS[instrument || 'guitar'];
    const open = tun.open;
    const n = open.length;
    limit = limit || 4;
    const cacheKey = (instrument || 'guitar') + '/' + pcs.join(',') + '/' + bassPc + '/' + limit;
    if (voicingCache[cacheKey]) return voicingCache[cacheKey];

    const need = new Set(pcs);
    const fifth = pcs.length >= 4 ? mod(pcs[0] + 7, 12) : null; // optional in 4-note chords
    const found = new Map();

    function evaluate(fr) {
      const sounded = [];
      for (let i = 0; i < n; i++) if (fr[i] >= 0) sounded.push(i);
      if (sounded.length < tun.minStrings) return;
      const got = new Set(sounded.map((i) => mod(open[i] + fr[i], 12)));
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
      if (i === n) { if (bassSet) evaluate(fr); return; }
      fr[i] = -1; // muted
      rec(i + 1, base, bassSet, lo, hi);
      const options = [];
      if (need.has(mod(open[i], 12))) options.push(0);
      for (let f = base; f <= base + 3; f++) if (need.has(mod(open[i] + f, 12))) options.push(f);
      for (const f of options) {
        if (!bassSet && mod(open[i] + f, 12) !== bassPc) continue; // lowest sounding string carries the bass
        fr[i] = f;
        const nlo = f > 0 ? Math.min(lo, f) : lo;
        const nhi = f > 0 ? Math.max(hi, f) : hi;
        if (nhi - nlo > 3) continue;
        rec(i + 1, base, true, nlo, nhi);
      }
      fr[i] = undefined;
    }
    for (let base = 1; base <= 12; base++) rec(0, base, !tun.requireBass, 99, -1);

    const sorted = Array.from(found.values()).sort((a, b) => b.score - a.score);
    const picked = [];
    for (const v of sorted) {
      if (picked.some((p) => Math.abs(p.position - v.position) < 2)) continue;
      picked.push(v);
      if (picked.length >= limit) break;
    }
    voicingCache[cacheKey] = picked;
    return picked;
  }

  const guitarVoicings = (pcs, bassPc, limit) => fretVoicings(pcs, bassPc, 'guitar', limit);

  // ---------- scales and modes ----------
  // steps: semitones from the scale root. letters: letter offset of each step,
  // so every note gets a real spelling (the ♭3 of a blues scale is a third, not a ♯2).

  const HEPTA = [0, 1, 2, 3, 4, 5, 6];
  const SCALES = {
    major:     { name: 'Major',          steps: [0, 2, 4, 5, 7, 9, 11], letters: HEPTA,
                 modes: ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian'] },
    natMinor:  { name: 'Natural minor',  steps: [0, 2, 3, 5, 7, 8, 10], letters: HEPTA,
                 modes: ['Aeolian', 'Locrian', 'Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian'] },
    harmMinor: { name: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11], letters: HEPTA,
                 modes: ['Harmonic minor', 'Locrian ♮6', 'Ionian ♯5', 'Dorian ♯4', 'Phrygian dominant', 'Lydian ♯2', 'Altered ♭♭7'] },
    melMinor:  { name: 'Melodic minor',  steps: [0, 2, 3, 5, 7, 9, 11], letters: HEPTA,
                 modes: ['Melodic minor', 'Dorian ♭2', 'Lydian augmented', 'Lydian dominant', 'Mixolydian ♭6', 'Locrian ♮2', 'Altered'] },
    majBlues:  { name: 'Major blues',    steps: [0, 2, 3, 4, 7, 9],  letters: [0, 1, 2, 2, 4, 5], blue: [3] },
    minBlues:  { name: 'Minor blues',    steps: [0, 3, 5, 6, 7, 10], letters: [0, 2, 3, 4, 4, 6], blue: [6] },
    dimWH:     { name: 'Diminished (whole-half)', steps: [0, 2, 3, 5, 6, 8, 9, 11], letters: [0, 1, 2, 3, 4, 5, 5, 6] },
  };
  const MAJOR_STEPS = SCALES.major.steps;

  // Scale-degree label for a step: 3 semitones on the third letter reads "♭3".
  function degreeLabel(semi, letter) {
    const d = mod(semi - MAJOR_STEPS[letter] + 6, 12) - 6;
    return (d < 0 ? '♭'.repeat(-d) : '♯'.repeat(d)) + (letter + 1);
  }

  // A mode is a rotation of its parent scale, re-measured from its own root.
  function rotate(parentId, k) {
    const p = SCALES[parentId].steps;
    const steps = p.slice(k).concat(p.slice(0, k)).map((s) => mod(s - p[k], 12));
    return { steps, letters: HEPTA.slice(), name: SCALES[parentId].modes[k], parent: parentId, degree: k };
  }

  // Spell a scale (by id, or a {steps, letters} spec) from a root note.
  function buildScale(rootNote, spec, name) {
    const def = typeof spec === 'string' ? SCALES[spec] : spec;
    const notes = def.steps.map((st, i) => tidy(makeNote(rootNote.letter + def.letters[i], rootNote.pc + st), false));
    const blue = new Set((def.blue || []).map((st) => mod(rootNote.pc + st, 12)));
    return {
      name: rootNote.name + ' ' + (name || def.name),
      modeName: name || def.name,
      root: rootNote,
      notes,
      pcs: notes.map((x) => x.pc),
      degrees: def.steps.map((st, i) => degreeLabel(st, def.letters[i])),
      blue,
    };
  }

  // Which scale to play over a chord on the board (the "back of the card").
  function chordScale(modeId, keyName, chordId, sevenths) {
    const r = realize(modeId, keyName, chordId, sevenths);
    if (!r) return null;
    const def = MODES[modeId].byId[chordId];
    let spec;
    let why;
    if (modeId === 'major') {
      if (def.group === 'main') {
        spec = rotate('major', def.col);
        why = 'mode ' + (def.col + 1) + ' of ' + keyName + ' major';
      } else if (def.group === 'modal') {
        spec = rotate('natMinor', def.col);
        why = 'borrowed from ' + keyName + ' natural minor';
      } else {
        const target = MODES.major.byId[def.to[0]];
        const minorTarget = ['ii', 'iii', 'vi'].indexOf(target.id) > -1;
        spec = minorTarget ? rotate('harmMinor', 4) : rotate('major', 4);
        why = minorTarget ? 'dominant of a minor chord, so it borrows the harmonic minor' : 'dominant of a major chord';
      }
    } else if (def.group === 'main') {
      spec = rotate('harmMinor', def.col);
      why = 'mode ' + (def.col + 1) + ' of ' + keyName + ' harmonic minor';
    } else if (def.group === 'n6') {
      spec = rotate('major', 3);
      why = 'the Neapolitan is a bright major chord, so Lydian fits it';
    } else {
      spec = { steps: SCALES.dimWH.steps, letters: SCALES.dimWH.letters, name: SCALES.dimWH.name };
      why = 'symmetrical, so it fits every inversion of the diminished chord';
    }
    const sc = buildScale(r.root, spec, spec.name);
    sc.why = why;
    sc.chordPcs = r.pcs;
    return sc;
  }

  // ---------- harmonized scales (seventh chords, extensions, modes) ----------

  const QUALITY_BY_SHAPE = {};
  Object.keys(QUALITIES).forEach((k) => { QUALITY_BY_SHAPE[QUALITIES[k].iv.join(',')] = k; });

  const EXT = [
    { step: 1, names: { 1: '♭9', 2: '9', 3: '♯9' } },
    { step: 3, names: { 4: '♭11', 5: '11', 6: '♯11' } },
    { step: 5, names: { 8: '♭13', 9: '13', 10: '♯13' } },
  ];

  function harmonize(scaleId, keyName) {
    const def = SCALES[scaleId];
    if (!def.modes) return [];
    const sc = buildScale(parseKey(keyName), scaleId);
    const n = sc.notes.length;
    return sc.notes.map((rootN, i) => {
      const chordNotes = [0, 2, 4, 6].map((k) => sc.notes[(i + k) % n]);
      const iv = chordNotes.map((x) => mod(x.pc - rootN.pc, 12));
      const quality = QUALITY_BY_SHAPE[iv.join(',')] || null;
      const chordPcs = chordNotes.map((x) => x.pc);
      const extensions = EXT.map((e) => {
        const note = sc.notes[(i + e.step) % n];
        const semi = mod(note.pc - rootN.pc, 12);
        // An extension a half step above a chord tone clashes with it: the classic avoid note.
        const avoid = chordPcs.some((pc) => mod(note.pc - pc, 12) === 1);
        return { name: e.names[semi] || '?', note, avoid };
      });
      return {
        degree: i,
        numeral: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][i],
        root: rootN,
        notes: sc.notes.slice(i).concat(sc.notes.slice(0, i)),
        quality,
        symbol: rootN.name + (quality ? QUALITIES[quality].sym : '?'),
        chordPcs,
        extensions,
        mode: def.modes[i],
      };
    });
  }

  // ---------- blues ----------

  const BLUES = {
    major: {
      label: 'Major blues',
      chords: {
        I:  { deg: 0, semi: 0, q: 'dom7', num: 'I7' },
        IV: { deg: 3, semi: 5, q: 'dom7', num: 'IV7' },
        V:  { deg: 4, semi: 7, q: 'dom7', num: 'V7' },
      },
      bars: ['I', 'IV', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'],
      targets: ['I', 'IV', 'V'],
      scaleFor: { I: 'majBlues', IV: 'minBlues', V: 'minBlues' },
    },
    minor: {
      label: 'Minor blues',
      chords: {
        i:   { deg: 0, semi: 0, q: 'm7',   num: 'i7' },
        iv:  { deg: 3, semi: 5, q: 'm7',   num: 'iv7' },
        bVI: { deg: 5, semi: 8, q: 'dom7', num: '♭VI7' },
        V:   { deg: 4, semi: 7, q: 'dom7', num: 'V7' },
      },
      bars: ['i', 'iv', 'i', 'i', 'iv', 'iv', 'i', 'i', 'bVI', 'V', 'i', 'V'],
      targets: ['i', 'iv', 'V'],
      scaleFor: { i: 'minBlues', iv: 'minBlues', bVI: 'minBlues', V: 'minBlues' },
    },
  };

  function realizeBlues(type, keyName, chordId) {
    const def = BLUES[type].chords[chordId];
    const tonic = parseKey(keyName);
    const rootN = tidy(makeNote(tonic.letter + def.deg, tonic.pc + def.semi), true);
    const q = QUALITIES[def.q];
    const tones = q.iv.map((iv, i) => tidy(makeNote(rootN.letter + STEPS[i], rootN.pc + iv), false));
    return {
      id: chordId, num: def.num, root: rootN, bass: rootN, slash: false, tones,
      pcs: tones.map((t) => t.pc), sym: q.sym, quality: def.q, qualityName: q.name,
      symbol: rootN.name + q.sym,
      // Arpeggio degree labels: R 3 5 ♭7 style.
      toneLabels: q.iv.map((iv, i) => (i === 0 ? 'R' : degreeLabel(iv, STEPS[i]))),
    };
  }

  // ---------- melody (seeded, so the same progression sings the same line) ----------

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // segments: [{ scalePcs, chordPcs, beats }]. Returns [{ midi, beat, dur }] with beat offsets.
  function melody(segments, seed) {
    const rand = rng(seed || 7);
    const LO = 64;
    const HI = 81;
    const pool = (pcs) => { const out = []; for (let m = LO; m <= HI; m++) if (pcs.indexOf(mod(m, 12)) > -1) out.push(m); return out; };
    const nearest = (list, target) => list.reduce((b, m) => (Math.abs(m - target) < Math.abs(b - target) ? m : b), list[0]);
    const RHYTHMS = [
      [1, 1, 1, 1], [1, 0.5, 0.5, 1, 1], [1.5, 0.5, 1, 1], [0.5, 0.5, 1, 2], [2, 1, 1], [1, 1, 2],
    ];
    const out = [];
    let at = 0;
    let prev = 72;
    segments.forEach((seg) => {
      const scale = pool(seg.scalePcs);
      const tones = pool(seg.chordPcs);
      let t = 0;
      while (t < seg.beats - 1e-6) {
        const bar = Math.min(4, seg.beats - t);
        let pattern = RHYTHMS[Math.floor(rand() * RHYTHMS.length)];
        let sum = 0;
        pattern = pattern.filter((d) => (sum += d) <= bar + 1e-6);
        let inner = 0;
        pattern.forEach((d, i) => {
          const strong = Math.abs((inner % 2)) < 1e-6;
          let note;
          if (strong || i === 0) {
            note = nearest(tones, prev + (rand() < 0.5 ? -2 : 2));
          } else {
            const idx = scale.indexOf(nearest(scale, prev));
            const move = [-2, -1, -1, 1, 1, 2][Math.floor(rand() * 6)];
            note = scale[Math.max(0, Math.min(scale.length - 1, idx + move))];
          }
          if (!(i > 0 && rand() < 0.12)) out.push({ midi: note, beat: at + t + inner, dur: d * 0.92 });
          prev = note;
          inner += d;
        });
        t += bar;
      }
      at += seg.beats;
    });
    return out;
  }

  // ---------- harmony under a melody ----------
  // Close harmony, like a vocal or horn section: the melody stays on top and each extra
  // voice takes the next note down. On a chord tone, the next notes down come from the
  // chord. On a passing note, they come from the scale in thirds, so the voices move in
  // parallel and stay in the key. Returns `count` voices, closest first.

  function harmonyVoices(line, segments, count) {
    count = Math.max(0, Math.min(5, count | 0));
    const starts = [];
    let at = 0;
    segments.forEach((sg) => { starts.push(at); at += sg.beats; });
    const segAt = (beat) => {
      let i = 0;
      while (i + 1 < starts.length && starts[i + 1] <= beat + 1e-6) i++;
      return segments[i];
    };
    const voices = [];
    for (let k = 0; k < count; k++) voices.push([]);
    line.forEach((n) => {
      const sg = segAt(n.beat);
      const pc = mod(n.midi, 12);
      let below = [];
      if (sg.chordPcs.indexOf(pc) > -1) {
        for (let m = n.midi - 1; m >= n.midi - 36 && below.length < count; m--) {
          if (sg.chordPcs.indexOf(mod(m, 12)) > -1) below.push(m);
        }
      } else {
        // Walk down the scale and keep every second step: a stack of diatonic thirds.
        const steps = [];
        for (let m = n.midi - 1; m >= n.midi - 40 && steps.length < count * 2; m--) {
          if (sg.scalePcs.indexOf(mod(m, 12)) > -1) steps.push(m);
        }
        below = steps.filter((m, i) => i % 2 === 1);
      }
      below.slice(0, count).forEach((m, k) => voices[k].push({ midi: m, beat: n.beat, dur: n.dur }));
    });
    return voices;
  }

  root.Theory = {
    LETTERS, KEY_NAMES, QUALITIES, MODES, EXAMPLES, GUITAR_OPEN, TUNINGS, SCALES, BLUES,
    mod, makeNote, simplify, tidy, parseKey, keyId, keyFromId, parallelKey,
    realize, nextOptions, validate, encodeShare, decodeShare,
    voiceChord, voiceProgression, guitarVoicings, fretVoicings,
    degreeLabel, rotate, buildScale, chordScale, harmonize, realizeBlues, melody, harmonyVoices,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
