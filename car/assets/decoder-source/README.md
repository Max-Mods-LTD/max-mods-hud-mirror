# Native JPEG worker

`main.c` is GPL-3.0-or-later. `stb_image.h` retains its MIT/public-domain dual
licence. The header is pinned to nothings/stb commit
`f0569113c93ad095470c54bf34a17b36646bbbb5`.

Build on x86-64 Linux with musl 1.2.5 and GCC. Install musl from https://musl.libc.org/
or its source mirror https://github.com/ifduyue/musl at commit
`0784374d561435f7c787a555aeab8ede699ed298` (tag v1.2.5), then point
`HUD_MIRROR_CC` at its `musl-gcc` wrapper:

```sh
HUD_MIRROR_CC=/path/to/musl/bin/musl-gcc python3 tools/build_decoder.py
```

The worker is statically linked for baseline x86-64/SSE2, with a non-executable
stack. The static C library is musl 1.2.5 (MIT; COPYRIGHT included). It needs no BMW library, GPU/device permission, dynamic loader, root,
network or file access. The executable uses Linux system calls; compatibility
with the physical BMW still needs checking. It accepts only 768x432 or
576x324 JPEG frames up to 600000 bytes, limits its address space to 96 MiB,
and returns one full-range BT.601 YUV420 atlas per request. The Node client
keeps at most one decode in flight and one newest waiting frame.

The app package includes this exact source and header alongside the worker.
