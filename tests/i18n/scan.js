'use strict';
// ━━ SOURCE LOADING AND STRUCTURE FOR THE BOARD-LANGUAGES GUARD ━━━━━━━━━━━━━
//
// Turns a JavaScript file, or the inline scripts of an HTML page, into tokens
// plus three structural indexes the checks share:
//   objects   every object literal, its keys and (when a key's value is one
//             plain string) that string
//   fnAt      for each token, the innermost NAMED function around it
//   frames    the bracket each token sits directly inside
// All line numbers are the file's own (inline scripts keep their offset).

const fs = require('node:fs');
const path = require('node:path');
const { tokenize, htmlScripts } = require('./tok');

const ROOT = path.resolve(__dirname, '..', '..');

const cache = new Map();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// { rel, kind, src, units: [{ toks, comments, lineBase }] }
function load(rel, srcOverride) {
  const key = rel + (srcOverride ? '#override' : '');
  if (!srcOverride && cache.has(key)) return cache.get(key);
  const src = srcOverride != null ? srcOverride : read(rel);
  const kind = rel.endsWith('.html') ? 'html' : rel.endsWith('.css') ? 'css' : 'js';
  const units = [];
  if (kind === 'html') {
    for (const s of htmlScripts(src)) {
      const r = tokenize(s.code, { file: rel, lineBase: s.lineBase });
      units.push(index(r.toks, r.comments));
    }
  } else if (kind === 'js') {
    const r = tokenize(src, { file: rel });
    units.push(index(r.toks, r.comments));
  }
  const out = { rel, kind, src, units };
  if (!srcOverride) cache.set(key, out);
  return out;
}

// ── Structure ──────────────────────────────────────────────────────────────

const OBJ_BEFORE = new Set(['=', '(', ',', ':', '[', '?', '||', '&&', '??', 'return', '!', '+', '-', '...',
  '+=', '||=', '&&=', '??=', '=>' /* only with parens, checked below */, 'typeof', 'in', 'of', '${', 'yield', 'await', 'new', 'case', 'throw']);

function index(toks, comments) {
  const n = toks.length;
  const frameOf = new Array(n);       // index of the opening token of the bracket each token is inside
  const fnAt = new Array(n);          // innermost named function
  const fnPathAt = new Array(n);      // outer>inner named functions
  const isObj = new Array(n);         // for '{' tokens: is it an object literal
  const closeOf = new Array(n);       // for an opening bracket: its closing token index
  const objects = [];
  const stack = [];                   // { i, v, obj, fn, keys }
  let pendingFn = null;               // name waiting for its body brace

  const prevSig = (k) => (k > 0 ? toks[k - 1] : null);

  for (let i = 0; i < n; i++) {
    const tk = toks[i];
    const top = stack[stack.length - 1];
    frameOf[i] = top ? top.i : -1;
    // innermost named function, and the path of named functions around it
    let fn = null;
    const pathNames = [];
    for (let k = 0; k < stack.length; k++) if (stack[k].fn) { fn = stack[k].fn; pathNames.push(fn); }
    fnAt[i] = fn;
    fnPathAt[i] = pathNames.join('>');

    // function-name discovery. A name waits for its body's '{': after ')'
    // for a function or method, after '=>' for an arrow. A ';' at the same
    // level abandons it (`var raw = (x || {}).value;` is not a function).
    if (tk.t === 'id') {
      const n1 = toks[i + 1], n2 = toks[i + 2], n3 = toks[i + 3];
      if (tk.v === 'function' && n1 && n1.t === 'id') pendingFn = { name: n1.v, arrow: false, depth: stack.length };
      else if (tk.v === 'function' && n1 && n1.v === '*' && n2 && n2.t === 'id') pendingFn = { name: n2.v, arrow: false, depth: stack.length };
      else if (n1 && (n1.v === '=' || n1.v === ':') && n2 && (n2.v === 'function' || n2.v === 'async')) pendingFn = { name: tk.v, arrow: false, depth: stack.length };
      else if (n1 && n1.v === '=' && n2 && n2.v === '(') pendingFn = { name: tk.v, arrow: true, depth: stack.length };   // x = (a) => {
      else if (n1 && n1.v === '=' && n2 && n2.t === 'id' && n3 && n3.v === '=>') pendingFn = { name: tk.v, arrow: true, depth: stack.length };   // x = a => {
      else if (n1 && n1.v === '(' && top && (top.obj || top.cls) && (!prevSig(i) || [',', '{', ';', '}', 'async', 'get', 'set', 'static'].includes(prevSig(i).v))) pendingFn = { name: tk.v, arrow: false, depth: stack.length };   // method
      else if (tk.v === 'class' && n1 && n1.t === 'id') pendingFn = { name: '@class:' + n1.v, arrow: false, depth: stack.length };
    }
    if (tk.t === 'punc' && tk.v === ';' && pendingFn && pendingFn.depth === stack.length) pendingFn = null;

    if (tk.t === 'punc' && (tk.v === '{' || tk.v === '(' || tk.v === '[' || tk.v === '${')) {
      let obj = false, fnName = null, cls = false;
      if (tk.v === '{') {
        const p = prevSig(i);
        const isClass = pendingFn && pendingFn.name.startsWith('@class:');
        if (pendingFn && p && (isClass || (pendingFn.arrow ? p.v === '=>' : p.v === ')'))) {
          if (isClass) cls = true; else fnName = pendingFn.name;
          pendingFn = null;
        } else if (!p) obj = false;
        else if (p.v === '=>') obj = false;
        else if (p.v === ')') obj = false;
        else if (p.t === 'punc' && OBJ_BEFORE.has(p.v)) {
          obj = true;
          if (p.v === ':' && top && !top.obj) {
            // `case x: {` is a block; a ternary `? a : {` is an object
            let d = 0, isCase = false;
            for (let k = i - 2; k >= 0; k--) {
              const t = toks[k];
              if (t.t === 'punc' && (t.v === ')' || t.v === ']' || t.v === '}')) d++;
              else if (t.t === 'punc' && (t.v === '(' || t.v === '[' || t.v === '{')) { if (d === 0) break; d--; }
              else if (d === 0 && t.t === 'id' && (t.v === 'case' || t.v === 'default')) { isCase = true; break; }
              else if (d === 0 && t.t === 'punc' && (t.v === ';' || t.v === '?')) break;
            }
            if (isCase) obj = false;
          }
        } else if (p.t === 'id' && OBJ_BEFORE.has(p.v)) obj = true;
        else obj = false;
        isObj[i] = obj;
      }
      const frame = { i, v: tk.v, obj, fn: fnName, cls, keys: obj ? [] : null, curKey: null };
      if (obj) {
        // name the object
        const p1 = toks[i - 1], p2 = toks[i - 2];
        if (p1 && p1.v === '=' && p2 && p2.t === 'id') frame.name = p2.v;
        else if (p1 && p1.v === ':' && top && top.obj && top.curKey) frame.name = top.curKey;
        else if (p1 && (p1.v === '(' || p1.v === ',')) frame.name = '(arg)';
        else if (p1 && p1.v === '[') frame.name = '[elem]';
        frame.parent = [];
        for (const f of stack) if (f.obj && f.name) frame.parent.push(f.name);
      }
      stack.push(frame);
      continue;
    }
    if (tk.t === 'punc' && (tk.v === '}' || tk.v === ')' || tk.v === ']' || tk.v === '}$')) {
      const f = stack.pop();
      if (f) {
        closeOf[f.i] = i;
        if (f.obj) objects.push({ open: f.i, close: i, line: toks[f.i].line, endLine: tk.line, name: f.name || null,
          parent: f.parent || [], keys: f.keys, fn: fnAt[f.i] });
      }
      continue;
    }
    // keys of an object literal: `{ key: …` or `, key: …`, plus methods `key(…) {`
    if (top && top.obj && (tk.t === 'id' || tk.t === 'str' || tk.t === 'num')) {
      const p = toks[i - 1], nx = toks[i + 1];
      if (p && p.t === 'punc' && (p.v === '{' || p.v === ',') && nx && nx.t === 'punc' && (nx.v === ':' || nx.v === '(')) {
        const key = tk.t === 'num' ? String(Number(tk.v.replace(/_/g, ''))) : String(tk.v);
        const ent = { k: key, line: tk.line, tok: i, method: nx.v === '(' };
        if (nx.v === ':') {
          // the value: tokens to the next ',' or '}' at this level
          const v0 = i + 2;
          let d = 0, j = v0;
          for (; j < n; j++) {
            const t = toks[j];
            if (t.t === 'punc' && (t.v === '{' || t.v === '(' || t.v === '[' || t.v === '${')) d++;
            else if (t.t === 'punc' && (t.v === '}' || t.v === ')' || t.v === ']' || t.v === '}$')) { if (d === 0) break; d--; }
            else if (d === 0 && t.t === 'punc' && t.v === ',') break;
          }
          ent.v0 = v0; ent.v1 = j;          // value tokens [v0, v1)
          const vt = toks[v0];
          ent.simple = j === v0 + 1 && vt && (vt.t === 'str' || (vt.t === 'tpl' && !vt.open));
          ent.str = ent.simple ? vt.v : null;
          ent.objVal = vt && vt.t === 'punc' && vt.v === '{' ? v0 : null;
          ent.arrVal = vt && vt.t === 'punc' && vt.v === '[' ? v0 : null;
        }
        top.keys.push(ent);
        top.curKey = key;
      }
    }
  }
  return { toks, comments, frameOf, fnAt, fnPathAt, isObj, closeOf, objects };
}

// The object literal opening at token `open`, if any.
function objectAt(unit, open) {
  return unit.objects.find((o) => o.open === open) || null;
}

// Find a top-level declaration `var|let|const NAME = {` (or `NAME = {`) and
// return its object.
function findTable(unit, name) {
  const t = unit.toks;
  for (const o of unit.objects) {
    const p1 = t[o.open - 1], p2 = t[o.open - 2];
    if (p1 && p1.v === '=' && p2 && p2.t === 'id' && p2.v === name) return o;
    // Object.freeze({ … }) assigned to NAME
    if (p1 && p1.v === '(' && p2 && p2.v === 'freeze') {
      const p5 = t[o.open - 5], p6 = t[o.open - 6];
      if (p5 && p5.v === '=' && p6 && p6.v === name) return o;
    }
  }
  return null;
}

// The comment text on a token's line (for `i18n-ok:` pragmas).
function commentOnLine(unit, line) {
  return unit.comments.filter((c) => c.line === line || (c.endLine && c.line <= line && c.endLine >= line)).map((c) => c.v).join(' ');
}

module.exports = { ROOT, read, load, index, findTable, objectAt, commentOnLine };
