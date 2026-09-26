#!/bin/sh
# Reproduces the archive card's two fly-through clips exactly as shipped (v23888).
# Run from anywhere; writes into fids-current/textures/. Needs ./build.sh first.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
LIST=$(ls "$HERE"/elements/*.png | tr '\n' ';' | sed 's/;$//')
for key in air-atlantic air-nova; do
  "$HERE/bin/flythru" --out "$ROOT/fids-current/textures/heritage-sky-$key.mp4" \
    --elements "$LIST" --plane "$ROOT/fids-current/aircraft/heritage/$key.png" \
    --w 1280 --h 768 --fps 30 --dur 20 --period 2000 --focal 1000 --dir -1 \
    --planeDepth 1000 --planeWidth 0.62 --pitch -1.8 --bob 22 --bobSec 10 \
    --bitrate 3200000 --seed 23
done
# One sky for every carrier: the seed places the clouds, so it is shared. Only the aeroplane swaps.
