#!/bin/sh
# Compiles the heritage-sky tools into ./bin. Needs Xcode command-line tools (swiftc).
set -e
cd "$(dirname "$0")"; mkdir -p bin
for f in src/*.swift; do n=$(basename "$f" .swift); swiftc -O "$f" -o "bin/$n"; echo "built bin/$n"; done
