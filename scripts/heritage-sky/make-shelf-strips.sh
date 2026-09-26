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
