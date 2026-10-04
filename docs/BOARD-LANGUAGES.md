# Board languages

Every word a passenger can read ships in all nine board languages:

| code | language | direction | clock |
|---|---|---|---|
| en | English | left to right | 5:35pm |
| fr | French | left to right | 17:35 |
| es | Spanish | left to right | 17:35 |
| de | German | left to right | 17:35 |
| it | Italian | left to right | 17:35 |
| pt | Portuguese | left to right | 17:35 |
| ja | Japanese | left to right | 17:35 |
| zh | Chinese (simplified) | left to right | 17:35 |
| ar | Arabic | **right to left** | 17:35 |

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
| a time | `bsTime(date, lang, tz)` |
| a weekday or date | `bsWeekday(date, lang, 'short', tz)`, `bsDate(date, lang, opts, tz)` |
| a gate label from the legacy table | `_gateLbl(key, _frF, wrap, sep)` (falls through to `STR`) |
| mark a half you wrapped yourself | `BoardStrings.markHalf(html, lang, key)` |
| mark a whole element as one language | `BoardStrings.setLang(el, lang)` |
| a font stack set from code | `BoardStrings.withScripts(stack)` |
| a loader or status line | `BoardStrings.loaderLine('loading')` |
| static page text | `<span data-i18n="key">` (`data-i18n-one`, `data-i18n-upper`), filled by `BoardStrings.applyStatic()` |

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

## 4. The guard

`tests/board-languages.test.js` runs `tests/i18n/checks.js` over every
passenger script, inline script, stylesheet and page:

| check | fails on |
|---|---|
| B1 | a table entry missing a language, empty, an expression, or an unknown code |
| B2 | a language table outside the store and the registered tables; `[code, text]` lists; `X_FR` parallel tables |
| B3 | a translation equal to the English, ja/zh/ar without their own script, French pasted into es/de/it/pt |
| B4 | any object key declared twice (the CITY_FR collapse); a key in two tables one helper reads |
| B5 | words in markup, in a text sink, after a helper, in an `X \| Y` literal, or an English sentence literal |
| B6 | a literal key passed to a helper that does not exist; ad copy with no translation row |
| B7 | one English phrase translated two ways |
| B8 | a label the store translates, written as a literal |
| B9 | CSS `content:` text; `data-*` text drawn by `content: attr()` |
| B10 | static page text not marked `data-i18n` or `data-operator` |
| B11 | a language chosen outside the store (see the "Never" list) |
| B12 | a second list of Québec airports |
| B13 | a timer that sweeps the page and rewrites its text |
| B14 | `board-strings.js` and `fids-core.js` served from different builds |
| C1 | a script or stylesheet on a passenger page that is not classified |
| P1, P2 | a policy exception or `i18n-ok` pragma that matches nothing, or has no valid reason |
| L1 | a new key in a frozen table |

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
* on one line: `el.textContent = 'LIVE'; // i18n-ok: operator`;
* in markup: `data-operator` on an operator-only container.

"passenger" is never a reason. An exception that matches nothing fails.

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
Arabic+Japanese (right to left and CJK) and Spanish+Chinese, checking that no
text is clipped, that Arabic sits right to left, and that the Japanese, Chinese
and Arabic glyphs come from the board's own web fonts rather than a host
fallback (the stream host has none). The pictures go in the PR.

## 6. Decisions still open

These are policy calls, not translation work. Each has a default the guard
holds until it is answered; the ledger tags the items that wait on one.

| | decision | default |
|---|---|---|
| D1 | The boards' clock per language | the store's clock (`bsTime`) reads 5:35pm in English and 17:35 in the others, and new code uses it; the gate, the departures and baggage boards and the weather card still print 12-hour times in every language (27 places, ledgered) until this is answered |
| D2 | City and airport names in ja/zh/ar/es | the Latin names, as today |
| D3 | Portuguese: Brazil or Portugal | mixed, as today |
| D5 | Accor's feature lines in English on a non-English ad | shown, as today |
| D6 | The companion app: translate now, or leave to its replacement | ledgered |
| D7 | Title Case on fr/es/it/pt signs | unchanged |
| D8 | May an operator put English first on a Québec screen? | no: the Québec rule wins |
| D11 | The archive pages (a 1991 board, the heritage index) in nine languages or their period's two | unchanged (ledgered) |
| — | `test` as a required status check on `main` | **not on: until it is, a red guard does not stop a merge** |
