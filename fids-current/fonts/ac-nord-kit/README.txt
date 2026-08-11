AC NORD + AIR CANADA ICON FONT — KIT
====================================

WHAT'S INSIDE
  fonts/                 10 AC Nord .woff2 files
                           Text:    Light, Regular, Italic, Medium, Bold, Heavy
                           Display: Regular, Medium, Bold, Heavy
  icons/icomoon.woff     Air Canada UI icon font (~173 glyphs, U+E900–U+E9AE)
  fonts.css              Drop-in @font-face + icon classes (paths already match
                           this folder layout)
  icon-reference/        Contact sheet of every icon glyph with its \value
  ac_nord_specimen.png   Full type specimen (all weights + a gate-panel mock)

QUICK START
  1. Drop this whole folder into your project.
  2. Link the CSS:   <link rel="stylesheet" href="fonts.css">
  3. Use it:
        font-family: 'AC Nord Display';   /* gate / flight numbers, headlines */
        font-family: 'AC Nord Text';      /* status lines, body, small UI    */
        <span class="ac-ico ico-wifi"></span>   /* an icon */
  4. For live boards, add class="tnum" so figures stay column-aligned.

ADDING MORE ICONS
  Only 7 glyphs have confirmed names (already in fonts.css). For the rest,
  open icon-reference/ac_icomoon_contact_sheet.png, find the icon you want,
  note its \value (e.g. \e935), and add:
        .ico-myname::before { content:'\e935'; }

NOTE ON USE
  AC Nord and this icon set are Air Canada proprietary assets. Fine for your
  own / non-commercial experimentation; get permission before anything public.
