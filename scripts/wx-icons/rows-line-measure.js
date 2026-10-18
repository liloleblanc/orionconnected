// Run in headless Chrome on a page served from rows-line.py's workdir
// (live-shot style: evaluated with awaitPromise). Draws every raw icon of
// both sets at 8 pixels to the unit and returns the drawn extent of each, in
// sheet units: { white: {name: {x,y,w,h,n,edge}}, color: {...}, k }.
(async () => {
  const K = 8;
  const index = await (await fetch('raw/index.json')).json();
  const extent = async (file, view) => {
    let txt = await (await fetch(file)).text();
    const px = Math.round(view[2] * K);
    txt = txt.replace('<svg ', '<svg width="' + px + '" height="' + px + '" ');
    const url = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
    const cv = document.createElement('canvas'); cv.width = cv.height = px;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, px, px);
    const a = cx.getImageData(0, 0, px, px).data;
    let x0 = px, y0 = px, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      if (a[(y * px + x) * 4 + 3] > 0) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    URL.revokeObjectURL(url);
    const edge = x0 === 0 || y0 === 0 || x1 === px - 1 || y1 === px - 1;
    return { x: view[0] + x0 / K, y: view[1] + y0 / K, w: (x1 + 1 - x0) / K, h: (y1 + 1 - y0) / K, n, edge };
  };
  const out = { k: K, white: {}, color: {} };
  for (const set of ['white', 'color']) {
    for (const [name, view] of Object.entries(index)) out[set][name] = await extent('raw/' + set + '/' + name + '.svg', view);
  }
  return out;
})()
