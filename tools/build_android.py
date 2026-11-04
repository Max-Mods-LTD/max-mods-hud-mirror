#!/usr/bin/env python3
"""Build the dependency-free prototype APK using Android SDK 35 and ECJ.

ANDROID_SDK_ROOT and ECJ_JAR name your SDK and Eclipse compiler.
HUD_MIRROR_KEYSTORE may name your signing key (alias: hudmirror).
Keep the generated local build/ key for installing future APK updates.
"""
import os
import pathlib
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'build' / 'android'
OUT.mkdir(parents=True, exist_ok=True)
sdk = pathlib.Path(os.environ['ANDROID_SDK_ROOT'])
tools = sdk / 'build-tools' / '35.0.0'
android = sdk / 'platforms' / 'android-35' / 'android.jar'
ecj = pathlib.Path(os.environ['ECJ_JAR'])
sources = sorted((ROOT / 'android' / 'app' / 'src' / 'main' / 'java').rglob('*.java'))
classes = OUT / 'classes'
classes.mkdir(exist_ok=True)

def run(*args):
    subprocess.run([str(x) for x in args], check=True)

run('java', '-jar', ecj, '-8', '-proc:none', '-warn:none', '-classpath', android, '-d', classes, *sources)
jar = OUT / 'classes.jar'
with zipfile.ZipFile(jar, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(classes.rglob('*.class')):
        z.write(p, p.relative_to(classes).as_posix())
run(tools / 'd8', '--min-api', '26', '--lib', android, '--output', OUT, jar)
unsigned = OUT / 'unsigned.apk'
run(tools / 'aapt', 'package', '-f', '-M', ROOT / 'android' / 'app' / 'src' / 'main' / 'AndroidManifest.xml', '-I', android, '-F', unsigned)
with zipfile.ZipFile(unsigned, 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(OUT / 'classes.dex', 'classes.dex')
aligned = OUT / 'aligned.apk'
run(tools / 'zipalign', '-f', '4', unsigned, aligned)
key = pathlib.Path(os.environ.get('HUD_MIRROR_KEYSTORE', str(OUT / 'prototype-signing.p12')))
password = os.environ.get('HUD_MIRROR_STORE_PASSWORD', 'maxmods-prototype')
if not key.exists():
    run('keytool', '-genkeypair', '-keystore', key, '-storepass', password, '-keypass', password,
        '-alias', 'hudmirror', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '3650',
        '-dname', 'CN=Max Mods HUD Mirror Prototype')
dest = ROOT / 'dist' / 'Max_Mods_HUD_Mirror_Android_v0.1.0.apk'
dest.parent.mkdir(exist_ok=True)
run(tools / 'apksigner', 'sign', '--ks', key, '--ks-key-alias', 'hudmirror', '--ks-pass', 'pass:' + password,
    '--key-pass', 'pass:' + password, '--out', dest, aligned)
run(tools / 'apksigner', 'verify', '--verbose', dest)
print('Built', dest)
