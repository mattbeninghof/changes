# Changes

A slide rule for harmony. Pick a key, start from the main chords, and follow the arrows into secondary dominants, borrowed chords, diminished passing chords and the Neapolitan. Hear every chord, see it on piano and guitar, and play the whole progression back.

**Live:** https://mattbeninghof.github.io/changes/

## Progressions and Dark harmony

- **Progressions (major keys):** the seven diatonic chords, secondary dominants (play one, then resolve to its target), and modal interchange from the parallel minor (enter from I, IV or V, mix freely, return to I, IV or V).
- **Dark harmony (minor keys):** harmonic-minor main chords, the vii°7 of V (four inversions, mix freely, land on V), the vii°7 of iv (mix freely, rise to iv or ♭VI), and the Neapolitan sixth (to V, directly or through vii°7/V).

Switch between them with the Major/Minor control on the board, or press **Flip** to carry your progression to the parallel key. Turn off **Follow the arrows** to play anything. Every chord also shows the scale to play over it, and **Melody** writes a line over your progression, with up to five **harmony** voices stacked under it.

**Export MIDI** saves the chords (chords and bass tracks). With Melody on, it also saves the melody and each harmony as their own files.

## Blues and Scales

- **Blues:** the 12-bar major and minor blues in any key, a shuffle with boogie bass, the major and minor blues scales (and a mixed view), target-note arpeggios for I, IV and V, an optional improvised solo, and MIDI export (the band as one file, the solo as another).
- **Scales:** a Major/Minor switch, then natural, harmonic or melodic minor, across the whole neck or keyboard, the seventh chords they build, extensions with avoid notes marked, and the mode for each degree.

- **Sketchpad:** type any chords (`Em A7 Dmaj7 G/B`), or pick them from menus. Changes finds the key, labels each chord (in the key, secondary dominant, borrowed or chromatic), suggests a scale for each, and plays, harmonizes and exports them like the other tabs. Share links look like `#sketch=Em,A7,Dmaj7`.

Everything works on **guitar, piano or ukulele**.

## Files

- `index.html`, `styles.css`: the page
- `theory.js`: spelling, chord catalog, movement rules, voice leading, guitar shape search (no DOM)
- `audio.js`: a small Web Audio synth (keys, lead, bass)
- `midi.js`: a tiny Standard MIDI File writer
- `instruments.js`: fretboard, keyboard and chord-box drawings
- `app.js`: shell, Progressions view, shared helpers
- `blues.js`, `scales.js`, `sketch.js`: the Blues, Scales and Sketchpad views
- `test/`: open `test/index.html` in a browser, or run `sh test/run.sh` on macOS

Plain HTML, CSS and JS. No build step, no dependencies.
