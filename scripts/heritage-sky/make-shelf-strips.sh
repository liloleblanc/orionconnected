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
