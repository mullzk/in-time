"""Fetches the public GTFS and BAV rail-network sources into a VersionedArchive.

Both are public open-data endpoints, so their URLs are code defaults; the version
is resolved cheaply (without downloading the payload) before deciding whether a
download is needed."""

import re
import shutil
import tempfile
import urllib.request
import zipfile
from email.utils import parsedate_to_datetime
from pathlib import Path

from pipeline.archive import VersionedArchive

GTFS_SCHEDULE_URL = (
    "https://data.opentransportdata.swiss/dataset/timetable-2026-gtfs2020/permalink"
)
RAIL_NETWORK_URL = (
    "https://data.geo.admin.ch/ch.bav.schienennetz/schienennetz/"
    "schienennetz_2056_de.gdb.zip"
)

_TIMEOUT_SECONDS = 120
_USER_AGENT = "in-time-pipeline"
_GTFS_VERSION = re.compile(r"gtfs_fp\d+_(\d{8})")


def _request(url: str, method: str = "GET") -> urllib.request.Request:
    return urllib.request.Request(
        url, method=method, headers={"User-Agent": _USER_AGENT}
    )


def gtfs_version_from_final_url(url: str) -> str:
    match = _GTFS_VERSION.search(url)
    if match is None:
        raise ValueError(f"no GTFS version in {url}")
    return match.group(1)


def sanitize_last_modified(last_modified: str) -> str:
    return parsedate_to_datetime(last_modified).strftime("%Y%m%d")


def extract_zip_from_url(url: str, dest_dir: Path) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(_request(url), timeout=_TIMEOUT_SECONDS) as response:
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as buffer:
            shutil.copyfileobj(response, buffer)
            zip_path = Path(buffer.name)
    try:
        with zipfile.ZipFile(zip_path) as archive:
            _extract_normalising_separators(archive, dest_dir)
    finally:
        zip_path.unlink(missing_ok=True)


def _extract_normalising_separators(archive: zipfile.ZipFile, dest_dir: Path) -> None:
    # The swissTLM3D archive stores paths with Windows backslashes, which
    # extractall keeps as literal filename characters instead of directories.
    root = dest_dir.resolve()
    for member in archive.infolist():
        relative = member.filename.replace("\\", "/")
        target = (dest_dir / relative).resolve()
        if not target.is_relative_to(root):
            raise ValueError(f"zip entry escapes the destination: {member.filename}")
        if relative.endswith("/"):
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member) as source, open(target, "wb") as sink:
            shutil.copyfileobj(source, sink)


def resolve_gtfs_version(url: str = GTFS_SCHEDULE_URL) -> str:
    # The permalink redirects to gtfs_fp<year>_<yyyymmdd>.zip; the final URL
    # carries the version, so we never read the (large) body.
    with urllib.request.urlopen(_request(url), timeout=_TIMEOUT_SECONDS) as response:
        return gtfs_version_from_final_url(response.geturl())


def resolve_rail_network_version(url: str = RAIL_NETWORK_URL) -> str:
    with urllib.request.urlopen(
        _request(url, method="HEAD"), timeout=_TIMEOUT_SECONDS
    ) as response:
        last_modified = response.headers.get("Last-Modified")
    if not last_modified:
        raise ValueError(f"no Last-Modified for {url}")
    return sanitize_last_modified(last_modified)


def gtfs_archive(archive_root: Path, url: str = GTFS_SCHEDULE_URL) -> VersionedArchive:
    return VersionedArchive(
        archive_root,
        resolve_version=lambda: resolve_gtfs_version(url),
        download=lambda _version, dest: extract_zip_from_url(url, dest),
    )


def rail_network_archive(
    archive_root: Path, url: str = RAIL_NETWORK_URL
) -> VersionedArchive:
    return VersionedArchive(
        archive_root,
        resolve_version=lambda: resolve_rail_network_version(url),
        download=lambda _version, dest: extract_zip_from_url(url, dest),
    )
