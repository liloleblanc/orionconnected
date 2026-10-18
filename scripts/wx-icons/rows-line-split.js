// How the two row sets read across ground luminance (fids-core.js
// _wxRowSetFor, v24053). The board does not split on this: it gives the
// colour set wherever white holds less than 3:1 on the row's ground (above a
// relative luminance of 0.30) and otherwise follows the row's own text ink.
// This measures what that choice costs and gains, icon by icon.
//
// Run in headless Chrome on any page of a served fids-current (live-shot
// style: evaluated with awaitPromise). Draws the 20 drawings of both row sets
// (logos/weather/rows-line-white/, rows-line-color/) at 192 px, keeps every
// pixel the drawing covers (alpha >= 128), and for grey grounds from
// luminance 0.02 to 0.98 takes, per icon, the median WCAG contrast of its
// pixels laid on that ground, then the median over the 20 icons, for each
// set. WCAG contrast depends only on the two luminances, so a grey ground
// stands for every ground of the same luminance.
//
// Returns { split, table }: split is the ground luminance at which the colour
// set's median first reaches the white set's (interpolated between steps);
// table lists each step: [luminance, white median, colour median, icons the
// white set draws better]. Measured 2026-10-12: split 0.563. Between about
// 0.30 and 0.60 neither set reaches 3:1 on most icons.
(async () => {
  const NAMES = ['clear-day', 'partly-cloudy-day', 'sunrise', 'cloudy', 'overcast', 'clear-night', 'partly-cloudy-night', 'rain',
    'lightning-bolt', 'thunderstorms', 'snowflake', 'snow', 'fog', 'wind', 'thunderstorms-rain', 'thermometer-colder',
    'partly-cloudy-day-snow', 'umbrella', 'tornado', 'thermometer-warmer'];
  const P = 192;
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const greyFor = (lum) => { let lo = 0, hi = 255; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (L(m, m, m) < lum) lo = m; else hi = m; } return (lo + hi) / 2; };
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const ink = async (url) => {
    let txt = await (await fetch(url)).text();
    txt = txt.replace('<svg ', '<svg width="' + P + '" height="' + P + '" ');
    const u = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = u; });
    const cv = document.createElement('canvas'); cv.width = cv.height = P;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, P, P);
    URL.revokeObjectURL(u);
    const a = cx.getImageData(0, 0, P, P).data, px = [];
    for (let i = 0; i < a.length; i += 4) if (a[i + 3] >= 128) px.push([a[i], a[i + 1], a[i + 2], a[i + 3] / 255]);
    return px;
  };
  const sets = {};
  for (const set of ['white', 'color']) {
    sets[set] = [];
    for (const n of NAMES) sets[set].push(await ink('/logos/weather/rows-line-' + set + '/' + n + '.svg'));
  }
  const iconMedian = (px, g) => {
    const Lg = L(g, g, g);
    return median(px.map(([r, gg, b, al]) => {
      const Lc = L(al * r + (1 - al) * g, al * gg + (1 - al) * g, al * b + (1 - al) * g);
      return (Math.max(Lc, Lg) + 0.05) / (Math.min(Lc, Lg) + 0.05);
    }));
  };
  const table = [];
  let split = null, prev = null;
  for (let lum = 0.02; lum <= 0.981; lum += 0.01) {
    const g = greyFor(lum);
    const w = sets.white.map((px) => iconMedian(px, g)), c = sets.color.map((px) => iconMedian(px, g));
    const row = [+lum.toFixed(2), +median(w).toFixed(3), +median(c).toFixed(3), w.filter((v, i) => v > c[i]).length];
    table.push(row);
    if (split === null && prev && row[2] >= row[1]) {
      const d0 = prev[1] - prev[2], d1 = row[1] - row[2];
      split = +(prev[0] + (row[0] - prev[0]) * d0 / (d0 - d1)).toFixed(3);
    }
    prev = row;
  }
  return { split, table };
})()
