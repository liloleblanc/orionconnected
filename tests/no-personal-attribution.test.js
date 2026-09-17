'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// A DECISION HAS NO OWNER IN THIS REPOSITORY.
//
// tests/no-personal-content.test.js already forbids personal NAMES and QUOTED
// conversation. This file closes the gap beside it: third-person attribution.
//
// "the owner asked for four things that all need height" contains no name and
// quotes nobody, so the older guard passes it — and 312 such lines had
// accumulated, in a PUBLIC repository, attributing design decisions to a person
// by role or pronoun. Several sat beside verbatim quotes of that person's
// messages, typos preserved.
//
// The rule is the same one, stated for the other half of the problem: record
// WHAT was decided and WHY. A maintainer changing an angled clock tab needs to
// know what the angle is for. That it was requested by someone, and how they
// phrased it, helps nobody and reads very differently to a stranger than it did
// to whoever typed it.
//
// If this fails: rewrite the comment so the sentence is about the software.
//   "the owner asked for X"     → "X is the requirement"
//   "per the owner's mock"      → "per the reference design"
//   "he says the bottom orb is right" → "the bottom orb is the correct reference"
//   "his viewport (1920x950)"   → "the reference viewport (1920x950)"
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const EXTS = ['.js', '.css', '.html', '.md', '.json', '.jsonc', '.sh', '.py', '.yml', '.yaml'];

function trackedTextFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(f => EXTS.includes(path.extname(f)))
    // Captured third-party markup — real airport pages kept verbatim as parser
    // evidence. Their wording is not our comment and must not be edited.
    .filter(f => !f.includes('tests/fixtures/'))
    .filter(f => !f.endsWith('assets/asset-manifest.json'))
    // These two files necessarily contain the patterns they forbid.
    .filter(f => !f.endsWith('tests/no-personal-attribution.test.js'))
    .filter(f => !f.endsWith('tests/no-personal-content.test.js'));
}

// "ownership", "owners", "ownerDocument", "data-owner", "SINGLE-OWNER MAP" and
// friends are ordinary technical vocabulary. Only a definite article or a
// possessive turns "owner" into a person.
const OWNER = /\b(?:the owner\b|THE OWNER\b|owner's|OWNER'S|per the owner\b)/;
const TECHNICAL = /ownership|\bowners\b|ownerDocument|owner_id|data-owner|single-owner|SINGLE-OWNER/i;

// Pronoun + an attributing verb. Keyed on the verb as well as the pronoun so
// ordinary prose ("he" inside a quoted airport disclaimer, say) does not trip
// it; the offence is attributing a DECISION or an OBSERVATION to a person.
const PRONOUN_VERB =
  /\b(?:he|she|He|She)\s+(?:said|says|asked|wants|wanted|confirmed|flagged|reported|prefers|preferred|noticed|rejected|approved|vetoed|picked|chose|is right|was right|had said)\b/;

// Possessives that put a person behind an artefact.
const POSSESSIVE =
  /\b(?:his|her|His|Her)\s+(?:call|mock|mockup|spec|screenshot|photo|shot|reference|sketch|viewport|note|notes|ask|request|design|own)\b/;

function scan(re, extraFilter) {
  const hits = [];
  for (const f of trackedTextFiles()) {
    let body;
    try { body = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
    body.split('\n').forEach((line, i) => {
      if (!re.test(line)) return;
      if (extraFilter && extraFilter(line)) return;
      hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 110)}`);
    });
  }
  return hits;
}

test('no comment names a person as the source of a decision', () => {
  const hits = scan(OWNER, line => TECHNICAL.test(line) && !/the owner\b|owner's/i.test(line));
  assert.deepEqual(hits, [],
    'A decision has no owner here. State the requirement and the reasoning: ' +
    '"X is the requirement", "per the reference design".');
});

test('no comment attributes a decision or observation to he or she', () => {
  const hits = scan(PRONOUN_VERB);
  assert.deepEqual(hits, [],
    'Say what was decided or observed, not who said it. ' +
    '"he says the bottom orb is right" → "the bottom orb is the correct reference".');
});

test('no comment puts a person behind a reference artefact', () => {
  const hits = scan(POSSESSIVE);
  assert.deepEqual(hits, [],
    'A mock, screenshot or viewport belongs to the project, not to a person. ' +
    '"his viewport (1920x950)" → "the reference viewport (1920x950)".');
});

// The patterns above are the ones that actually accumulated. Asserting they
// still FIRE keeps this guard honest: a passing sweep is otherwise
// indistinguishable from a regex that stopped matching anything.
test('the patterns still catch what they were written for', () => {
  assert.match('/* the owner asked for four things */', OWNER);
  assert.match("/* per the owner's mock */", OWNER);
  assert.match('// he says the bottom orb is right', PRONOUN_VERB);
  assert.match('// She rejected the 104px blob', PRONOUN_VERB);
  assert.match('/* measured against his viewport (1920x950) */', POSSESSIVE);

  // And that ordinary technical vocabulary does not trip them.
  assert.doesNotMatch('const owners = new Map();', OWNER);
  assert.doesNotMatch('el.ownerDocument.defaultView', OWNER);
  assert.doesNotMatch('/* SINGLE-OWNER MAP: one writer, many readers */', OWNER);
  assert.doesNotMatch('// the screen he is looking at', PRONOUN_VERB);
  assert.doesNotMatch('// his name is not recorded anywhere', POSSESSIVE);
});
