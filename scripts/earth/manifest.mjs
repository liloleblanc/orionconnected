#!/usr/bin/env node
// ━━ THE EARTH FLOOR'S FILE LIST (build time) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
//   node scripts/earth/manifest.mjs
//
// Writes scripts/earth/manifest.json: every file under fids-current/earth/v1
// with its bytes, sha256 and JPEG size (read from the SOF marker), and fails
// when a square is missing, a file is not a 960 px square (2048×1024 for the
// whole Earth), a file is over 1 MB, anything else sits under earth/, or the
// total is over budget. tests/earth-imagery.test.js holds the disk to this list.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const EARTH = path.join(ROOT, 'fids-current', 'earth');
const OUT = path.join(HERE, 'manifest.json');

export const LAYERS = Array.from({ length: 12 }, (_, i) => 'day-' + String(i + 1).padStart(2, '0')).concat(['night']);
export const BUDGET_BYTES = 160e6;           // the whole set; measured 142 MB at quality 0.82 (2026-10-12)
export const MAX_FILE_BYTES = 1e6;

// every file the set must hold, as published paths under earth/
export function expected() {
  const out = [];
  for (const layer of LAYERS) {
    out.push('v1/world/' + layer + '.jpg');
    for (const [dir, span] of [['t16', 60], ['t32', 30]]) {
      for (let latS = -90; latS < 90; latS += span) {
        for (let lonW = -180; lonW < 180; lonW += span) out.push('v1/' + dir + '/' + layer + '/' + latS + '_' + lonW + '.jpg');
      }
    }
  }
  return out;
}

// width and height from a baseline or progressive JPEG's SOF marker
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const want = expected(), wantSet = new Set(want);
  const have = walk(EARTH, EARTH, []);
  const problems = [];
  for (const p of want) if (!have.includes(p)) problems.push('missing ' + p);
  for (const p of have) if (!wantSet.has(p)) problems.push('not part of the set: earth/' + p);
  const files = [];
  let total = 0;
  for (const p of want) {
    const f = path.join(EARTH, p);
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f), sz = jpegSize(buf);
    const isWorld = p.startsWith('v1/world/');
    if (!sz || sz.w !== (isWorld ? 2048 : 960) || sz.h !== (isWorld ? 1024 : 960)) problems.push('wrong size ' + p + ' ' + JSON.stringify(sz));
    if (buf.length > MAX_FILE_BYTES) problems.push('over 1 MB: ' + p);
    total += buf.length;
    files.push({ path: p, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), w: sz && sz.w, h: sz && sz.h });
  }
  if (total > BUDGET_BYTES) problems.push('total ' + total + ' bytes is over the budget of ' + BUDGET_BYTES);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  fs.writeFileSync(OUT, JSON.stringify({ $about: 'Every file of the Earth floor (fids-current/earth), written by scripts/earth/manifest.mjs.', count: files.length, bytes: total, files }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  console.log(files.length + ' files, ' + (total / 1e6).toFixed(1) + ' MB → ' + path.relative(ROOT, OUT));
}
