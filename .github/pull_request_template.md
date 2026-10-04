## What changed

## Pictures
<!-- The screen as a passenger sees it. For anything with words: German+Portuguese leading
     (the longest) and Arabic+Japanese leading (right-to-left and CJK).
     node tests/render/languages.mjs writes them to tests/render/out/. -->

## Open items
<!-- The visible ledger: everything not done in this PR.
     node tests/i18n/ledger.js --md prints the board-language items. -->

## Checks
- [ ] All 9 board languages covered (the guard passes): every new or changed passenger word is in `fids-current/js/board-strings.js` with en fr es de it pt ja zh ar
- [ ] Existing wording reused where the English already exists on a screen (the "one translation per phrase" check passes)
- [ ] Pre-boarding / travel documents / loyalty / cabin wording: the airline's or government's own published words; careful translations listed here for review
- [ ] Fit checked with German+Portuguese and Arabic+Japanese leading (pictures attached)
- [ ] New `i18n-ok` pragmas or policy lines listed here with their reason, or "none"
- [ ] `FIDS_BUILD_TAG` and every `?v=` bumped
