/* Changes: instrument drawings shared by every view. Pure SVG strings, no state. */
(function (root) {
  'use strict';

  const T = root.Theory;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isBlack = (m) => [1, 3, 6, 8, 10].indexOf(((m % 12) + 12) % 12) > -1;

  // Dot roles used across the app:
  //   root  : amber, the note everything is measured from
  //   tone  : cream, a chord tone
  //   scale : hollow amber, a scale tone you can pass through
  //   blue  : slate, a blue note
  //   bass  : copper, the bass note of a voicing

  // ---------- keyboard ----------
  // opts: { lo, hi, mark(midi) -> null | { role, label } , label }
  function keyboard(opts) {
    const lo = opts.lo;
    const hi = opts.hi;
    const W = 14;
    let whites = '';
    let blacks = '';
    let labels = '';
    let x = 0;
    const whiteX = {};
    for (let m = lo; m <= hi; m++) {
      if (isBlack(m)) continue;
      whiteX[m] = x;
      const mk = opts.mark(m);
      whites += '<rect class="pk-w' + (mk ? ' is-' + mk.role : '') + '" x="' + x + '" y="0" width="' + (W - 1) + '" height="64" rx="2"/>';
      if (mk && mk.label) labels += '<text class="pk-label' + (mk.role === 'scale' ? ' on-scale' : '') + '" x="' + (x + (W - 1) / 2) + '" y="56">' + esc(mk.label) + '</text>';
      if (m % 12 === 0) labels += '<text class="pk-oct" x="' + (x + 2) + '" y="76">C' + (Math.floor(m / 12) - 1) + '</text>';
      x += W;
    }
    for (let m = lo; m <= hi; m++) {
      if (!isBlack(m) || whiteX[m - 1] === undefined) continue;
      const bx = whiteX[m - 1] + W - 4.5;
      const mk = opts.mark(m);
      blacks += '<rect class="pk-b' + (mk ? ' is-' + mk.role : '') + '" x="' + bx + '" y="0" width="8" height="40" rx="1.5"/>';
      if (mk && mk.label) labels += '<text class="pk-label pk-label-b' + (mk.role === 'scale' ? ' on-scale' : '') + '" x="' + (bx + 4) + '" y="34">' + esc(mk.label) + '</text>';
    }
    return '<svg class="piano" viewBox="-1 -1 ' + (x + 1) + ' 80" role="img" aria-label="' + esc(opts.label || 'Keyboard') + '">' +
      whites + blacks + labels + '</svg>';
  }

  // ---------- fretboard (horizontal, high string on top like a tab) ----------
  // opts: { instrument, from, to, mark(stringIndex, fret, midi) -> null | { role, label }, label }
  function fretboard(opts) {
    const tun = T.TUNINGS[opts.instrument || 'guitar'];
    const n = tun.open.length;
    const from = opts.from || 0;
    const to = opts.to == null ? 15 : opts.to;
    const fw = 42;
    const sg = 20;
    const left = 30;
    const top = 22;
    const openW = from === 0 ? 30 : 0;
    const x0 = left + openW;
    const frets = to - Math.max(from, 1) + 1;
    const width = x0 + frets * fw + 12;
    const height = top + (n - 1) * sg + 26;
    const rowY = (s) => top + (n - 1 - s) * sg; // string 0 (lowest) at the bottom
    const colX = (f) => (f === 0 ? left + openW / 2 - 2 : x0 + (f - Math.max(from, 1) + 0.5) * fw);
    let g = '';
    // fret numbers + inlays
    for (let f = Math.max(from, 1); f <= to; f++) {
      const cx = colX(f);
      g += '<text class="fb-num" x="' + cx + '" y="' + (top - 10) + '">' + f + '</text>';
      if ([3, 5, 7, 9, 15].indexOf(f) > -1) g += '<circle class="fb-inlay" cx="' + cx + '" cy="' + (top + (n - 1) * sg / 2) + '" r="3.2"/>';
      if (f === 12) {
        g += '<circle class="fb-inlay" cx="' + cx + '" cy="' + (top + (n - 1) * sg * 0.25) + '" r="3.2"/>';
        g += '<circle class="fb-inlay" cx="' + cx + '" cy="' + (top + (n - 1) * sg * 0.75) + '" r="3.2"/>';
      }
    }
    // frets
    for (let f = Math.max(from, 1) - 1; f <= to; f++) {
      const x = x0 + (f - Math.max(from, 1) + 1) * fw;
      g += '<line class="' + (f === 0 ? 'fb-nut' : 'fb-fret') + '" x1="' + x + '" y1="' + top + '" x2="' + x + '" y2="' + (top + (n - 1) * sg) + '"/>';
    }
    // strings + names
    for (let s = 0; s < n; s++) {
      const y = rowY(s);
      g += '<line class="fb-string" x1="' + (from === 0 ? left + 4 : x0) + '" y1="' + y + '" x2="' + (width - 12) + '" y2="' + y + '" style="stroke-width:' + (n === 6 ? 0.6 + (5 - s) * 0.22 : 0.9) + '"/>';
      g += '<text class="fb-str" x="' + 12 + '" y="' + (y + 3.5) + '">' + esc(tun.labels[s]) + '</text>';
    }
    // dots
    let dots = '';
    for (let s = 0; s < n; s++) {
      for (let f = from; f <= to; f++) {
        const midi = tun.open[s] + f;
        const mk = opts.mark(s, f, midi);
        if (!mk) continue;
        const cx = colX(f);
        const cy = rowY(s);
        dots += '<g class="fb-dot is-' + mk.role + '"><circle cx="' + cx + '" cy="' + cy + '" r="8.2"/>' +
          (mk.label ? '<text x="' + cx + '" y="' + (cy + 3) + '">' + esc(mk.label) + '</text>' : '') + '</g>';
      }
    }
    return '<div class="fb-scroll"><svg class="fretboard" viewBox="0 0 ' + width + ' ' + height + '" style="min-width:' + Math.round(width * 0.82) + 'px" role="img" aria-label="' + esc(opts.label || 'Fretboard') + '">' + g + dots + '</svg></div>';
  }

  // ---------- chord box (vertical, low string on the left) ----------
  // nameOf: { pc: noteName } for the labels under the strings.
  function chordBox(shape, rootPc, nameOf, instrument, small) {
    const tun = T.TUNINGS[instrument || 'guitar'];
    const n = tun.open.length;
    const frets = shape.frets;
    const fretted = frets.filter((f) => f > 0);
    const maxF = fretted.length ? Math.max.apply(null, fretted) : 0;
    const minF = fretted.length ? Math.min.apply(null, fretted) : 0;
    const start = maxF <= 4 ? 1 : minF;
    const rows = 4;
    const gap = n === 6 ? 20 : 26;
    const sx = 22;
    const sy = 26;
    const fh = 26;
    const width = sx * 2 + gap * (n - 1);
    let s = '';
    for (let i = 0; i < n; i++) s += '<line class="gs" x1="' + (sx + i * gap) + '" y1="' + sy + '" x2="' + (sx + i * gap) + '" y2="' + (sy + rows * fh) + '"/>';
    for (let f = 0; f <= rows; f++) {
      const cls = f === 0 && start === 1 ? 'gnut' : 'gf';
      s += '<line class="' + cls + '" x1="' + sx + '" y1="' + (sy + f * fh) + '" x2="' + (sx + gap * (n - 1)) + '" y2="' + (sy + f * fh) + '"/>';
    }
    if (start > 1) s += '<text class="gpos" x="' + (sx + gap * (n - 1) + 8) + '" y="' + (sy + fh / 2 + 4) + '">' + start + 'fr</text>';
    if (shape.barre) {
      const y = sy + (shape.barre.fret - start + 0.5) * fh;
      s += '<rect class="gbarre" x="' + (sx + shape.barre.from * gap - 7) + '" y="' + (y - 7) + '" width="' + ((shape.barre.to - shape.barre.from) * gap + 14) + '" height="14" rx="7"/>';
    }
    frets.forEach((f, i) => {
      const x = sx + i * gap;
      const pc = f >= 0 ? (tun.open[i] + f) % 12 : null;
      const isRoot = pc === rootPc;
      if (f < 0) s += '<text class="gmark" x="' + x + '" y="' + (sy - 9) + '">×</text>';
      else if (f === 0) s += '<circle class="gopen' + (isRoot ? ' is-root' : '') + '" cx="' + x + '" cy="' + (sy - 13) + '" r="4.5"/>';
      else s += '<circle class="gdot' + (isRoot ? ' is-root' : '') + '" cx="' + x + '" cy="' + (sy + (f - start + 0.5) * fh) + '" r="7.5"/>';
    });
    if (!small && nameOf) {
      frets.forEach((f, i) => {
        if (f < 0) return;
        s += '<text class="gname" x="' + (sx + i * gap) + '" y="' + (sy + rows * fh + 18) + '">' + esc(nameOf[(tun.open[i] + f) % 12] || '') + '</text>';
      });
    }
    const tab = frets.map((f) => (f < 0 ? 'x' : f)).join(' ');
    return '<svg class="' + (small ? 'gbox-small' : 'guitar') + '" viewBox="0 0 ' + (width + 22) + ' ' + (sy + rows * fh + (small ? 6 : 28)) +
      '" role="img" aria-label="' + esc(tun.name + ' shape ' + tab + ', lowest string first') + '">' + s + '</svg>';
  }

  function legend(items) {
    return '<ul class="legend">' + items.map((it) =>
      '<li><span class="lg-dot is-' + it.role + '"></span>' + esc(it.text) + '</li>').join('') + '</ul>';
  }

  root.Instruments = { keyboard, fretboard, chordBox, legend, isBlack };
})(window);
