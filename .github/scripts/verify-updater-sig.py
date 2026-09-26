#!/usr/bin/env python3
"""Verify a Tauri updater signature against the pubkey in tauri.conf.json.

Usage: verify-updater-sig.py <file> <file.sig> <tauri.conf.json>

Both the pubkey and the .sig are base64 of a whole minisign file. Pubkey line 2
is `Ed` + key id (8 bytes) + key (32). The .sig's line 2 is `ED` (prehashed) +
key id + signature (64) over blake2b-512 of the file, line 3 the trusted
comment, and line 4 the global signature over that signature plus the comment.

minisign is not packaged for ubuntu-22.04, so this stands in for it with
python3-cryptography. Python 3.10: no hashlib.file_digest.
"""
import base64
import hashlib
import json
import sys

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

path, sig_path, conf_path = sys.argv[1:]


def fail(msg):
    sys.exit(f"{path}: {msg}")


def key_id(b):
    # Stored little-endian; minisign prints it reversed.
    return b[::-1].hex().upper()


def lines(b64):
    return base64.b64decode(b64).decode().splitlines()


with open(conf_path) as fh:
    pub = base64.b64decode(lines(json.load(fh)["plugins"]["updater"]["pubkey"])[1])
with open(sig_path) as fh:
    sig_lines = lines(fh.read())
sig = base64.b64decode(sig_lines[1])
comment = sig_lines[2].removeprefix("trusted comment: ")
global_sig = base64.b64decode(sig_lines[3])

if pub[:2] != b"Ed":
    fail(f"{conf_path}: pubkey algorithm is {pub[:2].decode()!r}, expected 'Ed'")
if sig[:2] != b"ED":
    fail(f"signature algorithm is {sig[:2].decode()!r}, expected 'ED' (prehashed)")
if sig[2:10] != pub[2:10]:
    fail(f"signed with key {key_id(sig[2:10])}, but {conf_path} has key {key_id(pub[2:10])}")

h = hashlib.blake2b()
with open(path, "rb") as fh:
    for chunk in iter(lambda: fh.read(1 << 20), b""):
        h.update(chunk)

key = Ed25519PublicKey.from_public_bytes(pub[10:42])
try:
    key.verify(sig[10:74], h.digest())
except InvalidSignature:
    fail(f"{sig_path} does not match the file")
try:
    key.verify(global_sig, sig[10:74] + comment.encode())
except InvalidSignature:
    fail(f"{sig_path}: the trusted comment's signature is invalid")

print(f"OK: {path} is signed by key {key_id(pub[2:10])} ({comment})")
