"""Read access to the currently published artifact set (the `current` symlink):
which service day is live and its station catalog bytes. Keeps the views free of
filesystem logic and testable without HTTP."""

from datetime import date

from pipeline.artifacts import STATIONS_NAME
from pipeline.datadir import DataDir


class PublishedSchedule:
    def __init__(self, data_dir: DataDir) -> None:
        self._data_dir = data_dir

    def service_date(self) -> date | None:
        target = self._data_dir.current_target_name()
        if target is None:
            return None
        return date.fromisoformat(target)

    def stations_bytes(self) -> bytes | None:
        path = self._data_dir.current_link / STATIONS_NAME
        if not path.is_file():
            return None
        return path.read_bytes()
