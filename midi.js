/* Changes: a tiny Standard MIDI File writer (format 1). Pure, no DOM, so tests can load it anywhere. */
(function (root) {
  'use strict';

  const PPQ = 480; // ticks per quarter note

  function vlq(n) {
    const bytes = [n & 0x7f];
    while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
    return bytes;
  }

  function text(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      out.push(c < 128 ? c : 63); // keep names plain ASCII
    }
    return out;
  }

  function chunk(id, body) {
    const len = body.length;
    return text(id).concat([(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255], body);
  }

  function meta(type, data) {
    return [0xff, type].concat(vlq(data.length), data);
  }

  // events: [{ tick, bytes }] in any order. Note-offs sort ahead of note-ons on the same tick.
  function trackBody(name, events) {
    const sorted = events.slice().sort((a, b) => a.tick - b.tick || a.order - b.order);
    let body = [0].concat(meta(0x03, text(name)));
    let last = 0;
    sorted.forEach((e) => {
      body = body.concat(vlq(e.tick - last), e.bytes);
      last = e.tick;
    });
    return body.concat([0], meta(0x2f, []));
  }

  // tracks: [{ name, channel, program, notes: [{ midi, beat, dur, vel }] }]
  function write(opts) {
    const bpm = opts.bpm || 120;
    const usPerQuarter = Math.round(60000000 / bpm);
    const tempo = trackBody(opts.title || 'Changes', [
      { tick: 0, order: 0, bytes: meta(0x51, [(usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255]) },
      { tick: 0, order: 1, bytes: meta(0x58, [4, 2, 24, 8]) },
    ]);
    const chunks = [chunk('MTrk', tempo)];
    opts.tracks.forEach((t) => {
      const ch = (t.channel || 0) & 15;
      const events = [{ tick: 0, order: 0, bytes: [0xc0 | ch, (t.program || 0) & 127] }];
      t.notes.forEach((n) => {
        const on = Math.max(0, Math.round(n.beat * PPQ));
        const off = Math.max(on + 1, Math.round((n.beat + n.dur) * PPQ));
        const key = Math.max(0, Math.min(127, Math.round(n.midi)));
        const vel = Math.max(1, Math.min(127, Math.round(n.vel || 90)));
        events.push({ tick: on, order: 2, bytes: [0x90 | ch, key, vel] });
        events.push({ tick: off, order: 1, bytes: [0x80 | ch, key, 0] });
      });
      chunks.push(chunk('MTrk', trackBody(t.name, events)));
    });
    const n = chunks.length;
    const header = chunk('MThd', [0, 1, (n >> 8) & 255, n & 255, (PPQ >> 8) & 255, PPQ & 255]);
    const all = header.concat.apply(header, chunks);
    return new Uint8Array(all);
  }

  root.MidiFile = { write, PPQ };
})(typeof globalThis !== 'undefined' ? globalThis : this);
