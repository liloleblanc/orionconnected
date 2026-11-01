# 100 Years of United (United gates, boarding, 2026)

The centenary mark on the boarding strip of a United gate, through 31 December 2026 on the
airport's own calendar (`_uaCentennialOn` and `_boardWelcomeStripHtml` in
`fids-current/js/fids-core.js`; the "100 YEARS OF UNITED" block in
`fids-current/css/display-overrides.css`, after the v23761 rondelle block and before the
v23773 sign blocks, where `tests/united-centennial.test.js` requires it). While a United
flight boards, United's spinning globe sits on the left of "Now Boarding", the Star Alliance
star is the divider between the two languages (with one board language it sits after the
words), and the 100 YEARS OF UNITED lettering sits on the right.

## The files

| File (`fids-current/logos/airlines/us-major/`) | What it is | Made from |
| --- | --- | --- |
| `united-100-globe.webp` | 55 frames of United's globe square, 134 px each, side by side (7370 × 134, lossless). Frames 1–37: the globe growing in while it turns. Frames 38–55: one turn of its lines, which repeats with no seam (the step from frame 55 back to 38 measures the same as any other step). | Frames 1–55 of United's animation, the globe square cut out of each frame, following it as it slides; the lettering and the ® mark are left out. |
| `united-100-years-words.png` | The "100 / YEARS OF / UNITED" lettering on its own (212 × 161). | The finished lockup in the same animation's frame 50, lettering only, recoloured from white to United Blue `#0033A0` (the colour of the UNITED wordmark on the gate banner), because the strip is white and the original white lettering is drawn for dark grounds. Nothing else is changed. |

The board plays the frames at 60 ms each (United's run is 40 ms; this is half again as
slow). The part of United's animation where the globe and the lettering move apart to the
two ends of a wide footer is not used.

## Source

- United Airlines' animated "100 years of United" logo, shown at the foot of united.com pages:
  `https://www.united.com/de03c2916e8b84cccdb6.u100-DesktopWeb.webp` (animated WebP,
  2272 × 192, 122 frames at 40 ms, 325,478 bytes). Saved from united.com on 2026-10-30.
- It is United's trademark and artwork. The board shows it only on United's own flights'
  gates, beside the flight, the way it shows every airline's own logo.
