#!/usr/bin/env node
// ━━ THE NASA SOURCE PICTURES FOR THE EARTH FLOOR (build time only) ━━━━━━━━━━
//
//   EARTH_CACHE=/some/dir/outside/the/repo node scripts/earth/fetch.mjs [--pin]
//
// Downloads the 13 pictures listed in scripts/earth/sources.json (Blue Marble:
// Next Generation, one per month, and Black Marble 2016) into $EARTH_CACHE,
// each in its own empty directory: $EARTH_CACHE/<layer>/<file>. A download
// that stopped part-way resumes from where it stopped (HTTP Range).
//
// The cache is a few hundred MB, kept once, and never committed. Nothing a
// screen runs ever contacts NASA: the screens read the squares tile.swift cuts
// from these files, from our own origin.
//
// With --pin, the bytes and sha256 of each file are written back into
// sources.json (the first fetch). Without it, a file whose bytes or sha256 do
// not match the pinned values is an error.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = path.join(HERE, 'sources.json');
const CACHE = process.env.EARTH_CACHE;
const PIN = process.argv.includes('--pin');
if (!CACHE) { console.error('Set EARTH_CACHE to a directory outside the repository.'); process.exit(2); }
if (path.resolve(CACHE).startsWith(path.resolve(HERE, '..', '..') + path.sep)) {
  console.error('EARTH_CACHE must be outside the repository.'); process.exit(2);
}

const doc = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));

function sha256Of(file) {
  return new Promise((ok, no) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', no);
  });
}

async function download(src) {
  const dir = path.join(CACHE, src.layer);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, path.basename(new URL(src.url).pathname));
  const part = file + '.part';
  if (fs.existsSync(file) && (!src.bytes || fs.statSync(file).size === src.bytes)) return file;
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const headers = have ? { Range: 'bytes=' + have + '-' } : {};
      const res = await fetch(src.url, { headers });
      if (have && res.status === 200) have = 0;                     // the server ignored the range: start again
      else if (!(res.status === 200 || res.status === 206)) throw new Error('HTTP ' + res.status);
      const type = String(res.headers.get('content-type') || '');
      if (!/^image\/jpeg/.test(type)) throw new Error('not a JPEG: ' + type);
      const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
      for await (const chunk of res.body) { out.write(chunk); have += chunk.length; }
      await new Promise((ok) => out.end(ok));
      const fd = fs.openSync(part, 'r'), head = Buffer.alloc(3); fs.readSync(fd, head, 0, 3, 0); fs.closeSync(fd);
      if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) throw new Error('the file does not start as a JPEG');
      fs.renameSync(part, file);
      return file;
    } catch (err) {
      console.error('  ' + src.layer + ': attempt ' + attempt + ' failed (' + err.message + ')');
      have = fs.existsSync(part) ? fs.statSync(part).size : 0;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error(src.layer + ': could not download ' + src.url);
}

let bad = 0;
for (const src of doc.sources) {
  const file = await download(src);
  const bytes = fs.statSync(file).size, sha = await sha256Of(file);
  if (PIN) { src.bytes = bytes; src.sha256 = sha; }
  else if ((src.bytes && src.bytes !== bytes) || (src.sha256 && src.sha256 !== sha)) {
    console.error(src.layer + ': does not match the pinned file (' + bytes + ' bytes, ' + sha + ')'); bad++; continue;
  }
  console.log(src.layer.padEnd(7) + ' ' + String(bytes).padStart(10) + '  ' + sha.slice(0, 16) + '  ' + path.relative(CACHE, file));
}
if (PIN) fs.writeFileSync(SOURCES, JSON.stringify(doc, null, 2) + '\n');
process.exit(bad ? 1 : 0);
