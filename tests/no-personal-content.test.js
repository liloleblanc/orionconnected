'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// NO PERSONAL NAMES AND NO QUOTED CONVERSATION IN THIS REPOSITORY.
//
// Comments must record the DECISION and the REASONING. They must not record who
// said what, or reproduce what they said. A working conversation is not
// documentation, and quoting one is unprofessional regardless of whether the
// repository is public.
//
// This had accumulated to 2,065 occurrences across 43 files over three and a
// half months before it was removed, and it had been raised more than once in
// that time. It kept returning because nothing enforced it — every comment
// explaining the rule was itself just a comment. This test is the enforcement.
//
// If this fails: rewrite the offending comment to state the decision and why,
// with no name and no quotation. See docs/FLIGHT-DATA-PROVIDERS.md for the
// house style.
// ═══════════════════════════════════════════════════════════════════════════

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Text-bearing sources only. SVG path data and base64 blobs throw false
// positives — random character runs inside a `d="..."` attribute matched a
// profanity search the first time this was checked.
const EXTS = ['.js', '.css', '.html', '.md', '.json', '.jsonc', '.sh', '.py', '.yml', '.yaml'];

function trackedTextFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n')
    .filter(Boolean)
    .filter(f => EXTS.includes(path.extname(f)))
    // Asset manifests are generated and list filenames, not prose.
    .filter(f => !f.endsWith('assets/asset-manifest.json'))
    // tests/fixtures/** is captured third-party markup — real airport websites
    // saved verbatim so the parsers can be tested against them. Their wording
    // is evidence and must not be edited; an airport's own disclaimer is not
    // our comment.
    .filter(f => !f.includes('tests/fixtures/'))
    // This file necessarily contains the patterns it forbids.
    .filter(f => !f.endsWith('tests/no-personal-content.test.js'));
}

function scan(re) {
  const hits = [];
  for (const f of trackedTextFiles()) {
    let body;
    try { body = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
    body.split('\n').forEach((line, i) => {
      if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 110)}`);
      re.lastIndex = 0;
    });
  }
  return hits;
}

test('no personal name appears in any tracked source file', () => {
  // The owner's given name. Word-boundary so "Nickel", "nickname" and the like
  // are not caught.
  const hits = scan(/\bNick\b/);
  assert.deepEqual(hits, [],
    'Personal names must not appear in the codebase. State the decision and the ' +
    'reasoning instead — "Reported:", "Decision, <date>:", or simply the fact.');
});

test('no profanity is quoted in any tracked source file', () => {
  const hits = scan(/\b(?:fuck|fucking|fucked|shit|bullshit|attrocious)\b/i);
  assert.deepEqual(hits, [],
    'Quoted conversation does not belong in comments, least of all this. ' +
    'Describe the fault and the fix.');
});

// Catching this generically is harder than it looks, and the first attempt
// got it wrong: keying on `<Capitalised>: "..."` flagged four legitimate
// technical comments — `Catches: "De Havilland Dash 8-400"`, an
// `"Aircraft Type:"` UI label, a design note reading
// `Aesthetic: "Airport Operations Console"`. An allowlist of permitted nouns
// would need extending forever.
//
// The real discriminator is not WHO is quoted, it is WHAT the quote sounds
// like. Technical examples are noun phrases: model names, field labels,
// literal values. Conversation carries first- and second-person pronouns,
// contractions, requests and complaints. Key on that instead — it needs no
// allowlist and it catches a name this test has never heard of.
// Two bugs cost three iterations of this test and are worth naming, because
// both make a guard LOOK strict while reporting nonsense:
//   · "us" as a speech token matched the path /logos/airlines/us-major/...
//     Generic pronouns must not be so short that code matches them.
//   · a naive ['"] close matched the apostrophe inside don't / isn't, so the
//     "quote" began mid-word: `t an ADB airport for us`. A closing quote is
//     only a closing quote when a letter does not follow it.
//   · "your" and "my" are PRODUCT COPY here, not speech. The board says
//     "Your Aircraft | Votre Avion" and "Please remain seated until your zone
//     is called"; an ad says "Your world awaits"; a default template is called
//     "My Gate Template". Ten legitimate comments were flagged before those
//     two tokens came out. A genuine complaint carries "I" or an informal
//     contraction anyway, so nothing real is lost.
//   · `thats` was listed without its apostrophe twin `that's`, so a quote
//     whose only informal token was the CORRECTLY spelled contraction read as
//     clean. Every other pair here is listed both ways (don't/dont,
//     doesnt/doesn't); this one was simply missed, and it is the second reason
//     the wrapped quote below went unseen for as long as it did.
const SPEECH = /(?:^|[^\w'])(?:I|I'm|I've|me|please|why|wtf|don't|doesn't|didn't|can't|won't|isn't|wasn't|dont|cant|didnt|doesnt|thats|that's|make it|put it|change it|fix it|supposed to)(?:$|[^\w'])/;
// Quote marks pair with their NEAREST neighbour, and the length floor is a
// filter applied afterwards rather than part of the match. Baking `{15,}` into
// the pattern made the regex SKIP a short quoted term — `"Pending"`, `"navy"` —
// and leave its two marks unconsumed, free to pair with distant ones. Within a
// single line that mispairing stayed small; across a joined run it manufactured
// 60-character spans that read as speech because some unrelated `can't` fell
// between them. Match any quoted span, then judge it.
const QUOTE_MIN = 15;
const quoted = /"([^"\n]*)"|'([^'\n]*)'(?![A-Za-z])/g;
const COMMENT_LINE = /(?:\/\/|^\s*\*|<!--|^\s*#)/;

// A fourth bug, and the reason this no longer scans a line at a time: the
// character class excludes \n, so a quote whose opening and closing marks sat
// on DIFFERENT comment lines had no match to find. Neither half is a quote by
// itself, so every line passed and the wrapped quote read as clean. One
// survived in the tree that way. Runs of consecutive single-line comments are
// therefore joined into one logical string and scanned as a single span.
//
// The leading marker is dropped as the lines join. Leaving it in would splice
// a `//` into the middle of the span, and the path filter below would then
// discard the whole thing as a value — the guard would look like it had been
// fixed while still seeing nothing. Only the LEADING marker goes: a trailing
// comment keeps the code ahead of it, exactly as the old scan saw it.
function commentRuns(body) {
  const runs = [];
  let run = null;
  body.split('\n').forEach((line, i) => {
    if (!COMMENT_LINE.test(line)) { run = null; return; }
    const text = line
      .replace(/^\s*(?:\/\/+|\*+\/?|#+|<!--)\s?/, '')
      .replace(/\s*-->\s*$/, '');
    if (!run) { run = { text: '', starts: [] }; runs.push(run); }
    if (run.text) run.text += ' ';
    run.starts.push({ at: run.text.length, line: i + 1 });
    run.text += text;
  });
  return runs;
}

// Hits come back as `<line>: <span>`, the line being the one the quote OPENS
// on rather than the first line of the run — a 40-line header block should
// point at the offending sentence, not at its own first word.
function quotedSpeech(body) {
  const hits = [];
  for (const run of commentRuns(body)) {
    let m;
    quoted.lastIndex = 0;
    while ((m = quoted.exec(run.text))) {
      const q = m[1] || m[2] || '';
      if (q.length < QUOTE_MIN) continue;
      // Paths, URLs and selectors are values, not speech.
      if (/[/\\]|https?:|^[.#@]|=|\{|\}/.test(q)) continue;
      if (!SPEECH.test(q)) continue;
      let line = run.starts[0].line;
      for (const s of run.starts) { if (s.at <= m.index) line = s.line; else break; }
      hits.push(`${line}: ${q.slice(0, 90)}`);
    }
  }
  return hits;
}

test('no comment quotes conversational speech', () => {
  const hits = [];
  for (const f of trackedTextFiles()) {
    let body;
    try { body = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
    for (const hit of quotedSpeech(body)) hits.push(`${f}:${hit}`);
  }
  assert.deepEqual(hits, [],
    'A comment is quoting conversation. Record what was decided and why — not ' +
    'who said it, and not how they phrased it.');
});

// The wrap is the gap this guard actually had, so it gets its own test rather
// than being trusted to the sweep above — the sweep passes when the scanner
// sees nothing, which is indistinguishable from the tree being clean. The
// fixtures are invented speech: a regression test for this rule must not
// itself become the thing the rule forbids.
test('a quote wrapped across two comment lines is caught', () => {
  const wrapped = [
    '// v00000 — the picker offers exactly the airports that have data.',
    '// "why would I put an entry with',
    '// no feed in front of anyone". A board fills only when a handler exists.',
  ].join('\n');
  const hits = quotedSpeech(wrapped);
  assert.notDeepEqual(hits, [],
    'A quote split across two comment lines must be caught. Scanning one line ' +
    'at a time cannot see it, which is how one survived in the tree.');
  assert.match(hits[0], /^2: /,
    'The hit must report the line the quote OPENS on, not the start of the run.');

  // The same sentence on a single line was always caught. Asserting it here
  // keeps the test honest about what the join added: the wrap, not the match.
  const inline = '// "why would I put an entry with no feed in front of anyone".';
  assert.notDeepEqual(quotedSpeech(inline), []);

  // Joining makes the false-positive defences matter MORE, not less: spans
  // that were bounded by one line now run across several. A contraction's
  // apostrophe is still not a closing quote, because a letter follows it —
  // without that rule this block would report a 60-character "quote" opening
  // mid-word in `doesn't` and closing mid-word in `client's`.
  const contractions = [
    "// The worker doesn't answer for an airport that, for reasons I",
    "// never learned, the client's registry still lists.",
  ].join('\n');
  assert.deepEqual(quotedSpeech(contractions), []);

  // And a path spliced together from two lines is still a value, not speech.
  const wrappedPath = [
    '// The emblem for that carrier lives at "logos/airlines/us-major/',
    '// please-note-the-hyphen.svg" and nothing else reads it.',
  ].join('\n');
  assert.deepEqual(quotedSpeech(wrappedPath), []);
});
