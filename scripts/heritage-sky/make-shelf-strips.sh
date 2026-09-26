#!/bin/sh
# Reproduces the gate aircraft shelf's three v3 cloud strips (bank / medium / veil).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
E="$HERE/elements"; O="$ROOT/fids-current/textures"; C="$HERE/bin/compose"
"$C" --out "$O/gate-clouds-bank-v3.png" --outW 1250 --outH 260 --featherTop 0.05 --featherBot 0.02 --haze 0.12 --whiten 0.05 --place \
"$E/p04_01.png,0.06,0.30,0.72,0,0.94;$E/p06_01.png,0.27,0.24,0.58,1,0.90;$E/p02_01.png,0.48,0.32,0.76,0,0.95;$E/p13_03.png,0.68,0.25,0.56,1,0.90;$E/p05_01.png,0.88,0.30,0.68,0,0.93"
"$C" --out "$O/gate-clouds-medium-v3.png" --outW 1000 --outH 260 --featherTop 0.12 --featherBot 0.08 --haze 0.22 --whiten 0.15 --place \
"$E/p01_01.png,0.10,0.55,0.46,0,0.82;$E/p13_01.png,0.36,0.42,0.38,1,0.76;$E/p03_01.png,0.60,0.58,0.44,0,0.80;$E/p07_01.png,0.86,0.45,0.40,1,0.78"
"$C" --out "$O/gate-clouds-veil-v3.png" --outW 2600 --outH 260 --featherTop 0.20 --featherBot 0.18 --whiten 0.58 --place \
"$E/ai_02.png,0.06,0.52,0.40,0,0.70;$E/ai_04.png,0.24,0.46,0.34,1,0.66;$E/ai_01.png,0.41,0.55,0.42,0,0.72;$E/ai_05.png,0.58,0.48,0.30,1,0.64;$E/ai_03.png,0.76,0.53,0.38,0,0.70;$E/ai_02.png,0.92,0.47,0.33,1,0.66"

# ── v4 (v23892): the veils rebuilt from the licensed smoke-cloud sheet and the
# soft-cloud vector, denser and matched front and back; the bank is a licensed
# cumulus bank made tileable. The stock sheets are not in the repository; the
# cut-outs below are. Recovery from a dark-checkerboard preview:
#   unchecker (grid reconstruction) -> blurpng 7 0.03 -> alpharemap 0.14 1.1
#   -> blurpng 3 0.02 -> crop -> ellfeather 0.55 (no straight crop edges).
FRONT="$E/smoke_01.png,0.05,0.55,0.42,0,0.85;$E/streak_top.png,0.16,0.62,0.22,1,0.80;$E/wisp_r.png,0.28,0.48,0.68,0,0.75;$E/smoke_04.png,0.40,0.40,0.40,1,0.80;$E/streak_bot.png,0.50,0.58,0.22,0,0.80;$E/smoke_05.png,0.61,0.50,0.40,1,0.85;$E/wisp_l.png,0.72,0.56,0.58,0,0.72;$E/smoke_02.png,0.83,0.42,0.38,1,0.80;$E/smoke_03.png,0.94,0.60,0.45,0,0.80"
"$C" --out "$O/gate-clouds-veil-front-v4.png" --outW 2400 --outH 240 --featherTop 0.15 --featherBot 0.15 --whiten 0.30 --place "$FRONT"
BACK="$E/smoke_05.png,0.04,0.50,0.34,0,0.88;$E/streak_bot.png,0.12,0.64,0.20,1,0.85;$E/wisp_l.png,0.21,0.44,0.50,0,0.78;$E/smoke_01.png,0.29,0.58,0.36,1,0.88;$E/smoke_04.png,0.37,0.38,0.34,0,0.85;$E/streak_top.png,0.46,0.60,0.18,0,0.85;$E/smoke_03.png,0.54,0.50,0.38,1,0.85;$E/smoke_02.png,0.62,0.66,0.32,0,0.85;$E/wisp_r.png,0.71,0.46,0.58,1,0.78;$E/smoke_05.png,0.80,0.62,0.34,1,0.88;$E/smoke_01.png,0.88,0.40,0.36,0,0.88;$E/streak_bot.png,0.96,0.56,0.22,0,0.85"
"$C" --out "$O/gate-clouds-veil-back-v4.png" --outW 2700 --outH 270 --featherTop 0.15 --featherBot 0.15 --whiten 0.28 --place "$BACK"
# The bank: a 1920x280 band cut from the licensed cumulus bank, cross-faded over 240px so it tiles at 1680.
"$HERE/bin/tileify" "$E/bankband_01.png" "$O/gate-clouds-bank-v4.png" 240
# The sky plate (gate-sky-back-v3.jpg) is rows 180-530 of the licensed cirrus sky, resized to 1600x292 (sips); the plate is still, so it need not tile.

# ── v5 (v23893): THREE BANDS. A still cloud layer along the top, the still
# bank along the bottom, and the aeroplane's band between them carrying the
# fast veils (front and back, filling the band) and the slow medium-to-big
# clouds behind them. The veils are recomposed taller so they fill the band.
FRONT="$E/smoke_01.png,0.05,0.62,0.36,0,0.85;$E/streak_top.png,0.16,0.30,0.20,1,0.80;$E/wisp_r.png,0.28,0.55,0.60,0,0.75;$E/smoke_04.png,0.40,0.24,0.34,1,0.80;$E/streak_bot.png,0.50,0.72,0.20,0,0.80;$E/smoke_05.png,0.61,0.42,0.36,1,0.85;$E/wisp_l.png,0.72,0.66,0.52,0,0.72;$E/smoke_02.png,0.83,0.28,0.34,1,0.80;$E/smoke_03.png,0.94,0.58,0.40,0,0.80"
"$C" --out "$O/gate-clouds-veil-front-v5.png" --outW 2400 --outH 290 --featherTop 0.14 --featherBot 0.14 --whiten 0.30 --place "$FRONT"
BACK="$E/smoke_05.png,0.04,0.40,0.30,0,0.88;$E/streak_bot.png,0.12,0.74,0.18,1,0.85;$E/wisp_l.png,0.21,0.32,0.46,0,0.78;$E/smoke_01.png,0.29,0.66,0.32,1,0.88;$E/smoke_04.png,0.37,0.24,0.30,0,0.85;$E/streak_top.png,0.46,0.56,0.17,0,0.85;$E/smoke_03.png,0.54,0.76,0.34,1,0.85;$E/smoke_02.png,0.62,0.36,0.30,0,0.85;$E/wisp_r.png,0.71,0.60,0.52,1,0.78;$E/smoke_05.png,0.80,0.26,0.30,1,0.88;$E/smoke_01.png,0.88,0.70,0.32,0,0.88;$E/streak_bot.png,0.96,0.46,0.20,0,0.85"
"$C" --out "$O/gate-clouds-veil-back-v5.png" --outW 2700 --outH 290 --featherTop 0.14 --featherBot 0.14 --whiten 0.28 --place "$BACK"
# The top band lives in the plate (still). ceiling_01.png is the bank band flipped both ways
# (flipcrop rows 140-240, tinted blue-grey), alpha floor lifted (alpharemap 0.40 1.2) and faded
# out over rows 48-78 (vfade) so no crop line survives; the plate is the licensed cirrus sky
# at 1600x225 with the ceiling drawn at y=-14, alpha .84:
#   plate gate-sky-back-v4.jpg 1600 225 sky-1600x225.jpg "ceiling_01.png,0,-14,0.84"

# ── v23894: the top band is a deck of soft wisps hung from the top edge, not the
# flipped bank (which read as a flat strip with a hard lower edge on the board);
# the bank's upper haze fades in over 70 rows so the layer's top is never a line.
DECK="$E/wisp_r.png,0.06,0.78,1.05,0,0.92;$E/smoke_03.png,0.19,0.84,0.80,1,0.90;$E/wisp_l.png,0.31,0.80,1.00,0,0.90;$E/smoke_01.png,0.44,0.86,0.70,1,0.92;$E/smoke_05.png,0.55,0.82,0.78,0,0.92;$E/wisp_r.png,0.68,0.76,1.05,1,0.90;$E/smoke_04.png,0.81,0.84,0.72,0,0.92;$E/smoke_02.png,0.92,0.80,0.80,1,0.90;$E/wisp_l.png,1.02,0.82,0.95,1,0.90"
"$C" --out "$O/deck.png" --outW 1600 --outH 110 --featherTop 0 --featherBot 0 --whiten 0.32 --place "$DECK"
"$HERE/bin/vfade" "$O/deck.png" "$O/deck.png" 62 108
#   plate gate-sky-back-v5.jpg 1600 225 sky-1600x225.jpg "deck.png,0,-6,0.92"   (sky-1600x225.jpg = the licensed cirrus band)
"$HERE/bin/alpharemap" "$E/bankband_01.png" "$O/bankband-2.png" 0.22 1.0
"$HERE/bin/vfadein" "$O/bankband-2.png" "$O/bankband-2.png" 0 70
"$HERE/bin/tileify" "$O/bankband-2.png" "$O/gate-clouds-bank-v5.png" 240

# ── v23895: the bands made obvious and the veils made to fill the band.
# Top band: big lit cumulus (the medium elements) hung from the top edge, tops cut by the
# frame, bottoms irregular, faded out over rows 84-118; baked into the plate.
TOP="$E/p03_01.png,0.06,0.84,1.30,0,0.96;$E/p13_01.png,0.20,0.90,1.15,1,0.95;$E/p01_01.png,0.34,0.86,1.30,0,0.96;$E/p10_01.png,0.49,0.92,1.10,1,0.95;$E/p07_01.png,0.62,0.86,1.25,0,0.96;$E/p03_01.png,0.77,0.90,1.20,1,0.95;$E/p13_01.png,0.91,0.84,1.30,0,0.96;$E/p01_01.png,1.04,0.90,1.15,1,0.95"
"$C" --out "$O/topband.png" --outW 1600 --outH 120 --featherTop 0 --featherBot 0 --haze 0.08 --whiten 0.06 --place "$TOP"
"$HERE/bin/vfade" "$O/topband.png" "$O/topband.png" 84 118
#   plate gate-sky-back-v6.jpg 1600 225 sky-1600x225.jpg "topband.png,0,-10,1.0"
# Veils: big soft masses, 0.7-0.95 of the band height, overlapping, front and back.
FRONT="$E/wisp_r.png,0.05,0.50,0.95,0,0.88;$E/smoke_01.png,0.17,0.62,0.78,1,0.86;$E/wisp_l.png,0.29,0.46,0.92,0,0.85;$E/smoke_05.png,0.41,0.58,0.80,1,0.88;$E/smoke_03.png,0.52,0.42,0.76,0,0.86;$E/wisp_r.png,0.64,0.56,0.95,1,0.86;$E/smoke_04.png,0.76,0.48,0.80,0,0.88;$E/smoke_02.png,0.87,0.60,0.78,1,0.86;$E/wisp_l.png,0.98,0.50,0.90,0,0.85"
"$C" --out "$O/gate-clouds-veil-front-v6.png" --outW 2400 --outH 290 --featherTop 0.10 --featherBot 0.10 --whiten 0.32 --place "$FRONT"
BACK="$E/smoke_05.png,0.04,0.52,0.82,0,0.90;$E/wisp_l.png,0.13,0.44,0.86,1,0.86;$E/smoke_01.png,0.22,0.60,0.74,0,0.90;$E/wisp_r.png,0.31,0.50,0.90,0,0.86;$E/smoke_03.png,0.40,0.42,0.72,1,0.88;$E/smoke_04.png,0.49,0.58,0.76,0,0.90;$E/smoke_02.png,0.58,0.46,0.74,1,0.88;$E/wisp_l.png,0.67,0.56,0.86,0,0.86;$E/smoke_05.png,0.76,0.48,0.82,1,0.90;$E/wisp_r.png,0.85,0.60,0.90,1,0.86;$E/smoke_01.png,0.93,0.44,0.74,0,0.90;$E/smoke_03.png,1.01,0.54,0.72,1,0.88"
"$C" --out "$O/gate-clouds-veil-back-v6.png" --outW 2700 --outH 290 --featherTop 0.10 --featherBot 0.10 --whiten 0.30 --place "$BACK"

# ── v23896: THE TOP AND BOTTOM ARE THE LICENSED BORDER SHEET, WHOLE. The smoke-cloud sheet is
# a border layout — cloud along its top and its bottom, clear in the middle — and that is the
# still background: its two borders sit at the top and bottom of the plate, scaled uniformly so
# the shelf's window (up to ~440px wide) sees one copy, alpha lifted (the smoke is translucent)
# and the crop edges faded. The bank layer is off; the fast veils are light and span the band.
# (smokeborder_01.png is the recovered sheet: unchecker -> blurpng 7 0.03 -> alpharemap 0.14 1.1 -> blurpng 3 0.02)
"$HERE/bin/cropscale" "$E/smokeborder_01.png" "$O/border-top.png" 0 0 1920 235 440
"$HERE/bin/cropscale" "$E/smokeborder_01.png" "$O/border-bot.png" 0 555 1920 255 440
"$HERE/bin/alpharemap" "$O/border-top.png" "$O/border-top.png" 0 0.55; "$HERE/bin/vfade"   "$O/border-top.png" "$O/border-top.png" 38 54
"$HERE/bin/alpharemap" "$O/border-bot.png" "$O/border-bot.png" 0 0.55; "$HERE/bin/vfadein" "$O/border-bot.png" "$O/border-bot.png" 0 18
#   plate gate-sky-back-v7.jpg 1600 225 sky-1600x225.jpg "border-top.png,0,0,1" "border-top.png,440,0,1" "border-top.png,880,0,1" "border-top.png,1320,0,1" "border-bot.png,0,167,1" "border-bot.png,440,167,1" "border-bot.png,880,167,1" "border-bot.png,1320,167,1"
# Veils v7: light (not heavier), spanning the band's height; strips 230 tall display at 115 (55..170).
FRONT="$E/wisp_r.png,0.05,0.50,0.95,0,0.72;$E/smoke_01.png,0.17,0.66,0.72,1,0.70;$E/wisp_l.png,0.29,0.42,0.92,0,0.70;$E/smoke_05.png,0.41,0.60,0.74,1,0.72;$E/smoke_03.png,0.52,0.36,0.70,0,0.70;$E/wisp_r.png,0.64,0.58,0.95,1,0.70;$E/smoke_04.png,0.76,0.44,0.74,0,0.72;$E/smoke_02.png,0.87,0.64,0.72,1,0.70;$E/wisp_l.png,0.98,0.50,0.90,0,0.70"
"$C" --out "$O/gate-clouds-veil-front-v7.png" --outW 2400 --outH 230 --featherTop 0.10 --featherBot 0.10 --whiten 0.36 --place "$FRONT"
BACK="$E/smoke_05.png,0.04,0.54,0.80,0,0.74;$E/wisp_l.png,0.13,0.40,0.86,1,0.70;$E/smoke_01.png,0.22,0.64,0.70,0,0.74;$E/wisp_r.png,0.31,0.50,0.90,0,0.70;$E/smoke_03.png,0.40,0.36,0.68,1,0.72;$E/smoke_04.png,0.49,0.62,0.72,0,0.74;$E/smoke_02.png,0.58,0.44,0.70,1,0.72;$E/wisp_l.png,0.67,0.58,0.86,0,0.70;$E/smoke_05.png,0.76,0.46,0.80,1,0.74;$E/wisp_r.png,0.85,0.64,0.90,1,0.70;$E/smoke_01.png,0.93,0.40,0.70,0,0.74;$E/smoke_03.png,1.01,0.56,0.68,1,0.72"
"$C" --out "$O/gate-clouds-veil-back-v7.png" --outW 2700 --outH 230 --featherTop 0.10 --featherBot 0.10 --whiten 0.34 --place "$BACK"
