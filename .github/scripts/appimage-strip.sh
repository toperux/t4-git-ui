#!/usr/bin/env bash
# Remove usr/lib/libwayland-client.so.0 from an AppImage, in place.
#
# Usage: appimage-strip.sh <file.AppImage>
#
# Why: the AppImage is built on ubuntu-22.04, and linuxdeploy bundles that
# host's libwayland-client (1.20). A newer host's Mesa libEGL_mesa uses symbols
# 1.20 lacks (wl_display_create_queue_with_name and others), so EGL init fails
# with EGL_BAD_PARAMETER and the window stays blank. Without the bundled copy
# the host's own libwayland-client is loaded.
#
# Why a repack: neither the Tauri bundler's AppImage settings nor linuxdeploy's
# environment has a way to exclude a library, so the image is unpacked after
# `cargo tauri build`, the library removed and the squashfs rebuilt behind the
# same runtime. The runtime's embedded .digest_md5 is rewritten to match
# (appimage-digest.py); it is checked on the original first, so a change in how
# appimagetool computes it fails here instead of shipping a wrong one.
#
# When to drop it: once Tauri's linuxdeploy picks up the upstream excludelist,
# which has excluded this one library since 2024-11 (pkg2appimage#559). Moving
# the runner does not help: noble ships libwayland 1.22.
#
# Nothing in the image is executed. Needs python3 and squashfs-tools 4.5+.
set -euo pipefail

f=$1
lib=usr/lib/libwayland-client.so.0

# The runtime is an ELF with its section headers last, and the squashfs starts
# right after them: e_shoff + e_shentsize * e_shnum.
off=$(python3 -c '
import struct, sys
with open(sys.argv[1], "rb") as fh:
    h = fh.read(64)
if h[:6] != b"\x7fELF\x02\x01":
    sys.exit(f"{sys.argv[1]}: not a 64-bit little-endian ELF")
shoff, = struct.unpack_from("<Q", h, 0x28)
shentsize, shnum = struct.unpack_from("<HH", h, 0x3A)
print(shoff + shentsize * shnum)
' "$f")
echo "runtime is $off bytes"
# Fails on a wrong offset.
unsquashfs -s -o "$off" "$f" >/dev/null
digest=$(dirname "$0")/appimage-digest.py
python3 "$digest" --check "$f"

tmp=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/appimage-strip.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

unsquashfs -q -o "$off" -d "$tmp/root" "$f" >/dev/null
# A silent no-op would mean the bundler changed and this needs another look.
if [ ! -e "$tmp/root/$lib" ]; then
  echo "$lib is not in $f" >&2
  exit 1
fi
rm "$tmp/root/$lib"
echo "removed $lib"

mksquashfs "$tmp/root" "$tmp/fs" -comp zstd -root-owned -noappend -mkfs-time 0 -quiet -no-progress
# Never `> "$f"` while reading it: the redirect truncates it first.
{ head -c "$off" "$f"; cat "$tmp/fs"; } > "$tmp/new"
mv "$tmp/new" "$f"
chmod 755 "$f"
python3 "$digest" --write "$f"
python3 "$digest" --check "$f"

list=$(unsquashfs -l -o "$off" "$f")
if grep -q libwayland-client <<<"$list"; then
  echo "libwayland-client is still in $f" >&2
  exit 1
fi
echo "repacked $f"
