# Changes

A slide rule for harmony. Pick a key, start from the main chords, and follow the arrows into secondary dominants, borrowed chords, diminished passing chords and the Neapolitan. Hear every chord, see it on piano and guitar, and play the whole progression back.

**Live:** https://mattbeninghof.github.io/changes/

## Two systems

- **Major:** the seven diatonic chords, secondary dominants (play one, then resolve to its target), and modal interchange from the parallel minor (enter from I, IV or V, mix freely, return to I, IV or V).
- **Minor:** harmonic-minor main chords, the vii°7 of V (four inversions, mix freely, land on V), the vii°7 of iv (mix freely, rise to iv or ♭VI), and the Neapolitan sixth (to V, directly or through vii°7/V).

Turn off **Follow the arrows** to play anything.

## Files

- `index.html`, `styles.css`: the page
- `theory.js`: spelling, chord catalog, movement rules, voice leading, guitar shape search (no DOM)
- `audio.js`: a small Web Audio keys synth
- `app.js`: the interface
- `test/`: open `test/index.html` in a browser, or run `sh test/run.sh` on macOS

Plain HTML, CSS and JS. No build step, no dependencies.
