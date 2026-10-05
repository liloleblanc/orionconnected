# Board languages

Every word a passenger can read ships in all nine board languages:

| code | language | direction | clock |
|---|---|---|---|
| en | English | left to right | 5:35pm |
| fr | French | left to right | 17:35 |
| es | Spanish | left to right | 17:35 |
| de | German | left to right | 17:35 |
| it | Italian | left to right | 17:35 |
| pt | Portuguese (Brazilian, as `Intl` 'pt' writes its dates) | left to right | 17:35 |
| ja | Japanese | left to right | 17:35 |
| zh | Chinese (simplified) | left to right | 17:35 |
| ar | Arabic | **right to left** | 17:35 |

A board reads **one clock: the clock of the language it leads with** (its
first language, French first in Québec). A board led by English reads 5:35pm
as the boards always have; any other reads 17:35 — 'PM' is an English word.
Every board time goes through `BoardStrings.boardTime` (a `Date`) or
`boardClockText` (a time a feed already wrote). A half that names its own
language (the welcome strip's clock in each language) keeps that language's
own clock.

That covers the gate, departures, arrivals, baggage, the weather and heritage
cards, the advertising carousel, the boot loaders, empty and error panels, the
phone layout and the Studio player. Operator screens (the menu, the override
panel, sign-in, the test-flight form) are not passenger text.

The rule is enforced by `npm test` on every pull request. This page is how to
work with it.

---

## 1. Where words live

**`fids-current/js/board-strings.js`** is the one store. Every passenger page
loads it first. It holds:

* `BoardStrings.LANGS` — the nine codes, the only copy of the list.
* `BoardStrings.META[lang]` — direction, Intl locale, 12/24-hour clock, the
  colon's typography (`Prochain : …`, `次：…`).
* `BoardStrings.FR_FIRST` — the Québec airports, the only copy.
* `BoardStrings.LANG_DEFAULTS` / `ES_AIRPORTS` — what a board speaks by default.
* `STR` — one entry per phrase, each with all nine languages:

```js
expected: {
  en: 'expected', fr: 'prévu', es: 'prevista', de: 'voraussichtlich', it: 'previsto',
  pt: 'prevista', ja: '予定', zh: '预计', ar: 'متوقعة'
},
```

Each value is a plain string literal. `{FLIGHT}`-style placeholders are filled
by the helpers. Keys starting with `$` are metadata:

* `$src` — where the wording comes from, per language: `airline:XX` or
  `gov:XX` (the airline's or government's own published words, URL in a
  comment), `house` (our original), `careful` (our careful translation).
  Required for pre-boarding, travel-document, loyalty and cabin wording.
  On `localhost`, `?i18n=provenance` outlines every `careful` string on
  screen, so the pictures show which words are ours.
* `$slot` — the fixed-width slot the phrase is fitted into.
* `$ctx` — separates two meanings of one English phrase (a status "Boarding"
  and a column heading "Boarding" may translate differently).

**Older tables.** `LS`, `SS`, `_GATE_LBL`, `TICKER_MSG`, `BAGS_TICKER_MSG`,
`_WXLBL`, `AD_I18N` and a few others in `fids-core.js`, `fids-v2.js`,
`tour.html`, `studio-render.js`, `app.html` and `heritage-board.js` predate the
store. They are registered in `tests/i18n/policy.js` (`LEGACY_STORES`) and held
to every rule. **Their key sets are frozen** (`tests/i18n/legacy-keys.json`):
a new key goes in `STR`, and their helpers (`TL`, `SL`, `_gateLbl`,
`_gateLbl1`, …) fall through to it.

## 2. How to put a word on screen

| you want | write |
|---|---|
| one language | `bs('expected', lang)` |
| a placeholder | `bsFmt('gateChangeMoved', lang, { FLIGHT: 'AC 123', GATE: '4' })` |
| the board's pair, `Label \| Label` | `bsPair('expected', { frFirst: _frF })` |
| the pair as plain text (an attribute) | `bsPair('expected', { plain: true })` |
| which languages the pair shows | `bsPairLangs(langs, iata)` |
| the board's own time (its clock, rows, gate times) | `BoardStrings.boardTime(date, tz)`, `boardClockText(text)` |
| a time inside one language's half | `bsTime(date, lang, tz)` |
| is a feed's text in this language? | `BoardStrings.looksLike(text, lang)` |
| a weekday or date | `bsWeekday(date, lang, 'short', tz)`, `bsDate(date, lang, opts, tz)` |
| a gate label from the legacy table | `_gateLbl(key, _frF, wrap, sep)` (falls through to `STR`) |
| mark a half you wrapped yourself | `BoardStrings.markHalf(html, lang, key)` |
| mark a whole element as one language | `BoardStrings.setLang(el, lang)` |
| a font stack set from code | `BoardStrings.withScripts(stack)` |
| a loader or status line | `BoardStrings.loaderLine('loading')` |
| static page text | `<span data-i18n="key">` (`data-i18n-one`, `data-i18n-upper`), filled by `BoardStrings.applyStatic()` |
| words painted once that must follow the board's languages (the boot loader; the board's header and its empty, feed-down and error panels) | `BoardStrings.onLangs(fn)`: `fn` runs whenever `fids-core.js` sets `langs` (it calls `BoardStrings.langsChanged()`, which also re-runs `applyStatic`) |

Each half of a pair is a `<span class="bs-h" lang="…">`, with `dir="rtl"` on
an Arabic half and bidi isolation on every half, so `من Calgary` reads right to
left and a Japanese date cannot interleave with an Arabic one. `_gateLbl` marks
the halves its callers wrap the same way (`markHalf`). A board that shows one
language at a time (departures, baggage, the phone list) carries `lang` on its
table; its columns keep their order.

**Fonts.** Every font stack ends in `var(--fids-script-fonts)`: the board's own
font draws Latin and digits, and Noto Sans JP / SC / Arabic (Google Fonts,
linked by each board page) draw the rest, so a host with no fonts of its own
still renders them. `shared.css` sets the variable per language, so Chinese
takes the simplified-Chinese forms and Japanese the Japanese ones. Japanese
breaks between phrases (`word-break: auto-phrase`); Arabic is never tracked.

Never:

* write words into an HTML string (`'<b>Gate ' + n`), a template literal, CSS
  `content:`, a `data-*` attribute drawn by `content: attr()`, or static page
  markup;
* add a literal fallback after a helper (`TL('x') || 'Gate'`): the key must
  exist instead;
* choose a word by comparing the language (`lang === 'fr' ? 'Porte' : 'Gate'`)
  or with the French-first flag (`_frF ? 'Vol' : 'Flight'`);
* slice `langs` (`langs.slice(0, 2)`), read `boardLangsFor(iata)[1]`, or keep a
  private list of language codes;
* format a time with a literal locale (`toLocaleTimeString('en-US', …)`,
  `hour12: true`);
* rewrite text on a timer after render.

## 3. Which languages a board speaks

`bsResolveLangs` is the one resolver, in this order:

1. `?langs=` / `?lang=` in the URL (matched against the constant list);
2. the saved per-airport choice, `localStorage['fids_langs_<IATA>']`, which
   `toggleLang` (the only writer) saves;
3. the configured `langs`;
4. the per-airport default;
5. on a phone, one language: `fids_mobile_lang`, else the browser's language.

Then the **Québec rule**: at a `FR_FIRST` airport, French leads whenever it is
selected. It is never added when it is not. Every pair goes through
`bsPairLangs`, so no surface can order the languages differently.

## 4. The guard — and the screens, read

`tests/board-languages.test.js` runs `tests/i18n/checks.js` over every
passenger script, inline script, stylesheet and page:

| check | fails on |
|---|---|
| B1 | a table entry missing a language, empty, an expression, or an unknown code |
| B2 | a language table outside the store and the registered tables; `[code, text]` lists; `X_FR` parallel tables |
| B3 | a translation equal to the English or holding an English word ('Gate closes shortly' or 'Doors shut momentarily' in German, 'Today' for German; everyday English too, not only the store's; the ticker lists line by line, at any index), a placeholder ('XXX', '???', '…', '—', 'N/A', 'TBD', 'TODO', 'FIXME', 'Lorem ipsum'), a letter of a script the language does not write ('明日' or a Cyrillic 'о' in German), a look-alike letter (fullwidth 'Ｔｏｍｏｒｒｏｗ', a small capital 'ᴡ'), Persian or Urdu for Arabic ('فردا', 'کل'), ja/zh/ar without their own script, simplified Chinese in the Japanese or the Chinese pasted into it, French pasted into es/de/it/pt, Spanish, Italian or Portuguese pasted into another of the three ('Tramo', 'Domani') (reviewed lists: `SAME_AS_ENGLISH`, `SAME_ACROSS`, `NATIVE_WORDS`, `SAME_JA_ZH`) |
| B4 | any object key declared twice (the CITY_FR collapse); a key in two tables one helper reads |
| B5 | words in markup, in a text sink, after a helper, in an `X \| Y` literal, or an English sentence literal; text hidden from the literals (`String.fromCharCode(…)`, `atob('…')`, letters joined, a literal reversed) |
| B6 | a key passed to a helper that does not exist — by any name the helper is reached by (`S.bs`, a copy `var f = BoardStrings.bs`, `var t = TL`, `var { bs: f } = BoardStrings`), as either branch of a ternary, or in a variable holding a literal; ad copy with no translation row |
| B7 | one English phrase translated two ways |
| B8 | a label the store translates, written as a literal |
| B9 | CSS `content:` text (a `var()` fallback too); `data-*` text drawn by `content: attr()`; CSS content written from code (a stylesheet's text, `insertRule`, `setProperty('--x', '"…"')`); text CSS draws without `content:` (`quotes`, a `list-style-type` string, a `@counter-style`'s symbols, prefix and suffix) and a custom property drawn by `content: var(--x)`, in a stylesheet, a `style=""` attribute or CSS written from code |
| B10 | static page text not marked `data-i18n` or `data-operator`, including inside `<svg>`, `<template>`, `<noscript>` and `<script type="text/template">` |
| B11 | a language chosen outside the store (see the "Never" list): a literal language given to any of the store's helpers (`bs(k, 'fr')`, `bsPair(k, { langs: ['en', 'fr'] })`), a language picked by position (`langs[1]`, `langs.filter(…)[0]`, `langs.slice(1, 2)`), a locale not the store's (`toLocaleTimeString([])`, `toLocaleString()`, `Intl.DateTimeFormat(navigator.language)`), the browser's language read outside the resolver, an English fallback (`x.en`, `f(k).en`); a language held in a name (`var L = 'fr'; bs(k, L)`, `'f' + 'r'`, `{ l: 'fr' }.l`), read by name (`BOARD_STR.k['fr']`, `BoardStrings.entry(k).fr`, `var { en } = STR.k`) or by position (`Object.values(entry)[0]`, `pairLangs(langs)[1]`), a helper called another way (`bs.call`, `bs.apply`, `BoardStrings['bs']`, `bs?.()`), the board's languages overwritten (`lang = 'en'`, `langs = ['en', 'fr']`, `langs.splice(…, 'en', 'fr')`), an English date (`toDateString()`, `toUTCString()`, `String(new Date())`, `META.en` as a locale, a locale call borrowed through `.call`), a hand-written am/pm |
| B12 | a second list of Québec airports |
| B13 | a timer that sweeps the page and rewrites its text |
| B14 | `board-strings.js` and `fids-core.js` served from different builds |
| B15 | a passenger word kept outside the store: a label-shaped literal in a variable, a property, a list, a return value or a helper's argument, unless every word in it is data; and any literal word (whatever its case: `{ late: 'delayed' }` shown in capitals) stored under a name that reaches markup text — a variable, a property, an array, an object's keys, a return value. Data is the name tables only (cities, airports, airlines, aircraft, hotel brands): never a notes table, never a brand's separate words, never a word the store's English uses as a label, and in CI never a word added to a name table in the same change |
| B16 | the store or a name table changed at run time: an assignment, `delete`, mutating call or `Object.assign` into `BOARD_STR`, `STR`, `LISTS`, `META`, a registered table, or a name table (`CITY_FR`, `CITY`, `AIRLINE_NAME`, the shared names), bare, through `window`, through another name for it (`var c = CITY_FR; c.YUL = …`) or a global name built from literals (`globalThis['CITY_' + 'FR']`) — the CITY_FR collapse where no duplicate-key check can see it; reviewed writers only (`DATA_WRITERS`) |
| B17 | two statuses, or two weather conditions, reading the same in one language ('On time' and 'Scheduled' both 定刻) |
| C1 | a script or stylesheet on a passenger page that is not classified |
| C2 | a script, stylesheet, page or data file (`.json`) a passenger script loads at run time that is not classified, its URL written whole or in literal parts |
| C3 | a page in neither `PASSENGER_PAGES` nor the reviewed `NON_PASSENGER_PAGES` (a new page is a passenger page until reviewed otherwise); C1 also follows a passenger page's iframes, objects, embeds and links |
| C4 | a `.js` or `.css` file under `fids-current/` in neither the passenger lists nor the reviewed `NON_PASSENGER`, however it is loaded |
| W1 | a word a feed worker writes into a row's text fields (status, remark, label…) or a text-making function's return, written there or held in a name first: the worker sends a code, the board says it |
| P1, P2 | a policy exception or `i18n-ok` pragma that matches nothing, or has no valid reason |
| L1 | a new key in a frozen table |

The checks see through the forms a review used to get past them: text
sinks over a whole expression (`el.textContent = x ? 'Gate closes' : ''`),
`append`/`createTextNode`/`fillText`, `setAttribute` and `dataset` into a
`content: attr()` attribute, `placeholder`/`title`/`alt`/`aria-label`, the
second argument of `replace`, an entry with only French, a zero-width space,
the English inside a translation (`Tomorrow (morgen)`), German pasted from
Spanish, a letter a language does not write, a pair joined with `|`, `/` or
`·`, `window.bs`, `TLin`, `bsList` and the Studio's `T`/`TU`, a language
compared in parentheses, in an `if`, a `switch` or an `includes`, a language
picked by position (`langs[1]`), and an English fallback (`x[lang] || x.en`,
any direct `x.en`). Every one of those is a seeded case in
`tests/i18n/fixtures/attacks.js` and `store.js`.

**The screens, read.** `tests/board-languages-render.test.js` runs
`tests/render/words.mjs` in CI: the gate, departures and baggage boards in
each of the nine languages alone and in the pairs that stress them, the
gate's whole centre deck (welcome, airline and hotel ads page by page, the
map takeover, the weather card's three screens), the gate's departure
delayed, cancelled, boarding, on final call, closed, at Porter's
pre-boarding and moved to another gate, the gate with no flight left, its
"Later at this gate" strip, the phone layout of the gate and
the departures board in each language, the arrivals board, a Québec
airport (Montréal's departures, arrivals and a gate, French first, its
deck and its states), the Studio player (a departures, a gate and a baggage
document) in each language, the stream's rotation page and the stream
tour; and, on the boards and the gates, the airport's feed down (no list,
the last update's time, the last good list with its age), each reached in
other languages and read after a change to the set's, mid-visit. It
reads every visible text node, the text CSS draws (`::before`/`::after`),
placeholders, text drawn on a canvas, and the boards inside same-origin
iframes. It fails on any word that is not one of the board's languages or
data, a 12-hour clock on a board not led by English, feed text marked with
a language it is not in, Arabic, Japanese or Chinese not marked with its
language and direction, and any key the store was asked for and does not
have (`BoardStrings.misses`: a key held in a variable renders blank). A
language's words are the store's — but an English word (the store's
English, or everyday English) counts as another language's only when the
store's translations use it in two entries or a reviewed list says so, so an
English word slipped into one translation is not vouched for by the store
itself. A word in capitals is a code only when it is a known airport or
airline code or no language's word: 'LATE', 'OPEN' or 'TODO' on a German
board, or 'GATE' on a Japanese one, is read as a word. Placeholders ('???',
'TODO') and Persian or Urdu shown for Arabic fail too. It runs on
the boards' demonstration data with the network shut off; `LIVE=1 node
tests/render/words.mjs` reads the live site's data (feed text, weather,
hotels). Three markers tell it what a passenger reads as written:
`translate="no"` (an address, a hotel's or restaurant's name),
`data-i18n-feed` (a feed's own sentences, held to the language they are
marked with) and `data-i18n-all` (a piece that shows every language by
design: the weather card's title). Each is counted as an exception.

The guard fails closed: a file its tokenizer cannot follow fails the test
rather than being skipped. `tests/board-languages-selftest.test.js` feeds it
one seeded example of every violation and fails if any goes unseen.
`tests/board-languages-helpers.test.js` runs every key through every ordered
pair of languages, the Québec rule, the clock, the weekdays and the resolver
for every airport.

### Exceptions

Only for text a passenger does not read as words, each with a reason from
`operator | brand | unit | code | data | debug`:

* `tests/i18n/policy.js`: `OPERATOR_FUNCTIONS`, `BRAND_TERMS`, `UNIT_TERMS`,
  `SAME_AS_ENGLISH` (the language's own word, like German *Terminal*),
  `NONTEXT_TABLES`, `DATA_TABLES`, `TEXT_REWRITERS`;
* in the code: at the end of the line it excuses,
  `el.textContent = 'LIVE'; // i18n-ok: operator`, or on a line of its own
  just above it. A pragma at the end of a line of code never reaches the line
  below it;
* in markup: `data-operator` on an operator-only container.

"passenger" is never a reason. An exception that matches nothing fails.

**No exception grows without an approval, and no change approves itself.**
Against `main`, no policy list (brand terms, operator functions,
non-passenger files and pages, data tables and keys, data writers, native
words, the checks' own lists of calls whose arguments are never words) may
gain an entry, and no file may gain an `i18n-ok` pragma or a
`translate="no"` / `data-i18n-feed` / `data-i18n-all` marker — each
identified by the line of code it excuses, so moving a pragma onto a new
label is new — unless it is recorded in **main's**
`tests/i18n/approved-exceptions.json` as
`{ "list", "entry", "approved": "the pull request it was approved in" }`.
The guard reads the approvals from main, never from the change being
checked, and a change to that file may not travel with anything else: an
approval is a pull request of its own, reviewed on its own, and the change
that uses it follows once it is merged. Every new exception is printed in
the CI summary, approved or not.

**Main's guard decides.** A pull request carries its own copy of the guard,
so on its own a change could loosen a check or make a script exit early. The
"Board languages, as main enforces them" step of `.github/workflows/checks.yml`
therefore checks out a worktree of **origin/main** and runs **main's**
`tests/i18n/as-main.js --change <this checkout>`, which:

* runs main's board-languages tests on main itself, for a baseline count;
* lays the change's `fids-current/`, `workers/`, `worker-entry.js`, ledger,
  frozen keys and approvals file over a worktree of main. The change's
  `policy.js` is code, so it is never run there: a separate node with no
  permission to write, spawn or load a native module reads it as data, and
  it is written back as a plain object for main's ratchet to compare;
* runs main's tests again, main's `npm run guard` and main's rendered check;
* fails on any failure, and on any static test file that runs fewer tests
  than it does on main (a file that stops early with `process.exit(0)`).

Locally, `node tests/i18n/as-main.js` runs main's copy on your checkout.

There is deliberately no `pull_request_target` workflow: on a public
repository that would run a fork's code with the base repository's
privileges. The guard exists to stop accidental gaps; a deliberate edit to
`checks.yml` or to the guard itself shows plainly in the diff and is caught
in review.
`.github/CODEOWNERS` names the guard's files (`tests/i18n/`,
`tests/render/`, `tests/board-languages*`, `.github/`, `package.json`, this
page) for the code-owner review in section 7.

What this does not stop: page code written to attack the test run (main's
tests load the change's `board-strings.js` and render its pages), and two
pull requests in turn, an approval and then its use, if nobody reviews the
first. Both are plain to see in a diff; the review in section 7 is what
holds them.

### The debt ledger

`tests/i18n/debt.json` lists every gap that existed when the guard landed and
is not fixed yet, by check, file, function and text (never line numbers). It
**only shrinks**:

* a finding not in it fails;
* an entry that matches fewer times than its count fails: run
  `node tests/i18n/ledger.js --prune`;
* against `main`, no entry may be added or grow.

`node tests/i18n/ledger.js --md` prints the open items by surface, for the PR
body's Open items list. Items that wait on a decision carry its number.

## 5. Pictures: fit, right to left, fonts

`node tests/render/languages.mjs` serves the worktree locally and shoots the
gate and the boards with German+Portuguese leading (the longest),
Arabic+Japanese (right to left and CJK), Spanish+Chinese, French alone and
French first, checking that no text is clipped, that every Arabic word on
screen (not only the ones already marked) sits right to left, that Chinese
sits under `lang="zh"` (or it is drawn with Japanese glyph forms), and that
the Japanese, Chinese and Arabic glyphs come from the board's own web fonts
rather than a host fallback (the stream host has none). The pictures go in
the PR. A status column is never cut: every render fits each status cell's
own word (`_fidsNoStatusClip`), and the geometry pass sizes the column for
every status of its language.

## 6. Decisions still open

These are policy calls, not translation work. Each has a default the guard
holds until it is answered; the ledger tags the items that wait on one.

| | decision | default |
|---|---|---|
| D1 | The clock of a board led by English | a board reads the clock of the language it leads with (above): a board without English, or led by another language, reads 17:35 everywhere; a board led by English reads 5:35pm as before, and its French half keeps 17:35 where a half carries its own language's clock (the welcome strip). Open: whether an English-led bilingual board should read one clock in both halves |
| D2 | City and airport names in ja/zh/ar/es | the Latin names, as today; a French board now uses the board's own French name where it has one (Montréal) |
| D3 | Portuguese: Brazil or Portugal | **Brazilian**, as `Intl` 'pt' writes the boards' dates: Retirada de bagagem, Situação (the status column), Classe Econômica, Neblina, Pancadas de chuva |
| D5 | Accor's feature lines in English on a non-English ad | not shown: a feed's text is shown in a language only when it is that language (`looksLike`); the address and names are data (`translate="no"`) |
| D7 | Title Case on fr/es/it/pt signs | English only: other languages keep their own capitals (`_fidsTitleCaseIn`) |
| D6 | The companion app: translate now, or leave to its replacement | ledgered |
| D8 | May an operator put English first on a Québec screen? | no: the Québec rule wins |
| D11 | The archive pages (a 1991 board, the heritage index) in nine languages or their period's two | unchanged (ledgered) |
| D13 | The reading order of a pair on a board led by Arabic ('رحلة \| Flight', Arabic on the left) | unchanged: the halves are each marked and isolated, the pair runs left to right. The map caption already reads right to left on an Arabic-led board. Open: whether every pair on such a board should start from the right |
| D12 | The inbound line's connector pair ('PD2381 from \| de Montreal', v23720) | kept as asked for; its Japanese half now reads 出発地 before the city (発 after a city is a suffix, and 'AC1984 発 Toronto' read backwards) |
| — | Making a red guard stop a merge and a deploy | **three settings outside the repository (section 7), not on yet.** Until they are, the guard reports in every pull request and in the manual deploy, but a red check can still be merged, and Workers Builds ships every merge |

## 7. Making it binding: the settings outside the repository

Everything above runs on every pull request, and the manual "Deploy display
site" workflow runs `npm test` before it ships. Three things can only be
switched on outside the repository, in GitHub's and Cloudflare's settings.
None of them is on yet; until they are, a red check is a report, not a gate.

1. **A red check stops a merge.** The ruleset "Protect main" (id 17189099)
   requires a pull request but no status check. Add two required status
   checks, both from GitHub Actions (`integration_id` 15368, so neither can
   be satisfied by a status posted by hand): `test` ("Repository checks")
   and `board-languages (main's guard)` (the workflow main defines):

   ```
   gh api -X PUT repos/<owner>/<repo>/rulesets/17189099 --input ruleset.json
   ```

   where `ruleset.json` is the current ruleset (`gh api
   repos/<owner>/<repo>/rulesets/17189099`) with one more rule:

   ```json
   { "type": "required_status_checks",
     "parameters": { "strict_required_status_checks_policy": true,
       "required_status_checks": [
         { "context": "test", "integration_id": 15368 },
         { "context": "board-languages (main's guard)", "integration_id": 15368 } ] } }
   ```

   (`strict` makes a pull request be up to date with main before it merges,
   so the guard that passed it is the one it merges into.) Or: Settings →
   Rules → Protect main → Require status checks to pass → add both.

2. **A change to the guard is reviewed.** In the same ruleset's
   pull-request rule, set "Require review from Code Owners" (and at least
   one approval). `.github/CODEOWNERS` names the guard's files, so a pull
   request that touches `tests/i18n/`, `tests/render/`,
   `tests/board-languages*`, `.github/` or `package.json` (an approval in
   `approved-exceptions.json` included) cannot merge on its own author's
   say. Every pull request here is opened by the same account, and GitHub
   does not let an author approve their own pull request, so such a change
   then needs a deliberate bypass of the ruleset by an administrator (or a
   second account as code owner): that is the point, a guard change is a
   decision, not a side effect.

3. **A red guard stops a deploy.** Workers Builds deploys every merge to
   `main` and does not read `wrangler.jsonc`'s build settings. In the
   Cloudflare dashboard (Workers & Pages → `fids` → Settings → Build), set
   the **Build command** to `npm run guard`. It runs the guard's checks in
   a few seconds with no dependencies and fails the build — so nothing
   ships — on any passenger word outside the nine-language store that the
   ledger does not already list.
