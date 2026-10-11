(() => {
  const svg = document.documentElement;
  const vb = svg.viewBox.baseVal;
  const shapes = [...svg.querySelectorAll('path,circle,ellipse,rect,polygon,polyline,line')].filter((e) => !(e.tagName === 'rect' && e.getAttribute('width') == vb.width));
  const items = shapes.map((e) => {
    const b = e.getBBox(), m = e.getCTM();
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const cs = getComputedStyle(e);
    return { tag: e.tagName, html: e.outerHTML.replace(/\s+/g, ' '), m: [m.a, m.b, m.c, m.d, m.e, m.f].map((v) => +v.toFixed(4)),
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => +v.toFixed(2)), fill: cs.fill, stroke: cs.stroke,
      r: e.tagName === 'circle' ? +e.getAttribute('r') : 0 };
  });
  return { vb: [vb.x, vb.y, vb.width, vb.height], items };
})()
