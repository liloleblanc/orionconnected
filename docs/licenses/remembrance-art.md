# Remembrance art (11 November)

The art of the 11 November looks (`fids-current/js/remembrance.js`, styled by
`fids-current/css/remembrance.css`). The public tree carries no text files, so this note
lives here; each SVG also says what it is in a comment just inside its `<svg>` tag.

## The files: stand-ins, replaced one-for-one

Every file in `fids-current/holidays/remembrance/` is **stand-in art drawn for the boards**.
Each is replaced by the licensed file under the **same name**, with nothing else to change:
the look draws whatever file sits at that path, at that file's own proportions (the `ART`
table in `remembrance.js`: change `ratio` there only if the new file's width / height differs).

| File | Shows | Used as | Licensed replacement (Vecteezy, Pro licence held for this project) |
| --- | --- | --- | --- |
| `poppy.svg` | one red poppy, face-on, black centre, no leaf | worn beside the airport's logo on the departures banner; pinned in the gate's cream band before the airport's mark; the large poppy on the silence floor, the still ticker line and the gate's silence card (Canada, United Kingdom, Australia) | item 74521065, "red poppy symbol representing remembrance" |
| `wreath.svg` | a plain green laurel wreath with a red, white and blue ribbon | in the gate's cream band before the airport's mark (United States, Veterans Day) | item 14720428, one wreath of the set, without its placeholder text; the ribbon is ours |
| `us-flag.svg` | the United States flag, whole, union at the upper left | the pin beside the airport's logo on the departures banner (United States, Veterans Day) | item 81829391, "waving United States flag" |

Ratios the look draws each at today: poppy 1 : 1, wreath 300 : 336, flag 1.9 : 1.

After a replacement: check that the file is plain vector art (no `<script>`, `<image>`,
`<foreignObject>` or links; `tests/remembrance.test.js` holds this), keep a one-line comment
naming its Vecteezy item just inside the `<svg>` tag, and bump the build tag.

## Use of the poppy: permission first

- **Canada.** The poppy, as a symbol of remembrance, is a registered trademark of the
  **Royal Canadian Legion**; any use needs its written permission, including visual or
  multimedia displays for public viewing. Requests go to poppytrademark@legion.ca with a
  description of the use, a draft design, the reason and the dates.
- **United Kingdom.** The **Royal British Legion**'s poppy is also a registered trademark.
  A natural poppy flower is used, not the Legion's two-petal poppy with its leaf, and the
  Legion is asked before the boards at London Heathrow and Edinburgh show it.

So the look ships with a **switch per country** (`SWITCH` in `remembrance.js`):

| Country | Ships | Why |
| --- | --- | --- |
| Canada (`CA`) | **off** | the Royal Canadian Legion's written permission is needed first |
| United Kingdom (`GB`) | **off** | the Royal British Legion's poppy is a registered trademark |
| Australia (`AU`) | on | |
| United States (`US`) | on | no poppy: a flag pin and a laurel wreath |

Turning a country on is the one-line change to `SWITCH`. Off, that country's boards show
nothing of the look. `?holiday=remembrance` previews any airport's own look whatever its
switch says, for review.

## The flag

The United States flag follows the Flag Code (4 U.S.C. §8): shown whole, the union at the
upper left, nothing written or placed on it, and never in or beside advertising. It is the
pin on the departures banner only; the gate, which carries the adverts, has the wreath.

Do not reuse these files outside this project without checking the licence terms.
