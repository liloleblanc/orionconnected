FIDS MOBILE — DEPLOY PACKAGE
============================
Replace these files on your site (same paths):

  js/fids-core.js      -> js/fids-core.js
  css/fids-v2.css      -> css/fids-v2.css
  gids.html            -> gids.html
  bids.html            -> bids.html
  logos/aircraft-icon.png -> logos/aircraft-icon.png   (your black plane, for the map marker)

Then HARD-REFRESH on your phone.

WHAT'S IN THIS BUILD (mobile gate/baggage only; big-display untouched):
- Consistent type scale (4 categories: codes/gate, title/status, data, labels)
- Airline logo in header (white card, with airline-name text fallback)
- City names cleaned (no "(yow)")
- Status as coloured text, no pills
- Translations via TL()/SL() (9 languages)
- "Arrives in X min" incoming-aircraft block
- Bottom MENU nav (Back / gate-flight Search) — fixed to viewport
- Scroll unlock on mobile
- Real aircraft livery between the codes
- logos/aircraft-icon.png = your black plane (map marker)

KNOWN / OUTSTANDING (for next session, fresh + with data):
- Map plane only shows when the flight is AIRBORNE (progress >= 2%).
  On the ground (boarding/scheduled) the map shows route + dots, no plane.
  To always show it, that condition in fids-core.js (~line 15835) needs changing.
- The plane image you sent arrived flattened (dark on black), so it's
  low-contrast. For a crisp marker, re-export it as a true transparent PNG
  and drop it in at logos/aircraft-icon.png.
- Verify everything on the actual phone; sandbox renders haven't matched live.
