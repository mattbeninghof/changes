/* Changes: theory tests. Runs in the browser (test/index.html) or headless via test/run.sh. */
(function (root) {
  'use strict';
  const T = root.Theory;
  const results = [];
  function test(name, fn) {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, err: String(e && e.message || e) }); }
  }
  function eq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg ? msg + ': ' : '') + 'expected ' + sb + ', got ' + sa);
  }
  function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

  const symbols = (mode, key, ids, sev) => ids.map((id) => T.realize(mode, key, id, sev).symbol);
  const groupIds = (mode, g) => T.MODES[mode].chords.filter((c) => c.group === g).map((c) => c.id);

  // ---------- spelling ----------

  test('C major main chords, sevenths', () => {
    eq(symbols('major', 'C', groupIds('major', 'main'), true),
      ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7♭5']);
  });

  test('C major secondary dominants and their targets', () => {
    const ids = groupIds('major', 'secdom');
    eq(symbols('major', 'C', ids, true), ['G7', 'A7', 'B7', 'C7', 'D7', 'E7']);
    eq(ids.map((id) => T.MODES.major.byId[id].to[0]), ['I', 'ii', 'iii', 'IV', 'V', 'vi']);
  });

  test('C major modal interchange', () => {
    eq(symbols('major', 'C', groupIds('major', 'modal'), true), ['Dm7♭5', 'E♭maj7', 'Fm7', 'A♭maj7', 'B♭7']);
  });

  test('A minor main chords, triads (matches the minor card)', () => {
    eq(symbols('minor', 'A', groupIds('minor', 'main'), false), ['Am', 'B°', 'C+', 'Dm', 'E7', 'F', 'G♯°']);
  });

  test('A minor secondary diminished and Neapolitan', () => {
    eq(symbols('minor', 'A', groupIds('minor', 'dimV'), false), ['A°7', 'C°7', 'D♯°7', 'F♯°7']);
    eq(symbols('minor', 'A', groupIds('minor', 'dimIV'), false), ['B♭°7', 'C♯°7', 'E°7', 'G°7']);
    eq(T.realize('minor', 'A', 'N6', true).symbol, 'B♭/D');
  });

  test('F minor: vii°7/V is B D F A♭ in every inversion', () => {
    groupIds('minor', 'dimV').forEach((id) => {
      const pcs = T.realize('minor', 'F', id, true).pcs.slice().sort((a, b) => a - b);
      eq(pcs, [2, 5, 8, 11], id);
    });
  });

  test('E♭ major spells flats, F♯ major spells sharps', () => {
    eq(symbols('major', 'E♭', ['I', 'IV', 'V', 'vi'], false), ['E♭', 'A♭', 'B♭', 'Cm']);
    eq(symbols('major', 'F♯', ['I', 'IV', 'V', 'vii'], false), ['F♯', 'B', 'C♯', 'E♯°']);
  });

  test('chromatic roots avoid F♭ and C♭ (D♭ major borrowed chords)', () => {
    eq(symbols('major', 'D♭', ['m-bIII', 'm-bVII'], false), ['E', 'B']);
  });

  test('every chord in every key: correct pitches, no double accidentals', () => {
    ['major', 'minor'].forEach((mode) => {
      T.KEY_NAMES[mode].forEach((key) => {
        T.MODES[mode].chords.forEach((c) => {
          [true, false].forEach((sev) => {
            const r = T.realize(mode, key, c.id, sev);
            const q = T.QUALITIES[sev ? c.sev : c.tri];
            eq(r.pcs, q.iv.map((iv) => T.mod(r.root.pc + iv, 12)), mode + ' ' + key + ' ' + c.id);
            const names = [r.root.name, r.bass.name].concat(r.tones.map((t) => t.name));
            ok(names.every((n) => n.indexOf('𝄪') < 0 && n.indexOf('𝄫') < 0 && n.indexOf('?') < 0),
              'double accidental in ' + mode + ' ' + key + ' ' + c.id + ': ' + names.join(' '));
          });
        });
      });
    });
  });

  // ---------- movement rules ----------

  test('start: only main chords', () => {
    eq(T.nextOptions('major', null), groupIds('major', 'main'));
  });

  test('major: secondary dominant must resolve to its target', () => {
    eq(T.nextOptions('major', 'V/vi'), ['vi']);
  });

  test('major: modal interchange opens only from I, IV, V', () => {
    ok(T.nextOptions('major', 'IV').indexOf('m-iv') > -1);
    ok(T.nextOptions('major', 'ii').indexOf('m-iv') < 0);
    eq(T.nextOptions('major', 'm-bVI').slice(0, 3), ['I', 'IV', 'V']);
    ok(T.nextOptions('major', 'm-bVI').indexOf('m-bVII') > -1, 'modal chords mix');
  });

  test('minor: diminished groups mix and resolve', () => {
    const fromTop = T.nextOptions('minor', 'dV-4');
    ok(fromTop.indexOf('V') > -1 && fromTop.indexOf('dV-1') > -1 && fromTop.indexOf('i') < 0);
    const fromBottom = T.nextOptions('minor', 'dIV-3');
    ok(fromBottom.indexOf('iv') > -1 && fromBottom.indexOf('bVI') > -1 && fromBottom.indexOf('V') < 0);
  });

  test('minor: Neapolitan goes to V or through vii°7/V', () => {
    const n = T.nextOptions('minor', 'N6');
    ok(n.indexOf('V') > -1 && n.indexOf('dV-4') > -1 && n.indexOf('i') < 0 && n.indexOf('N6') < 0);
  });

  test('all built-in examples follow the rules', () => {
    ['major', 'minor'].forEach((mode) => {
      T.EXAMPLES[mode].forEach((ex) => {
        ok(T.validate(mode, ex.ids).every(Boolean), mode + ' example "' + ex.name + '" breaks a rule');
      });
    });
  });

  test('validate flags the step that breaks a rule', () => {
    eq(T.validate('major', ['I', 'V/vi', 'IV']), [true, true, false]);
  });

  // ---------- share codes ----------

  test('share code round-trips', () => {
    const code = T.encodeShare('major', 'F♯', true, ['I', 'V/vi', 'vi', 'm-bVII']);
    eq(T.decodeShare(code), { mode: 'major', key: 'F♯', sevenths: true, ids: ['I', 'V/vi', 'vi', 'm-bVII'] });
  });

  test('bad share codes are rejected', () => {
    eq(T.decodeShare('major.Hb.7.I'), null);
    eq(T.decodeShare('minor.A.7.I'), null);
    eq(T.decodeShare('nonsense'), null);
  });

  // ---------- voicings ----------

  test('keyboard voicing keeps chord tones and leads smoothly', () => {
    const chords = ['I', 'vi', 'IV', 'V'].map((id) => T.realize('major', 'C', id, true));
    const vs = T.voiceProgression(chords);
    vs.forEach((v, i) => {
      eq(v.upper.map((n) => T.mod(n, 12)).sort((a, b) => a - b), chords[i].pcs.slice().sort((a, b) => a - b));
      eq(T.mod(v.bass, 12), chords[i].bass.pc);
    });
    // smooth: no voice jumps more than a fifth between neighbours
    for (let i = 1; i < vs.length; i++) {
      const jump = Math.max.apply(null, vs[i].upper.map((n) => Math.min.apply(null, vs[i - 1].upper.map((p) => Math.abs(n - p)))));
      ok(jump <= 7, 'jump of ' + jump + ' into chord ' + i);
    }
  });

  const shape = (v) => v.frets.map((f) => (f < 0 ? 'x' : f)).join('');
  const topShape = (mode, key, id, sev) => {
    const r = T.realize(mode, key, id, sev);
    return shape(T.guitarVoicings(r.pcs, r.bass.pc)[0]);
  };

  test('guitar: familiar open shapes come first', () => {
    eq(topShape('major', 'C', 'I', false), 'x32010');
    eq(topShape('major', 'C', 'vi', false), 'x02210');
    eq(topShape('major', 'G', 'I', false).slice(0, 3), '320');
    eq(topShape('major', 'D', 'I', false), 'xx0232');
    eq(topShape('minor', 'A', 'V', false), '020100');
  });

  test('guitar: every chord in every key has a valid voicing', () => {
    ['major', 'minor'].forEach((mode) => {
      T.KEY_NAMES[mode].forEach((key) => {
        T.MODES[mode].chords.forEach((c) => {
          [true, false].forEach((sev) => {
            const r = T.realize(mode, key, c.id, sev);
            const vs = T.guitarVoicings(r.pcs, r.bass.pc);
            ok(vs.length > 0, 'no voicing for ' + r.symbol);
            vs.forEach((v) => {
              const sounded = v.frets.map((f, i) => (f >= 0 ? T.mod(T.GUITAR_OPEN[i] + f, 12) : null)).filter((x) => x !== null);
              ok(sounded[0] === r.bass.pc, 'wrong bass for ' + r.symbol + ' ' + shape(v));
              ok(sounded.every((pc) => r.pcs.indexOf(pc) > -1), 'stray note in ' + r.symbol + ' ' + shape(v));
              ok(v.maxFret - v.minFret <= 3, 'stretch in ' + r.symbol);
            });
          });
        });
      });
    });
  });

  // ---------- scales, modes, chord-scales ----------

  test('C major harmonized: chords, modes, avoid notes', () => {
    const h = T.harmonize('major', 'C');
    eq(h.map((r) => r.symbol), ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7♭5']);
    eq(h.map((r) => r.mode), ['Ionian', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian', 'Locrian']);
    const ext = (i) => h[i].extensions.map((e) => e.name + (e.avoid ? '*' : ''));
    eq(ext(0), ['9', '11*', '13']);
    eq(ext(1), ['9', '11', '13']);
    eq(ext(2), ['♭9*', '11', '♭13*']);
    eq(ext(3), ['9', '♯11', '13']);
    eq(ext(4), ['9', '11*', '13']);
    eq(ext(6), ['♭9*', '11', '♭13']);
  });

  test('every scale in every key harmonizes to named seventh chords', () => {
    ['major', 'natMinor', 'harmMinor', 'melMinor'].forEach((id) => {
      T.KEY_NAMES.major.concat(T.KEY_NAMES.minor).forEach((k) => {
        T.harmonize(id, k).forEach((r) => ok(r.quality, id + ' ' + k + ' degree ' + (r.degree + 1)));
      });
    });
  });

  test('blues scales spell and label correctly', () => {
    const maj = T.buildScale(T.parseKey('C'), 'majBlues');
    eq(maj.notes.map((n) => n.name), ['C', 'D', 'E♭', 'E', 'G', 'A']);
    eq(maj.degrees, ['1', '2', '♭3', '3', '5', '6']);
    const min = T.buildScale(T.parseKey('A'), 'minBlues');
    eq(min.notes.map((n) => n.name), ['A', 'C', 'D', 'E♭', 'E', 'G']);
    eq(min.degrees, ['1', '♭3', '4', '♭5', '5', '♭7']);
    ok(min.blue.has(3), 'E♭ is the blue note');
  });

  test('every board chord sits inside the scale chosen for it', () => {
    ['major', 'minor'].forEach((mode) => {
      T.KEY_NAMES[mode].forEach((key) => {
        T.MODES[mode].chords.forEach((c) => {
          [true, false].forEach((sev) => {
            const sc = T.chordScale(mode, key, c.id, sev);
            sc.chordPcs.forEach((pc) => ok(sc.pcs.indexOf(pc) > -1, sc.name + ' misses a tone of ' + c.id + ' in ' + key));
          });
        });
      });
    });
  });

  test('chord-scale picks: Dm7 Dorian, E7 to Am is Phrygian dominant, N6 Lydian', () => {
    eq(T.chordScale('major', 'C', 'ii', true).name, 'D Dorian');
    eq(T.chordScale('major', 'C', 'V/vi', true).name, 'E Phrygian dominant');
    eq(T.chordScale('major', 'C', 'V/IV', true).name, 'C Mixolydian');
    eq(T.chordScale('major', 'C', 'm-bVII', true).name, 'B♭ Mixolydian');
    eq(T.chordScale('minor', 'A', 'N6', false).name, 'B♭ Lydian');
    eq(T.chordScale('minor', 'A', 'V', false).name, 'E Phrygian dominant');
  });

  // ---------- blues ----------

  test('12-bar blues in C and A minor', () => {
    const sym = (type, key) => T.BLUES[type].bars.map((id) => T.realizeBlues(type, key, id).symbol);
    eq(sym('major', 'C'), ['C7', 'F7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7']);
    eq(sym('minor', 'A'), ['Am7', 'Dm7', 'Am7', 'Am7', 'Dm7', 'Dm7', 'Am7', 'Am7', 'F7', 'E7', 'Am7', 'E7']);
    eq(T.realizeBlues('major', 'C', 'I').toneLabels, ['R', '3', '5', '♭7']);
  });

  // ---------- ukulele ----------

  const ukeTop = (mode, key, id, sev) => {
    const r = T.realize(mode, key, id, sev);
    return T.fretVoicings(r.pcs, r.bass.pc, 'ukulele')[0].frets.join('');
  };

  test('ukulele: familiar shapes come first', () => {
    eq(ukeTop('major', 'C', 'I', false), '0003');
    eq(ukeTop('major', 'C', 'vi', false), '2000');
    eq(ukeTop('major', 'C', 'IV', false), '2010');
    eq(ukeTop('major', 'G', 'I', false), '0232');
  });

  test('ukulele: every chord in every key has a voicing', () => {
    ['major', 'minor'].forEach((mode) => {
      T.KEY_NAMES[mode].forEach((key) => {
        T.MODES[mode].chords.forEach((c) => {
          [true, false].forEach((sev) => {
            const r = T.realize(mode, key, c.id, sev);
            const vs = T.fretVoicings(r.pcs, r.bass.pc, 'ukulele');
            ok(vs.length > 0, 'no ukulele voicing for ' + r.symbol);
            vs[0].frets.forEach((f, i) => ok(f >= 0 && r.pcs.indexOf(T.mod(T.TUNINGS.ukulele.open[i] + f, 12)) > -1, 'bad uke note in ' + r.symbol));
          });
        });
      });
    });
  });

  // ---------- melody ----------

  test('melody is repeatable, in range, and in the scale', () => {
    const segs = ['I', 'vi', 'IV', 'V'].map((id) => {
      const sc = T.chordScale('major', 'C', id, true);
      return { scalePcs: sc.pcs, chordPcs: sc.chordPcs, beats: 4 };
    });
    const a = T.melody(segs, 3);
    const b = T.melody(segs, 3);
    eq(a, b);
    ok(a.length > 6, 'too few notes');
    a.forEach((n) => {
      ok(n.midi >= 64 && n.midi <= 81, 'out of range');
      const seg = segs[Math.floor(n.beat / 4)];
      ok(seg.scalePcs.indexOf(T.mod(n.midi, 12)) > -1, 'note outside scale');
    });
  });

  // ---------- harmony + MIDI ----------

  const cSegs = () => ['I', 'vi', 'IV', 'V'].map((id) => {
    const sc = T.chordScale('major', 'C', id, false);
    return { scalePcs: sc.pcs, chordPcs: sc.chordPcs, beats: 4 };
  });

  test('harmony voices sit below the melody, in the scale, closest first', () => {
    const segs = cSegs();
    const line = T.melody(segs, 5);
    const voices = T.harmonyVoices(line, segs, 5);
    eq(voices.length, 5);
    voices.forEach((v, k) => {
      ok(v.length > 0, 'voice ' + k + ' is empty');
      v.forEach((n) => {
        const mel = line.find((m) => m.beat === n.beat);
        ok(n.midi < mel.midi, 'harmony above melody');
        const seg = segs[Math.floor(n.beat / 4)];
        ok(seg.scalePcs.indexOf(T.mod(n.midi, 12)) > -1, 'harmony outside the scale');
        if (k > 0) {
          const upper = voices[k - 1].find((m) => m.beat === n.beat);
          ok(upper && n.midi < upper.midi, 'voices cross');
        }
      });
    });
  });

  test('harmony on a chord tone uses the chord: E over C gives C then G', () => {
    const segs = [{ scalePcs: [0, 2, 4, 5, 7, 9, 11], chordPcs: [0, 4, 7], beats: 4 }];
    const v = T.harmonyVoices([{ midi: 76, beat: 0, dur: 1 }], segs, 3);
    eq(v.map((x) => x[0].midi), [72, 67, 64]);
  });

  test('harmony on a passing note moves in diatonic thirds: D over C gives B then G', () => {
    const segs = [{ scalePcs: [0, 2, 4, 5, 7, 9, 11], chordPcs: [0, 4, 7], beats: 4 }];
    const v = T.harmonyVoices([{ midi: 74, beat: 0, dur: 1 }], segs, 2);
    eq(v.map((x) => x[0].midi), [71, 67]);
  });

  test('MIDI file: valid header, tempo, and every note on has its note off', () => {
    const M = root.MidiFile;
    const bytes = M.write({ bpm: 90, tracks: [{ name: 'Chords', program: 4, notes: [{ midi: 60, beat: 0, dur: 1 }, { midi: 64, beat: 0, dur: 1 }] }] });
    const str = (a, b) => String.fromCharCode.apply(null, Array.from(bytes.slice(a, b)));
    eq(str(0, 4), 'MThd');
    eq(Array.from(bytes.slice(8, 14)), [0, 1, 0, 2, 1, 224]); // format 1, 2 tracks, 480 ppq
    eq(str(14, 18), 'MTrk');
    let ons = 0, offs = 0;
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x90 && bytes[i + 2] > 0) ons++;
      if (bytes[i] === 0x80) offs++;
    }
    eq([ons, offs], [2, 2]);
    const us = Math.round(60000000 / 90);
    const tempoAt = Array.from(bytes).findIndex((b, i) => b === 0xff && bytes[i + 1] === 0x51);
    eq(Array.from(bytes.slice(tempoAt + 3, tempoAt + 6)), [(us >> 16) & 255, (us >> 8) & 255, us & 255]);
  });

  // ---------- flip ----------

  test('flip covers every chord on both cards', () => {
    ['major', 'minor'].forEach((m) => {
      const other = m === 'major' ? 'minor' : 'major';
      T.MODES[m].chords.forEach((c) => {
        const out = T.flipProgression(m, [c.id]);
        ok(out.length === 1 && T.MODES[other].byId[out[0]], m + ' ' + c.id + ' has no counterpart');
      });
    });
  });

  test('flip: I vi IV V becomes i bVI iv V, and the lesson flips cleanly', () => {
    eq(T.flipProgression('major', ['I', 'vi', 'IV', 'V']), ['i', 'bVI', 'iv', 'V']);
    eq(T.flipProgression('minor', ['i', 'iv', 'V', 'i']), ['I', 'IV', 'V', 'I']);
    eq(T.flipProgression('major', ['I', 'V/iii', 'iii', 'V']), ['i', 'vii', 'bIII', 'V']);
    // No built-in lesson should flip into the same chord twice in a row.
    T.EXAMPLES.major.forEach((ex) => {
      const f = T.flipProgression('major', ex.ids);
      ok(f.every((id, i) => i === 0 || id !== f[i - 1]), ex.name + ' doubles a chord when flipped: ' + f.join(' '));
    });
    ok(T.validate('minor', T.flipProgression('major', ['I', 'V/IV', 'IV', 'V'])).every(Boolean), 'secondary dominant should become a legal diminished move');
    eq(T.parallelKey('major', 'E♭', 'minor'), 'E♭');
    eq(T.parallelKey('major', 'D♭', 'minor'), 'C♯');
  });

  root.__testResults = results;
})(typeof globalThis !== 'undefined' ? globalThis : this);
