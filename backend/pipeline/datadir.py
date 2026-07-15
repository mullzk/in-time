import os
import shutil
from datetime import date
from pathlib import Path


class DataDir:
    # Layout under IN_TIME_DATA_DIR. `artifacts/` holds only published outputs
    # (served by nginx via the `current` symlink); `gtfs`/`build`/`catalog` are
    # internal siblings. Publishing swaps `current` atomically, then removes the
    # day it replaced.
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    @property
    def artifacts(self) -> Path:
        return self.root / "artifacts"

    @property
    def gtfs_archive(self) -> Path:
        return self.root / "gtfs" / "archive"

    @property
    def build(self) -> Path:
        return self.root / "build"

    @property
    def catalog(self) -> Path:
        return self.root / "catalog"

    @property
    def current_link(self) -> Path:
        return self.artifacts / "current"

    def artifact_dir(self, service_date: date) -> Path:
        return self.artifacts / service_date.isoformat()

    def current_target_name(self) -> str | None:
        if not self.current_link.is_symlink():
            return None
        return os.readlink(self.current_link)

    def publish(self, service_date: date) -> None:
        self.artifacts.mkdir(parents=True, exist_ok=True)
        previous = self.current_target_name()
        target_name = service_date.isoformat()

        staging = self.artifacts / f".current-{target_name}.tmp"
        if staging.is_symlink() or staging.exists():
            staging.unlink()
        os.symlink(target_name, staging)
        os.replace(staging, self.current_link)

        if previous is not None and previous != target_name:
            shutil.rmtree(self.artifacts / previous, ignore_errors=True)
