#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec "${HUD_MIRROR_CC:-musl-gcc}" -std=c99 -O3 -march=x86-64 -mtune=generic -static -s -fstack-protector-strong -Wl,-z,noexecstack main.c -lm -o jpeg-decoder
