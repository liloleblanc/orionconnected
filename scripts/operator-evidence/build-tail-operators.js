#!/usr/bin/env node
'use strict';

// Builds the registration → operator table the worker reads as evidence of
// who operates a flight (workers/fids-proxy.js, TAIL_OPERATOR) from Transport
// Canada's Canadian Civil Aircraft Register.
//
// WHERE THE DATA COMES FROM, AND WHAT IT ASKS OF US
//
// The register's quick search pages sit under the canada.ca terms, which want
// written permission for commercial redistribution, so the table is NOT built
// from them. The register's bulk download (the "Download" button on the
// register's search page: a zip of about 4 MB holding carscurr.txt,
// carsownr.txt and a layout file) is published under the Government of Canada
// Open Data Licence Agreement for Unrestricted Use of Canada's Data. Taking it
// means accepting that agreement, a click-through on Transport Canada's site;
// accepting it is a decision for the maintainer, not a script. Its terms, as
// read on 2026-10-04:
//   - commercial use is allowed;
//   - every reproduction carries "Reproduced and distributed with the
//     permission of the Government of Canada." (this script writes that line
//     into the generated block);
//   - a product that uses the data shows a notice that it "has been produced
//     by or for (name) and includes data provided by the Government of
//     Canada";
//   - distributions are to be "evidenced by a written agreement" (clause
//     3.1(c));
//   - the data may not be linked to identify an organization or suggest
//     access to non-public information (clause 3.1(d)).
//
// USE
//   1. Download the zip from the register's search page (accepting the
//      agreement there) and unzip it.
//   2. node scripts/operator-evidence/build-tail-operators.js <dir or carsownr.txt>
//      Rewrites the block between "// TAIL_OPERATOR:BEGIN" and
//      "// TAIL_OPERATOR:END" in workers/fids-proxy.js and prints the counts.
//      --dry prints the block instead of writing it.
//
// THE FILE'S LAYOUT is read from the rows themselves, not assumed: each row of
// carsownr.txt is split as CSV and searched for a field that is a Canadian
// registration mark (GBJZ, or C-GBJZ) and a field that is one of the owners
// below. That keeps the build working if Transport Canada reorders columns.
// A mark owned by two of the operators below at once is left out: the table
// only ever says what the register says unambiguously.

const fs = require('node:fs');
const path = require('node:path');

// Registered owner → the operator code the boards key on. Only the carriers
// that fly for Air Canada and WestJet under the marketing carrier's number.
const OWNERS = [
  { key: 'JAZZAVIATION', op: 'QK', name: 'Jazz Aviation LP' },
  { key: 'PALAIRLINES', op: 'PB', name: 'PAL Airlines Ltd.' },
  { key: 'AIRCANADAROUGE', op: 'RV', name: 'Air Canada rouge LP' },
  { key: 'WESTJETENCORE', op: 'WR', name: 'WestJet Encore Ltd.' }
];

function csvFields(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

function ownerOp(field) {
  const k = String(field || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!k) return null;
  for (const o of OWNERS) if (k.startsWith(o.key)) return o;
  return null;
}

function markOf(field) {
  const m = String(field || '').toUpperCase().replace(/\s+/g, '').match(/^(?:C-?)?([FGI][A-Z]{3})$/);
  return m ? 'C' + m[1] : null;
}

// carsownr.txt text → { table: { CGBJZ: 'QK', ... }, counts: { QK: n, ... }, conflicts: [...] }
function parseOwnerRows(text) {
  const seen = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = csvFields(line);
    let mark = null, owner = null;
    for (const f of fields) {
      if (!mark) mark = markOf(f);
      if (!owner) owner = ownerOp(f);
    }
    if (!mark || !owner) continue;
    if (!seen.has(mark)) seen.set(mark, new Set());
    seen.get(mark).add(owner.op);
  }
  const table = {}, counts = {}, conflicts = [];
  for (const [mark, ops] of [...seen.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ops.size !== 1) { conflicts.push(mark); continue; }
    const op = [...ops][0];
    table[mark] = op;
    counts[op] = (counts[op] || 0) + 1;
  }
  return { table, counts, conflicts };
}

function buildBlock(parsed, when) {
  const names = OWNERS.filter((o) => parsed.counts[o.op]).map((o) => `${o.name} ${parsed.counts[o.op]}`).join(', ');
  const rows = Object.keys(parsed.table);
  const body = [];
  for (let i = 0; i < rows.length; i += 6) {
    body.push('  ' + rows.slice(i, i + 6).map((r) => `${r}: "${parsed.table[r]}"`).join(', ') + (i + 6 < rows.length ? ',' : ''));
  }
  return [
    '// TAIL_OPERATOR:BEGIN',
    `// Built ${when} by scripts/operator-evidence/build-tail-operators.js from`,
    "// Transport Canada's Canadian Civil Aircraft Register (carsownr.txt):",
    `// ${names}.`,
    '// Reproduced and distributed with the permission of the Government of Canada.',
    'const TAIL_OPERATOR = {',
    ...body,
    '};',
    '// TAIL_OPERATOR:END'
  ].join('\n');
}

function applyToWorker(src, block) {
  const a = src.indexOf('// TAIL_OPERATOR:BEGIN');
  const b = src.indexOf('// TAIL_OPERATOR:END', a);
  if (a < 0 || b < 0) throw new Error('TAIL_OPERATOR markers not found in the worker');
  return src.slice(0, a) + block + src.slice(b + '// TAIL_OPERATOR:END'.length);
}

if (require.main === module) {
  const arg = process.argv.slice(2).find((x) => !x.startsWith('--'));
  if (!arg) {
    console.error('usage: build-tail-operators.js <unzipped register dir | carsownr.txt> [--dry]');
    process.exit(2);
  }
  const file = fs.statSync(arg).isDirectory() ? path.join(arg, 'carsownr.txt') : arg;
  const parsed = parseOwnerRows(fs.readFileSync(file, 'latin1'));
  const block = buildBlock(parsed, new Date().toISOString().slice(0, 10));
  console.error('owners:', JSON.stringify(parsed.counts), 'left out (two owners):', parsed.conflicts.length);
  if (process.argv.includes('--dry')) { console.log(block); process.exit(0); }
  const worker = path.join(__dirname, '..', '..', 'workers', 'fids-proxy.js');
  fs.writeFileSync(worker, applyToWorker(fs.readFileSync(worker, 'utf8'), block));
  console.error('wrote', Object.keys(parsed.table).length, 'registrations to', worker);
}

module.exports = { OWNERS, csvFields, parseOwnerRows, buildBlock, applyToWorker, markOf, ownerOp };
