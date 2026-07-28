"""Atomic file writes: stage into a sibling temp file, then rename into place,
so a reader never observes a half-written file and an aborted write leaves the
destination untouched."""

import os
from pathlib import Path


def write_atomically(path: Path, data: bytes) -> None:
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)
