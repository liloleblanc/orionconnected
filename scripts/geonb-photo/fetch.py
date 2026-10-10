#!/usr/bin/env python3
"""Download the GeoNB aerial photo of an airfield in chunks.

  python3 fetch.py <grid.json> <outdir>

grid.json names the photo's web-map tile box at its native zoom (z18 for
GeoNB's 2021 imagery): the first tile x0/y0, how many across (nx) and down
(ny), and the chunk size in tiles. Each chunk is one export request from
GeoNB's Imagery Basemap, drawn in Web Mercator (bboxSR/imageSR 3857) so its
pixels line up with the web map's own tiles. Chunks are saved as
c_<x>_<y>_<w>x<h>.jpg, which `swift mosaic.swift stitch` puts back together.
"""
import json, math, os, sys, time, urllib.request

EXPORT = 'https://geonb.snb.ca/arcgis/rest/services/GeoNB_Basemap_Imagery/MapServer/export'
UA = 'OrionConnectedFIDS/1.0 (airport display boards; +https://fids.orionconnected.com)'
R = 20037508.342789244

g = json.load(open(sys.argv[1]))
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
n = 2 ** g['z']
tw = 2 * R / n
for ty in range(g['y0'], g['y0'] + g['ny'], g['chunk']):
    for tx in range(g['x0'], g['x0'] + g['nx'], g['chunk']):
        w = min(g['chunk'], g['x0'] + g['nx'] - tx)
        h = min(g['chunk'], g['y0'] + g['ny'] - ty)
        name = os.path.join(out, 'c_%d_%d_%dx%d.jpg' % (tx, ty, w, h))
        if os.path.exists(name):
            continue
        x0 = -R + tx * tw
        y1 = R - ty * tw
        bbox = (x0, y1 - h * tw, x0 + w * tw, y1)
        url = EXPORT + '?bbox=%.4f,%.4f,%.4f,%.4f&bboxSR=3857&imageSR=3857&size=%d,%d&format=jpg&f=image' % (bbox + (w * 256, h * 256))
        data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=120).read()
        open(name, 'wb').write(data)
        print(name, len(data))
        time.sleep(1)
