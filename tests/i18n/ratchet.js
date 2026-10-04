'use strict';
// ━━ THE EXCEPTION RATCHET ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Every way to loosen the guard is a list: a brand term, an operator
// function, a file that is "not passenger", a data table, an `i18n-ok:`
// pragma, a call whose arguments are never words. Each one can be right, and
// each one can hide a label. So none of them may GROW against main without an
// approval recorded for that entry in tests/i18n/approved-exceptions.json:
//
//   { "list": "BRAND_TERMS", "entry": "The Ritz", "approved": "PR #990, approved in review on 2026-10-06" }
//
// The test prints every new exception into the CI summary whether it is
// approved or not, so no addition is ever silent. Pragmas are counted per file
// and reason; an approval for one carries the new count.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const APPROVALS = path.join(__dirname, 'approved-exceptions.json');

// A list's entries as strings, so two versions of the policy can be compared.
function listEntries(P) {
  const out = {};
  const keys = (o) => Object.keys(o || {});
  const perFile = (o) => [].concat(...keys(o).map((f) => keys(o[f]).map((k) => f + ' ' + k)));
  out.REASONS = (P.REASONS || []).slice();
  out.BRAND_TERMS = keys(P.BRAND_TERMS);
  out.SAME_AS_ENGLISH = [].concat(...keys(P.SAME_AS_ENGLISH).map((en) => {
    const e = P.SAME_AS_ENGLISH[en];
    return (e.langs || e).map((l) => en + ' ' + l);
  }));
  out.UNIT_TERMS = (P.UNIT_TERMS || []).slice();
  out.OPERATOR_FUNCTIONS = perFile(P.OPERATOR_FUNCTIONS);
  out.NON_PASSENGER = keys(P.NON_PASSENGER);
  out.NON_PASSENGER_PAGES = keys(P.NON_PASSENGER_PAGES);
  out.DATA_TABLES = perFile(P.DATA_TABLES);
  out.DATA_KEYS = keys(P.DATA_KEYS);
  out.DATA_WORDS = (P.DATA_WORDS || []).slice();
  out.NONTEXT_TABLES = (P.NONTEXT_TABLES || []).map((n) => n.file + ' ' + (n.name || n.fn));
  out.TEXT_REWRITERS = perFile(P.TEXT_REWRITERS);
  out.LANG_STORAGE_FUNCTIONS = perFile(P.LANG_STORAGE_FUNCTIONS);
  out.LANG_POSITION_FUNCTIONS = perFile(P.LANG_POSITION_FUNCTIONS);
  out.LANG_RECORD_TABLES = perFile(P.LANG_RECORD_TABLES);
  out.DECISION_FILES = keys(P.DECISION_FILES);
  out.LEGACY_STORES = (P.LEGACY_STORES || []).map((s) => s.file + ' ' + s.name + (s.growable ? ' (growable)' : ''));
  return out;
}

// Entries in `now` that `before` did not have: [{ list, entry }]
function exceptionsAdded(before, now) {
  const a = listEntries(before), b = listEntries(now);
  const out = [];
  for (const list of Object.keys(b)) {
    const had = new Set(a[list] || []);
    for (const e of b[list]) if (!had.has(e)) out.push({ list, entry: e });
  }
  return out;
}

// The checks' own loosening lists (calls whose arguments are never words…).
function loosenersAdded(before, now) {
  const out = [];
  if (!before || !now) return out;
  for (const list of Object.keys(now)) {
    const had = new Set(before[list] ? [...before[list]] : []);
    for (const e of now[list]) if (!had.has(e)) out.push({ list: 'checks.js ' + list, entry: e });
  }
  return out;
}

// `i18n-ok: reason` pragmas per file and reason: { "file reason": n }
function pragmaCounts(files, read) {
  const out = {};
  for (const f of files) {
    let src = null;
    try { src = read(f); } catch (e) { src = null; }
    if (src == null) continue;
    for (const m of src.matchAll(/i18n-ok:\s*([a-z]+)/g)) {
      const k = f + ' ' + m[1];
      out[k] = (out[k] || 0) + 1;
    }
    // translate="no" tells the rendered check (tests/render/words.mjs) that
    // an element's words are data: an exception like any other
    for (const m of src.matchAll(/translate=\\?["']no\\?["']/g)) {
      const k = f + ' translate="no"';
      out[k] = (out[k] || 0) + 1;
    }
    // data-i18n-all: a piece that shows every board language by design
    for (const m of src.matchAll(/data-i18n-(all|feed)\b/g)) {
      const k = f + ' data-i18n-' + m[1];
      out[k] = (out[k] || 0) + 1;
    }
  }
  return out;
}
function pragmasAdded(before, now) {
  const out = [];
  for (const [k, n] of Object.entries(now)) {
    const was = before[k] || 0;
    if (n > was) out.push({ list: 'i18n-ok', entry: k, count: n, was });
  }
  return out;
}

function loadApprovals(file) {
  const f = file || APPROVALS;
  if (!fs.existsSync(f)) return [];
  const list = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!Array.isArray(list)) throw new Error('approved-exceptions.json must be a list');
  for (const a of list) {
    if (!a || typeof a.list !== 'string' || typeof a.entry !== 'string' || typeof a.approved !== 'string' || !a.approved.trim())
      throw new Error('every approval names its list, its entry, and where it was approved: ' + JSON.stringify(a));
  }
  return list;
}
function unapproved(added, approvals) {
  return added.filter((x) => !approvals.some((a) => a.list === x.list && a.entry === x.entry
    && (x.count == null || (typeof a.count === 'number' && a.count >= x.count))));
}

// Evaluate a module's source as it was at another commit, with its requires
// answered by `req`.
function evalModule(src, req) {
  const m = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__dirname', src)(m, m.exports, req, __dirname);
  return m.exports;
}

module.exports = { ROOT, APPROVALS, listEntries, exceptionsAdded, loosenersAdded, pragmaCounts, pragmasAdded, loadApprovals, unapproved, evalModule };
