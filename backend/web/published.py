"""Read access to the currently published artifact set (the `current` symlink):
which service day is live and its station catalog bytes. Keeps the views free of
filesystem logic and testable without HTTP."""

from datetime import date

from pipeline.artifacts import STATIONS_RAIL_NAME, STATIONS_ROAD_NAME
from pipeline.datadir import DataDir


class PublishedSchedule:
    def __init__(self, data_dir: DataDir) -> None:
        self._data_dir = data_dir

    def service_date(self) -> date | None:
        target = self._data_dir.current_target_name()
        if target is None:
            return None
        return date.fromisoformat(target)

    def artifact_version(self, name: str) -> str | None:
        """Identifies the published copy of one artifact, so its URL can carry
        the version and a rebuild reaches clients through a fresh address rather
        than through cache negotiation. Taken from the file rather than from the
        service day: a day republished from a later build keeps its name."""
        path = self._data_dir.current_link / name
        if not path.is_file():
            return None
        published = path.stat()
        return f"{int(published.st_mtime)}-{published.st_size}"

    def stations_rail_bytes(self) -> bytes | None:
        return self._read(STATIONS_RAIL_NAME)

    def stations_road_bytes(self) -> bytes | None:
        return self._read(STATIONS_ROAD_NAME)

    def _read(self, name: str) -> bytes | None:
        path = self._data_dir.current_link / name
        return path.read_bytes() if path.is_file() else None
