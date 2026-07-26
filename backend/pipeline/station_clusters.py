"""Groups stops that GTFS transfers.txt ties together into one physical
interchange, so the sonification can treat a rail station and its neighbouring
tram and bus stops -- distinct BPUICs at the same place, e.g. "Bern" and "Bern,
Bahnhof" -- as a single sonified station. It is a union-find over the transfer
edges in BPUIC (didok) space: platforms already share their station's BPUIC, so
no parent-station step is needed. Each cluster is named by its smallest didok."""

import csv
from pathlib import Path

from pipeline.gtfs import is_swiss_bpuic_text


class _UnionFind:
    def __init__(self) -> None:
        self._parent: dict[int, int] = {}

    def find(self, item: int) -> int:
        self._parent.setdefault(item, item)
        while self._parent[item] != item:
            self._parent[item] = self._parent[self._parent[item]]
            item = self._parent[item]
        return item

    def union(self, first: int, second: int) -> None:
        root_first, root_second = self.find(first), self.find(second)
        if root_first != root_second:
            self._parent[root_first] = root_second


def _read_stop_didoks(gtfs_dir: Path) -> dict[str, int]:
    stop_to_didok: dict[str, int] = {}
    with open(gtfs_dir / "stops.txt", encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            didok_text = (row.get("didok") or "").strip()
            if is_swiss_bpuic_text(didok_text):
                stop_to_didok[row["stop_id"]] = int(didok_text)
    return stop_to_didok


def load_station_clusters(gtfs_dir: Path) -> dict[int, int]:
    stop_to_didok = _read_stop_didoks(gtfs_dir)
    transfers = gtfs_dir / "transfers.txt"
    if not transfers.exists():
        return {}

    union = _UnionFind()
    with open(transfers, encoding="utf-8-sig", newline="") as feed:
        for row in csv.DictReader(feed):
            from_didok = stop_to_didok.get(row["from_stop_id"])
            to_didok = stop_to_didok.get(row["to_stop_id"])
            if from_didok is not None and to_didok is not None:
                union.union(from_didok, to_didok)

    members: dict[int, set[int]] = {}
    for didok in set(stop_to_didok.values()):
        members.setdefault(union.find(didok), set()).add(didok)

    clusters: dict[int, int] = {}
    for group in members.values():
        if len(group) > 1:
            representative = min(group)
            for didok in group:
                clusters[didok] = representative
    return clusters
