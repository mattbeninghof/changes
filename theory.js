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

  // ---------- flipping a progression to the parallel key ----------
  // Each chord maps to the chord that does the same job on the other card. Diatonic chords
  // map degree for degree. Borrowed chords in major are native in minor, and back again.
  // A secondary dominant becomes the diminished chord that leads to the same target.

  const FLIP = {
    major: {
      I: 'i', ii: 'ii', iii: 'bIII', IV: 'iv', V: 'V', vi: 'bVI', vii: 'vii',
      // V/ii and V/iii point at chords minor doesn't tonicize; keep them moving instead of doubling the target.
      'V/I': 'V', 'V/ii': 'iv', 'V/iii': 'vii', 'V/IV': 'dIV-3', 'V/V': 'dV-4', 'V/vi': 'dIV-5',
      'm-ii': 'ii', 'm-bIII': 'bIII', 'm-iv': 'iv', 'm-bVI': 'bVI', 'm-bVII': 'V',
    },
    minor: {
      i: 'I', ii: 'ii', bIII: 'm-bIII', iv: 'IV', V: 'V', bVI: 'm-bVI', vii: 'vii',
      N6: 'IV', 'dV-1': 'V/V', 'dV-3': 'V/V', 'dV-4': 'V/V', 'dV-6': 'V/V',
      'dIV-2': 'V/IV', 'dIV-3': 'V/IV', 'dIV-5': 'V/IV', 'dIV-7': 'V/IV',
    },
  };

  function flipProgression(fromMode, ids) {
    return ids.map((id) => FLIP[fromMode][id]).filter(Boolean);
  }

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

  // ---------- free chords (the Sketchpad) ----------
  // Any chord symbol, spelled by letter so the notes read correctly: [semitones, letter steps].

  const CHORD_TYPES = [
    { id: 'maj',   sym: '',        name: 'major triad',             aliases: ['', 'maj', 'M', 'major'],            tones: [[0, 0], [4, 2], [7, 4]] },
    { id: 'min',   sym: 'm',       name: 'minor triad',             aliases: ['m', 'min', '-', 'minor'],           tones: [[0, 0], [3, 2], [7, 4]] },
    { id: 'dim',   sym: '°',       name: 'diminished triad',        aliases: ['dim', '°', 'o'],                    tones: [[0, 0], [3, 2], [6, 4]] },
    { id: 'aug',   sym: '+',       name: 'augmented triad',         aliases: ['aug', '+', '#5'],                   tones: [[0, 0], [4, 2], [8, 4]] },
    { id: 'sus2',  sym: 'sus2',    name: 'suspended 2nd',           aliases: ['sus2'],                             tones: [[0, 0], [2, 1], [7, 4]] },
    { id: 'sus4',  sym: 'sus4',    name: 'suspended 4th',           aliases: ['sus4', 'sus'],                      tones: [[0, 0], [5, 3], [7, 4]] },
    { id: '6',     sym: '6',       name: 'major sixth',             aliases: ['6', 'maj6', 'M6'],                  tones: [[0, 0], [4, 2], [7, 4], [9, 5]] },
    { id: 'm6',    sym: 'm6',      name: 'minor sixth',             aliases: ['m6', 'min6', '-6'],                 tones: [[0, 0], [3, 2], [7, 4], [9, 5]] },
    { id: '7',     sym: '7',       name: 'dominant seventh',        aliases: ['7', 'dom7', 'dom'],                 tones: [[0, 0], [4, 2], [7, 4], [10, 6]] },
    { id: 'maj7',  sym: 'maj7',    name: 'major seventh',           aliases: ['maj7', 'M7', 'Δ', 'Δ7', 'ma7', 'j7'], tones: [[0, 0], [4, 2], [7, 4], [11, 6]] },
    { id: 'm7',    sym: 'm7',      name: 'minor seventh',           aliases: ['m7', 'min7', '-7', 'mi7'],          tones: [[0, 0], [3, 2], [7, 4], [10, 6]] },
    { id: 'm7b5',  sym: 'm7♭5',    name: 'half-diminished seventh', aliases: ['m7b5', 'ø', 'ø7', '-7b5', 'min7b5'], tones: [[0, 0], [3, 2], [6, 4], [10, 6]] },
    { id: 'dim7',  sym: '°7',      name: 'diminished seventh',      aliases: ['dim7', '°7', 'o7'],                 tones: [[0, 0], [3, 2], [6, 4], [9, 6]] },
    { id: 'mMaj7', sym: 'm(maj7)', name: 'minor major seventh',     aliases: ['mmaj7', 'mM7', 'm(maj7)', '-maj7', 'minmaj7', 'mΔ7'], tones: [[0, 0], [3, 2], [7, 4], [11, 6]] },
    { id: '7sus4', sym: '7sus4',   name: 'dominant 7 suspended',    aliases: ['7sus4', '7sus'],                    tones: [[0, 0], [5, 3], [7, 4], [10, 6]] },
    { id: '7#5',   sym: '7♯5',     name: 'augmented seventh',       aliases: ['7#5', '+7', 'aug7'],                tones: [[0, 0], [4, 2], [8, 4], [10, 6]] },
    { id: 'add9',  sym: 'add9',    name: 'major add 9',             aliases: ['add9', 'add2'],                     tones: [[0, 0], [4, 2], [7, 4], [14, 1]] },
    { id: 'madd9', sym: 'm(add9)', name: 'minor add 9',             aliases: ['madd9', 'm(add9)', 'madd2'],        tones: [[0, 0], [3, 2], [7, 4], [14, 1]] },
    { id: '9',     sym: '9',       name: 'dominant ninth',          aliases: ['9'],                                tones: [[0, 0], [4, 2], [7, 4], [10, 6], [14, 1]] },
    { id: 'maj9',  sym: 'maj9',    name: 'major ninth',             aliases: ['maj9', 'M9', 'Δ9'],                 tones: [[0, 0], [4, 2], [7, 4], [11, 6], [14, 1]] },
    { id: 'm9',    sym: 'm9',      name: 'minor ninth',             aliases: ['m9', 'min9', '-9'],                 tones: [[0, 0], [3, 2], [7, 4], [10, 6], [14, 1]] },
    { id: '7b9',   sym: '7♭9',     name: 'dominant 7 flat 9',       aliases: ['7b9'],                              tones: [[0, 0], [4, 2], [7, 4], [10, 6], [13, 1]] },
    { id: '7#9',   sym: '7♯9',     name: 'dominant 7 sharp 9',      aliases: ['7#9'],                              tones: [[0, 0], [4, 2], [7, 4], [10, 6], [15, 1]] },
    { id: '13',    sym: '13',      name: 'dominant thirteenth',     aliases: ['13'],                               tones: [[0, 0], [4, 2], [10, 6], [21, 5]] },
  ];
  const TYPE_EXACT = {};
  const TYPE_LOOSE = {};
  CHORD_TYPES.forEach((t) => t.aliases.forEach((a) => {
    TYPE_EXACT[a] = t;
    if (a.length > 1) TYPE_LOOSE[a.toLowerCase()] = t;
  }));

  const ACC_IN = { '': 0, '#': 1, '♯': 1, 'b': -1, '♭': -1 };

  // "Em", "A7", "Bbmaj7", "F#m7b5", "G/B", "Cm(maj7)" -> a chord object, or null.
  function parseChord(text) {
    const m = /^\s*([A-Ga-g])([#b♯♭]?)(.*?)(?:\/([A-Ga-g])([#b♯♭]?))?\s*$/.exec(String(text || ''));
    if (!m) return null;
    let q = m[3].replace(/♭/g, 'b').replace(/♯/g, '#').replace(/\s+/g, '');
    let type = TYPE_EXACT[q] || TYPE_EXACT[q.replace(/[()]/g, '')] || TYPE_LOOSE[q.toLowerCase()] || TYPE_LOOSE[q.replace(/[()]/g, '').toLowerCase()];
    if (!type) return null;
    const letter = LETTERS.indexOf(m[1].toUpperCase());
    const rootN = makeNote(letter, NATURAL_PC[letter] + ACC_IN[m[2]]);
    const tones = type.tones.map(([semi, step]) => tidy(makeNote(letter + step, rootN.pc + semi), false));
    let bass = rootN;
    if (m[4]) {
      const bl = LETTERS.indexOf(m[4].toUpperCase());
      bass = makeNote(bl, NATURAL_PC[bl] + ACC_IN[m[5]]);
    }
    const pcs = [];
    tones.forEach((t) => { if (pcs.indexOf(t.pc) < 0) pcs.push(t.pc); });
    const slash = bass.pc !== rootN.pc;
    return {
      id: rootN.name + type.id + (slash ? '/' + bass.name : ''),
      type: type.id, root: rootN, bass, slash, tones, pcs,
      sym: type.sym, qualityName: type.name,
      symbol: rootN.name + type.sym + (slash ? '/' + bass.name : ''),
      third: pcs.indexOf(mod(rootN.pc + 4, 12)) > -1 ? 'major' : pcs.indexOf(mod(rootN.pc + 3, 12)) > -1 ? 'minor' : 'none',
    };
  }

  function parseChords(text) {
    const out = [];
    const bad = [];
    String(text || '').split(/[\s,|]+/).filter(Boolean).forEach((tok) => {
      const c = parseChord(tok);
      if (c) out.push(c); else bad.push(tok);
    });
    return { chords: out, bad };
  }

  // Keys are { tonic: name, mode: 'major' | 'minor' }. Minor counts both the natural
  // and the raised 7th, since V7 in minor borrows it.
  function keyScalePcs(k) {
    const t = parseKey(k.tonic).pc;
    const steps = k.mode === 'major' ? SCALES.major.steps : SCALES.natMinor.steps.concat([11]);
    return steps.map((st) => mod(t + st, 12));
  }

  function detectKey(chords) {
    if (!chords.length) return { tonic: 'C', mode: 'major' };
    let best = null;
    ['major', 'minor'].forEach((mode) => {
      KEY_NAMES[mode].forEach((tonic) => {
        const k = { tonic, mode };
        const sc = keyScalePcs(k);
        const t = parseKey(tonic).pc;
        const isTonic = (c) => c.root.pc === t && c.third === (mode === 'major' ? 'major' : 'minor');
        let score = 0;
        chords.forEach((c) => {
          const fit = c.pcs.filter((pc) => sc.indexOf(pc) > -1).length / c.pcs.length;
          score += fit * fit;
          if (c.root.pc === mod(t + 7, 12) && c.third === 'major') score += 0.3; // a real V
        });
        if (chords.some(isTonic)) score += 0.3;
        if (isTonic(chords[0])) score += 0.3;
        if (isTonic(chords[chords.length - 1])) score += 0.6;
        if (mode === 'minor') score -= 0.05; // tie goes to major
        if (!best || score > best.score + 1e-9) best = { tonic, mode, score };
      });
    });
    return { tonic: best.tonic, mode: best.mode };
  }

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  function numeralFor(c, tonicNote) {
    const deg = mod(c.root.letter - tonicNote.letter, 7);
    const acc = mod(mod(c.root.pc - tonicNote.pc, 12) - MAJOR_STEPS[deg] + 6, 12) - 6;
    let n = ROMAN[deg];
    if (c.third === 'minor' || c.type === 'dim' || c.type === 'dim7' || c.type === 'm7b5') n = n.toLowerCase();
    const suffix = { dim: '°', dim7: '°7', m7b5: 'ø7', aug: '+', '7#5': '+7', maj7: 'maj7', mMaj7: '(maj7)', maj9: 'maj9',
      '6': '6', m6: '6', sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', add9: 'add9', madd9: 'add9' }[c.type] ||
      (['7', 'm7', '9', 'm9', '13', '7b9', '7#9', '7sus4'].indexOf(c.type) > -1 ? (c.type.indexOf('9') > -1 ? '9' : c.type === '13' ? '13' : '7') : '');
    return (acc < 0 ? '♭'.repeat(-acc) : '♯'.repeat(acc)) + n + suffix;
  }

  // What a chord is doing in a key: diatonic, a secondary dominant, borrowed, or chromatic.
  function analyzeChord(c, k) {
    const tonic = parseKey(k.tonic);
    const sc = keyScalePcs(k);
    const inKey = c.pcs.every((pc) => sc.indexOf(pc) > -1);
    const num = numeralFor(c, tonic);
    if (inKey) {
      const tonicChord = c.root.pc === tonic.pc;
      return { numeral: num, role: 'diatonic', text: tonicChord ? 'Home: the tonic chord.' : 'In the key.' };
    }
    // A major chord or dominant a fifth above a chord of the key: a secondary dominant.
    if (c.third === 'major' && ['maj', '7', '9', '13', '7b9', '7#9'].indexOf(c.type) > -1) {
      const targetPc = mod(c.root.pc - 7, 12);
      if (targetPc !== tonic.pc && sc.indexOf(targetPc) > -1) {
        const target = makeNote(c.root.letter - 4, targetPc);
        const steps = k.mode === 'major' ? SCALES.major.steps : SCALES.natMinor.steps;
        const deg = mod(target.letter - tonic.letter, 7);
        // The target's own third, measured inside the key, says whether it is a minor chord.
        const minorTarget = mod(tonic.pc + steps[mod(deg + 2, 7)] - target.pc, 12) === 3;
        let tn = ROMAN[deg];
        if (minorTarget) tn = tn.toLowerCase();
        return { numeral: 'V' + (c.type === 'maj' ? '' : '7') + '/' + tn, role: 'secondary', text: 'Secondary dominant: it points at ' + target.name + '.' };
      }
    }
    const other = { tonic: k.tonic, mode: k.mode === 'major' ? 'minor' : 'major' };
    const osc = keyScalePcs(other);
    if (c.pcs.every((pc) => osc.indexOf(pc) > -1)) {
      return { numeral: num, role: 'borrowed', text: 'Borrowed from ' + k.tonic + ' ' + other.mode + '.' };
    }
    return { numeral: num, role: 'chromatic', text: 'Outside the key: a chromatic color.' };
  }

  // A scale to play over a free chord: the key's own mode when it fits, otherwise the best match.
  const SCALE_PREFS = {
    maj: ['Ionian', 'Lydian', 'Mixolydian'], '6': ['Ionian', 'Lydian'], add9: ['Ionian', 'Lydian'], maj7: ['Ionian', 'Lydian'], maj9: ['Ionian', 'Lydian'],
    min: ['Dorian', 'Aeolian', 'Phrygian'], m6: ['Dorian', 'Melodic minor'], madd9: ['Aeolian', 'Dorian'], m7: ['Dorian', 'Aeolian', 'Phrygian'], m9: ['Dorian', 'Aeolian'],
    '7': ['Mixolydian', 'Lydian dominant'], '9': ['Mixolydian', 'Lydian dominant'], '13': ['Mixolydian'], '7sus4': ['Mixolydian'],
    '7b9': ['Phrygian dominant', 'Diminished (half-whole)'], '7#9': ['Diminished (half-whole)', 'Altered'], '7#5': ['Altered', 'Whole tone'],
    m7b5: ['Locrian', 'Locrian ♮2'], dim: ['Diminished (whole-half)', 'Locrian'], dim7: ['Diminished (whole-half)'],
    aug: ['Lydian augmented', 'Whole tone'], mMaj7: ['Melodic minor', 'Harmonic minor'], sus2: ['Mixolydian', 'Ionian'], sus4: ['Mixolydian', 'Ionian'],
  };

  function freeScale(c, k) {
    const cands = [];
    ['major', 'melMinor', 'harmMinor'].forEach((p) => { for (let i = 0; i < 7; i++) cands.push(rotate(p, i)); });
    cands.push({ steps: SCALES.dimWH.steps, letters: SCALES.dimWH.letters, name: 'Diminished (whole-half)' });
    cands.push({ steps: [0, 1, 3, 4, 6, 7, 9, 10], letters: [0, 1, 1, 2, 3, 4, 5, 6], name: 'Diminished (half-whole)' });
    cands.push({ steps: [0, 2, 4, 6, 8, 10], letters: [0, 1, 2, 3, 4, 6], name: 'Whole tone' });
    const fits = (spec) => c.pcs.every((pc) => spec.steps.indexOf(mod(pc - c.root.pc, 12)) > -1);
    let pick = null;
    let why = '';
    // 1. The key itself, if the chord lives in it.
    if (k) {
      const keyMode = k.mode === 'major' ? 'major' : 'natMinor';
      const kPcs = (k.mode === 'major' ? SCALES.major.steps : SCALES.natMinor.steps).map((st) => mod(parseKey(k.tonic).pc + st, 12));
      const idx = kPcs.indexOf(c.root.pc);
      if (idx > -1 && c.pcs.every((pc) => kPcs.indexOf(pc) > -1)) {
        pick = rotate(keyMode, idx);
        why = 'its own mode in ' + k.tonic + ' ' + k.mode;
      } else if (k.mode === 'minor') {
        const hPcs = SCALES.harmMinor.steps.map((st) => mod(parseKey(k.tonic).pc + st, 12));
        const hi = hPcs.indexOf(c.root.pc);
        if (hi > -1 && c.pcs.every((pc) => hPcs.indexOf(pc) > -1)) { pick = rotate('harmMinor', hi); why = 'from ' + k.tonic + ' harmonic minor'; }
      }
    }
    // 2. The usual choice for this chord type.
    if (!pick) {
      const prefs = SCALE_PREFS[c.type] || [];
      for (const name of prefs) {
        const s = cands.find((x) => x.name === name && fits(x));
        if (s) { pick = s; why = 'the usual color for a ' + c.qualityName; break; }
      }
    }
    // 3. Anything that holds every chord tone.
    if (!pick) { pick = cands.find(fits) || rotate('major', 0); why = 'it holds every chord tone'; }
    const out = buildScale(c.root, pick, pick.name);
    out.why = why;
    out.chordPcs = c.pcs;
    return out;
  }

  root.Theory = {
    LETTERS, KEY_NAMES, QUALITIES, MODES, EXAMPLES, GUITAR_OPEN, TUNINGS, SCALES, BLUES,
    mod, makeNote, simplify, tidy, parseKey, keyId, keyFromId, parallelKey,
    realize, nextOptions, validate, encodeShare, decodeShare, flipProgression,
    voiceChord, voiceProgression, guitarVoicings, fretVoicings,
    degreeLabel, rotate, buildScale, chordScale, harmonize, realizeBlues, melody, harmonyVoices,
    CHORD_TYPES, parseChord, parseChords, detectKey, analyzeChord, freeScale,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
