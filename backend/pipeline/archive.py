import os
import shutil
import tempfile
from collections.abc import Callable
from pathlib import Path


class VersionedArchive:
    """Idempotent versioned archive: resolves the current feed version and downloads
    it only when that version is not already on disk. Download and version
    resolution are injected so the fetch stays testable without network.

    Only the last used version is meant to be kept on disk; `retain_only` prunes
    the others once a build has published, so the raw feeds do not accumulate."""

    def __init__(
        self,
        archive_root: Path,
        resolve_version: Callable[[], str],
        download: Callable[[str, Path], None],
    ) -> None:
        self.archive_root = Path(archive_root)
        self._resolve_version = resolve_version
        self._download = download

    def path_for(self, version: str) -> Path:
        return self.archive_root / version

    def retain_only(self, version: str) -> None:
        if not self.archive_root.exists():
            return
        for entry in self.archive_root.iterdir():
            if entry.name == version:
                continue
            if entry.is_dir():
                shutil.rmtree(entry, ignore_errors=True)
            else:
                entry.unlink(missing_ok=True)

    def ensure(self) -> str:
        version = self._resolve_version()
        destination = self.path_for(version)
        if destination.exists():
            return version

        self.archive_root.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(dir=self.archive_root, prefix=f".{version}."))
        try:
            self._download(version, staging)
            os.replace(staging, destination)
        finally:
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)
        return version
