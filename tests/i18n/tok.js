'use strict';
// ━━ A SMALL JAVASCRIPT TOKENIZER FOR THE BOARD-LANGUAGES GUARD ━━━━━━━━━━━━━
//
// Zero dependencies, because CI runs `npm test` without `npm ci`.
//
// Tokens: { t, v, s, e, line } where t is one of
//   'str'   a quoted string; v is its cooked value
//   'tpl'   one chunk of a template literal (part: head|mid, open: a ${
//           follows); v is the raw text of the chunk
//   'regex' a regular-expression literal (by previous-token heuristic)
//   'id'    an identifier or keyword
//   'num'   a number
//   'punc'  a punctuator; '${' opens a template hole and '}$' closes one
// Comments are returned separately (for `i18n-ok:` pragmas), never mixed into
// the token stream the checks walk.
//
// FAIL CLOSED. A guard that loses its place in a file passes everything after
// that point. So an unterminated string, template or comment, or unbalanced
// braces, brackets or parentheses at the end of a file, THROWS, naming the
// file and line; the test reports it as a failure rather than skipping the
// file.

const KW_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'else', 'do', 'instanceof', 'yield', 'await']);
const PUNCS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=',
  '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const ID_START = /[A-Za-z_$\u00C0-\uFFFF]/;
const ID_PART = /[A-Za-z0-9_$\u00C0-\uFFFF\u200C\u200D]/;

class TokenizeError extends Error {}

function tokenize(src, opts) {
  opts = opts || {};
  const file = opts.file || '<input>';
  const lineBase = opts.lineBase || 0;
  const toks = [];
  const comments = [];
  let i = 0, line = 1 + lineBase;
  const n = src.length;
  const tplStack = [];
  const stack = [];           // open brackets: { ( [ ${
  const fail = (msg, at) => { throw new TokenizeError(`${file}:${at || line}: ${msg}`); };

  function prev() { return toks.length ? toks[toks.length - 1] : null; }
  function regexAllowed() {
    const p = prev();
    if (!p) return true;
    if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 'regex') return false;
    if (p.t === 'id') return KW_BEFORE_REGEX.has(p.v);
    if (p.t === 'punc') return !(p.v === ')' || p.v === ']' || p.v === '}' || p.v === '}$' || p.v === '++' || p.v === '--');
    return true;
  }
  function readTemplateChunk(l0) {
    const s = i;
    let out = '';
    while (i < n) {
      const c = src[i];
      if (c === '\\') { out += c + (src[i + 1] || ''); if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (c === '`') { i++; return { text: out, open: false, s }; }
      if (c === '$' && src[i + 1] === '{') { i += 2; return { text: out, open: true, s }; }
      if (c === '\n') line++;
      out += c; i++;
    }
    return fail('unterminated template literal', l0);
  }
  function pushTemplate(part, l0) {
    const ch = readTemplateChunk(l0);
    toks.push({ t: 'tpl', v: ch.text, s: ch.s, e: i, line: l0, part, open: ch.open });
    if (ch.open) {
      tplStack.push(stack.length);
      stack.push({ v: '${', line });
      toks.push({ t: 'punc', v: '${', s: i - 2, e: i, line });
    }
  }

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '\u00A0' || c === '\uFEFF' || c === '\u2028' || c === '\u2029') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      const s = i; while (i < n && src[i] !== '\n') i++;
      comments.push({ v: src.slice(s + 2, i), line, s, e: i });
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      if (j < 0) fail('unterminated block comment');
      const l0 = line;
      for (let k = i; k < j; k++) if (src[k] === '\n') line++;
      comments.push({ v: src.slice(i + 2, j), line: l0, endLine: line, s: i, e: j + 2 });
      i = j + 2;
      continue;
    }
    if (c === '<' && src.startsWith('<!--', i)) { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'") {
      const q = c, s = i, l0 = line; i++;
      let out = '';
      while (true) {
        if (i >= n) fail('unterminated string', l0);
        const d = src[i];
        if (d === q) break;
        if (d === '\n') fail('unterminated string', l0);
        if (d === '\\') {
          const x = src[i + 1];
          if (x === 'n') out += '\n';
          else if (x === 't') out += '\t';
          else if (x === 'r') out += '\r';
          else if (x === 'b') out += '\b';
          else if (x === 'f') out += '\f';
          else if (x === 'v') out += '\v';
          else if (x === '0' && !/[0-9]/.test(src[i + 2] || '')) out += '\0';
          else if (x === 'u') {
            if (src[i + 2] === '{') { const j = src.indexOf('}', i); out += String.fromCodePoint(parseInt(src.slice(i + 3, j), 16)); i = j + 1; continue; }
            out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; continue;
          } else if (x === 'x') { out += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16)); i += 4; continue; }
          else if (x === '\r' && src[i + 2] === '\n') { line++; i += 3; continue; }
          else if (x === '\n') { line++; }
          else out += x;
          i += 2; continue;
        }
        out += d; i++;
      }
      i++;
      toks.push({ t: 'str', v: out, q, s, e: i, line: l0 });
      continue;
    }
    if (c === '`') { const l0 = line; i++; pushTemplate('head', l0); continue; }
    if (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === stack.length - 1) {
      tplStack.pop(); stack.pop();
      toks.push({ t: 'punc', v: '}$', s: i, e: i + 1, line });
      i++;
      pushTemplate('mid', line);
      continue;
    }
    if (c === '/' && regexAllowed()) {
      const s = i, l0 = line; i++;
      let inClass = false, closed = false;
      while (i < n) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '\n') break;
        if (inClass) { if (d === ']') inClass = false; }
        else if (d === '[') inClass = true;
        else if (d === '/') { i++; closed = true; break; }
        i++;
      }
      if (!closed) fail('unterminated regular expression', l0);
      while (i < n && /[a-z]/i.test(src[i])) i++;
      toks.push({ t: 'regex', v: src.slice(s, i), s, e: i, line: l0 });
      continue;
    }
    if (ID_START.test(c) || (c === '\\' && src[i + 1] === 'u')) {
      const s = i; i++;
      while (i < n && ID_PART.test(src[i])) i++;
      toks.push({ t: 'id', v: src.slice(s, i), s, e: i, line });
      continue;
    }
    if (c === '#' && ID_START.test(src[i + 1] || '')) {     // private field
      const s = i; i++;
      while (i < n && ID_PART.test(src[i])) i++;
      toks.push({ t: 'id', v: src.slice(s, i), s, e: i, line });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      const s = i;
      while (i < n && /[0-9A-Za-z._]/.test(src[i])) {
        if ((src[i] === 'e' || src[i] === 'E') && (src[i + 1] === '+' || src[i + 1] === '-') && !/^0x/i.test(src.slice(s, i))) i += 2;
        else i++;
      }
      toks.push({ t: 'num', v: src.slice(s, i), s, e: i, line });
      continue;
    }
    let p = null;
    for (const cand of PUNCS) if (src.startsWith(cand, i)) { p = cand; break; }
    if (!p) p = c;
    if (p === '{' || p === '(' || p === '[') stack.push({ v: p, line });
    else if (p === '}' || p === ')' || p === ']') {
      const top = stack.pop();
      const want = { '}': '{', ')': '(', ']': '[' }[p];
      if (!top || top.v !== want) fail(`unbalanced '${p}'` + (top ? ` (opened '${top.v}' at line ${top.line})` : ''));
    }
    toks.push({ t: 'punc', v: p, s: i, e: i + p.length, line });
    i += p.length;
  }
  if (stack.length) fail(`unclosed '${stack[stack.length - 1].v}' opened at line ${stack[stack.length - 1].line}`);
  return { toks, comments };
}

// Inline <script> blocks of an HTML page, with the line each starts on.
// JSON and template scripts are not JavaScript and are skipped. A block ends
// where a browser ends it: at the first "</script" (any case) that is followed
// by white space, "/" or ">", and runs on to the next ">" ("</script >",
// "</SCRIPT\n foo>").
function htmlScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script(?:[\s/][^>]*)?>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (type && !/^(text\/javascript|module|application\/javascript)$/i.test(type)) continue;
    const start = m.index + m[0].indexOf('>') + 1;
    const lineBase = html.slice(0, start).split('\n').length - 1;
    out.push({ code: m[2], lineBase, start });
  }
  return out;
}

module.exports = { tokenize, htmlScripts, TokenizeError };
