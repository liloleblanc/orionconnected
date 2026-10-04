# Copilot instructions

## Board languages — every passenger word, all nine languages

Anything a passenger can see (gate, departures/arrivals, baggage, weather and heritage cards, ads,
loaders, empty/error panels, phone layout, Studio player) ships in **en fr es de it pt ja zh ar**.
No exception for small labels, fallbacks, CSS `content`, placeholders or "temporary" text.

To add or change a word:
1. Put it in `STR` in `fids-current/js/board-strings.js` with all nine values. If the English already
   exists on a screen, reuse that key or its exact translations.
2. Render it with `bs(key, lang)` or `bsPair(key, …)`. Never write words into HTML/CSS strings, never pick a
   language with `lang === 'xx'`, never slice `langs` or format a time/date yourself (`bsTime`, `bsDate`,
   `bsWeekday`, `bsPairLangs`).
3. Pre-boarding, travel documents, loyalty and cabin names: use the airline's or government's own published
   wording for each language it publishes; mark the others `$src: 'careful'`.
4. French leads at a Québec airport (`BoardStrings.FR_FIRST`) whenever French is selected; the helpers do this.
5. `npm test` must pass. The board-languages guard fails on a missing or empty language, a duplicate key, a
   value left in English, or a word hard-coded in markup. Fix the string. Do not add an exception to get
   green: exceptions are only for operator-only text, brand names, units, codes, data and debug output,
   with a reason (`tests/i18n/policy.js`, or `// i18n-ok: <reason>` on the line).
6. Tick "All 9 board languages covered (the guard passes)" in the PR and attach the language pictures
   (`node tests/render/languages.mjs`).

The full reference is `docs/BOARD-LANGUAGES.md`.
