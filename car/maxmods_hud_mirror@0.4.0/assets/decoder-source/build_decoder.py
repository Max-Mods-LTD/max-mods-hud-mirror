#!/usr/bin/env python3
"""Build a self-contained x86-64 Linux worker; no BMW SDK or shared libc required."""
import pathlib, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'car'/'assets'/'jpeg-decoder'
out.parent.mkdir(parents=True,exist_ok=True)
subprocess.run(['gcc','-std=c99','-O3','-march=x86-64','-mtune=generic','-static','-s',
    '-fstack-protector-strong','-Wl,-z,noexecstack',str(root/'native/jpeg-decoder/main.c'),'-lm','-o',str(out)],check=True)
out.chmod(0o755)
print(out)
