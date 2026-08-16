# Airline brand colours — sourced audit

Ground truth for `fids-current/data/airline-colors.js`. Every value here is
taken from an airline's **own published brand guidelines**, with the source
recorded. Nothing in this file is inferred from a screenshot, a colour name, or
by sampling pixels out of an SVG.

> **Why the sourcing rule exists.** An earlier pass extracted hex values by
> scraping every `#rrggbb` out of the logo files in this repo. It reported
> gradient stops, drop shadows and — in Delta's case — three colours that had
> been hand-drawn into a glossy orb an hour earlier, as if they were brand
> colours. Logo files may **confirm** a value found in a source. They must
> never originate one.

Schema in `airline-colors.js`: `r1` dark bar · `r1Text` text on the bar ·
`r2` accent · `body` light background · `bodyText` text on the body ·
`r3` third brand colour (currently Porter only).

---

## Confirmed against official guidelines

### DL — Delta Air Lines — **table is correct**
Source: Delta Brand Guidelines PDF (`waatbp.oneclub.org`, Aug 2024), Color Palette page.

| Delta's name | hex | Pantone | tier |
|---|---|---|---|
| Delta Blue | `#003366` | 654c | primary |
| Delta Red | `#C01933` | 187c | secondary |
| Wayfaring White | `#FFFFFF` | — | secondary |
| Delta Light Red | `#E01933` | 186c | widget / supergraphic |
| Delta Dark Red | `#991933` | 202c | widget / supergraphic |
| Passport Plum | `#2E1A47` | 2695c | tertiary |
| Delta Orange | `#FF6900` | 1505c | tertiary |
| Delta Yellow | `#EAAA00` | 124c | tertiary |
| Delta Light Blue | `#7D9BC1` | 652c | tertiary |
| Delta Dark Blue | `#041C2C` | 296c | tertiary |

Table has `r1 #003366` / `r2 #C01933` — **both correct**.

⚠️ `#C01933` and `#E01933` are **different official colours**, not a discrepancy.
`#C01933` is Delta Red (backgrounds); `#E01933` is Delta Light Red, specified for
the **widget**. `delta-widget-red.svg` using `#E01933` is therefore correct.
Tertiary colours are marked "apply in a very LIMITED MANNER and not as large
fields of colour" — so they must not become bar or body colours.

### AS — Alaska Airlines — **table is correct**
Source: Alaska Airlines Brand Book (`relayto.com`).

| name | hex | Pantone | tier |
|---|---|---|---|
| Midnight Blue | `#01426A` | 7694 C | primary |
| Atlas Blue | `#2774AE` | 2383 C | secondary |
| Breeze Blue | `#48A9C5` | 7702 C | secondary |
| Tropical Green | `#B3D57D` | 2284 C | secondary |
| Calm Blue | `#8BA6C1` | 2156 C | tertiary |
| Mist Gray | `#C8C9C7` | Cool Gray 3 C | tertiary |

Table has `r1 #01426A` / `r2 #2774AE` — **both correct**.

---

## Corrections needed

### AA — American Airlines — **accent correct, bar is not a brand colour**
Source: American Airlines Advertising Guidelines v3.0, March 2015 (slide 15,
"Visual Elements / Color"). Their own instruction: *"Always use the exact color
values listed. Don't use color references or values from files that have been
converted automatically between color modes."*

| AA's name | hex | Spot | CMYK | RGB |
|---|---|---|---|---|
| AA Blue | `#0078D2` | Custom PMS / 2778 U | 100/35/0/0 | 0/120/210 |
| AA Dark Gray | `#36495A` | 7545 C / 7547 U | 50/28/14/56 | 54/73/90 |
| AA Gray | `#9DA6AB` | 429 C / 7544 U | 5/0/0/40 | 157/166/171 |
| AA Red | `#C30019` | 200 C / 1805 U | 0/100/75/15 | 195/0/25 |
| Black | `#131313` | Black C / Black U | 0/0/0/100 | 19/19/19 |

| field | current | verdict |
|---|---|---|
| `r2` | `#0078D2` | ✅ AA Blue, exact |
| `r1` | `#101820` | ❌ **not an American colour** — invented near-black |

`r1` should be **AA Dark Gray `#36495A`** (the brand's dark neutral, and the
colour their own headlines and body copy use) or **Black `#131313`**. Dark Gray
is the branded choice; Black is flatter. **Nick's call.**

⚠️ AA Red `#C30019` is restricted: the guidelines mark it *"used exclusively in
online advertising."* It must not become a board accent.

### LH — Lufthansa — **accent is wrong**
Source: Lufthansa Brand Guidelines (`frontify.lufthansa.com`), Colour section.

| name | hex |
|---|---|
| LH Deep Blue | `#05164D` |
| Lufthansa Yellow | `#FFAD00` |
| Blue Breeze range | `#03123F` `#0D265B` `#3A5382` `#4D6995` `#6E8BB7` `#849AC2` |

| field | current | correct |
|---|---|---|
| `r1` | `#05164D` | ✅ correct |
| `r2` | `#FFB81C` | ❌ → **`#FFAD00`** |

Note Lufthansa's own rule: *"Blue and yellow surfaces are not placed next to each
other or over each other."* Yellow is an accent used in isolation — relevant if
the accent paints tabs sitting directly on the blue bar.

### AC / QK / RV — Air Canada, Jazz, Rouge — **red is wrong**
Source: Air Canada usage guideline PDF (`aircanada.com/content/dam/...ACF_Guidelines_en.pdf`).

```
AC Red    PMS 1795 C / 2035 U   CMYK 0.96.93.2   RGB 240.20.40   HEX #F01428
AC Black  PMS Process Black C   CMYK 0.0.0.100   RGB 0.0.0       HEX #000000
```

| field | current | correct |
|---|---|---|
| `r2` | `#D82F2E` | ❌ → **`#F01428`** |
| `r1` | `#0A0A0A` | near-black; the grey bar was Nick's deliberate choice, not a brand error |

Independently corroborated: `#F01428` is the red inside Air Canada's own logo
files already in this repo. `QK` (Jazz) and `RV` (Rouge) carry the same red and
need the same correction.

### FI — Icelandair — **missing from the table entirely**
Source: Icelandair brand portal (`brandpad.io/icelandair`).

| name | hex | tier |
|---|---|---|
| Midnight Blue | `#001B71` | primary (signature) |
| Snow White | `#FBFBFB` | primary |
| Basalt Grey | `#303030` | primary |
| Fiery Magenta | `#FF47B3` | accent |
| Crisp Blue | `#54C0E8` | accent |
| Boreal Blue | `#91F5E1` | accent |
| Volcanic Green | `#50E68C` | accent |
| Golden Yellow | `#FFDA00` | accent |
| Arctic Lilac | `#BE00FF` | accent |

Icelandair has a logo mapping (`icelandair-fin.svg`) but **no colour entry**, so
it falls through to defaults. Their palette is one signature blue plus **six**
accents, so choosing a single `r2` is a judgement call rather than a lookup —
**Nick's decision.** Crisp Blue `#54C0E8` is the most legible on a departure
board; Fiery Magenta is the most distinctive.

---

## Open question: the schema holds only two brand colours

Nick: *"theres about 3 to 4 colors airlines officially ... should be anyway."*

He is right, and it is a **data-model** limit, not just wrong values. Today an
airline gets `r1` (bar) and `r2` (accent) as real brand colours; `body` and
`bodyText` are derived light/text values, not brand colours. Only Porter has an
`r3`.

Every palette above carries 3–6 official colours. Adding `r3`/`r4` across the
board would let a board use, for example, Alaska's Breeze Blue or Delta's Light
Red where a third tone is needed, instead of inventing one.

⚠️ Constraint worth respecting: several carriers explicitly restrict their
tertiary colours (Delta: "not as large fields of colour"; Lufthansa: yellow
never adjacent to blue). A third slot should carry usage intent, not just a hex.

---

## Canadian regionals — Brandfetch, cross-checked against repo logo files

These carriers publish no brand book. Source: Brandfetch (`brandfetch.com/<domain>`),
which derives a palette from the company's own site and assets.

⚠️ **Brandfetch is a weaker source than a brand book.** It infers colours, so a
pale tint it lists may be website chrome rather than brand. The confidence bar
used here is therefore **agreement with the airline's own logo file already in
this repo** — two independent derivations landing on the same hex.

### High confidence — two independent sources agree, table disagrees with both

| code | airline | table accent | Brandfetch **and** logo file |
|---|---|---|---|
| `YP` | Perimeter | `#1B75BC` blue | **`#FF8024`** orange |
| `3H` | Air Inuit | `#E4002B` | **`#F1471D`** |
| `5T` | Canadian North | `#00A9CE` cyan | **`#CD163F`** red |

Canadian North is the most visible error: the board paints a **cyan** accent for
an airline whose mark is **red**.

### Single source only — leads, not facts. Do not change without confirmation.

| code | airline | table `r1` / `r2` | Brandfetch |
|---|---|---|---|
| `MO` | Calm Air | `#10243F` / `#C8102E` | `#141531` Ebony / `#A8914E` Driftwood |
| `JV` | Bearskin | `#910028` / `#C8102E` | `#009ED8` / `#F6BB60` |
| `WT` | Wasaya | `#CD342B` / `#E1241B` | `#02488D` / `#FF0000` |
| `NSA` | North Star | `#B01117` / `#F9A51A` | `#B11116` / `#000000` |
| `BQ` | Pascan | `#1B2A4A` / `#E1241B` | `#142454` / `#BF9C46` |
| `4N` | Air North | `#13294B` / `#F2A900` | `#075087` / `#F27620` |
| `PB` | PAL | `#183677` / `#3E57BE` | `#193577` / `#8FC7E1` |

Notes:
- **Bearskin** — Brandfetch says blue/gold; both the table and the repo's logo
  file say crimson `#910028`. Two sources against one: **do not change.**
- **North Star** — `#B01117` (table + logo) vs `#B11116` (Brandfetch) differ by
  one digit. The logo file is the better authority; leave as is.
- **PAL** — `#183577` vs `#193577`, again a hair apart; logo file carries
  `#1C3474`/`#1F3876`. Not worth changing on this evidence.
- **Calm Air** — the largest single-source gap: red accent in the table versus a
  gold "Driftwood" from Brandfetch. Worth confirming from Calm Air directly
  before touching it.
