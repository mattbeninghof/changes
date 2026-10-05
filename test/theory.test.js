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

  root.__testResults = results;
})(typeof globalThis !== 'undefined' ? globalThis : this);
