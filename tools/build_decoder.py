#!/usr/bin/env python3
"""Build a self-contained x86-64 Linux worker; no BMW SDK or shared libc required."""
import pathlib, subprocess, os, shutil
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'car'/'assets'/'jpeg-decoder'
out.parent.mkdir(parents=True,exist_ok=True)
compiler=os.environ.get('HUD_MIRROR_CC') or shutil.which('musl-gcc') or str(root/'build/toolchains/musl/bin/musl-gcc')
if not pathlib.Path(compiler).exists(): raise SystemExit('Install musl 1.2.5 and set HUD_MIRROR_CC to its musl-gcc wrapper')
subprocess.run([compiler,'-std=c99','-O3','-march=x86-64','-mtune=generic','-static','-s',
    '-fstack-protector-strong','-Wl,-z,noexecstack',str(root/'native/jpeg-decoder/main.c'),'-lm','-o',str(out)],check=True)
out.chmod(0o755)
print(out)
