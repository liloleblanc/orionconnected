// Run in headless Chrome on any page served from fids-current (evaluated with
// awaitPromise: Runtime.evaluate { expression: <this file>, awaitPromise: true,
// returnByValue: true }). Draws every file of the two row sets
// (logos/weather/rows-flat-white/, rows-flat-color/, built by flat.py) and of
// the ink copy's mask (rows-flat-ink/) at the rows' 38 px, keeps the pixels
// that are at least half covered (alpha >= 0.5, the pixels that make the
// drawing out), and sums them up as colour groups, each [r, g, b, alpha,
// share of the pixels], PART BY PART: each pixel goes to the nearest of the
// colours its file is filled with (the white, the grey and the orange of the
// white set; the navy, the blue and the brown of the colour set), and each
// part is grouped on its own (at most K groups in all). A part none of whose
// pixels meets the ground (an uncovered pixel or the edge) is marked
// enclosed: the mercury inside its tube, judged against the tube it sits in
// by the palette, not against the row. fids-core.js _wxRowSeen reads them to
// tell, on any row's ground, how much of each part of a drawing stands at
// 3:1 there, and _wxRowShare how much of the ink copy does (fids-core.js
// _WX_ROW_PX; tests/weather-rows-flat.test.js checks every entry was made
// from the file as it is now, by its SHA-1).
//
// Returns { src, check }: src is the _WX_ROW_PX table as JavaScript, to put in
// fids-core.js in place of the one there; check compares, on a spread of
// grounds, each part's share read from its groups with the share read from
// every one of its pixels (the largest difference).
(async () => {
  const S = 38, K = 24;
  const NAMES = ['clear-day', 'clear-night', 'cloudy', 'drizzle', 'extreme-rain', 'extreme-snow', 'fog', 'hail', 'lightning-bolt', 'mist',
    'overcast-day', 'overcast-night', 'overcast', 'partly-cloudy-day-snow', 'partly-cloudy-day', 'partly-cloudy-night', 'rain', 'sleet', 'snow',
    'snowflake', 'sunrise', 'thermometer-colder', 'thermometer-warmer', 'thunderstorms-day-rain', 'thunderstorms-night-rain',
    'thunderstorms-rain', 'thunderstorms', 'tornado', 'umbrella', 'wind-cloud', 'wind'];
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex2 = (v) => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
  const sha1 = async (txt) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(txt)))].map((b) => hex2(b)).join('');
  const pixels = async (url) => {
    const txt = await (await fetch(url, { cache: 'no-store' })).text();
    const blob = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = blob; });
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S).data;
    URL.revokeObjectURL(blob);
    const px = [], at = [];
    for (let i = 0; i < S * S; i++) if (d[i * 4 + 3] >= 128) { px.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]]); at.push(i); }
    // a covered pixel meets the ground where a neighbour is uncovered or it is at the edge
    const bare = (i) => d[i * 4 + 3] < 128;
    const meets = at.map((i) => { const x = i % S, y = (i - x) / S; return x === 0 || y === 0 || x === S - 1 || y === S - 1 || bare(i - 1) || bare(i + 1) || bare(i - S) || bare(i + S); });
    return { txt, px, meets };
  };
  // the colours a file is filled with, in the order it first uses them
  const fills = (txt) => [...new Set([...txt.matchAll(/fill="#([0-9a-fA-F]{6})"/g)].map((m) => m[1].toUpperCase()))]
    .filter((h) => h !== '000000').map((h) => [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)));
  // K groups by plain k-means on (r, g, b, alpha), started from K pixels
  // spread evenly through the pixels sorted by luminance then alpha, so the
  // same files always give the same table
  const groups = (px, kk) => {
    const order = px.slice().sort((p, q) => (lum(p) - lum(q)) || (p[3] - q[3]));
    const k = Math.min(kk, order.length);
    let c = []; for (let i = 0; i < k; i++) c.push(order[Math.floor((i + 0.5) * order.length / k)].slice());
    let lab = new Array(px.length).fill(0);
    for (let it = 0; it < 60; it++) {
      for (let i = 0; i < px.length; i++) {
        let b = 0, bd = Infinity;
        for (let j = 0; j < c.length; j++) { let s = 0; for (let t = 0; t < 4; t++) s += (px[i][t] - c[j][t]) ** 2; if (s < bd) { bd = s; b = j; } }
        lab[i] = b;
      }
      const sum = c.map(() => [0, 0, 0, 0, 0]);
      for (let i = 0; i < px.length; i++) { const s = sum[lab[i]]; for (let t = 0; t < 4; t++) s[t] += px[i][t]; s[4]++; }
      c = c.map((old, j) => (sum[j][4] ? sum[j].slice(0, 4).map((v) => v / sum[j][4]) : old));
    }
    const n = c.map((_, j) => lab.filter((l) => l === j).length);
    return c.map((g, j) => [...g.map(Math.round), n[j] / px.length]).filter((g) => g[4] > 0);
  };
  // the share of a drawing standing at 3:1 on a ground, from pixels or groups
  const shareOf = (list, G, w) => {
    let on = 0, all = 0;
    for (const p of list) {
      const a = p[3] / 255, wt = w ? p[4] : 1;
      const seen = [0, 1, 2].map((t) => p[t] * a + G[t] * (1 - a));
      all += wt; if (cr(seen, G) >= 3) on += wt;
    }
    return all ? on / all : 0;
  };
  const GROUNDS = [[1, 40, 70], [10, 10, 10], [212, 35, 65], [165, 13, 36], [58, 128, 203], [164, 146, 90], [45, 164, 196], [249, 212, 76],
    [237, 187, 0], [242, 140, 0], [247, 250, 253], [179, 240, 255], [136, 213, 247], [248, 250, 219], [224, 237, 212], [166, 191, 163],
    [125, 132, 139], [64, 81, 96], [3, 63, 119], [255, 255, 255], [0, 86, 90], [218, 53, 68]];
  const SETS = { w: '/logos/weather/rows-flat-white/', c: '/logos/weather/rows-flat-color/', k: '/logos/weather/rows-flat-ink/' };
  const table = { w: {}, c: {}, k: {} };
  let worst = 0, worstAt = '';
  for (const [k, dir] of Object.entries(SETS)) {
    for (const n of NAMES) {
      const { txt, px, meets } = await pixels(dir + n + '.svg');
      // the parts: the mask is one; a drawing, one per colour it is filled with
      const cols = k === 'k' ? [[255, 255, 255]] : fills(txt);
      const lab = px.map((p) => { let b = 0, bd = Infinity; cols.forEach((c, j) => { const s = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (s < bd) { bd = s; b = j; } }); return b; });
      const parts = cols.map((_, j) => ({ px: px.filter((_, i) => lab[i] === j), out: px.some((_, i) => lab[i] === j && meets[i]) })).filter((p) => p.px.length);
      // at most K groups in all, each part its share of them (one at least)
      const ks = parts.map((p) => Math.max(1, Math.floor(K * p.px.length / px.length)));
      while (ks.reduce((a, v) => a + v, 0) > K) ks[ks.indexOf(Math.max(...ks))]--;
      const enc = parts.map((p, j) => {
        const g = groups(p.px, ks[j]);
        for (const G of GROUNDS) {
          const e = Math.abs(shareOf(p.px, G, false) - shareOf(g, G, true));
          if (e > worst) { worst = e; worstAt = k + ' ' + n + ' part ' + j + ' on ' + G.join(','); }
        }
        // each group's share of the whole drawing, so the parts' shares make the whole
        return (p.out ? '' : '~') + g.map((q) => q.slice(0, 4).map(hex2).join('') + hex2(q[4] * p.px.length / px.length * 255)).join('');
      });
      // 'sha1(10):' then each part ('~' first where it never meets the ground), '/' between
      // them, each group as rrggbbaa + its share of the drawing in 255ths
      table[k][n] = (await sha1(txt)).slice(0, 10) + ':' + enc.join('/');
    }
  }
  const lines = (k) => NAMES.map((n) => "    '" + n + "': '" + table[k][n] + "'").join(',\n');
  const src = 'var _WX_ROW_PX = {\n  // the white set (rows-flat-white/, the dark colourway)\n  w: {\n' + lines('w') + '\n  },\n'
    + '  // the colour set (rows-flat-color/, the light colourway)\n  c: {\n' + lines('c') + '\n  },\n'
    + '  // the ink copy\'s mask (rows-flat-ink/, one part)\n  k: {\n' + lines('k') + '\n  }\n};';
  return { src, check: { worst: +worst.toFixed(3), at: worstAt } };
})()
