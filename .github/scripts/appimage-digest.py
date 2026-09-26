#!/usr/bin/env python3
"""Check or rewrite a type-2 AppImage's embedded MD5 digest (.digest_md5).

Usage: appimage-digest.py --check|--write <file.AppImage>

appimagetool embeds an MD5 of the whole file in the runtime's .digest_md5
section; appimage-strip.sh changes the payload, so it rewrites the digest here.
This reproduces appimagetool's appimage_type2_digest_md5 (src/digest.c) exactly,
quirks included: the file is hashed in 4096-byte chunks, the .digest_md5,
.sha256_sig and .sig_key sections are skipped, and the skipped bytes and the
last chunk's tail are whatever the reused buffer held from the chunk before,
not zeros. --check against the untouched image is what proves the emulation
still matches the tool that built it.
"""
import hashlib
import struct
import sys

CHUNK = 4096
SKIPPED = (".digest_md5", ".sha256_sig", ".sig_key")

mode, path = sys.argv[1:]
with open(path, "rb") as fh:
    data = bytearray(fh.read())


def sections():
    shoff, = struct.unpack_from("<Q", data, 0x28)
    shentsize, shnum, shstrndx = struct.unpack_from("<HHH", data, 0x3A)

    def header(i):
        # sh_name, sh_offset, sh_size
        base = shoff + i * shentsize
        name, = struct.unpack_from("<I", data, base)
        offset, size = struct.unpack_from("<QQ", data, base + 0x18)
        return name, offset, size

    _, strtab, _ = header(shstrndx)
    found = {}
    for i in range(shnum):
        name, offset, size = header(i)
        end = data.index(b"\0", strtab + name)
        found[data[strtab + name:end].decode()] = (offset, size)
    return found


def digest(secs):
    skip_ranges = [secs[n] for n in SKIPPED]
    md5 = hashlib.md5()
    buf = bytearray(CHUNK)
    pos = 0
    left = len(data)
    skip = 0
    while left > 0:
        current = pos
        this = CHUNK
        if skip > 0:
            n = CHUNK if skip % CHUNK == 0 else skip % CHUNK
            this -= n
            skip -= n
            pos += n
        for offset, size in skip_ranges:
            if 0 < offset - current < CHUNK:
                begin = (offset - current) % CHUNK
                part = data[pos:pos + begin]
                buf[:len(part)] = part
                pos += begin
                this -= begin + size
                if this < 0:
                    skip = -this
                    this = 0
                pos += CHUNK - this - begin
        if this > 0:
            part = data[pos:pos + this]
            buf[CHUNK - this:CHUNK - this + len(part)] = part
            pos += this
        md5.update(buf)
        left -= CHUNK
    return md5.digest()


secs = sections()
offset, size = secs[".digest_md5"]
stored = bytes(data[offset:offset + 16])
actual = digest(secs)
if mode == "--check":
    if stored != actual:
        sys.exit(f"{path}: .digest_md5 is {stored.hex()}, the file hashes to {actual.hex()}")
    print(f"digest ok: {actual.hex()}")
elif mode == "--write":
    with open(path, "r+b") as fh:
        fh.seek(offset)
        fh.write(actual)
    print(f"digest written: {actual.hex()}")
else:
    sys.exit(f"unknown mode {mode}")
